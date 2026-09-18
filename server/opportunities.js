// "Where can I take part, given what I want to study?" — the suggestion Leo makes while
// someone is filling in Your strengths.
//
// This is the riskiest kind of suggestion in the whole app, because a competition has a
// deadline and an eligibility rule, both change every year, and some of them stop running
// altogether — a first version of this named Google Code Jam, which closed in 2023. So the
// model is allowed to
// name only long-running, well-established programmes, and is forbidden from stating when
// anything opens, closes, costs or who qualifies. The answer is a direction to search in,
// not a calendar. Every card says to confirm on the organiser's own page.

import { callGemini, languageRule } from './gemini.js'

const RULES = `You are Leo, inside Path2Uni, helping a school leaver decide where to take part
outside class so their application has something in it.

HARD RULES:
- Name only activities that have run for years and exist internationally or nationwide.
- Only name a programme you are confident STILL RUNS. A competition that has been
  discontinued is worse than a generic suggestion: it sends someone to a dead page and they
  do not find out until they get there. When unsure, describe the category instead — "an
  algorithmic programming contest your school can enter" beats naming the wrong one.
- NEVER state a date, a deadline, a registration window, a fee, an age limit or an
  eligibility rule. You do not have this year's figures and they change every cycle.
- Never invent a competition, an organisation or a programme. If you are not sure something
  exists under that name, leave it out.
- Never promise that taking part improves admission chances. Say what it gives them instead:
  a portfolio piece, a result to cite, people to meet.
- Write plainly, second person, no markdown and no emoji.`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    ideas: {
      type: 'ARRAY',
      description: '4 to 6 suggestions, ordered from the easiest to start to the most demanding.',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'The activity or programme, under 60 characters.' },
          kind: { type: 'STRING', description: 'One of: competition, project, volunteering, research, course, community.' },
          why: { type: 'STRING', description: 'One sentence on what it gives THIS applicant, given their field and level. Under 160 characters.' },
          start: { type: 'STRING', description: 'The concrete first move, under 110 characters. Never a date.' },
        },
        required: ['title', 'kind', 'why', 'start'],
      },
    },
  },
  required: ['ideas'],
}

const KINDS = new Set(['competition', 'project', 'volunteering', 'research', 'course', 'community'])

/** The deterministic answer: still useful, and honest about being generic. */
function fallback(profile) {
  const field = profile.field || 'your field'
  return [
    { title: 'A school or city olympiad in your subject', kind: 'competition', why: `A placing in ${field} is something an admissions officer can read as evidence rather than a claim.`, start: 'Ask your subject teacher which rounds your school enters and when registration normally opens.' },
    { title: 'One finished project you can show', kind: 'project', why: 'A finished small thing beats a described big one, and it gives you something to talk about.', start: 'Pick a problem you actually have, build the smallest version, and put it somewhere public.' },
    { title: 'Volunteering with a local organisation', kind: 'volunteering', why: 'Shows sustained commitment, which is the part most applications are thin on.', start: 'Choose one organisation and commit to a regular slot rather than a one-off day.' },
    { title: 'A free online course with a certificate', kind: 'course', why: `Fills a gap in ${field} that your school timetable does not cover.`, start: 'Pick one course, finish it, and note what you built with it — the certificate alone says little.' },
  ]
}

export async function suggestOpportunities({ apiKey, profile, lang = 'en' }) {
  if (!apiKey) return { ideas: fallback(profile), source: { kind: 'rules', reason: 'no_api_key' } }

  const facts = [
    `Field: ${profile.field}`,
    `Level they are applying for: ${profile.degree}`,
    `Destinations they are considering: ${(profile.destinationLabels ?? [profile.destinationLabel]).filter(Boolean).join(', ')}`,
    `Intake year: ${profile.intake}`,
    'They are still at school. Assume no budget and no professional network.',
  ].join('\n')

  try {
    const { text, model } = await callGemini({
      apiKey,
      system: `${RULES}\n\n${languageRule(lang)}\n\nSuggest where this applicant could take part.`,
      contents: [{ role: 'user', parts: [{ text: facts }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.7 },
      signal: AbortSignal.timeout(25_000),
    })
    const ideas = (JSON.parse(text).ideas ?? [])
      .filter(idea => idea?.title && idea?.why)
      .slice(0, 6)
      .map(idea => ({
        title: String(idea.title).slice(0, 90),
        // An unknown kind would render without an icon, so it becomes the neutral one.
        kind: KINDS.has(idea.kind) ? idea.kind : 'project',
        why: String(idea.why).slice(0, 220),
        start: String(idea.start ?? '').slice(0, 160),
      }))
    if (!ideas.length) throw new Error('no usable ideas')
    return { ideas, source: { kind: 'gemini', model } }
  } catch (error) {
    return { ideas: fallback(profile), source: { kind: 'rules', reason: error.name === 'TimeoutError' ? 'timeout' : 'model_unavailable' } }
  }
}
