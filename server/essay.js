// The motivation letter workshop.
//
// Leo does NOT write the essay. Two reasons, and the second is the one that matters:
//
//   * An essay an admissions officer can tell was generated is worse than a plain one, and
//     they are getting better at telling.
//   * It is the applicant's letter. A generated paragraph they paste in is a statement about
//     themselves that they did not make, submitted under their name.
//
// So this returns structure and questions. The questions are the product: a good one pulls a
// concrete memory out of someone, which is the thing they cannot get from a template.
//
// Nothing here is stored. database/README.md rules essays out of both databases, and the
// draft stays in the browser. Activity text is sent to the model only when the applicant
// asks for it to be read, and the interface says so before it happens.

import { callGemini, languageRule } from './gemini.js'

const RULES = `You are Leo, helping a school leaver plan their own motivation letter.

YOU DO NOT WRITE THE LETTER. Not a sentence of it, not an example paragraph they could
paste, not an opening line. If you produce text they can copy, you have failed at this task.

WHAT YOU DO:
- Give the shape of the letter and, for each part, questions only they can answer.
- Turn what they have actually done into evidence: name what a concrete activity demonstrates,
  and what detail would make it believable to a stranger.
- Say what weakens a letter: claims without an example, adjectives about yourself, copied
  phrases about "passion", and anything the reader cannot check.

HARD RULES:
- Never invent an experience, an award, a result or a motivation they did not give you.
- Never state how long the letter must be, what the deadline is, or what any specific
  university requires — those differ per programme and we do not hold them.
- Never promise this improves their chances.
- Plain, second person, no markdown, no emoji.`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    sections: {
      type: 'ARRAY',
      description: '4 to 5 parts of the letter, in the order they should be written.',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'What this part of the letter does. Under 50 characters.' },
          purpose: { type: 'STRING', description: 'One sentence on what the reader should take from it. Under 150 characters.' },
          questions: { type: 'ARRAY', items: { type: 'STRING' }, description: '2 to 3 questions only this applicant can answer. Each under 120 characters.' },
        },
        required: ['title', 'purpose', 'questions'],
      },
    },
    evidence: {
      type: 'ARRAY',
      description: 'One entry per activity the applicant listed, in the order given. Empty if they listed none.',
      items: {
        type: 'OBJECT',
        properties: {
          activity: { type: 'STRING', description: 'The activity, echoed back in their words. Under 80 characters.' },
          shows: { type: 'STRING', description: 'What a reader can fairly conclude from it. Under 140 characters.' },
          sharpen: { type: 'STRING', description: 'The one detail that would make it concrete. A question or an instruction, never a written sentence. Under 140 characters.' },
        },
        required: ['activity', 'shows', 'sharpen'],
      },
    },
    weakest: { type: 'STRING', description: 'The single most common way this kind of letter goes wrong, given their field. Under 180 characters.' },
  },
  required: ['sections', 'weakest'],
}

const fallback = profile => ({
  sections: [
    { title: 'Why this subject', purpose: 'The reader should finish this part knowing the moment your interest became specific.', questions: ['What is the first problem in this subject you could not stop thinking about?', 'What did you do about it that nobody asked you to do?'] },
    { title: 'What you have already done', purpose: 'Evidence, not adjectives: things that happened, with enough detail to be checkable.', questions: ['Which of your activities would you still have done if nobody ever saw it?', 'What went wrong in one of them, and what did you change?'] },
    { title: 'Why this country and this university', purpose: 'Shows you chose them rather than applied everywhere.', questions: ['What can you do there that you cannot do at home?', 'Which course, lab or person on their site made you look twice?'] },
    { title: 'What you intend to do next', purpose: 'Makes the degree a step rather than a destination.', questions: ['What do you want to be able to build or answer in five years?', 'What part of that does this programme actually supply?'] },
  ],
  evidence: [],
  weakest: `Claiming an interest in ${profile.field || 'the subject'} without a single concrete thing you did about it. Every sentence a reader cannot picture is a sentence they skip.`,
  source: { kind: 'rules' },
})

/** `activities` is free text about a person, so it is passed only when explicitly offered. */
export async function planEssay({ apiKey, profile, activities = '', lang = 'en' }) {
  if (!apiKey) return fallback(profile)

  const trimmed = String(activities || '').slice(0, 1200).trim()
  const facts = [
    `Field: ${profile.field}`,
    `Level: ${profile.degree}`,
    `Destinations: ${(profile.destinationLabels ?? [profile.destinationLabel]).filter(Boolean).join(', ')}`,
    trimmed ? `What they have listed under their own activities and awards:\n${trimmed}` : 'They have listed no activities yet, so return an empty evidence array and do not invent any.',
  ].join('\n')

  try {
    const { text, model } = await callGemini({
      apiKey,
      system: `${RULES}\n\n${languageRule(lang)}\n\nPlan this applicant's motivation letter.`,
      contents: [{ role: 'user', parts: [{ text: facts }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.6 },
      signal: AbortSignal.timeout(28_000),
    })
    const parsed = JSON.parse(text)
    const sections = (parsed.sections ?? []).slice(0, 5).map(section => ({
      title: String(section.title ?? '').slice(0, 80),
      purpose: String(section.purpose ?? '').slice(0, 220),
      questions: (section.questions ?? []).slice(0, 3).map(question => String(question).slice(0, 180)),
    })).filter(section => section.title && section.questions.length)
    if (!sections.length) throw new Error('no usable sections')
    return {
      sections,
      // Never more entries than activities given: the model must not add experiences.
      evidence: trimmed ? (parsed.evidence ?? []).slice(0, 8).map(item => ({
        activity: String(item.activity ?? '').slice(0, 120),
        shows: String(item.shows ?? '').slice(0, 200),
        sharpen: String(item.sharpen ?? '').slice(0, 200),
      })).filter(item => item.activity) : [],
      weakest: String(parsed.weakest ?? '').slice(0, 260),
      source: { kind: 'gemini', model },
    }
  } catch {
    return fallback(profile)
  }
}
