const STORAGE_KEY = 'path2uni:applicantProfile'

export function loadApplicantProfile() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { tests: [] }
  } catch {
    return { tests: [] }
  }
}

export function toProfileTestRows(tests) {
  const testWithoutDate = tests.find(test => !test.date)
  if (testWithoutDate) throw new Error(`${testWithoutDate.name || 'Exam'}: test date is required.`)

  return tests.map(test => ({
    test_code: test.code,
    test_name: test.name,
    status: test.status,
    score: test.score === '' || test.score == null ? null : Number(test.score),
    score_text: test.scoreText || null,
    test_date: ['completed', 'mock'].includes(test.status) ? test.date || null : null,
    planned_date: test.status === 'planned' ? test.date || null : null,
  }))
}

export async function saveApplicantTests(tests) {
  const current = loadApplicantProfile()
  const next = { ...current, tests: toProfileTestRows(tests), updatedAt: new Date().toISOString() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))

  const apiUrl = import.meta.env.VITE_API_URL
  if (apiUrl) {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/applicant-profile/tests`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ tests: next.tests }),
    })
    if (!response.ok) throw new Error(`Could not save test results (${response.status})`)
  }
  return next
}

