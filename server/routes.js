// One router shared by the Vite dev middleware and the standalone server, so there is a
// single definition of every route and no chance of the two drifting apart.

import { register, login, logout, userForToken } from './auth.js'
import { isReachable } from './db.js'
import { createAdmissionPlan, handlePlanRequest } from './plan.js'
import {
  getProfile, saveProfile, profileForPlanning, savePlan, getCurrentPlan, setTaskDone,
  destinationOptions, fieldOptions, levelOptions, englishLevels,
} from './profiles.js'
import { askLeo } from './chat.js'
import { getTests, saveTests } from './tests.js'
import { diagnose, explainMatches, adviceFingerprint, readCachedAdvice, writeCachedAdvice } from './advisor.js'
import { shortlistUniversities } from '../src/data/worldUniversities.js'
import { buildGraph } from '../src/services/planShape.js'
import { readObjective, fields as FIELD_VOCAB } from '../src/services/planContext.js'

const COOKIE = 'p2u_session'

export const readCookie = (header, name = COOKIE) =>
  (header || '').split(';').map(part => part.trim().split('='))
    .find(([key]) => key === name)?.[1] || null

// HttpOnly keeps the token away from scripts and SameSite=Lax blocks cross-site submission.
// `Secure` is added whenever the request arrived over TLS, so the flag appears automatically
// in production without anyone remembering to switch it on, and stays off on local http
// (where a Secure cookie would simply be discarded and nobody could sign in).
export const sessionCookie = ({ token, expires }, secure = false) =>
  `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Expires=${expires.toUTCString()}${secure ? '; Secure' : ''}`

export const clearCookie = (secure = false) =>
  `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`

// Told to browsers only over TLS: sending HSTS over plain http is ignored, and promising it
// from a local dev server would pin localhost to https for a year in that browser.
const HSTS = { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }

// The Decision Map's graph is laid out from the tasks rather than stored, so a plan read
// back from the database gets its graph rebuilt here — the database never holds layout.
function rehydrate(stored, profile) {
  const context = readObjective(stored.objective, profileForPlanning(profile))
  return { ...stored, status: 'generated', generatedAt: stored.createdAt, graph: buildGraph(context, stored.tasks) }
}

const reply = (status, body, headers = {}) => ({ status, body, headers })

/**
 * @param {{method:string, path:string, body:string, cookie:string, userAgent:string, apiKey:string|null}} request
 * @returns {Promise<{status:number, body:object, headers?:object}>}
 */
