import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { query, isReachable, pool } from '../server/db.js'
import { register } from '../server/auth.js'
import { saveProfile } from '../server/profiles.js'
import { route } from '../server/routes.js'

const up = await isReachable()
const db = { skip:up ? false : 'postgres is not running (docker compose up -d core-db)' }
const made = []

test('My Matches returns a complete first result without waiting for the model', db, async () => {
  const username = `matches_${Math.random().toString(36).slice(2, 10)}`
  made.push(username)
  const { user, session } = await register({ username, password:'a-good-passphrase', email: `${username}@example.test` })
  await saveProfile(user.id, {
    destinations:['de', 'hu', 'it'], degree:'Bachelor', field:'Business & Management',
    intake:new Date().getFullYear() + 1, englishLevel:'C2',
  })

  const started = performance.now()
  const response = await route({
    method:'GET', path:'/api/me/diagnosis', body:'', apiKey:null,
    cookie:`p2u_session=${session.token}`, userAgent:'advisor-test',
  })
  const elapsed = performance.now() - started

  assert.equal(response.status, 200, JSON.stringify(response.body))
  // The integration suite can run against hosted Supabase, so this includes two network
  // round-trips. Keep the budget far below the model timeout (25s) without pretending that
  // an internet database has local-Postgres latency.
  assert.ok(elapsed < 3000, `the first My Matches response took ${Math.round(elapsed)}ms`)
  assert.equal(typeof response.body.diagnosis.summary, 'string')
  assert.ok(response.body.diagnosis.strengths.length > 0)
  assert.ok(response.body.matches.length >= 3)
  assert.equal(response.body.cached, false)
})

after(async () => {
  if (up && made.length) await query('delete from users where username = any($1)', [made])
  await pool.end()
})
