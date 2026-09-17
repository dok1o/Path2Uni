import { appendFile } from 'node:fs/promises'
import { readObjective } from '../src/services/planContext.js'
import { assemblePlan, normalizeTasks } from '../src/services/planShape.js'
import { buildLocalPlan } from '../src/services/localPlan.js'
import { shortlistUniversities } from '../src/data/worldUniversities.js'
import { generateWithGemini } from './gemini.js'

const LOG = new URL('./ai-runs.jsonl', import.meta.url)
// Generation itself runs 8-11s on the free tier; leave room for one failed model before giving up.
const TIMEOUT_MS = 30_000

/**
 * Whitelist, not blacklist. The model needs six facts to order an admission plan; it does not
 * need who the applicant is. Names, ids, contacts and free-text goals never leave this process.
 * That is what makes a free tier — where prompts may be reviewed and trained on — acceptable here.
 */
export function deidentify(profile) {
  profile = profile && typeof profile === 'object' ? profile : {}
  const languages = Array.isArray(profile?.languages) ? profile.languages : []
  const english = languages.find(language => language?.name === 'English')
  return {
    destination: profile.destination ?? null,
    degree: profile.degree ?? null,
    field: profile.field ?? null,
    intake: profile.intake ?? null,
    languages: english ? [{ name: 'English', level: english.level }] : [],
  }
}

async function record(entry) {
  // Shaped after the ai_runs table in database/intelligence. Never contains prompt text or profile data.
  try { await appendFile(LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n') }
  catch { /* logging must never fail a request */ }
}

export async function createAdmissionPlan({ profile, objective, apiKey }) {
  const started = Date.now()
  const safeProfile = deidentify(profile)
  const context = readObjective(objective, safeProfile)
  const shortlist = context.destination.iso
    ? shortlistUniversities({
        country: context.destination.iso,
        field: context.fieldTag,
        level: String(context.degree || '').toLowerCase(),
        limit: 10,
      })
    : []

  const fallback = reason => {
    const plan = buildLocalPlan({ profile: safeProfile, objective, shortlist, reason })
    return plan
  }

  if (!apiKey) {
    await record({ status: 'skipped', reason: 'no_api_key', latencyMs: Date.now() - started })
    return fallback('no_api_key')
  }

  const abort = AbortSignal.timeout(TIMEOUT_MS)
  try {
    const { plan, model, usage } = await generateWithGemini({ apiKey, context, shortlist, signal: abort })
    const tasks = normalizeTasks(plan.tasks, context)
    if (!tasks.length) throw Object.assign(new Error('model returned no usable task'), { attempts: [{ model, status: 200, detail: 'schema ok, tasks unusable' }] })

    await record({ status: 'ok', model, ...usage, taskCount: tasks.length, shortlist: shortlist.length, latencyMs: Date.now() - started })
    return assemblePlan({
      context, tasks, shortlist,
      confidence: Math.min(Math.max(Number(plan.confidence) || 0.8, 0.5), 0.97),
      source: { kind: 'gemini', model },
    })
  } catch (error) {
    await record({
      status: 'failed', reason: error.name === 'TimeoutError' ? 'timeout' : 'cascade_exhausted',
      attempts: error.attempts ?? [{ detail: String(error.message).slice(0, 200) }],
      latencyMs: Date.now() - started,
    })
    return fallback(error.name === 'TimeoutError' ? 'timeout' : 'model_unavailable')
  }
}

/** Framework-agnostic handler, mounted by both the standalone server and the Vite dev middleware. */
export async function handlePlanRequest(rawBody, apiKey) {
  let parsed
  try { parsed = JSON.parse(rawBody || '{}') }
  catch { return { status: 400, body: { error: 'body must be JSON' } } }
  if (typeof parsed.objective !== 'string' || !parsed.objective.trim()) {
    return { status: 400, body: { error: 'objective is required' } }
  }
  const plan = await createAdmissionPlan({
    profile: parsed.profile ?? {},
    objective: parsed.objective.slice(0, 500),
    apiKey,
  })
  return { status: 200, body: plan }
}
