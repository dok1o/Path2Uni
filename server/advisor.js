// Two things the model does that the rest of the app cannot: read a profile back to the
// person in plain language, and say why a particular university suits them.
//
// Both are explanation, never discovery. The universities come from the catalogue, the
// requirements come from the demo layer, and the model's job is to make that legible. It is
// told exactly which numbers are demonstration data, because an explanation that quietly
// launders a demo figure into a confident statement is worse than no explanation.

import { createHash } from 'node:crypto'
import { callGemini, languageRule } from './gemini.js'
import { query } from './db.js'
import { requirementsFor, englishGap, DEMO_NOTICE } from '../src/data/admissionDemo.js'
import { universities, cityById, FIELD_LABELS } from '../src/data/worldUniversities.js'
import { assessReadiness } from '../src/services/readiness.js'

const RULES = `You are writing inside Path2Uni, for a school leaver applying abroad.

Every number you are given about entry requirements, deadlines and costs is DEMONSTRATION
data, not checked against any university. So:
- You may repeat those numbers, but always as "typically around X" or "usually", never as
  "you need X" or "the deadline is X".
- Never invent a figure you were not given. If something is missing, say it has to come from
  the university's own page.
- Never state a probability of admission, a percentage, or a promise.

Write warm, plain, second-person English. No markdown, no bullet characters, no emoji.`

const DIAGNOSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: 'Two or three sentences reading the profile back to them: where they want to go, to study what, and when.' },
    strengths: { type: 'ARRAY', items: { type: 'STRING' }, description: '2 to 3 concrete strengths drawn only from the profile. Each under 90 characters.' },
    gaps: { type: 'ARRAY', items: { type: 'STRING' }, description: '2 to 3 things standing between them and the goal, phrased as work to do rather than verdicts. Each under 90 characters.' },
    goal: { type: 'STRING', description: 'One sentence naming the educational goal in their own terms.' },
  },
  required: ['summary', 'strengths', 'gaps', 'goal'],
}

const MATCH_SCHEMA = {
  type: 'OBJECT',
  properties: {
    matches: {
      type: 'ARRAY',
      description: 'One entry per university given, in the same order, none added or dropped.',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          why: { type: 'STRING', description: 'Two sentences on why this suits this person specifically, citing their field, level, language or city. Under 200 characters.' },
          watch: { type: 'STRING', description: 'One sentence on the thing to check or work on for this one. Under 120 characters.' },
        },
        required: ['id', 'why', 'watch'],
      },
    },
  },
  required: ['matches'],
}

const destinationsOf = profile => (profile.destinations?.length ? profile.destinations : [profile.destination]).filter(Boolean)
const labelsOf = profile => (profile.destinationLabels?.length ? profile.destinationLabels : [profile.destinationLabel]).filter(Boolean)

const profileLines = (profile, tests) => {
  const labels = labelsOf(profile)
  const lines = [
    labels.length > 1
      ? `Destinations, in their order of preference: ${labels.join(', ')}. They have not decided between them yet — do not write as if they had.`
      : `Destination: ${labels[0]}`,
    `Level: ${profile.degree}`,
    `Field: ${profile.field}`,
    `Intake year: ${profile.intake}`,
    `English on file: ${profile.englishLevel}`,
  ]
  if (tests?.length) {
    lines.push('Exams:')
    for (const test of tests) {
      const score = test.score ?? test.score_text ?? '—'
      const when = test.test_date || test.planned_date || 'no date'
      lines.push(`- ${test.test_name || test.test_code}: ${test.status}, result ${score}, ${when}`)
    }
  } else {
    lines.push('Exams: none recorded yet')
  }
  return lines
}

/**
 * The advice depends only on these answers, so it is regenerated only when one of them moves.
 * Two Gemini calls and six seconds on every visit to My matches is not a load-time problem to
 * optimise away later — it is the page being unusable.
 */
