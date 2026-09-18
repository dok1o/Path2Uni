// Needs path2uni_core. Skips itself when the database is not running.

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { query, isReachable, pool } from '../server/db.js'
import { register } from '../server/auth.js'
import { isEncrypted, decrypt } from '../server/crypto.js'
import {
  validateProfile, getProfile, saveProfile, profileForPlanning,
  savePlan, getCurrentPlan, destinationOptions, fieldOptions,
} from '../server/profiles.js'
import { route } from '../server/routes.js'
import { curatedIsos, FIELDS } from '../src/data/worldUniversities.js'
import { buildLocalPlan } from '../src/services/localPlan.js'

const up = await isReachable()
const db = { skip: up ? false : 'postgres is not running (docker compose up -d core-db)' }

const made = []
async function newUser() {
  const username = `test_${Math.random().toString(36).slice(2, 10)}`
  made.push(username)
  const { user, session } = await register({ username, password: 'a-good-passphrase' })
  return { user, session }
}
after(async () => {
  if (up && made.length) await query('delete from users where username = any($1)', [made])
  await pool.end()
})

const VALID = { destination: 'hu', degree: 'Bachelor', field: 'Medicine', intake: new Date().getFullYear() + 1, englishLevel: 'B2' }

// ---------- options offered to the client ----------

test('every destination offered is one the catalogue actually covers', () => {
  assert.ok(destinationOptions.length > 0)
  for (const option of destinationOptions) {
    assert.ok(curatedIsos.has(option.iso), `${option.label} has no curated universities`)
  }
  const isos = destinationOptions.map(option => option.iso)
  assert.equal(new Set(isos).size, isos.length, 'the same country is offered twice')
})

test('every field offered maps to a real catalogue tag', () => {
  for (const field of fieldOptions) assert.ok(FIELDS.includes(field.tag), `${field.label} -> ${field.tag}`)
  const labels = fieldOptions.map(field => field.label)
  assert.equal(new Set(labels).size, labels.length, 'a field label is offered twice')
})

// ---------- validation ----------

test('a complete profile validates and is normalised', () => {
  const { value, errors } = validateProfile(VALID)
  assert.equal(errors, undefined)
  assert.equal(value.degree, 'bachelor', 'the degree must be lowered to the enum value')
  assert.equal(value.destinationLabel, 'Hungary')
  assert.equal(typeof value.intake, 'number')
})

test('every field is checked, and the errors name the field', () => {
  const { errors } = validateProfile({ destination: 'zz', degree: 'wizard', field: 'Astrology', intake: 1999, englishLevel: 'Z9' })
  assert.deepEqual(Object.keys(errors).sort(), ['degree', 'destination', 'englishLevel', 'field', 'intake'])
})

test('an intake year outside the sensible window is refused', () => {
  const year = new Date().getFullYear()
  assert.ok(validateProfile({ ...VALID, intake: year - 1 }).errors?.intake)
  assert.ok(validateProfile({ ...VALID, intake: year + 9 }).errors?.intake)
  assert.ok(validateProfile({ ...VALID, intake: 2027.5 }).errors?.intake)
  assert.equal(validateProfile({ ...VALID, intake: year }).errors, undefined)
})

test('validation survives junk input', () => {
  for (const input of [undefined, {}, null, { destination: {}, degree: [], field: 7, intake: 'soon', englishLevel: null }]) {
    assert.ok(validateProfile(input ?? undefined).errors, `accepted ${JSON.stringify(input)}`)
  }
})

test('a destination outside the curated set is refused even if it exists in planContext', () => {
  // France and Spain are known destinations but have no curated universities, so the
  // onboarding must not offer them and the server must not accept them.
  assert.ok(validateProfile({ ...VALID, destination: 'fr' }).errors?.destination)
})

// ---------- several destinations ----------

test('a list of destinations validates, in the order it was given', () => {
  const { value, errors } = validateProfile({ ...VALID, destination: undefined, destinations: ['de', 'nl', 'hu'] })
  assert.equal(errors, undefined)
  assert.deepEqual(value.destinations, ['de', 'nl', 'hu'])
  assert.deepEqual(value.destinationLabels, ['Germany', 'Netherlands', 'Hungary'])
  // The head of the list is the primary: what the roadmap is written for.
  assert.equal(value.destination, 'de')
  assert.equal(value.destinationLabel, 'Germany')
})

