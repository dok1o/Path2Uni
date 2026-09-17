// Live tests. They spend real Gemini quota, so they skip themselves unless a key is present.
// Run with: npm run test:live

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { TASK_TYPES } from '../src/services/planShape.js'
import { MODELS } from '../server/gemini.js'
import { createAdmissionPlan } from '../server/plan.js'

async function key() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  try {
    const text = await readFile(new URL('../.env', import.meta.url), 'utf8')
    return text.split('\n').find(line => line.startsWith('GEMINI_API_KEY='))?.slice('GEMINI_API_KEY='.length).trim() || null
  } catch { return null }
}

const API_KEY = await key()
const live = { skip: API_KEY ? false : 'no GEMINI_API_KEY' }

const PROFILE = {
  destination: 'Italy', degree: 'Bachelor', field: 'Economics & Management',
  intake: '2027', languages: [{ name: 'English', level: 'B2' }],
}

function assertRenderablePlan(plan) {
  assert.equal(plan.status, 'generated')
  assert.ok(plan.tasks.length >= 3 && plan.tasks.length <= 6, `task count ${plan.tasks.length}`)
  assert.ok(plan.confidence > 0 && plan.confidence <= 1)
  assert.ok(plan.sourceCount > 0)

  const ids = new Set(plan.graph.nodes.map(node => node.id))
  for (const [from, to] of plan.graph.edges) {
    assert.ok(ids.has(from) && ids.has(to), `dangling edge ${from}->${to}`)
  }
  for (const task of plan.tasks) {
    assert.ok(TASK_TYPES.includes(task.type), `unrenderable type ${task.type}`)
    assert.ok(task.subtasks.length > 0, `${task.shortTitle} has no subtasks`)
    assert.ok(task.shortTitle.length <= 34, `${task.shortTitle} overflows the roadmap pin`)
    assert.ok(ids.has(task.id), `task ${task.id} has no graph node`)
  }
  assert.equal(plan.tasks[0].state, 'current')
}

test('the model cascade names only models this key can reach', live, async () => {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}&pageSize=200`)
  assert.equal(response.status, 200)
  const available = new Set((await response.json()).models
    .filter(model => model.supportedGenerationMethods?.includes('generateContent'))
    .map(model => model.name.replace('models/', '')))
  for (const model of MODELS) assert.ok(available.has(model), `${model} is not available to this key`)
})

test('a real generation returns a renderable plan', live, async () => {
  const plan = await createAdmissionPlan({ profile: PROFILE, objective: 'Economics bachelor in Italy 2027', apiKey: API_KEY })
  assertRenderablePlan(plan)
  if (plan.source.kind === 'rules') {
    // A free-tier outage is a legitimate outcome — the point is that it still produced a plan.
    console.log(`  (fell back to rules: ${plan.source.reason})`)
  } else {
    assert.ok(MODELS.includes(plan.source.model))
  }
})

test('the plan reflects the objective, not the profile it was given', live, async () => {
  const plan = await createAdmissionPlan({
    profile: PROFILE,
    objective: 'Medicine in Hungary taught in English for 2027',
    apiKey: API_KEY,
  })
  assertRenderablePlan(plan)
  assert.ok(plan.shortlist.length > 0)
  for (const uni of plan.shortlist) {
    assert.equal(uni.country, 'Hungary', `${uni.name} is not in Hungary`)
    assert.ok(uni.fields.includes('medicine'), `${uni.name} does not teach medicine`)
  }
  const text = JSON.stringify(plan.tasks)
  assert.ok(!/Universitaly/.test(text), 'the plan still refers to the Italian portal')
})

test('the model does not smuggle in fees or absolute dates', live, async () => {
  const plan = await createAdmissionPlan({ profile: PROFILE, objective: 'Engineering master in Germany 2026', apiKey: API_KEY })
  const text = [plan.tasks.map(t => `${t.title} ${t.description} ${t.subtasks.join(' ')}`).join(' ')].join(' ')
  assert.ok(!/[€$£]\s?\d|\d+\s?(EUR|USD|GBP)/i.test(text), `a currency amount appeared: ${text.slice(0, 200)}`)
  assert.ok(!/\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(text),
    'an absolute deadline appeared')
  assert.ok(!/\b\d{1,3}%/.test(text), 'an acceptance rate appeared')
})

test('a bad key degrades to the rule-based plan instead of erroring', async () => {
  const plan = await createAdmissionPlan({ profile: PROFILE, objective: 'Economics in Italy 2027', apiKey: 'AQ.definitely-not-a-key' })
  assertRenderablePlan(plan)
  assert.equal(plan.source.kind, 'rules')
  assert.ok(plan.shortlist.length > 0, 'our own shortlist survives a model failure')
})

// ---------- the standalone HTTP server ----------

let server
const PORT = 8799
const url = `http://localhost:${PORT}/api/ai/admission-plan`

before(async () => {
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  })
  for (let i = 0; i < 40; i += 1) {
    try {
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      return
    } catch { await new Promise(resolve => setTimeout(resolve, 150)) }
  }
  throw new Error('the standalone server never came up')
})

after(() => server?.kill())

const post = (body, headers = { 'Content-Type': 'application/json' }) =>
  fetch(url, { method: 'POST', headers, body })

test('the server rejects malformed requests with 400, not 500', async () => {
  assert.equal((await post('{}')).status, 400)
  assert.equal((await post('not json')).status, 400)
  assert.equal((await post('{"objective":""}')).status, 400)
  assert.equal((await post(JSON.stringify({ objective: 'x', profile: 'a string' }))).status, 200)
  assert.equal((await post(JSON.stringify({ objective: 'x', profile: { languages: 'english' } }))).status, 200)
})

test('unknown api routes and wrong methods are refused', async () => {
  assert.equal((await fetch(`http://localhost:${PORT}/api/nope`)).status, 404)
  assert.equal((await fetch(url, { method: 'GET' })).status, 404)
})

test('the api is same-origin: no wildcard CORS alongside cookie auth', async () => {
  // A wildcard Access-Control-Allow-Origin cannot carry credentials, so advertising one
  // next to a session cookie would be broken and misleading. The server serves the built
  // frontend itself instead, which is why no CORS header belongs here at all.
  const response = await post(JSON.stringify({ objective: 'x' }))
  assert.equal(response.headers.get('access-control-allow-origin'), null)
})

test('the server serves the built frontend from the same origin', async () => {
  const response = await fetch(`http://localhost:${PORT}/`)
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /<div id="root">/, 'did not get index.html')
})

test('static paths cannot escape dist/', async () => {
  const response = await fetch(`http://localhost:${PORT}/../.env`)
  const text = await response.text()
  assert.ok(!text.includes('GEMINI_API_KEY'), 'path traversal reached .env')
})

test('an end-to-end request over HTTP returns a renderable plan', async () => {
  const response = await post(JSON.stringify({ profile: PROFILE, objective: 'Computer Science master in Malaysia 2026' }))
  assert.equal(response.status, 200)
  const plan = await response.json()
  assertRenderablePlan(plan)
  assert.ok(['gemini', 'rules'].includes(plan.source.kind))
})

test('the response never carries the api key or the prompt back to the client', async () => {
  const response = await post(JSON.stringify({ profile: PROFILE, objective: 'Economics in Italy 2027' }))
  const text = await response.text()
  assert.ok(!text.includes('AQ.'), 'the api key appears in the response')
  assert.ok(!/systemInstruction|generativelanguage/.test(text), 'prompt internals leaked to the client')
})
