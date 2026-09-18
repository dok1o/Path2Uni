// Exam results. Needs path2uni_core; skips itself when the database is down.

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { query, isReachable, pool } from '../server/db.js'
import { register } from '../server/auth.js'
import { saveProfile } from '../server/profiles.js'
import { validateTests, getTests, saveTests } from '../server/tests.js'
import { route } from '../server/routes.js'
import { englishGap } from '../src/data/admissionDemo.js'

const up = await isReachable()
const db = { skip: up ? false : 'postgres is not running' }
const made = []
async function newUser({ withProfile = true } = {}) {
  const username = `test_${Math.random().toString(36).slice(2, 10)}`
  made.push(username)
  const { user, session } = await register({ username, password: 'a-good-passphrase', email: `${username}@example.test` })
  if (withProfile) await saveProfile(user.id, { destination: 'hu', degree: 'Bachelor', field: 'Medicine', intake: new Date().getFullYear() + 1, englishLevel: 'B2' })
  return { user, session }
}
after(async () => {
  if (up && made.length) await query('delete from users where username = any($1)', [made])
  await pool.end()
})

const IELTS = { test_code: 'IELTS', test_name: 'IELTS Academic', status: 'completed', score: 7, test_date: '2026-05-14' }
const SAT = { test_code: 'SAT', test_name: 'SAT', status: 'planned', planned_date: '2026-11-07' }

// ---------- validation ----------

test('a test outside the catalogue is refused, not stored', () => {
  assert.match(validateTests([{ test_code: 'WIZARDRY', status: 'completed' }]).error, /unknown test/)
  assert.match(validateTests([{ test_code: '', status: 'completed' }]).error, /unknown test/)
})

test('an unknown status is refused', () => {
  assert.match(validateTests([{ ...IELTS, status: 'maybe' }]).error, /unknown status/)
})

test('a non-numeric score is refused rather than stored as NaN', () => {
  assert.match(validateTests([{ ...IELTS, score: 'seven' }]).error, /not a number/)
  assert.equal(validateTests([{ ...IELTS, score: '' }]).error, undefined, 'an empty score is allowed')
  assert.equal(validateTests([{ ...IELTS, score: null }]).value[0].score, null)
})

test('the same exam cannot be submitted twice', () => {
  assert.match(validateTests([IELTS, { ...IELTS, score: 8 }]).error, /twice/)
})

test('junk input cannot crash validation', () => {
  assert.ok(validateTests('nope').error)
  assert.ok(validateTests(null).error)
  assert.equal(validateTests([null, undefined, 'x']).value.length, 0)
  assert.ok(validateTests(Array.from({ length: 30 }, () => IELTS)).error)
})

test('only the date matching the status is kept', () => {
  const [completed] = validateTests([{ ...IELTS, planned_date: '2027-01-01' }]).value
  assert.equal(completed.takenOn, '2026-05-14')
  assert.equal(completed.plannedOn, null, 'a completed exam kept a planned date')

  const [planned] = validateTests([{ ...SAT, test_date: '2020-01-01' }]).value
  assert.equal(planned.plannedOn, '2026-11-07')
  assert.equal(planned.takenOn, null, 'a planned exam kept a taken date')
})

test('an undateable result is named and refused, not stored dateless', () => {
  // It used to fall through as null. 010 makes such a row unstorable anyway, and a result
  // nobody can date cannot be checked against a validity window.
  assert.match(validateTests([{ ...IELTS, test_date: 'someday' }]).error, /IELTS/)
  assert.match(validateTests([{ ...SAT, planned_date: null }]).error, /planned date/)
})

// ---------- storage ----------

test('tests save, read back, and keep their dates to the day', db, async () => {
  const { user } = await newUser()
  assert.deepEqual(await getTests(user.id), [])

  const saved = await saveTests(user.id, [IELTS, SAT])
  assert.equal(saved.tests.length, 2)

  const [ielts, sat] = (await getTests(user.id)).sort((a, b) => a.test_code.localeCompare(b.test_code))
  // A DATE read back through the driver used to shift a day on any positive UTC offset.
  assert.equal(ielts.test_date, '2026-05-14', 'the exam date moved')
  assert.equal(ielts.score, 7)
  assert.equal(sat.planned_date, '2026-11-07', 'the planned date moved')
  assert.equal(sat.score, null)
})

