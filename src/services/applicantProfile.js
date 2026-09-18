// Exam results the applicant has taken or is planning.
//
// Originally this kept everything in localStorage and optionally PUT to a separate API named
// by VITE_API_URL. There is a backend now on the same origin, so the results go to Postgres
// and belong to the signed-in account. localStorage stays as a cache: it makes the modal open
// with the previous answers instantly, and it keeps the step usable if a save fails.

const STORAGE_KEY = 'path2uni:applicantProfile'
const EMPTY = { tests: [] }

const readCache = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || EMPTY }
  catch { return EMPTY }
}

const writeCache = value => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) }
  catch { /* private window or blocked storage: the server copy is the real one */ }
}

export function loadApplicantProfile() {
  return readCache()
}

/** Pulls the stored results for the signed-in account and refreshes the cache. */
export async function fetchApplicantTests() {
  try {
    const response = await fetch('/api/me/tests')
    if (!response.ok) return readCache()
    const payload = await response.json()
    const next = { tests: payload.tests ?? [], updatedAt: new Date().toISOString() }
    writeCache(next)
    return next
  } catch { return readCache() }
}

/** The database row shape, so the server stores what the UI collected without reshaping. */
export function toProfileTestRows(tests) {
  return tests.map(test => ({
    test_code: test.code,
    test_name: test.name,
    status: test.status,
    score: test.score === '' || test.score == null ? null : Number(test.score),
    score_text: test.scoreText || null,
    test_date: test.status === 'completed' ? test.date || null : null,
    planned_date: test.status === 'planned' ? test.date || null : null,
  }))
}

export async function saveApplicantTests(tests) {
  const next = { tests: toProfileTestRows(tests), updatedAt: new Date().toISOString() }
  const response = await fetch('/api/me/tests', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tests: next.tests }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || `Could not save your test results (${response.status})`)
  }
  // Cache only what the server accepted, so the two never drift apart.
  const saved = { tests: (await response.json()).tests ?? next.tests, updatedAt: next.updatedAt }
  writeCache(saved)
  return saved
}