test('a single destination is still accepted and read as a one-element list', () => {
  // The profile editor and older clients send the scalar; they must keep working.
  const { value } = validateProfile(VALID)
  assert.deepEqual(value.destinations, ['hu'])
  assert.equal(value.destination, 'hu')
})

test('one bad code in the list fails the whole list rather than being dropped', () => {
  // Silently ignoring it would let a typo shrink someone's shortlist without telling them.
  assert.ok(validateProfile({ ...VALID, destinations: ['de', 'zz'] }).errors?.destination)
  assert.ok(validateProfile({ ...VALID, destinations: ['de', 'fr'] }).errors?.destination,
    'a country with no curated universities is not a usable destination')
})

test('an empty or oversized list is refused', () => {
  assert.ok(validateProfile({ ...VALID, destination: undefined, destinations: [] }).errors?.destination)
  assert.ok(validateProfile({ ...VALID, destinations: ['de', 'nl', 'hu', 'it', 'pl'] }).errors?.destination)
})

test('the same country twice counts once', () => {
  const { value } = validateProfile({ ...VALID, destinations: ['de', 'de', 'nl'] })
  assert.deepEqual(value.destinations, ['de', 'nl'])
})

test('destinations round-trip through the database with the primary kept in sync', db, async () => {
  const { user } = await newUser()
  const { profile } = await saveProfile(user.id, { ...VALID, destinations: ['nl', 'de', 'it'] })
  assert.deepEqual(profile.destinations, ['nl', 'de', 'it'])
  assert.equal(profile.destination, 'nl')

  const read = await getProfile(user.id)
  assert.deepEqual(read.destinations, ['nl', 'de', 'it'])
  assert.deepEqual(read.destinationLabels, ['Netherlands', 'Germany', 'Italy'])
  assert.equal(read.destination, 'nl', 'the scalar column must equal the head of the array')

  // 008 makes disagreement between the two unstorable, so a future writer that updates one
  // and forgets the other fails loudly instead of leaving a profile that reads two ways.
  await assert.rejects(
    query('update applicant_profiles set target_country_code = $1 where id = $2', ['de', read.id]),
    /applicant_profiles_primary_country_matches/)
})

test('narrowing to one destination drops the others', db, async () => {
  const { user } = await newUser()
  await saveProfile(user.id, { ...VALID, destinations: ['nl', 'de'] })
  const { profile } = await saveProfile(user.id, { ...VALID, destinations: ['de'] })
  assert.deepEqual(profile.destinations, ['de'])
  assert.equal((await getProfile(user.id)).destination, 'de')
})

test('the roadmap is written for the primary destination only', db, async () => {
  // A plan is a walk through one admission system — its rounds, documents and visa route.
  // The other countries widen the shortlist; they do not multiply the plan.
  const { user } = await newUser()
  await saveProfile(user.id, { ...VALID, destinations: ['nl', 'de'] })
  const shape = profileForPlanning(await getProfile(user.id))
  assert.equal(shape.destination, 'Netherlands')
})

// ---------- storage ----------

test('a profile saves, reads back and is scoped to its owner', db, async () => {
  const { user } = await newUser()
  const other = await newUser()

  assert.equal(await getProfile(user.id), null, 'a new account must start with no profile')
  const { profile } = await saveProfile(user.id, VALID)
  assert.equal(profile.destinationLabel, 'Hungary')
  assert.equal(profile.degree, 'Bachelor', 'the enum value should be presented in title case')

  assert.deepEqual(await getProfile(user.id), profile)
  assert.equal(await getProfile(other.user.id), null, 'one account can see another account’s profile')
})

test('saving twice updates rather than duplicating', db, async () => {
  const { user } = await newUser()
  await saveProfile(user.id, VALID)
  const { profile } = await saveProfile(user.id, { ...VALID, destination: 'de', field: 'Engineering' })
  assert.equal(profile.destinationLabel, 'Germany')
  const { rows } = await query('select count(*)::int as n from applicant_profiles where user_id = $1', [user.id])
  assert.equal(rows[0].n, 1, 'a second profile row was created')
})

