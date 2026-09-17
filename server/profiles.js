// Reading and writing a person's own profile and plan.
//
// Every function here takes a userId and scopes its query by it. There is no "fetch by id"
// that trusts an id from the client — the session decides whose data is reachable, which is
// the only way this stays correct once Row-Level Security is not yet in place.

import { query, pool } from './db.js'
import { encrypt, decrypt, encryptionReady, isEncrypted } from './crypto.js'
import { destinations, fields, degrees } from '../src/services/planContext.js'

const OBJECTIVE_CONTEXT = 'roadmaps.objective'
const LEVELS = new Set(['school', 'bachelor', 'master', 'phd'])

// The onboarding offers only destinations the curated catalogue actually covers, so a plan
// can always be backed by real universities.
export const destinationOptions = Object.entries(destinations)
  .filter(([, value]) => value.iso)
  .reduce((list, [key, value]) => (list.some(item => item.iso === value.iso) ? list : [...list, { key, iso: value.iso, label: value.label }]), [])
  .sort((a, b) => a.label.localeCompare(b.label))

export const fieldOptions = [...new Map(Object.values(fields).map(field => [field.label, field])).values()]
  .sort((a, b) => a.label.localeCompare(b.label))

export const levelOptions = Object.values(degrees)
export const englishLevels = ['A2', 'B1', 'B2', 'C1', 'C2']

export function validateProfile(input = {}) {
  const errors = {}
  const destination = destinationOptions.find(item => item.iso === input.destination)
  if (!destination) errors.destination = 'Choose a destination from the list.'

  const level = String(input.degree || '').toLowerCase()
  if (!LEVELS.has(level)) errors.degree = 'Choose a degree level.'

  const field = fieldOptions.find(item => item.label === input.field)
  if (!field) errors.field = 'Choose a field of study.'

  const year = Number(input.intake)
  const thisYear = new Date().getFullYear()
  if (!Number.isInteger(year) || year < thisYear || year > thisYear + 8) {
    errors.intake = `Pick an intake year between ${thisYear} and ${thisYear + 8}.`
  }

  const english = String(input.englishLevel || '').toUpperCase()
  if (!englishLevels.includes(english)) errors.englishLevel = 'Choose your English level.'

  return Object.keys(errors).length
    ? { errors }
    : { value: { destination: destination.iso, destinationLabel: destination.label, degree: level, field: field.label, intake: year, englishLevel: english } }
}

// `target_level` is stored as the education_level enum, which is lowercase. The client
// renders this straight into chips and headings, so present it the way it should read.
const titleCase = value => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value)

const rowToProfile = row => row && ({
  id: row.id,
  destination: row.target_country_code,
  destinationLabel: destinationOptions.find(item => item.iso === row.target_country_code)?.label ?? row.target_country_code,
  degree: titleCase(row.target_level),
  field: row.target_field,
  intake: row.target_start_year,
  englishLevel: row.english_level,
})

export async function getProfile(userId) {
  const { rows } = await query(
    `select id, target_country_code, target_level, target_field, target_start_year, english_level
     from applicant_profiles where user_id = $1`, [userId])
  return rowToProfile(rows[0]) ?? null
}

export async function saveProfile(userId, input) {
  const checked = validateProfile(input)
  if (checked.errors) return { errors: checked.errors }
  const { destination, degree, field, intake, englishLevel } = checked.value

  // One profile per user, so an upsert rather than insert-or-update branching.
  const { rows } = await query(
    `insert into applicant_profiles
       (user_id, target_level, target_country_code, target_field, target_start_year, english_level)
     values ($1, $2::education_level, $3, $4, $5, $6)
     on conflict (user_id) do update set
       target_level = excluded.target_level,
       target_country_code = excluded.target_country_code,
       target_field = excluded.target_field,
       target_start_year = excluded.target_start_year,
       english_level = excluded.english_level,
       updated_at = now()
     returning id, target_country_code, target_level, target_field, target_start_year, english_level`,
    [userId, degree, destination, field, intake, englishLevel])
  return { profile: rowToProfile(rows[0]) }
}