test('saving replaces the whole set, so a removed exam disappears', db, async () => {
  const { user } = await newUser()
  await saveTests(user.id, [IELTS, SAT])
  await saveTests(user.id, [IELTS])
  const rows = await getTests(user.id)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].test_code, 'IELTS')
})

test('a text grade is stored for exams that have no numeric score', db, async () => {
  const { user } = await newUser()
  await saveTests(user.id, [{ test_code: 'A_LEVEL', test_name: 'A-level', status: 'completed', score_text: 'A*', test_date: '2025-06-12' }])
  const [row] = await getTests(user.id)
  assert.equal(row.score_text, 'A*')
  assert.equal(row.score, null)
})

test('a result without its date is a 400, not a constraint violation', db, async () => {
  // 010_require_profile_test_date.sql makes such a row unstorable. Without the same check in
  // validateTests the API would answer 500 and say nothing about which exam was wrong.
  const { user } = await newUser()
  const result = await saveTests(user.id, [{ test_code: 'IELTS', test_name: 'IELTS Academic', status: 'completed', score: 7 }])
  assert.match(result.error, /IELTS/)
  assert.match(result.error, /test date/)
})

test('a mock sitting is stored, dated, and never counts as a certificate', db, async () => {
  const { user } = await newUser()
  await saveTests(user.id, [{ test_code: 'IELTS', test_name: 'IELTS Academic', status: 'mock', score: 7.5, test_date: '2026-02-10' }])
  const [row] = await getTests(user.id)
  assert.equal(row.status, 'mock')
  assert.equal(row.test_date, '2026-02-10')
  assert.equal(row.planned_date, null)
  // A practice score is a real number on a real day, but it proves nothing to an admissions office.
  const gap = englishGap({ englishLevel: 'B2', tests: await getTests(user.id) }, { test: 'IELTS', band: 6.5 })
  assert.notEqual(gap.status, 'clear')
  assert.match(gap.detail, /mock/i)
})

test('tests cannot be stored without a profile', db, async () => {
  const { user } = await newUser({ withProfile: false })
  assert.equal((await saveTests(user.id, [IELTS])).status, 409)
})

test('one account never sees another account’s results', db, async () => {
  const mine = await newUser(), theirs = await newUser()
  await saveTests(mine.user.id, [IELTS])
  assert.deepEqual(await getTests(theirs.user.id), [])
  assert.equal((await getTests(mine.user.id)).length, 1)
})

test('deleting a user takes their results with them', db, async () => {
  const { user } = await newUser()
  await saveTests(user.id, [IELTS])
  await query('delete from users where id = $1', [user.id])
  const { rows } = await query('select count(*)::int as n from profile_tests pt join applicant_profiles p on p.id = pt.profile_id where p.user_id = $1', [user.id])
  assert.equal(rows[0].n, 0)
})

// ---------- the HTTP surface ----------

const call = (method, body, cookie) =>
  route({ method, path: '/api/me/tests', body: body === undefined ? '' : JSON.stringify(body), cookie, userAgent: 'test', apiKey: null })

test('the route refuses an anonymous caller', db, async () => {
  assert.equal((await call('GET', undefined, '')).status, 401)
  assert.equal((await call('PUT', { tests: [IELTS] }, '')).status, 401)
})

test('a full round trip over the router', db, async () => {
  const { session } = await newUser()
  const cookie = `p2u_session=${session.token}`
  assert.deepEqual((await call('GET', undefined, cookie)).body.tests, [])

  const saved = await call('PUT', { tests: [IELTS, SAT] }, cookie)
  assert.equal(saved.status, 200)
  assert.equal(saved.body.tests.length, 2)
  assert.equal((await call('GET', undefined, cookie)).body.tests.length, 2)
})

test('the route reports a bad payload as 400, not 500', db, async () => {
  const { session } = await newUser()
  const cookie = `p2u_session=${session.token}`
  assert.equal((await call('PUT', { tests: 'nope' }, cookie)).status, 400)
  assert.equal((await call('PUT', { tests: [{ test_code: 'NOPE' }] }, cookie)).status, 400)
  assert.equal((await call('PUT', {}, cookie)).status, 400)
})
