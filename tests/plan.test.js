import { test } from 'node:test'
import assert from 'node:assert/strict'
import { destinations, fields, readObjective } from '../src/services/planContext.js'
import { TASK_TYPES, normalizeTasks, buildGraph, assemblePlan } from '../src/services/planShape.js'
import { buildLocalPlan } from '../src/services/localPlan.js'
import { deidentify, handlePlanRequest } from '../server/plan.js'
import { buildPrompt } from '../server/gemini.js'
import { curatedIsos, FIELDS } from '../src/data/worldUniversities.js'

const PROFILE = {
  destination: 'Italy', degree: 'Bachelor', field: 'Economics & Management',
  intake: '2027', languages: [{ name: 'English', level: 'B2' }],
}
const ctx = (objective, profile = PROFILE) => readObjective(objective, profile)

// ---------- planContext ----------

test('every destination that claims an iso points at a real curated country', () => {
  for (const [key, destination] of Object.entries(destinations)) {
    assert.ok(destination.label && destination.portal && destination.extraDoc && destination.earliest,
      `destination "${key}" is missing a procedural field`)
    if (destination.iso !== null) {
      assert.ok(curatedIsos.has(destination.iso), `destination "${key}" points at uncurated iso "${destination.iso}"`)
    }
  }
})

test('every field tag exists in the catalogue vocabulary', () => {
  for (const [key, field] of Object.entries(fields)) {
    assert.ok(FIELDS.includes(field.tag), `field "${key}" has tag "${field.tag}" which the catalogue does not know`)
  }
})

test('the objective overrides the profile', () => {
  const parsed = ctx('Master in Computer Science in Germany starting 2026')
  assert.equal(parsed.destination.label, 'Germany')
  assert.equal(parsed.destination.portal, 'uni-assist')
  assert.equal(parsed.degree, 'Master')
  assert.equal(parsed.field, 'Computer Science')
  assert.equal(parsed.fieldTag, 'cs')
  assert.equal(parsed.intake, '2026')
})

test('the profile fills what the objective leaves out', () => {
  const parsed = ctx('I want to study abroad')
  assert.equal(parsed.destination.label, 'Italy')
  assert.equal(parsed.degree, 'Bachelor')
  assert.equal(parsed.intake, '2027')
  assert.equal(parsed.matched, 0, 'nothing was confirmed by the objective')
})

test('confidence tracks how much the objective actually confirmed', () => {
  const vague = buildLocalPlan({ profile: PROFILE, objective: 'help me' })
  const precise = buildLocalPlan({ profile: PROFILE, objective: 'Economics bachelor in Italy 2027' })
  assert.ok(precise.confidence > vague.confidence,
    `a specific objective should score higher (${precise.confidence} vs ${vague.confidence})`)
  assert.ok(precise.confidence <= 0.94)
})

test('English at C1 or above removes the certificate task', () => {
  const weak = ctx('Economics bachelor in Italy 2027')
  const strong = ctx('Economics bachelor in Italy 2027', { ...PROFILE, languages: [{ name: 'English', level: 'C1' }] })
  assert.equal(weak.needsTest, true)
  assert.equal(strong.needsTest, false)
  assert.equal(buildLocalPlan({ profile: PROFILE, objective: 'x' }).tasks.length, 4)
  assert.equal(buildLocalPlan({ profile: { ...PROFILE, languages: [{ name: 'English', level: 'C2' }] }, objective: 'x' }).tasks.length, 3)
})

test('an empty or hostile objective still parses', () => {
  for (const objective of ['', '   ', '!!!', '2027'.repeat(60), '<script>alert(1)</script>', null, undefined]) {
    const parsed = readObjective(objective, PROFILE)
    assert.ok(parsed.destination.label, `no destination for objective ${JSON.stringify(objective)?.slice(0, 20)}`)
  }
})

test('a profile with no languages at all does not crash', () => {
  const parsed = readObjective('Economics in Italy', { destination: 'Italy' })
  assert.equal(parsed.englishLevel, 'unknown')
  assert.equal(parsed.needsTest, true)
})

// ---------- normalizeTasks: model output is untrusted input ----------

const model = overrides => ({ type: 'research', title: 'T', shortTitle: 'S', description: 'D', subtasks: ['a'], ...overrides })

test('tasks with a type the UI cannot render are dropped', () => {
  const tasks = normalizeTasks([
    model({ type: 'visa' }), model({ type: 'finance' }), model({ type: 'research' }),
  ], ctx('x'))
  assert.equal(tasks.length, 1)
  for (const task of tasks) assert.ok(TASK_TYPES.includes(task.type))
})

