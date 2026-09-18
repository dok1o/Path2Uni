// Exam results attached to a profile: what the applicant has taken, and what they plan to.
//
// profile_tests already existed in 001_schema.sql; 006 added the exam name and the
// taken/planned status. A score is either numeric (IELTS 7.0, SAT 1480) or a grade written
// as text (A-level "A*"), so both columns exist and exactly one is filled.

import { query, pool } from './db.js'
import { getProfile } from './profiles.js'

// Mirrors the catalogue offered in the UI. An unknown code is rejected rather than stored,
// so the column cannot quietly fill up with typos from a future client.
const CODES = new Set(['SAT', 'IELTS', 'UNT', 'DET', 'TOEFL_IBT', 'ACT', 'CAMBRIDGE', 'IB', 'AP', 'A_LEVEL', 'OTHER'])
const STATUSES = new Set(['completed', 'planned'])

const asDate = value => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

export function validateTests(rows) {
  if (!Array.isArray(rows)) return { error: 'tests must be an array' }
  if (rows.length > 20) return { error: 'too many tests' }

  const clean = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const code = String(row.test_code ?? '').toUpperCase()
    if (!CODES.has(code)) return { error: `unknown test: ${code || '(empty)'}` }
    const status = String(row.status ?? 'completed')
    if (!STATUSES.has(status)) return { error: `unknown status: ${status}` }

    const score = row.score === null || row.score === undefined || row.score === ''
      ? null : Number(row.score)
    if (score !== null && !Number.isFinite(score)) return { error: `score for ${code} is not a number` }

    clean.push({
      code,
      name: String(row.test_name ?? code).slice(0, 80),
      status,
      score,
      scoreText: row.score_text ? String(row.score_text).slice(0, 40) : null,
      // A completed exam has a date in the past tense, a planned one in the future; the UI
      // collects one field, so only the matching column is filled.
      takenOn: status === 'completed' ? asDate(row.test_date) : null,
      plannedOn: status === 'planned' ? asDate(row.planned_date) : null,
    })
  }
  const codes = clean.map(test => test.code)
  if (new Set(codes).size !== codes.length) return { error: 'the same test was sent twice' }
  return { value: clean }
}

const toClient = row => ({
  test_code: row.test_code,
  test_name: row.test_name,
  status: row.status,
  score: row.score === null ? null : Number(row.score),
  score_text: row.score_text,
  // Already a plain YYYY-MM-DD string: see the DATE type parser in db.js.
  test_date: row.test_date ?? null,
  planned_date: row.planned_date ?? null,
})

export async function getTests(userId) {
  const profile = await getProfile(userId)
  if (!profile) return []
  const { rows } = await query(
    `select test_code, test_name, status, score, score_text, test_date, planned_date
     from profile_tests where profile_id = $1 order by test_code`, [profile.id])
  return rows.map(toClient)
}

/** Replaces the whole set: the UI submits the full list, so a removed exam must disappear. */
export async function saveTests(userId, rows) {
  const profile = await getProfile(userId)
  if (!profile) return { error: 'Complete your profile first', status: 409 }

  const checked = validateTests(rows)
  if (checked.error) return { error: checked.error, status: 400 }

  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('delete from profile_tests where profile_id = $1', [profile.id])
    for (const test of checked.value) {
      await client.query(
        `insert into profile_tests
           (profile_id, test_code, test_name, status, score, score_text, test_date, planned_date)
         values ($1, $2, $3, $4::exam_status, $5, $6, $7, $8)`,
        [profile.id, test.code, test.name, test.status, test.score, test.scoreText, test.takenOn, test.plannedOn])
    }
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
  return { tests: await getTests(userId) }
}
