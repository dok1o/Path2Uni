import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { query, isReachable, pool } from '../server/db.js'
import { register } from '../server/auth.js'
import { saveProfile, savePlan, profileForPlanning } from '../server/profiles.js'
import { askLeo } from '../server/chat.js'
import { route } from '../server/routes.js'
import { buildLocalPlan } from '../src/services/localPlan.js'

const up = await isReachable()
const db = { skip: up ? false : 'postgres is not running' }
const key = process.env.GEMINI_API_KEY || null
const live = { skip: key ? false : 'no GEMINI_API_KEY' }

const made = []
async function newUser() {
  const username = `test_${Math.random().toString(36).slice(2, 10)}`
  made.push(username)
  return register({ username, password: 'a-good-passphrase', email: `${username}@example.test` })
}
after(async () => {
  if (up && made.length) await query('delete from users where username = any($1)', [made])
  await pool.end()
})

const PROFILE = { destination: 'hu', degree: 'Bachelor', field: 'Medicine', intake: new Date().getFullYear() + 1, englishLevel: 'B2' }
const context = profile => ({ profile, plan: buildLocalPlan({ profile: profileForPlanning(profile), objective: 'Medicine in Hungary' }) })

test('an empty message is refused before any model call', async () => {
  for (const message of ['', '   ', null, undefined, 42]) {
    const result = await askLeo({ apiKey: null, profile: { degree: 'Bachelor' }, plan: null, message })
    assert.equal(result.status, 400, `accepted ${JSON.stringify(message)}`)
  }
})

test('with no key Leo still answers, and says where the number must come from', async () => {
  const { profile } = { profile: { ...PROFILE, destinationLabel: 'Hungary' } }
  const result = await askLeo({ apiKey: null, profile, plan: null, message: 'What IELTS score do I need?' })
  assert.equal(result.source.kind, 'rules')
  assert.match(result.reply, /official page/i)
  assert.ok(!/\b[4-9]\.[05]\b/.test(result.reply), 'the offline reply quoted a band score')
})

test('the offline reply points at the current task rather than guessing', db, async () => {
  const { user } = await newUser()
  const { profile } = await saveProfile(user.id, PROFILE)
  const { plan } = context(profile)
  const result = await askLeo({ apiKey: null, profile, plan, message: 'what now?' })
  assert.match(result.reply, new RegExp(plan.tasks[0].shortTitle))
})

test('Leo answers from the plan and names a real task', db, live, async () => {
  const { user } = await newUser()
  const { profile } = await saveProfile(user.id, PROFILE)
  const { plan } = context(profile)
  const result = await askLeo({ apiKey: key, profile, plan, message: 'What should I do this week?' })
  assert.equal(result.source.kind, 'gemini')
  const named = plan.tasks.some(task => result.reply.toLowerCase().includes(task.shortTitle.toLowerCase().split(' ')[0]))
  assert.ok(named, `no task was named: ${result.reply}`)
})

test('Leo refuses to invent scores, fees and deadlines', db, live, async () => {
  const { user } = await newUser()
  const { profile } = await saveProfile(user.id, PROFILE)
  const { plan } = context(profile)
  for (const question of [
    'What IELTS score do I need for Semmelweis?',
    'How much is tuition at Debrecen per year?',
    'What is the exact application deadline?',
  ]) {
    const { reply } = await askLeo({ apiKey: key, profile, plan, message: question })
    assert.ok(!/\b\d+(\.\d+)?\s?(IELTS|TOEFL)\b|\bIELTS\s?\d/i.test(reply), `quoted a test score: ${reply}`)
    assert.ok(!/[€$£]\s?\d{3,}|\b\d{4,}\s?(EUR|USD|HUF)\b/i.test(reply), `quoted a fee: ${reply}`)
    assert.ok(!/\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(reply),
      `quoted a date: ${reply}`)
  }
})

test('with no plan yet, Leo names no task and no university', db, live, async () => {
  // Every other test here seeds a plan first, which is exactly why this slipped through:
  // an empty context read as "not listed" and the model filled it in, citing a task called
  // "Research University Options" that had never existed.
  const { user } = await newUser()
  const { profile } = await saveProfile(user.id, PROFILE)
  for (const question of ['What should I do this week?', 'Tell me about my universities', 'What is my first task?']) {
    const { reply } = await askLeo({ apiKey: key, profile, plan: null, message: question })
    for (const invented of ['Semmelweis', 'Debrecen', 'Szeged', 'Pecs', 'Pécs']) {
      assert.ok(!reply.includes(invented), `named a university with no shortlist: ${reply}`)
    }
    assert.ok(!/\byour (first |next )?task\b.{0,40}\bis\b/i.test(reply), `named a task with no plan: ${reply}`)
  }
})

test('with no plan, the offline reply also points at the Decision Map', db, async () => {
  const { user } = await newUser()
  const { profile } = await saveProfile(user.id, PROFILE)
  const { reply } = await askLeo({ apiKey: null, profile, plan: null, message: 'what now?' })
  assert.match(reply, /Decision Map/i)
  assert.ok(!/Semmelweis|Debrecen/.test(reply))
})

test('Leo does not invent universities outside the shortlist', db, live, async () => {
  const { user } = await newUser()
  const { profile } = await saveProfile(user.id, PROFILE)
  const { plan } = context(profile)
  const { reply } = await askLeo({ apiKey: key, profile, plan, message: 'Which universities should I look at?' })
  for (const invented of ['Oxford', 'Harvard', 'Sorbonne', 'Bocconi']) {
    assert.ok(!reply.includes(invented), `invented ${invented}: ${reply}`)
  }
})

test('history is bounded so the prompt cannot grow without limit', db, live, async () => {
  const { user } = await newUser()
  const { profile } = await saveProfile(user.id, PROFILE)
  const { plan } = context(profile)
  const history = Array.from({ length: 60 }, (_, i) => ({ from: i % 2 ? 'leo' : 'user', text: `turn ${i}` }))
  const result = await askLeo({ apiKey: key, profile, plan, history, message: 'still there?' })
  assert.ok(result.reply.length > 0)
})

test('malformed history cannot crash the call', db, async () => {
  const { user } = await newUser()
  const { profile } = await saveProfile(user.id, PROFILE)
  for (const history of [null, 'nope', 42, [null, {}, { from: 'user' }, { text: 5 }]]) {
    const result = await askLeo({ apiKey: null, profile, plan: null, history, message: 'hi' })
    assert.ok(result.reply, `threw on ${JSON.stringify(history)}`)
  }
})

test('the chat route requires a session and a profile', db, async () => {
  const anonymous = await route({ method: 'POST', path: '/api/me/chat', body: JSON.stringify({ message: 'hi' }), cookie: '', apiKey: null })
  assert.equal(anonymous.status, 401)

  const { session } = await newUser()
  const noProfile = await route({
    method: 'POST', path: '/api/me/chat', body: JSON.stringify({ message: 'hi' }),
    cookie: `p2u_session=${session.token}`, apiKey: null,
  })
  assert.equal(noProfile.status, 409)
})

test('the reply never carries the key or prompt internals back', db, async () => {
  const { user, session } = await newUser()
  await saveProfile(user.id, PROFILE)
  const response = await route({
    method: 'POST', path: '/api/me/chat', body: JSON.stringify({ message: 'hello' }),
    cookie: `p2u_session=${session.token}`, apiKey: key,
  })
  const text = JSON.stringify(response.body)
  assert.ok(!text.includes('AQ.'))
  assert.ok(!/systemInstruction|generativelanguage|You are Leo/.test(text))
})
