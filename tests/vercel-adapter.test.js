import assert from 'node:assert/strict'
import test from 'node:test'
import { handleVercelRequest, publicApiPath } from '../api/index.js'
import { describeConnection } from '../server/db.js'

test('Vercel rewrite path is restored without leaking its private query parameter', () => {
  const url = new URL('https://path2uni.vercel.app/api/index?__path=me%2Factivity&lang=ru')
  assert.equal(publicApiPath(url), '/api/me/activity')
})

test('serverless adapter passes an unknown API request through the shared router', async () => {
  const response = await handleVercelRequest(
    new Request('https://path2uni.vercel.app/api/index?__path=missing'),
  )
  assert.equal(response.status, 404)
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains')
  assert.deepEqual(await response.json(), { error: 'Not found' })
})

test('serverless adapter rejects oversized request bodies before routing them', async () => {
  const response = await handleVercelRequest(new Request(
    'https://path2uni.vercel.app/api/index?__path=ai%2Fadmission-plan',
    { method: 'POST', body: 'x'.repeat(64_001) },
  ))
  assert.equal(response.status, 413)
  assert.deepEqual(await response.json(), { error: 'Request body is too large' })
})

test('daily serverless job cannot be invoked without its bearer secret', async () => {
  const previous = process.env.CRON_SECRET
  process.env.CRON_SECRET = 'test-secret-that-is-long-enough'
  try {
    const response = await handleVercelRequest(
      new Request('https://path2uni.vercel.app/api/index?__path=cron'),
    )
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'Unauthorized' })
  } finally {
    if (previous == null) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previous
  }
})

test('database diagnostics hide a malformed password containing an at sign', () => {
  const previous = process.env.DATABASE_URL
  process.env.DATABASE_URL = 'postgresql://account:first@second@pooler.example.com:5432/postgres'
  try {
    const description = describeConnection()
    assert.equal(description, 'DATABASE_URL → postgresql://***@pooler.example.com:5432/postgres')
    assert.equal(description.includes('first'), false)
    assert.equal(description.includes('second'), false)
  } finally {
    if (previous == null) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previous
  }
})
