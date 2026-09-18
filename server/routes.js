// One router shared by the Vite dev middleware and the standalone server, so there is a
// single definition of every route and no chance of the two drifting apart.

import { register, login, logout, userForToken, findByEmail, attachEmail, markEmailVerified, startSession, userById, publicUser } from './auth.js'
import { createChallenge, useChallenge, looksLikeEmail, readEmail } from './challenges.js'
import { sendMail, mailReady } from './mail.js'
import { codeEmail } from './mailTemplates.js'
import { isReachable, query as dbQuery } from './db.js'
import { createAdmissionPlan, handlePlanRequest } from './plan.js'
import {
  getProfile, saveProfile, profileForPlanning, savePlan, getCurrentPlan, setTaskDone, MAX_DESTINATIONS,
  destinationOptions, fieldOptions, levelOptions, englishLevels,
} from './profiles.js'
import { askLeo } from './chat.js'
import { getTests, saveTests } from './tests.js'
import { getActivity, getXpLeaderboard, setSubtaskProgress } from './activity.js'
import { suggestOpportunities } from './opportunities.js'
import { planEssay } from './essay.js'
import { buildNotices } from './notices.js'
import { diagnose, explainMatches, adviceFingerprint, readCachedAdvice, writeCachedAdvice } from './advisor.js'
import { shortlistUniversities } from '../src/data/worldUniversities.js'
import { scholarshipsFor } from '../src/data/scholarships.js'
import { requirementsFor } from '../src/data/admissionDemo.js'
import { buildGraph } from '../src/services/planShape.js'
import { readObjective, fields as FIELD_VOCAB } from '../src/services/planContext.js'

const COOKIE = 'p2u_session'
const adviceRefreshes = new Map()

// Render deterministic matches immediately; when Gemini is configured it refines the same
// result once in the background and the existing fingerprint cache serves it next time.
function refreshAdviceInBackground({ key, apiKey, profile, tests, shortlist, fingerprint, lang, fieldTag }) {
  if (!apiKey || adviceRefreshes.has(key)) return
  const refresh = Promise.all([
    diagnose({ apiKey, profile, tests, lang }),
    explainMatches({ apiKey, profile, tests, shortlist, lang, fieldTag }),
  ]).then(async ([diagnosis, matches]) => {
    if (diagnosis.source?.kind === 'gemini') {
      await writeCachedAdvice(profile, fingerprint, { diagnosis, matches })
    }
  }).catch(error => {
    console.warn('[path2uni] My Matches background refresh failed:', error.message)
  }).finally(() => adviceRefreshes.delete(key))
  adviceRefreshes.set(key, refresh)
}

export const readCookie = (header, name = COOKIE) =>
  (header || '').split(';').map(part => part.trim().split('='))
    .find(([key]) => key === name)?.[1] || null

// HttpOnly keeps the token away from scripts and SameSite=Lax blocks cross-site submission.
// `Secure` is added whenever the request arrived over TLS, so the flag appears automatically
// in production without anyone remembering to switch it on, and stays off on local http
// (where a Secure cookie would simply be discarded and nobody could sign in).
export const sessionCookie = ({ token, expires }, secure = false) =>
  `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Expires=${expires.toUTCString()}${secure ? '; Secure' : ''}`

export const clearCookie = (secure = false) =>
  `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`

// Told to browsers only over TLS: sending HSTS over plain http is ignored, and promising it
// from a local dev server would pin localhost to https for a year in that browser.
const HSTS = { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }

// The Decision Map's graph is laid out from the tasks rather than stored, so a plan read
// back from the database gets its graph rebuilt here — the database never holds layout.
function rehydrate(stored, profile) {
  const context = readObjective(stored.objective, profileForPlanning(profile))
  return { ...stored, status: 'generated', generatedAt: stored.createdAt, graph: buildGraph(context, stored.tasks, stored.shortlist) }
}

const reply = (status, body, headers = {}) => ({ status, body, headers })

/**
 * @param {{method:string, path:string, body:string, cookie:string, userAgent:string, apiKey:string|null}} request
 * @returns {Promise<{status:number, body:object, headers?:object}>}
 */
/** Never print a whole address back: enough to recognise, not enough to harvest. */
const maskEmail = address => {
  if (!address || !address.includes('@')) return ''
  const [name, domain] = address.split('@')
  const head = name.slice(0, 2)
  return `${head}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`
}

/**
 * Sends the code, and never lets a mail failure break the request that created it. The code
 * is only ever in memory here — it is not logged, and in development, with no SMTP
 * configured, it is returned so the flow can be finished without a mail server.
 */
