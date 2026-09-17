// Gemini call for plan generation.
//
// The free tier returns 503 "high demand" on the newest models routinely, and Google retires
// model ids for new accounts, so a single hardcoded model id is not a working design.
// MODELS is a cascade, tried in order; the caller falls back to the rule-based planner if all fail.

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']

// A model that just answered 503 will almost certainly 503 again within the minute, and each
// blind retry costs a full round-trip of user-visible latency. Park it briefly instead.
const COOLDOWN_MS = 90_000
const benched = new Map()
const available = model => (benched.get(model) ?? 0) < Date.now()
const bench = model => benched.set(model, Date.now() + COOLDOWN_MS)

// Structured output: the model fills this and nothing else. Coordinates, XP, ids and
// ordering metadata are added by planShape.js — a model should not be inventing layout.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    confidence: { type: 'NUMBER', description: 'How well the objective is grounded in the supplied facts, 0 to 1.' },
    tasks: {
      type: 'ARRAY',
      description: '3 to 5 tasks in the order the applicant should do them.',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['research', 'documents', 'application'] },
          title: { type: 'STRING', description: 'Second person, encouraging, under 70 characters.' },
          shortTitle: { type: 'STRING', description: 'Two or three words for the roadmap pin.' },
          description: { type: 'STRING', description: 'One or two sentences on why this step comes now.' },
          subtasks: { type: 'ARRAY', items: { type: 'STRING' }, description: '2 to 4 concrete actions. Each under 60 characters — these render as short checklist rows, not sentences.' },
        },
        required: ['type', 'title', 'shortTitle', 'description', 'subtasks'],
      },
    },
  },
  required: ['confidence', 'tasks'],
}

const SYSTEM = `You plan university admission journeys for international applicants.

Rules you must not break:
- Use ONLY the facts given to you. If a fact is not supplied, do not state it.
- Never invent tuition fees, application deadlines, acceptance rates, scholarship amounts or exam dates.
  You may say a step must happen before another step; you may not say when in absolute terms.
- Order tasks by real dependency: research before documents, documents before the application.
- Every task must be something the applicant physically does, not advice.
- Write in warm, plain second-person English. No emoji, no markdown.`

export function buildPrompt({ context, shortlist }) {
  const lines = [
    `Destination: ${context.destination.label}`,
    `Degree level: ${context.degree}`,
    `Field of study: ${context.field}`,
    `Intended intake: ${context.intake}`,
    `English level: ${context.englishLevel}${context.needsTest ? ' (below the usual entry bar, a certificate is still needed)' : ' (clears most English-taught entry bars)'}`,
    `Application route: ${context.destination.portal}`,
    `Country-specific document required: ${context.destination.extraDoc}`,
    `Earliest admission round opens in: ${context.destination.earliest}`,
  ]
  if (shortlist.length) {
    lines.push('', 'Verified universities matching this applicant:')
    shortlist.forEach(uni => lines.push(
      `- ${uni.name}, ${uni.city} — ${uni.fields.join(', ')}; taught in ${uni.languages.join('/')}; ${uni.levels.join('/')}`))
  }
  lines.push('', 'Produce the ordered admission plan.')
  return lines.join('\n')
}

/** Returns { plan, model, usage } or throws with .attempts describing every failure. */
export async function generateWithGemini({ apiKey, context, shortlist, signal }) {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: buildPrompt({ context, shortlist }) }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0.4 },
  })

  const attempts = []
  const order = [...MODELS.filter(available), ...MODELS.filter(model => !available(model))]
  for (const model of order) {
    try {
      const response = await fetch(`${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal,
      })
      if (!response.ok) {
        const detail = await response.text()
        attempts.push({ model, status: response.status, detail: detail.slice(0, 200) })
        if (response.status === 503 || response.status === 429) bench(model)
        // 400/403 are our fault or the key's — trying another model will not help.
        if (response.status === 400 || response.status === 403) break
        continue
      }
      const payload = await response.json()
      const text = payload.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) { attempts.push({ model, status: 200, detail: 'empty candidate' }); continue }
      return {
        plan: JSON.parse(text),
        model,
        usage: {
          promptTokens: payload.usageMetadata?.promptTokenCount ?? null,
          outputTokens: payload.usageMetadata?.candidatesTokenCount ?? null,
        },
      }
    } catch (error) {
      if (error.name === 'AbortError') throw error
      attempts.push({ model, status: null, detail: String(error.message).slice(0, 200) })
    }
  }
  const failure = new Error('every Gemini model in the cascade failed')
  failure.attempts = attempts
  throw failure
}
