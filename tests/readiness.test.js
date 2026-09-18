// Readiness is the one number-shaped thing on screen, so its rules are pinned here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessReadiness } from '../src/services/readiness.js'

const profile = { degree: 'Bachelor', field: 'Computer Science', englishLevel: 'B2' }
const uni = { fields: ['cs', 'engineering'], levels: ['bachelor', 'master'], langs: ['de', 'en'] }
const requirements = { english: { test: 'IELTS', band: 6.5 } }

test('a certificate above the usual bar counts as met', () => {
  const result = assessReadiness({ profile, tests: [{ test_code: 'IELTS', status: 'completed', score: 7 }], university: uni, requirements, fieldTag: 'cs' })
  const english = result.checks.find(check => check.id === 'english')
  assert.equal(english.state, 'met')
  assert.equal(result.band, 'strong')
})

test('a self-reported level is never a certificate, however high', () => {
  // C2 with nothing sat is still "close", never "met": the sitting is what proves it.
  const result = assessReadiness({ profile: { ...profile, englishLevel: 'C2' }, tests: [], university: uni, requirements, fieldTag: 'cs' })
  assert.equal(result.checks.find(check => check.id === 'english').state, 'close')
})

test('a mock sitting does not count towards the certificate', () => {
  const result = assessReadiness({ profile, tests: [{ test_code: 'IELTS', status: 'mock', score: 8 }], university: uni, requirements, fieldTag: 'cs' })
  assert.notEqual(result.checks.find(check => check.id === 'english').state, 'met')
})

test('a university that does not teach the field cannot look like a fit', () => {
  const result = assessReadiness({ profile, tests: [{ test_code: 'IELTS', status: 'completed', score: 8 }], university: { ...uni, fields: ['law'] }, requirements, fieldTag: 'cs' })
  assert.equal(result.checks.find(check => check.id === 'field').state, 'missing')
  assert.notEqual(result.band, 'strong')
})

test('every check says what kind of evidence it rests on', () => {
  const result = assessReadiness({ profile, tests: [], university: uni, requirements, fieldTag: 'cs' })
  for (const check of result.checks) {
    assert.ok(['catalogue', 'demo', 'profile'].includes(check.evidence), `${check.id}: ${check.evidence}`)
    assert.ok(check.detail && check.vars, `${check.id} must carry a translatable detail`)
  }
})

test('the result never claims to be a probability', () => {
  const result = assessReadiness({ profile, tests: [], university: uni, requirements, fieldTag: 'cs' })
  assert.match(result.basis, /not a probability/i)
  // Nothing in the payload is a percentage — a percent sign here would be read as a chance.
  assert.equal(JSON.stringify(result).includes('%'), false)
})

test('an empty profile degrades to the lowest band rather than throwing', () => {
  const result = assessReadiness({ profile: {}, tests: [], university: {}, requirements: null, fieldTag: null })
  assert.equal(result.total, 5)
  assert.ok(['gaps', 'workable'].includes(result.band))
})