async function deliverCode(challenge, purpose, lang) {
  const message = codeEmail({ code: challenge.code, purpose, lang })
  const result = await sendMail({ to: challenge.email, subject: message.subject, text: message.text })
  if (!result.sent && process.env.NODE_ENV !== 'production' && !mailReady()) {
    console.log(`[path2uni] no SMTP configured — code for ${maskEmail(challenge.email)} is ${challenge.code}`)
  }
  return result
}

const LANGS = new Set(['ru', 'kk', 'en'])
/** The interface language, from the query string or the body. Anything unknown means English. */
const readLang = (query, parsed) => {
  const asked = query?.get?.('lang') ?? parsed?.lang
  return LANGS.has(asked) ? asked : 'en'
}

export async function route(request) {
  const { method, path, query, body, cookie, userAgent, apiKey, secure = false } = request

  // Local, not module-level: rebinding a shared helper would leak this request's `secure`
  // into every later one and stack a new wrapper on each call.
  const json = (status, body, headers = {}) =>
    reply(status, body, secure ? { ...HSTS, ...headers } : headers)

  let parsed = {}
  // PUT and PATCH carry bodies too; parsing only POST silently handed handlers an empty object.
  if (['POST', 'PUT', 'PATCH'].includes(method) && body) {
    try { parsed = JSON.parse(body) } catch { return json(400, { error: 'Request body must be JSON' }) }
  }

  try {
    if (path === '/api/auth/register' && method === 'POST') {
      const result = await register({ ...parsed, userAgent })
      if (result.error) return json(result.status, { error: result.error, field: result.field })
      return json(201, { user: result.user }, { 'Set-Cookie': sessionCookie(result.session, secure) })
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const result = await login({ ...parsed, userAgent })
      if (result.error) return json(result.status, { error: result.error, field: result.field })
      // With a second factor on, the password alone opens a challenge, never a session.
      if (result.needsSecondFactor) {
        const challenge = await createChallenge({ userId: result.userId, purpose: 'login', emailCipher: result.emailCipher })
        if (challenge.error) return json(challenge.status, { error: challenge.error })
        await deliverCode(challenge, 'login', readLang(query, parsed))
        return json(200, { needsCode: true, token: challenge.token, hint: maskEmail(challenge.email) })
      }
      return json(200, { user: result.user }, { 'Set-Cookie': sessionCookie(result.session, secure) })
    }

    // Passwordless: an address, then the code that arrives at it.
    if (path === '/api/auth/email-code' && method === 'POST') {
      const address = typeof parsed.email === 'string' ? parsed.email.trim() : ''
      if (!looksLikeEmail(address)) return json(400, { error: 'Enter an email address we can reach you at.' })
      const row = await findByEmail(address)
      // The answer is identical whether or not an account exists, for the same reason
      // server/auth.js burns a decoy hash: the response must not be an account oracle.
      if (!row || !row.email_verified_at) {
        return json(200, { needsCode: true, token: null, hint: maskEmail(address) })
      }
      const challenge = await createChallenge({ userId: row.id, purpose: 'login', emailCipher: row.email_cipher })
      if (challenge.error) return json(challenge.status, { error: challenge.error })
      await deliverCode(challenge, 'login', readLang(query, parsed))
      return json(200, { needsCode: true, token: challenge.token, hint: maskEmail(address) })
    }

    if (path === '/api/auth/verify' && method === 'POST') {
      // A null token is what an unknown address produced above; it must fail like a wrong
      // code rather than like a missing account.
      const used = await useChallenge({ token: parsed.token, code: parsed.code, purpose: 'login' })
      if (used.error) return json(used.status, { error: used.error, vars: used.vars })
      const session = await startSession(used.userId, userAgent)
      const row = await userById(used.userId)
      return json(200, { user: publicUser(row) }, { 'Set-Cookie': sessionCookie(session, secure) })
    }

    if (path === '/api/me/email' && method === 'PUT') {
      const me = await userForToken(readCookie(cookie))
      if (!me) return json(401, { error: 'Sign in first' })
      const changed = await attachEmail(me.id, parsed.email)
      if (changed.error) return json(changed.status, { error: changed.error })
      return json(200, { user: publicUser(await userById(me.id)) })
    }

    // Prove the address on the account belongs to whoever is holding it.
    if (path === '/api/me/email/confirm' && method === 'POST') {
      const me = await userForToken(readCookie(cookie))
      if (!me) return json(401, { error: 'Sign in first' })
      const row = await userById(me.id)
      if (!row?.email_cipher) return json(409, { error: 'Add an email address first.' })

      if (parsed.code) {
        const used = await useChallenge({ token: parsed.token, code: parsed.code, purpose: 'verify_email' })
        if (used.error) return json(used.status, { error: used.error, vars: used.vars })
        if (used.userId !== me.id) return json(403, { error: 'That code belongs to another account.' })
        await markEmailVerified(me.id, used.emailCipher)
        return json(200, { user: publicUser(await userById(me.id)) })
      }

      const challenge = await createChallenge({ userId: me.id, purpose: 'verify_email', emailCipher: row.email_cipher })
      if (challenge.error) return json(challenge.status, { error: challenge.error })
      const delivery = await deliverCode(challenge, 'verify_email', readLang(query, parsed))
      return json(200, { token: challenge.token, hint: maskEmail(challenge.email), delivered: delivery.sent, reason: delivery.reason })
    }

    if (path === '/api/me/settings' && method === 'PUT') {
      const me = await userForToken(readCookie(cookie))
      if (!me) return json(401, { error: 'Sign in first' })
      const row = await userById(me.id)
      // Both switches need a confirmed address: a second factor pointing at an unproven
      // address locks people out of their own accounts, and reminders go nowhere.
      if ((parsed.twoFactorEnabled || parsed.notifyByEmail) && !row?.email_verified_at) {
        return json(409, { error: 'Confirm your email address first.' })
      }
      await dbQuery(
        `update users set two_factor_enabled = coalesce($2, two_factor_enabled),
                          notify_by_email = coalesce($3, notify_by_email), updated_at = now()
         where id = $1`,
        [me.id, typeof parsed.twoFactorEnabled === 'boolean' ? parsed.twoFactorEnabled : null,
          typeof parsed.notifyByEmail === 'boolean' ? parsed.notifyByEmail : null])
      return json(200, { user: publicUser(await userById(me.id)) })
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      await logout(readCookie(cookie))
      return json(200, { ok: true }, { 'Set-Cookie': clearCookie(secure) })
    }

    if (path === '/api/auth/me' && method === 'GET') {
      const user = await userForToken(readCookie(cookie))
      // Not signed in is a normal state, not an error — the client asks this on every load.
      return json(200, { user: user ?? null })
    }

    // Everything below belongs to a signed-in person. Resolve them once.
    const me = path.startsWith('/api/me/') ? await userForToken(readCookie(cookie)) : null
    if (path.startsWith('/api/me/') && !me) return json(401, { error: 'Sign in first' })

    if (path === '/api/me/profile' && method === 'GET') {
      return json(200, { profile: await getProfile(me.id) })
    }

    if (path === '/api/me/profile' && method === 'PUT') {
      const result = await saveProfile(me.id, parsed)
      if (result.errors) return json(400, { errors: result.errors })
      return json(200, { profile: result.profile })
    }

    if (path === '/api/me/plan' && method === 'GET') {
      const stored = await getCurrentPlan(me.id)
      return json(200, { plan: stored ? rehydrate(stored, await getProfile(me.id)) : null })
    }

    if (path === '/api/me/plan' && method === 'POST') {
      const profile = await getProfile(me.id)
      if (!profile) return json(409, { error: 'Complete your profile first' })
      const objective = typeof parsed.objective === 'string' ? parsed.objective.slice(0, 500) : ''
      if (!objective.trim()) return json(400, { error: 'objective is required' })

      const plan = await createAdmissionPlan({ profile: profileForPlanning(profile), objective, apiKey, lang: readLang(query, parsed) })
      await savePlan(me.id, { plan, objective })
      // Read it back rather than returning what we just built: the stored rows carry the task
      // ids the per-quest progress API addresses, so a freshly generated plan is completable
      // straight away instead of only after a reload.
      const stored = await getCurrentPlan(me.id)
      return json(200, { plan: stored ? rehydrate(stored, profile) : { ...plan, objective } })
    }

    // Stage 3 and 4 of the product path: the profile read back, and why each match suits.
    if (path === '/api/me/diagnosis' && method === 'GET') {
      const profile = await getProfile(me.id)
      if (!profile) return json(409, { error: 'Complete your profile first' })
      const tests = await getTests(me.id)
      // The field is a hard filter. Without it the shortlist returns any university in the
      // country, and the explanation then has to justify a match that does not exist.
      const fieldTag = Object.values(FIELD_VOCAB).find(item => item.label === profile.field)?.tag ?? null
      // Built from every chosen destination, not from the plan's shortlist. The two answer
      // different questions: the roadmap walks one admission system, while the matches are
      // where the person is still deciding — and a comparison inside a single country is not
      // the comparison they opened this page for.
      const countries = profile.destinations?.length ? profile.destinations : [profile.destination]
      const shortlist = shortlistUniversities({
        countries, field: fieldTag,
        level: String(profile.degree).toLowerCase(),
        limit: countries.length > 1 ? 6 : 5,
      })
      // Regenerated only when the answers it was built from change.
      const lang = readLang(query, parsed)
      const fingerprint = adviceFingerprint(profile, tests, lang)
      const cached = await readCachedAdvice(profile, fingerprint)
      if (cached) return json(200, cached)

      const [diagnosis, matches] = await Promise.all([
        diagnose({ apiKey:null, profile, tests, lang }),
        explainMatches({ apiKey:null, profile, tests, shortlist, lang, fieldTag }),
      ])
      refreshAdviceInBackground({
        key:`${profile.id}:${fingerprint}`, apiKey, profile, tests, shortlist, fingerprint, lang, fieldTag,
      })
      return json(200, { diagnosis, matches, cached:false, refreshing:Boolean(apiKey) })
    }

    if (path === '/api/me/task' && method === 'POST') {
      const result = await setTaskDone(me.id, parsed.position, Boolean(parsed.done))
      if (result.error) return json(result.status, { error: result.error })
      return json(200, { plan: rehydrate(result.plan, await getProfile(me.id)) })
    }

    // The streak and the per-quest XP. Read separately from the plan because it changes on a
    // different rhythm: the plan is regenerated rarely, this moves every time a quest is ticked.
    // POST, not GET: the body may carry what the applicant wrote about themselves, and that
    // does not belong in a URL, a proxy log or a browser history entry.
    if (path === '/api/me/notices' && method === 'GET') {
      return json(200, await buildNotices(me.id))
    }

    if (path === '/api/me/essay' && method === 'POST') {
      const profile = await getProfile(me.id)
      if (!profile) return json(409, { error: 'Complete your profile first' })
      const activities = typeof parsed.activities === 'string' ? parsed.activities : ''
      return json(200, await planEssay({ apiKey, profile, activities, lang: readLang(query, parsed) }))
    }

    if (path === '/api/me/opportunities' && method === 'GET') {
      const profile = await getProfile(me.id)
      if (!profile) return json(409, { error: 'Complete your profile first' })
      return json(200, await suggestOpportunities({ apiKey, profile, lang: readLang(query, parsed) }))
    }

    if (path === '/api/me/funding' && method === 'GET') {
      const profile = await getProfile(me.id)
      if (!profile) return json(409, { error: 'Complete your profile first' })
      const countries = profile.destinations?.length ? profile.destinations : [profile.destination]
      return json(200, {
        countries: countries.filter(Boolean).map((iso, index) => ({
          iso,
          label: profile.destinationLabels?.[index] ?? iso,
          tuition: requirementsFor({ country: iso, id: null })?.tuition ?? null,
          scholarships: scholarshipsFor(iso),
        })),
      })
    }

    if (path === '/api/me/activity' && method === 'GET') {
      return json(200, await getActivity(me.id))
    }

    if (path === '/api/me/leaderboard' && method === 'GET') {
      return json(200, { leaderboard:await getXpLeaderboard(me.id) })
    }

    if (path === '/api/me/subtask' && method === 'POST') {
      const result = await setSubtaskProgress(me.id, parsed)
      if (result.error) return json(result.status, { error: result.error })
      return json(200, { ...result, plan: rehydrate(await getCurrentPlan(me.id), await getProfile(me.id)) })
    }

    if (path === '/api/me/tests' && method === 'GET') {
      return json(200, { tests: await getTests(me.id) })
    }

    if (path === '/api/me/tests' && method === 'PUT') {
      const result = await saveTests(me.id, parsed.tests)
      if (result.error) return json(result.status, { error: result.error })
      return json(200, { tests: result.tests })
    }

    if (path === '/api/me/chat' && method === 'POST') {
      const profile = await getProfile(me.id)
      if (!profile) return json(409, { error: 'Complete your profile first' })
      const stored = await getCurrentPlan(me.id)
      const result = await askLeo({
        apiKey, profile, plan: stored, lang: readLang(query, parsed),
        history: parsed.history, message: parsed.message,
      })
      if (result.error) return json(result.status, { error: result.error })
      return json(200, { reply: result.reply, source: result.source })
    }

    if (path === '/api/options' && method === 'GET') {
      return json(200, { destinations: destinationOptions, fields: fieldOptions, levels: levelOptions, englishLevels, maxDestinations: MAX_DESTINATIONS })
    }

    // Kept for the signed-out/demo path: generates without storing anything.
    if (path === '/api/ai/admission-plan' && method === 'POST') {
      const result = await handlePlanRequest(body, apiKey)
      return json(result.status, result.body)
    }

    if (path === '/api/health' && method === 'GET') {
      return json(200, { database: await isReachable() ? 'up' : 'down', model: apiKey ? 'configured' : 'no key' })
    }
  } catch (error) {
    // A database that is down must read as "service unavailable", not as bad credentials.
    const offline = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '57P03'].includes(error.code)
    if (offline) {
      console.error('[path2uni] postgres unreachable:', error.message)
      return json(503, { error: 'The database is unreachable. Run: docker compose up -d core-db' })
    }
    console.error('[path2uni] route error:', error)
    return json(500, { error: 'Something went wrong on our side' })
  }

  return json(404, { error: 'Not found' })
}