test('an invalid profile is rejected before it reaches the database', db, async () => {
  const { user } = await newUser()
  const result = await saveProfile(user.id, { ...VALID, destination: 'zz' })
  assert.ok(result.errors)
  assert.equal(await getProfile(user.id), null, 'a rejected profile was written anyway')
})

test('the planning shape is built from stored columns', db, async () => {
  const { user } = await newUser()
  const { profile } = await saveProfile(user.id, VALID)
  const shaped = profileForPlanning(profile)
  assert.equal(shaped.destination, 'Hungary')
  assert.equal(shaped.degree, 'Bachelor')
  assert.deepEqual(shaped.languages, [{ name: 'English', level: 'B2' }])
  assert.equal(typeof shaped.intake, 'string')
})

// ---------- the plan ----------

const samplePlan = profile => buildLocalPlan({
  profile: profileForPlanning(profile),
  objective: 'Medicine in Hungary taught in English',
})

test('a plan cannot be stored without a profile', db, async () => {
  const { user } = await newUser()
  const result = await savePlan(user.id, { plan: { tasks: [] }, objective: 'x' })
  assert.equal(result.status, 409)
})

test('a plan round-trips through the database', db, async () => {
  const { user } = await newUser()
  const { profile } = await saveProfile(user.id, VALID)
  const original = samplePlan(profile)
  await savePlan(user.id, { plan: original, objective: 'Medicine in Hungary taught in English' })

  const restored = await getCurrentPlan(user.id)
  assert.ok(restored)
  assert.equal(restored.tasks.length, original.tasks.length)
  assert.equal(restored.objective, 'Medicine in Hungary taught in English')
  assert.equal(restored.sourceCount, original.sourceCount)
  assert.deepEqual(restored.source, original.source)
  for (const [index, task] of restored.tasks.entries()) {
    assert.equal(task.type, original.tasks[index].type)
    assert.equal(task.title, original.tasks[index].title)
    assert.equal(task.shortTitle, original.tasks[index].shortTitle)
    assert.deepEqual(task.subtasks, original.tasks[index].subtasks)
    assert.equal(task.xp, original.tasks[index].xp)
    assert.equal(task.due, original.tasks[index].due)
  }
  assert.equal(restored.tasks[0].state, 'current')
  assert.ok(restored.tasks.slice(1).every(task => task.state === 'locked'))
})

test('the objective is stored encrypted, never in the clear', db, async () => {
  const { user } = await newUser()
  const { profile } = await saveProfile(user.id, VALID)
  const objective = 'Medicine in Hungary because my grandmother was a doctor'
  await savePlan(user.id, { plan: samplePlan(profile), objective })

  const { rows } = await query('select objective from roadmaps where profile_id = $1', [profile.id])
  assert.ok(!rows[0].objective.includes('grandmother'), 'the objective is sitting in the clear')
  assert.ok(isEncrypted(rows[0].objective))
  assert.equal(decrypt(rows[0].objective, 'roadmaps.objective'), objective)
})

test('generating again replaces the current plan instead of stacking', db, async () => {
  const { user } = await newUser()
  const { profile } = await saveProfile(user.id, VALID)
  await savePlan(user.id, { plan: samplePlan(profile), objective: 'first attempt' })
  await savePlan(user.id, { plan: samplePlan(profile), objective: 'second attempt' })

  assert.equal((await getCurrentPlan(user.id)).objective, 'second attempt')
  const { rows } = await query('select count(*)::int as n from roadmaps where profile_id = $1 and is_current', [profile.id])
  assert.equal(rows[0].n, 1, 'more than one plan is marked current')
  const { rows: all } = await query('select count(*)::int as n from roadmaps where profile_id = $1', [profile.id])
  assert.equal(all[0].n, 2, 'the earlier plan should be kept, just not current')
})

