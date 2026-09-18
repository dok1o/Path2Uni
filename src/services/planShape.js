// The plan's shape and layout. Owned by the app, never by the model: a language model
// asked for pixel coordinates returns overlapping nonsense, and the graph is a UI concern.
// The model supplies ordered tasks; everything below turns them into the rendered plan.

import { translate } from '../locales/index.js'

export const TASK_TYPES = ['research', 'documents', 'application']
const XP_BY_TYPE = { research: 120, documents: 180, application: 300 }

/** Drops anything the model invented outside the three types the UI can render. */
export function normalizeTasks(rawTasks, { destination }, lang = 'en') {
  const clean = (Array.isArray(rawTasks) ? rawTasks : [])
    .filter(task => task && TASK_TYPES.includes(task.type) && task.title)
    .slice(0, 6)
    .map((task, index) => ({
      id: `task-${index + 1}-${task.type}`,
      type: task.type,
      title: String(task.title).slice(0, 120),
      shortTitle: String(task.shortTitle || task.title).slice(0, 34),
      description: String(task.description || '').slice(0, 260),
      subtasks: (Array.isArray(task.subtasks) ? task.subtasks : []).slice(0, 4).map(s => String(s).slice(0, 120)),
    }))
    .filter(task => task.subtasks.length > 0)

  return clean.map((task, index) => ({
    ...task,
    // The client sends this back to tick a task off. getCurrentPlan() sets it from the stored
    // column; setting it here too means a freshly generated plan is completable straight away
    // rather than only after a reload.
    position: index,
    state: index === 0 ? 'current' : 'locked',
    xp: XP_BY_TYPE[task.type],
    // Written in the plan's language at generation time: the label is stored, so it cannot
    // be translated later without regenerating the plan.
    due: index === 0
      ? translate(lang, 'Today · 12 min')
      : index === clean.length - 1
        ? translate(lang, 'Rounds open in {month}', { month: translate(lang, destination.earliest) })
        : translate(lang, 'Unlocks after {task}', { task: clean[index - 1].shortTitle }),
  }))
}

/**
 * How many pages this plan can actually point at: the official sites of the shortlisted
 * universities, plus the national application portal. Every one of them is a link we hold,
 * not a number someone typed. The previous count was a per-country literal — it claimed
 * "12 verified pages" for a pipeline that has not verified anything yet.
 */
export function countSources(shortlist = []) {
  return shortlist.filter(entry => entry?.website).length + 1
}

export function buildGraph(context, tasks, shortlist = []) {
  const { destination, field, degree, intake, englishLevel, needsTest } = context
  const sources = countSources(shortlist)
  const nodes = [
    // No GPA: nothing in this app asks for one, and a number nobody entered is not their profile.
    { id: 'profile', type: 'profile', label: 'Your profile', meta: `English ${englishLevel} · ${degree}`, x: 12, y: 50, detail: 'The answers you gave after registration. This is the context for every decision below.' },
    { id: 'goal', type: 'goal', label: `${destination.label} · ${intake}`, meta: `${degree} goal`, x: 32, y: 18, detail: `Target: ${field} in ${destination.label}, ${intake} intake.` },
    { id: 'source', type: 'source', portal: destination.portal, label: 'Official sources', meta: sources === 1 ? `${destination.portal}` : `${sources} official pages`, x: 32, y: 82, detail: `The official sites of the universities on your shortlist, plus ${destination.portal}. These are the pages to confirm every figure against — we link them, we have not read them for you.` },
    { id: 'requirement', type: 'requirement', label: 'Entry requirements', meta: needsTest ? 'English · grades · documents' : 'grades · documents', x: 54, y: 30, detail: needsTest ? `Your ${englishLevel} English is below the usual bar, so a certificate is required before ${destination.portal} will accept the application.` : 'The AI converts sourced facts into explicit requirements and flags contradictions for review.' },
  ]
  // A node card is ~20% of the canvas wide and ~9% tall, so tasks keep a full card's gap
  // from the requirement column and from each other however many the plan returns.
  const step = 76 / Math.max(tasks.length - 1, 1)
  tasks.forEach((task, index) => nodes.push({
    id: task.id, type: 'task', taskType: task.type, label: task.shortTitle,
    meta: `Task ${index + 1} · ${task.state}`,
    x: index % 2 ? 86 : 74, y: 12 + index * step,
    detail: task.description,
  }))

  const edges = [['profile', 'goal'], ['profile', 'source'], ['goal', 'requirement'], ['source', 'requirement'], ['requirement', tasks[0].id]]
  tasks.slice(1).forEach((task, index) => edges.push([tasks[index].id, task.id]))
  return { nodes, edges }
}

/** Assembles the wire format both the model path and the offline fallback return. */
export function assemblePlan({ context, tasks, confidence, source, shortlist = [] }) {
  return {
    status: 'generated',
    generatedAt: new Date().toISOString(),
    confidence,
    sourceCount: countSources(shortlist),
    graph: buildGraph(context, tasks, shortlist),
    tasks,
    shortlist,
    source,
  }
}