test('tasks with no subtasks are dropped, because the panel would render empty', () => {
  assert.equal(normalizeTasks([model({ subtasks: [] }), model({ subtasks: null })], ctx('x')).length, 0)
})

test('junk in the task array cannot crash the normalizer', () => {
  const tasks = normalizeTasks([null, undefined, 'string', 42, {}, [], model()], ctx('x'))
  assert.equal(tasks.length, 1)
})

test('a non-array from the model yields an empty plan rather than throwing', () => {
  for (const value of [null, undefined, 'tasks', {}, 7]) {
    assert.equal(normalizeTasks(value, ctx('x')).length, 0)
  }
})

test('runaway model output is capped', () => {
  const many = normalizeTasks(Array.from({ length: 40 }, () => model()), ctx('x'))
  assert.ok(many.length <= 6, `capped at 6, got ${many.length}`)
  const long = normalizeTasks([model({
    title: 'x'.repeat(500), shortTitle: 'y'.repeat(500), description: 'z'.repeat(900),
    subtasks: Array.from({ length: 20 }, () => 'w'.repeat(400)),
  })], ctx('x'))[0]
  assert.ok(long.title.length <= 120)
  assert.ok(long.shortTitle.length <= 34)
  assert.ok(long.description.length <= 260)
  assert.ok(long.subtasks.length <= 4)
  for (const sub of long.subtasks) assert.ok(sub.length <= 120)
})

test('ordering metadata is assigned by us, not by the model', () => {
  const tasks = normalizeTasks([model({ type: 'research' }), model({ type: 'documents' }), model({ type: 'application' })], ctx('x'))
  assert.equal(tasks[0].state, 'current')
  assert.ok(tasks.slice(1).every(task => task.state === 'locked'))
  assert.equal(tasks[0].due, 'Today · 12 min')
  assert.match(tasks.at(-1).due, /^Rounds open in /)
  assert.equal(new Set(tasks.map(task => task.id)).size, tasks.length, 'task ids must be unique')
  for (const task of tasks) assert.ok(task.xp > 0)
})

// ---------- buildGraph ----------

test('the graph is connected and has no dangling edge, for any task count', () => {
  for (let count = 1; count <= 6; count += 1) {
    const tasks = normalizeTasks(Array.from({ length: count }, () => model()), ctx('x'))
    const graph = buildGraph(ctx('x'), tasks)
    const ids = new Set(graph.nodes.map(node => node.id))
    for (const [from, to] of graph.edges) {
      assert.ok(ids.has(from), `${count} tasks: edge from unknown node ${from}`)
      assert.ok(ids.has(to), `${count} tasks: edge to unknown node ${to}`)
    }
    for (const task of tasks) assert.ok(ids.has(task.id), `task ${task.id} has no node`)
    const reachable = new Set(['profile'])
    let grew = true
    while (grew) {
      grew = false
      for (const [from, to] of graph.edges) {
        if (reachable.has(from) && !reachable.has(to)) { reachable.add(to); grew = true }
      }
    }
    assert.equal(reachable.size, ids.size, `${count} tasks: ${ids.size - reachable.size} node(s) unreachable from the profile`)
  }
})

test('no two graph nodes overlap on the canvas, for any task count', () => {
  // A node card is ~20% of the canvas wide and ~9% tall. Closer than that in both axes and
  // the cards visibly cover each other — the bug this layout was rewritten to fix.
  for (let count = 1; count <= 6; count += 1) {
    const tasks = normalizeTasks(Array.from({ length: count }, () => model()), ctx('x'))
    const nodes = buildGraph(ctx('x'), tasks).nodes
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const overlap = Math.abs(nodes[i].x - nodes[j].x) < 20 && Math.abs(nodes[i].y - nodes[j].y) < 9
        assert.ok(!overlap, `${count} tasks: ${nodes[i].id} overlaps ${nodes[j].id}`)
      }
    }
  }
})

test('every node stays inside the canvas', () => {
  const tasks = normalizeTasks(Array.from({ length: 5 }, () => model()), ctx('x'))
  for (const node of buildGraph(ctx('x'), tasks).nodes) {
    assert.ok(node.x >= 10 && node.x <= 90, `${node.id} at x=${node.x} would be clipped`)
    assert.ok(node.y >= 5 && node.y <= 95, `${node.id} at y=${node.y} would be clipped`)
  }
})

// ---------- the assembled plan ----------