test('one account never sees another account’s plan', db, async () => {
  const mine = await newUser(), theirs = await newUser()
  const { profile } = await saveProfile(mine.user.id, VALID)
  await saveProfile(theirs.user.id, { ...VALID, destination: 'de' })
  await savePlan(mine.user.id, { plan: samplePlan(profile), objective: 'mine only' })

  assert.equal(await getCurrentPlan(theirs.user.id), null)
  assert.equal((await getCurrentPlan(mine.user.id)).objective, 'mine only')
})

test('deleting a user removes their profile and plans', db, async () => {
  const { user } = await newUser()
  const { profile } = await saveProfile(user.id, VALID)
  await savePlan(user.id, { plan: samplePlan(profile), objective: 'to be deleted' })
  await query('delete from users where id = $1', [user.id])

  for (const [table, column] of [['applicant_profiles', 'user_id'], ['roadmaps', 'profile_id'], ['roadmap_tasks', 'roadmap_id']]) {
    const id = column === 'user_id' ? user.id : profile.id
    const { rows } = await query(`select count(*)::int as n from ${table} where ${column} = $1`, [id])
    if (column !== 'roadmap_id') assert.equal(rows[0].n, 0, `${table} outlived its user`)
  }
})

// ---------- the HTTP surface ----------

const call = (path, { method = 'GET', body, cookie = '' } = {}) =>
  route({ method, path, body: body === undefined ? '' : JSON.stringify(body), cookie, userAgent: 'test', apiKey: null })

test('every /api/me route refuses an anonymous caller', db, async () => {
  for (const [path, method] of [['/api/me/profile', 'GET'], ['/api/me/profile', 'PUT'], ['/api/me/plan', 'GET'], ['/api/me/plan', 'POST']]) {
    const response = await call(path, { method, body: VALID })
    assert.equal(response.status, 401, `${method} ${path} answered ${response.status}`)
  }
})

test('the options endpoint gives the client exactly what onboarding needs', async () => {
  const { status, body } = await call('/api/options')
  assert.equal(status, 200)
  assert.deepEqual(Object.keys(body).sort(), ['destinations', 'englishLevels', 'fields', 'levels'])
  assert.ok(body.destinations.length >= 5 && body.fields.length >= 5)
  assert.deepEqual(body.englishLevels, ['A2', 'B1', 'B2', 'C1', 'C2'])
})

test('a PUT body is parsed — a POST-only parser silently emptied it', db, async () => {
  const { session } = await newUser()
  const cookie = `p2u_session=${session.token}`
  const response = await call('/api/me/profile', { method: 'PUT', body: VALID, cookie })
  assert.equal(response.status, 200, JSON.stringify(response.body))
  assert.equal(response.body.profile.destinationLabel, 'Hungary')
})

test('the profile route reports validation errors per field', db, async () => {
  const { session } = await newUser()
  const cookie = `p2u_session=${session.token}`
  const response = await call('/api/me/profile', { method: 'PUT', body: { ...VALID, intake: 1999 }, cookie })
  assert.equal(response.status, 400)
  assert.ok(response.body.errors.intake)
})

test('a plan cannot be generated before onboarding', db, async () => {
  const { session } = await newUser()
  const response = await call('/api/me/plan', { method: 'POST', body: { objective: 'anything' }, cookie: `p2u_session=${session.token}` })
  assert.equal(response.status, 409)
})

test('a stored plan comes back with its graph rebuilt, not read from the database', db, async () => {
  const { user, session } = await newUser()
  const cookie = `p2u_session=${session.token}`
  const { profile } = await saveProfile(user.id, VALID)
  await savePlan(user.id, { plan: samplePlan(profile), objective: 'Medicine in Hungary' })

  const { body } = await call('/api/me/plan', { cookie })
  assert.ok(body.plan.graph, 'no graph was rebuilt')
  const ids = new Set(body.plan.graph.nodes.map(node => node.id))
  for (const [from, to] of body.plan.graph.edges) assert.ok(ids.has(from) && ids.has(to))
  for (const task of body.plan.tasks) assert.ok(ids.has(task.id), `${task.id} has no node`)

  const { rows } = await query('select * from roadmaps where profile_id = $1 limit 1', [profile.id])
  assert.ok(!('graph' in rows[0]), 'layout is being stored in the database')
})
