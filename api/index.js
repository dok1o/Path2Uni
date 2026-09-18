// Vercel adapter for the framework-neutral router in server/routes.js.
//
// All /api/* requests are rewritten here by vercel.json. Keeping the adapter thin means
// local Vite, the standalone Render server and Vercel execute the same route definitions.

import { timingSafeEqual } from 'node:crypto'
import { attachDatabasePool, waitUntil } from '@vercel/functions'
import '../server/env.js'
import { route } from '../server/routes.js'
import { sendDigests } from '../server/digest.js'
import { purgeExpiredChallenges } from '../server/challenges.js'
import { pool } from '../server/db.js'

const MAX_BODY_BYTES = 64_000

// Fluid Compute can freeze a warm invocation between requests. Vercel releases idle pg
// clients before that happens, avoiding a later request inheriting a stale Supabase socket.
if (process.env.VERCEL) attachDatabasePool(pool)

const jsonResponse = (status, body, extraHeaders = {}) => {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' })
  for (const [key, value] of Object.entries(extraHeaders)) {
    if (Array.isArray(value)) value.forEach(item => headers.append(key, item))
    else if (value != null) headers.set(key, String(value))
  }
  return new Response(JSON.stringify(body), { status, headers })
}

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Recover the public API path that vercel.json carried through its single-function rewrite. */
export function publicApiPath(url) {
  const rewritten = url.searchParams.get('__path')
  if (rewritten == null) return url.pathname
  const suffix = rewritten.replace(/^\/+|\/+$/g, '')
  return suffix ? `/api/${suffix}` : '/api'
}

async function runDailyJobs(request) {
  const secret = process.env.CRON_SECRET || ''
  if (!secret) return jsonResponse(503, { error: 'CRON_SECRET is not configured' })
  if (!safeEqual(request.headers.get('authorization'), `Bearer ${secret}`)) {
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  const [digests, purged] = await Promise.all([
    sendDigests(),
    purgeExpiredChallenges(),
  ])
  return jsonResponse(200, { ok: true, digests, purged: purged ?? null })
}

export async function handleVercelRequest(request, context = {}) {
  const url = new URL(request.url)
  const path = publicApiPath(url)

  if (path === '/api/cron' && request.method === 'GET') return runDailyJobs(request)

  let body = ''
  if (!['GET', 'HEAD'].includes(request.method)) {
    body = await request.text()
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
      return jsonResponse(413, { error: 'Request body is too large' })
    }
  }

  const query = new URLSearchParams(url.searchParams)
  query.delete('__path')
  const deferred = []
  const defer = promise => {
    deferred.push(promise)
    if (process.env.VERCEL) waitUntil(promise)
    else if (typeof context.waitUntil === 'function') context.waitUntil(promise)
  }

  const result = await route({
    method: request.method,
    path,
    query,
    body,
    cookie: request.headers.get('cookie') || '',
    userAgent: request.headers.get('user-agent') || '',
    apiKey: process.env.GEMINI_API_KEY || null,
    secure: url.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https',
    defer,
  })

  // Exposed only for focused unit tests; production keeps these promises alive through
  // waitUntil above and still returns the response immediately.
  if (context.collectDeferred) context.collectDeferred(deferred)
  return jsonResponse(result.status, result.body, result.headers)
}

export default { fetch: handleVercelRequest }