test('the local plan is complete and renderable', () => {
  for (const key of Object.keys(destinations)) {
    const plan = buildLocalPlan({ profile: { ...PROFILE, destination: key }, objective: 'study abroad' })
    assert.equal(plan.status, 'generated')
    assert.ok(plan.tasks.length >= 3, `${key}: only ${plan.tasks.length} tasks`)
    assert.ok(plan.graph.nodes.length === plan.tasks.length + 4)
    assert.ok(plan.sourceCount > 0)
    assert.equal(plan.source.kind, 'rules')
    assert.doesNotThrow(() => new Date(plan.generatedAt).toISOString())
  }
})

test('assemblePlan carries the shortlist through untouched', () => {
  const shortlist = [{ name: 'X', city: 'Y' }]
  const context = ctx('x')
  const tasks = normalizeTasks([model()], context)
  assert.deepEqual(assemblePlan({ context, tasks, confidence: 0.8, source: { kind: 'rules' }, shortlist }).shortlist, shortlist)
})

// ---------- de-identification ----------

test('deidentify keeps exactly five keys and nothing else', () => {
  const output = deidentify({
    studentId: 'student-001', name: 'Mila Akhmetova', email: 'm@example.com', phone: '+7700',
    passport: 'N1234567', address: 'Almaty', dateOfBirth: '2008-04-11', goals: ['my uncle teaches there'],
    destination: 'Italy', degree: 'Bachelor', field: 'Economics', intake: '2027',
    languages: [{ name: 'English', level: 'B2' }, { name: 'Russian', level: 'native' }],
  })
  assert.deepEqual(Object.keys(output).sort(), ['degree', 'destination', 'field', 'intake', 'languages'])
  assert.deepEqual(output.languages, [{ name: 'English', level: 'B2' }], 'only the English level is relevant')
})

test('no identifier survives into the prompt', () => {
  const dirty = {
    studentId: 'student-001', name: 'Mila Akhmetova', email: 'm@example.com', passport: 'N1234567',
    address: 'Almaty, Abay 12', instagram: '@mila', goals: ['my uncle teaches at Bocconi'],
    destination: 'Italy', degree: 'Bachelor', field: 'Economics & Management', intake: '2027',
    languages: [{ name: 'English', level: 'B2' }],
  }
  const prompt = buildPrompt({ context: readObjective('Economics in Italy 2027', deidentify(dirty)), shortlist: [] })
  for (const secret of ['Mila', 'Akhmetova', 'm@example.com', 'N1234567', 'Almaty', 'Abay', '@mila', 'uncle', 'student-001']) {
    assert.ok(!prompt.includes(secret), `"${secret}" leaked into the prompt`)
  }
})

test('deidentify survives an empty or malformed profile', () => {
  for (const profile of [{}, undefined, { languages: null }, { languages: 'english' }, { languages: [] }]) {
    assert.doesNotThrow(() => deidentify(profile), `threw on ${JSON.stringify(profile)}`)
  }
})

test('the prompt states only supplied facts and forbids invented ones', () => {
  const prompt = buildPrompt({
    context: ctx('Economics bachelor in Italy 2027'),
    shortlist: [{ name: 'Bocconi University', city: 'Milan', fields: ['business'], languages: ['en'], levels: ['bachelor'] }],
  })
  assert.match(prompt, /Destination: Italy/)
  assert.match(prompt, /Application route: Universitaly/)
  assert.match(prompt, /Bocconi University, Milan/)
  // No absolute dates or money may appear in the facts we hand over.
  assert.ok(!/€|\$|EUR|USD/.test(prompt), 'the prompt quotes a currency')
  assert.ok(!/\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(prompt),
    'the prompt quotes an absolute date')
})

// ---------- the request handler ----------

test('the handler rejects bad input without calling anything', async () => {
  assert.equal((await handlePlanRequest('not json', null)).status, 400)
  assert.equal((await handlePlanRequest('{}', null)).status, 400)
  assert.equal((await handlePlanRequest('{"objective":"   "}', null)).status, 400)
  assert.equal((await handlePlanRequest('{"objective":123}', null)).status, 400)
})

test('with no key the handler still returns a usable plan', async () => {
  const result = await handlePlanRequest(JSON.stringify({ profile: PROFILE, objective: 'Economics in Italy 2027' }), null)
  assert.equal(result.status, 200)
  assert.equal(result.body.source.kind, 'rules')
  assert.equal(result.body.source.reason, 'no_api_key')
  assert.ok(result.body.tasks.length >= 3)
  assert.ok(result.body.shortlist.length > 0, 'the shortlist comes from our own data, so it survives a model outage')
})

test('an overlong objective is truncated rather than rejected', async () => {
  const result = await handlePlanRequest(JSON.stringify({ profile: PROFILE, objective: 'Italy '.repeat(400) }), null)
  assert.equal(result.status, 200)
})