export function adviceFingerprint(profile, tests = [], lang = 'en') {
  const parts = [
    lang,
    destinationsOf(profile).join(','), profile.degree, profile.field, profile.intake, profile.englishLevel,
    ...tests.map(test => `${test.test_code}:${test.status}:${test.score ?? test.score_text ?? ''}`).sort(),
  ]
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32)
}

export async function readCachedAdvice(profile, fingerprint) {
  const { rows } = await query(
    'select diagnosis, matches from profile_advice where profile_id = $1 and fingerprint = $2',
    [profile.id, fingerprint])
  return rows[0] ? { diagnosis: rows[0].diagnosis, matches: rows[0].matches, cached: true } : null
}

export async function writeCachedAdvice(profile, fingerprint, { diagnosis, matches }) {
  await query(
    `insert into profile_advice (profile_id, fingerprint, diagnosis, matches, model)
     values ($1, $2, $3, $4, $5)
     on conflict (profile_id) do update set
       fingerprint = excluded.fingerprint, diagnosis = excluded.diagnosis,
       matches = excluded.matches, model = excluded.model, created_at = now()`,
    [profile.id, fingerprint, JSON.stringify(diagnosis), JSON.stringify(matches),
      diagnosis?.source?.model ?? null])
}

/** Stage 3: the profile read back, with strengths, gaps and the goal. */
export async function diagnose({ apiKey, profile, tests, lang = 'en' }) {
  const countries = destinationsOf(profile)
  const labels = labelsOf(profile)
  // The primary destination decides the English read, because that is the one the roadmap is
  // written for; the others are described so the model can say how they differ.
  const requirements = requirementsFor({ country: countries[0], id: null })
  const gap = englishGap({ englishLevel: profile.englishLevel, tests }, requirements?.english)

  const describe = (iso, label) => {
    const found = requirementsFor({ country: iso, id: null })
    if (!found) return `- ${label}: no requirement data`
    return [
      `- ${label}: English usually around ${found.english.test} ${found.english.band};`,
      `tuition usually ${found.tuition.min}–${found.tuition.max} ${found.tuition.currency} per ${found.tuition.period};`,
      `rounds usually ${found.rounds.map(r => `${r.name} ${r.opens}–${r.closes}`).join('; ')}.`,
      found.gpaGuidance,
    ].join(' ')
  }

  const facts = [
    ...profileLines(profile, tests),
    '',
    'DEMONSTRATION data per destination (say "typically", never "you need"):',
    ...countries.map((iso, index) => describe(iso, labels[index] ?? iso)),
    '',
    `Our own read of their English against ${labels[0]}: ${gap.detail}`,
    countries.length > 1
      ? 'One of their gaps should be that the choice between these countries is still open, and name what actually separates them.'
      : '',
  ].filter(Boolean)

  const fallback = () => ({
    summary: `You are aiming for a ${String(profile.degree).toLowerCase()} in ${profile.field} in ${labels.join(' or ')}, starting ${profile.intake}.`,
    strengths: [labels.length > 1 ? `${labels.length} destinations shortlisted and a field already chosen` : 'A clear destination and field already chosen', `English recorded at ${profile.englishLevel}`],
    gaps: [
      gap.status === 'clear' ? 'Documents and the application itself' : 'An English certificate that proves your level',
      labels.length > 1 ? `The choice between ${labels.join(', ')} is still open` : 'Deadlines to confirm on official pages',
    ],
    goal: `Study ${profile.field} in ${labels.join(' or ')} from ${profile.intake}.`,
    source: { kind: 'rules' },
    evidence: 'demo',
    notice: DEMO_NOTICE,
  })

  if (!apiKey) return fallback()
  try {
    const { text, model } = await callGemini({
      apiKey,
      system: `${RULES}\n\n${languageRule(lang)}\n\nWrite a short diagnosis of this applicant's position.`,
      contents: [{ role: 'user', parts: [{ text: facts.join('\n') }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: DIAGNOSIS_SCHEMA, temperature: 0.5 },
      signal: AbortSignal.timeout(25_000),
    })
    const parsed = JSON.parse(text)
    return {
      summary: String(parsed.summary ?? '').slice(0, 400),
      strengths: (parsed.strengths ?? []).slice(0, 3).map(item => String(item).slice(0, 120)),
      gaps: (parsed.gaps ?? []).slice(0, 3).map(item => String(item).slice(0, 120)),
      goal: String(parsed.goal ?? '').slice(0, 200),
      englishGap: gap,
      source: { kind: 'gemini', model },
      evidence: 'demo',
      notice: DEMO_NOTICE,
    }
  } catch {
    return fallback()
  }
}

/** Stage 4: why each shortlisted university suits this person. */
export async function explainMatches({ apiKey, profile, tests, shortlist, lang = 'en', fieldTag = null }) {
  const picked = shortlist.slice(0, 6)
  if (!picked.length) return []

  const enriched = picked.map(entry => {
    const record = universities.find(uni => uni.name === entry.name)
    const requirements = record ? requirementsFor(record) : null
    return {
      id: record?.id ?? entry.name,
      name: entry.name,
      city: entry.city,
      country: entry.country,
      website: entry.website ?? null,
      fields: entry.fields,
      languages: entry.languages,
      levels: entry.levels,
      requirements,
      gap: englishGap({ englishLevel: profile.englishLevel, tests }, requirements?.english),
      // Computed here, deterministically, and never asked of the model: the one thing the
      // prompt forbids is exactly a statement about someone's chances.
      readiness: assessReadiness({ profile, tests, university: record ?? entry, requirements, fieldTag }),
    }
  })

  const fallback = () => enriched.map(item => ({
    id: item.id,
    name: item.name,
    city: item.city,
    country: item.country,
    website: item.website,
    readiness: item.readiness,
    why: `${item.name} teaches ${item.fields.map(f => FIELD_LABELS[f] ?? f).slice(0, 2).join(' and ')} in ${item.city}, at the level you are aiming for.`,
    watch: item.gap.detail,
    requirements: item.requirements,
    evidence: 'demo',
    notice: DEMO_NOTICE,
    source: { kind: 'rules' },
  }))

  if (!apiKey) return fallback()

  const facts = [
    ...profileLines(profile, tests),
    '',
    'Universities to explain, one entry each, in this order:',
    ...enriched.map(item => [
      `id: ${item.id}`,
      `  name: ${item.name}, ${item.city}`,
      `  teaches: ${item.fields.map(f => FIELD_LABELS[f] ?? f).join(', ')}`,
      `  taught in: ${item.languages.join('/')}; levels: ${item.levels.join('/')}`,
      item.requirements ? `  DEMO English bar: usually ${item.requirements.english.test} ${item.requirements.english.band}` : '',
      `  our read: ${item.gap.detail}`,
    ].filter(Boolean).join('\n')),
  ]

  try {
    const { text, model } = await callGemini({
      apiKey,
      system: `${RULES}\n\n${languageRule(lang)}\n\nExplain why each university suits this applicant. Use only the facts given.`,
      contents: [{ role: 'user', parts: [{ text: facts.join('\n') }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: MATCH_SCHEMA, temperature: 0.55 },
      signal: AbortSignal.timeout(30_000),
    })
    const byId = new Map((JSON.parse(text).matches ?? []).map(match => [match.id, match]))
    // Driven by our list, not the model's: an entry it invented is ignored, one it dropped
    // falls back to the deterministic sentence.
    return enriched.map(item => {
      const match = byId.get(item.id)
      return {
        id: item.id,
        name: item.name,
        city: item.city,
        country: item.country,
        website: item.website,
        readiness: item.readiness,
        why: match ? String(match.why).slice(0, 320) : `${item.name} teaches your field in ${item.city}.`,
        watch: match ? String(match.watch).slice(0, 200) : item.gap.detail,
        requirements: item.requirements,
        evidence: 'demo',
        notice: DEMO_NOTICE,
        source: { kind: match ? 'gemini' : 'rules', model },
      }
    })
  } catch {
    return fallback()
  }
}
