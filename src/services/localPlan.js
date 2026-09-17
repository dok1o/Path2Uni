// Deterministic rule-based planner. Two jobs: it runs with no backend at all, and it is
// what the API falls back to when the model is rate-limited or unavailable — which on a
// free tier is a routine event, not an edge case.

import { readObjective } from './planContext.js'
import { assemblePlan, normalizeTasks } from './planShape.js'

function draftTasks({ destination, field, degree, intake, englishLevel, needsTest }) {
  const tasks = [{
    type: 'research', shortTitle: 'University research',
    title: `Research your best-fit ${field} programmes`,
    description: `Compare ${String(degree).toLowerCase()} programmes in ${destination.label} using verified admission sources.`,
    subtasks: ['Review AI shortlist', 'Compare entry requirements', 'Save 5 programmes'],
  }]
  if (needsTest) tasks.push({
    type: 'documents', shortTitle: 'English certificate',
    title: 'Reach the English score your programmes ask for',
    description: `Your profile shows ${englishLevel}. Most ${destination.label} programmes ask for IELTS 6.0-6.5, so the certificate comes before the application.`,
    subtasks: ['Choose IELTS or TOEFL', 'Book the exam date', 'Build a 6-week study plan'],
  })
  tasks.push({
    type: 'documents', shortTitle: 'Core documents',
    title: 'Prepare your core documents',
    description: 'Collect and validate the documents shared across all your applications.',
    subtasks: ['Academic transcript', 'Passport copy', destination.extraDoc],
  })
  tasks.push({
    type: 'application', shortTitle: 'Application',
    title: `Submit through ${destination.portal}`,
    description: `Turn your verified requirements into a submitted ${intake} application before the earliest round closes.`,
    subtasks: ['Motivation letter', `${destination.portal} form`, 'Final source check'],
  })
  return tasks
}

export function buildLocalPlan({ profile, objective, shortlist = [], reason = 'offline' }) {
  const context = readObjective(objective, profile)
  const tasks = normalizeTasks(draftTasks(context), context)
  return assemblePlan({
    context, tasks, shortlist,
    confidence: Math.min(0.72 + context.matched * 0.06, 0.94),
    source: { kind: 'rules', reason },
  })
}
