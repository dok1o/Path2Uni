// Leo, the in-app guide.
//
// The hard part of a guidance chatbot is not answering — it is refusing to answer. A student
// who is told the wrong IELTS score or the wrong deadline loses a year and an application
// fee, and they have no way to tell a confident guess from a checked fact. So Leo is given
// exactly what this app knows, and is told to say "I don't know that yet" for everything
// else rather than fill the gap.
//
// Unlike plan generation, the input here is free text written by the person, so it cannot be
// de-identified: whatever they type goes to the model. The system prompt therefore also tells
// Leo not to ask for documents, identity numbers or contact details.

import { MODELS, callGemini, languageRule } from './gemini.js'

const MAX_TURNS = 12
const MAX_CHARS = 800

const SYSTEM = `You are Leo, a warm, level-headed guide inside Path2Uni, an app that helps
international applicants plan their university admission.

WHAT YOU KNOW is only what appears in the CONTEXT below. The context states explicitly
whether a plan and a shortlist exist. If it says there is no plan yet, you must not mention
tasks, steps or universities as if they existed — say the plan has not been built yet and
point them at the Decision Map. Naming a task that does not exist is the worst thing you can
do here, because it sounds exactly like a real answer.

WHAT YOU MUST NEVER DO:
- Never state a tuition fee, an application deadline, an exam date, a required IELTS/TOEFL/SAT
  score, an acceptance rate or a scholarship amount. We have not verified these yet. If asked,
  say plainly that you do not have that figure yet and that it must come from the university's
  official page, then offer what you can: which step of their plan covers finding it.
- Never invent a university, a programme or a fact that is not in the CONTEXT.
- Never ask for passport numbers, document scans, addresses or contact details. You do not
  need them and this app does not collect them here.
- Never promise admission or estimate their chances as a number.

HOW YOU WRITE:
- Short. Two or three sentences usually. This is a chat panel, not an essay.
- Second person, plain warm English. No markdown, no bullet lists, no emoji.
- If their question is about a task in their plan, name the task.
- If you genuinely do not know, say so in one sentence and suggest the next useful step.`

function buildContext({ profile, plan }) {
  const lines = [
    'CONTEXT',
    `Goal: ${profile.degree} in ${profile.field}, ${profile.destinationLabel}, ${profile.intake} intake.`,
    `English level on file: ${profile.englishLevel}.`,
  ]
  // Absence has to be stated, not left as a missing section. Without this the model treats
  // an empty context as "not listed here" and invents tasks and universities to fill it.
  if (plan?.tasks?.length) {
    lines.push('', 'Their current plan:')
    plan.tasks.forEach((task, index) => lines.push(
      `${index + 1}. [${task.state}] ${task.shortTitle} — ${task.description} (${task.subtasks.join('; ')})`))
  } else {
    lines.push('', 'THERE IS NO PLAN YET. They have not generated one. Do not name any task or step.')
  }

  if (plan?.shortlist?.length) {
    lines.push('', 'Universities we have verified for them:')
    for (const uni of plan.shortlist.slice(0, 8)) {
      lines.push(`- ${uni.name}, ${uni.city} — teaches ${uni.fields.join(', ')}; in ${uni.languages.join('/')}`)
    }
  } else {
    lines.push('', 'THERE IS NO SHORTLIST YET. Do not name any university.')
  }

  lines.push('', 'We do NOT have: fees, deadlines, entry scores, acceptance rates, scholarships.')
  return lines.join('\n')
}

/** @returns {{reply: string, source: {kind: string, model?: string, reason?: string}}} */
export async function askLeo({ apiKey, profile, plan, history, message, lang = 'en' }) {
  // The body comes from a client, so a number or an object is malformed input, not a message.
  const clean = typeof message === 'string' ? message.trim().slice(0, MAX_CHARS) : ''
  if (!clean) return { error: 'Say something first', status: 400 }

  if (!apiKey) return { reply: offline(clean, plan), source: { kind: 'rules', reason: 'no_api_key' } }

  // Only the recent turns: the whole history would grow the prompt without adding much.
  const turns = (Array.isArray(history) ? history : [])
    .filter(turn => turn && typeof turn.text === 'string')
    .slice(-MAX_TURNS)
    .map(turn => ({ role: turn.from === 'leo' ? 'model' : 'user', parts: [{ text: String(turn.text).slice(0, MAX_CHARS) }] }))

  try {
    const { text, model } = await callGemini({
      apiKey,
      system: `${SYSTEM}\n\n${languageRule(lang)}\n\n${buildContext({ profile, plan })}`,
      contents: [...turns, { role: 'user', parts: [{ text: clean }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
      signal: AbortSignal.timeout(25_000),
    })
    const reply = String(text ?? '').trim()
    if (!reply) throw new Error('empty reply')
    return { reply, source: { kind: 'gemini', model } }
  } catch (error) {
    return { reply: offline(clean, plan), source: { kind: 'rules', reason: error.name === 'TimeoutError' ? 'timeout' : 'model_unavailable' } }
  }
}

/**
 * What Leo says when the model is unreachable. It points at the plan rather than pretending
 * to think, because a wrong-but-fluent answer is worse here than an honest short one.
 */
function offline(message, plan) {
  const current = plan?.tasks?.find(task => task.state === 'current') ?? plan?.tasks?.[0]
  const asksForNumbers = /\b(ielts|toefl|sat|score|fee|cost|tuition|deadline|when|price|scholarship)\b/i.test(message)
  if (asksForNumbers) {
    return 'I don\'t have that figure yet — it has to come from the university\'s official page, and we only show numbers we have checked. '
      + (current ? `Your current step, "${current.shortTitle}", is where we go and find it.` : '')
  }
  return current
    ? `I can't reach my brain right now, but your next step is "${current.shortTitle}": ${current.subtasks[0]}.`
    : 'You don\'t have a plan yet — open the Decision Map and generate one, and then I can talk you through it.'
}