export async function route(request) {
  const { method, path, body, cookie, userAgent, apiKey, secure = false } = request

  // Local, not module-level: rebinding a shared helper would leak this request's `secure`
  // into every later one and stack a new wrapper on each call.
  const json = (status, body, headers = {}) =>
    reply(status, body, secure ? { ...HSTS, ...headers } : headers)

  let parsed = {}
  // PUT and PATCH carry bodies too; parsing only POST silently handed handlers an empty object.
  if (['POST', 'PUT', 'PATCH'].includes(method) && body) {
    try { parsed = JSON.parse(body) } catch { return json(400, { error: 'Request body must be JSON' }) }
  }

  try {
    if (path === '/api/auth/register' && method === 'POST') {
      const result = await register({ ...parsed, userAgent })
      if (result.error) return json(result.status, { error: result.error, field: result.field })
      return json(201, { user: result.user }, { 'Set-Cookie': sessionCookie(result.session, secure) })
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const result = await login({ ...parsed, userAgent })
      if (result.error) return json(result.status, { error: result.error, field: result.field })
      return json(200, { user: result.user }, { 'Set-Cookie': sessionCookie(result.session, secure) })
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      await logout(readCookie(cookie))
      return json(200, { ok: true }, { 'Set-Cookie': clearCookie(secure) })
    }

    if (path === '/api/auth/me' && method === 'GET') {
      const user = await userForToken(readCookie(cookie))
      // Not signed in is a normal state, not an error — the client asks this on every load.
      return json(200, { user: user ?? null })
    }

    // Everything below belongs to a signed-in person. Resolve them once.
    const me = path.startsWith('/api/me/') ? await userForToken(readCookie(cookie)) : null
    if (path.startsWith('/api/me/') && !me) return json(401, { error: 'Sign in first' })

    if (path === '/api/me/profile' && method === 'GET') {
      return json(200, { profile: await getProfile(me.id) })
    }

    if (path === '/api/me/profile' && method === 'PUT') {
      const result = await saveProfile(me.id, parsed)
      if (result.errors) return json(400, { errors: result.errors })
      return json(200, { profile: result.profile })
    }

    if (path === '/api/me/plan' && method === 'GET') {
      const stored = await getCurrentPlan(me.id)
      return json(200, { plan: stored ? rehydrate(stored, await getProfile(me.id)) : null })
    }

    if (path === '/api/me/plan' && method === 'POST') {
      const profile = await getProfile(me.id)
      if (!profile) return json(409, { error: 'Complete your profile first' })
      const objective = typeof parsed.objective === 'string' ? parsed.objective.slice(0, 500) : ''
      if (!objective.trim()) return json(400, { error: 'objective is required' })

      const plan = await createAdmissionPlan({ profile: profileForPlanning(profile), objective, apiKey })
      await savePlan(me.id, { plan, objective })
      return json(200, { plan: { ...plan, objective } })
    }

    // Stage 3 and 4 of the product path: the profile read back, and why each match suits.
    if (path === '/api/me/diagnosis' && method === 'GET') {
      const profile = await getProfile(me.id)
      if (!profile) return json(409, { error: 'Complete your profile first' })
      const tests = await getTests(me.id)
      const plan = await getCurrentPlan(me.id)
      // The field is a hard filter. Without it the shortlist returns any university in the
      // country, and the explanation then has to justify a match that does not exist.
      const fieldTag = Object.values(FIELD_VOCAB).find(item => item.label === profile.field)?.tag ?? null
      // Built from every chosen destination, not from the plan's shortlist. The two answer
      // different questions: the roadmap walks one admission system, while the matches are
      // where the person is still deciding — and a comparison inside a single country is not
      // the comparison they opened this page for.
      const countries = profile.destinations?.length ? profile.destinations : [profile.destination]
      const shortlist = shortlistUniversities({
        countries, field: fieldTag,
        level: String(profile.degree).toLowerCase(),
        limit: countries.length > 1 ? 6 : 5,
      })
      // Regenerated only when the answers it was built from change.
      const fingerprint = adviceFingerprint(profile, tests)
      const cached = await readCachedAdvice(profile, fingerprint)
      if (cached) return json(200, cached)

      const [diagnosis, matches] = await Promise.all([
        diagnose({ apiKey, profile, tests }),
        explainMatches({ apiKey, profile, tests, shortlist }),
      ])
      // A rules-only answer means the model was unreachable; caching it would freeze the
      // fallback in place until the profile changes.
      if (diagnosis.source?.kind === 'gemini') {
        await writeCachedAdvice(profile, fingerprint, { diagnosis, matches }).catch(() => {})
      }
      return json(200, { diagnosis, matches, cached: false })
    }

    if (path === '/api/me/task' && method === 'POST') {
      const result = await setTaskDone(me.id, parsed.position, Boolean(parsed.done))
      if (result.error) return json(result.status, { error: result.error })
      return json(200, { plan: rehydrate(result.plan, await getProfile(me.id)) })
    }

    if (path === '/api/me/tests' && method === 'GET') {
      return json(200, { tests: await getTests(me.id) })
    }

    if (path === '/api/me/tests' && method === 'PUT') {
      const result = await saveTests(me.id, parsed.tests)
      if (result.error) return json(result.status, { error: result.error })
      return json(200, { tests: result.tests })
    }

    if (path === '/api/me/chat' && method === 'POST') {
      const profile = await getProfile(me.id)
      if (!profile) return json(409, { error: 'Complete your profile first' })
      const stored = await getCurrentPlan(me.id)
      const result = await askLeo({
        apiKey, profile, plan: stored,
        history: parsed.history, message: parsed.message,
      })
      if (result.error) return json(result.status, { error: result.error })
      return json(200, { reply: result.reply, source: result.source })
    }

    if (path === '/api/options' && method === 'GET') {
      return json(200, { destinations: destinationOptions, fields: fieldOptions, levels: levelOptions, englishLevels })
    }

    // Kept for the signed-out/demo path: generates without storing anything.
    if (path === '/api/ai/admission-plan' && method === 'POST') {
      const result = await handlePlanRequest(body, apiKey)
      return json(result.status, result.body)
    }

    if (path === '/api/health' && method === 'GET') {
      return json(200, { database: await isReachable() ? 'up' : 'down', model: apiKey ? 'configured' : 'no key' })
    }
  } catch (error) {
    // A database that is down must read as "service unavailable", not as bad credentials.
    const offline = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '57P03'].includes(error.code)
    if (offline) {
      console.error('[path2uni] postgres unreachable:', error.message)
      return json(503, { error: 'The database is unreachable. Run: docker compose up -d core-db' })
    }
    console.error('[path2uni] route error:', error)
    return json(500, { error: 'Something went wrong on our side' })
  }

  return json(404, { error: 'Not found' })
}