/** The shape the plan generator expects, built from stored columns. */
export const profileForPlanning = profile => profile && ({
  destination: profile.destinationLabel,
  degree: profile.degree,
  field: profile.field,
  intake: String(profile.intake),
  languages: [{ name: 'English', level: profile.englishLevel }],
})

/**
 * Stores a generated plan and marks it current. The graph is not stored: planShape.js lays
 * it out from the tasks, so persisting it would freeze a UI decision into the database.
 */
export async function savePlan(userId, { plan, objective }) {
  const profile = await getProfile(userId)
  if (!profile) return { error: 'Complete your profile first', status: 409 }

  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('update roadmaps set is_current = false where profile_id = $1', [profile.id])

    const storedObjective = objective && encryptionReady()
      ? encrypt(String(objective).slice(0, 500), OBJECTIVE_CONTEXT)
      : null

    const { rows } = await client.query(
      `insert into roadmaps (profile_id, title, objective, confidence, source_count, shortlist, source)
       values ($1, $2, $3, $4, $5, $6, $7) returning id, created_at`,
      [profile.id, `${profile.field} in ${profile.destinationLabel}`.slice(0, 120), storedObjective,
        plan.confidence ?? null, plan.sourceCount ?? null,
        JSON.stringify(plan.shortlist ?? []), JSON.stringify(plan.source ?? {})])
    const roadmapId = rows[0].id

    for (const [index, task] of (plan.tasks ?? []).entries()) {
      await client.query(
        `insert into roadmap_tasks
           (roadmap_id, category, title, short_title, description, subtasks, xp, due_label, position, status, priority)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::task_status, $11)`,
        [roadmapId, task.type, task.title, task.shortTitle, task.description,
          JSON.stringify(task.subtasks ?? []), task.xp ?? null, task.due ?? null, index,
          task.state === 'current' ? 'in_progress' : 'todo', Math.min(index + 1, 5)])
    }
    await client.query('commit')
    return { roadmapId, createdAt: rows[0].created_at }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

/** The current plan, in the same shape the client already renders. */
export async function getCurrentPlan(userId) {
  const profile = await getProfile(userId)
  if (!profile) return null

  const { rows } = await query(
    `select id, objective, confidence, source_count, shortlist, source, created_at
     from roadmaps where profile_id = $1 and is_current order by created_at desc limit 1`, [profile.id])
  const roadmap = rows[0]
  if (!roadmap) return null

  const { rows: taskRows } = await query(
    `select category, title, short_title, description, subtasks, xp, due_label, status, position
     from roadmap_tasks where roadmap_id = $1 order by position`, [roadmap.id])

  const tasks = taskRows.map((row, index) => ({
    id: `task-${index + 1}-${row.category}`,
    type: row.category,
    title: row.title,
    shortTitle: row.short_title ?? row.title,
    description: row.description ?? '',
    subtasks: row.subtasks ?? [],
    xp: row.xp ?? 0,
    due: row.due_label ?? '',
    state: row.status === 'done' ? 'done' : index === 0 ? 'current' : 'locked',
  }))
  if (!tasks.length) return null

  return {
    roadmapId: roadmap.id,
    // A plan written before a key was configured, or by an older build, is plain text.
    objective: isEncrypted(roadmap.objective) ? decrypt(roadmap.objective, OBJECTIVE_CONTEXT) : roadmap.objective,
    confidence: roadmap.confidence === null ? 0.8 : Number(roadmap.confidence),
    sourceCount: roadmap.source_count ?? 0,
    shortlist: roadmap.shortlist ?? [],
    source: roadmap.source ?? {},
    tasks,
    createdAt: roadmap.created_at,
  }
}
