// How ready this applicant is for this university, counted rather than guessed.
//
// This is deliberately NOT a probability of admission. To produce one you need the entry
// scores, the competition and the intake statistics for that programme in that year, and we
// hold none of them — a number built on the demonstration layer would look like a fact and
// be a fiction, and a student who reads "72%" applies to the wrong place and finds out a
// year later.
//
// What it is instead: a count of the requirements we actually know about, each one shown
// with the evidence behind it, so the reader can see exactly what produced the verdict and
// which parts rest on demonstration data. Three of the five checks are facts from our own
// catalogue; two compare against the demo requirement layer and say so.

const BANDS = [
  { id: 'strong', from: 0.8, label: 'Looks like a fit', tone: 'good' },
  { id: 'workable', from: 0.5, label: 'Realistic, with gaps to close', tone: 'warn' },
  { id: 'gaps', from: 0, label: 'Not there yet', tone: 'bad' },
]

const STATE_WEIGHT = { met: 1, close: 0.5, missing: 0 }
// Two checks are disqualifying rather than scored. A university that does not teach your
// subject, or does not offer your level, is not "mostly a fit" because four other boxes are
// ticked — it is the wrong university, and the field filter is a hard filter everywhere else
// in this app. Without this, missing one of them still scored 4/5 and read as a fit.
const BLOCKING = new Set(['field', 'level'])

/** IELTS-style bands only; a text grade cannot be compared numerically. */
const numericEnglish = tests => (tests ?? [])
  .filter(test => test.test_code === 'IELTS' && test.status === 'completed' && test.score != null)
  .map(test => Number(test.score))
  .filter(Number.isFinite)
  .sort((a, b) => b - a)[0] ?? null

const LEVEL_ORDER = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']

export function assessReadiness({ profile, tests = [], university, requirements, fieldTag }) {
  const checks = []

  // --- real, from our own catalogue
  checks.push(university?.fields?.length && fieldTag && !university.fields.includes(fieldTag)
    ? { id: 'field', label: 'Teaches your field', state: 'missing', detail: 'This university does not list your subject.', vars: {}, evidence: 'catalogue' }
    : { id: 'field', label: 'Teaches your field', state: 'met', detail: 'Your subject is taught here.', vars: {}, evidence: 'catalogue' })

  const level = String(profile.degree || '').toLowerCase()
  checks.push(university?.levels?.length && level && !university.levels.includes(level)
    ? { id: 'level', label: 'Offers your level', state: 'missing', detail: 'Your degree level is not offered here.', vars: {}, evidence: 'catalogue' }
    : { id: 'level', label: 'Offers your level', state: 'met', detail: 'Your degree level is offered here.', vars: {}, evidence: 'catalogue' })

  const english = university?.languages ?? university?.langs ?? []
  checks.push(english.includes('en')
    ? { id: 'language', label: 'Taught in a language you have', state: 'met', detail: 'English-taught programmes exist here.', vars: {}, evidence: 'catalogue' }
    : { id: 'language', label: 'Taught in a language you have', state: 'close', detail: 'Teaching is mainly in the national language, so expect a language year.', vars: {}, evidence: 'catalogue' })

  // --- compared against the demonstration requirement layer
  const bar = typeof requirements?.english?.band === 'number' ? requirements.english.band : null
  const score = numericEnglish(tests)
  const selfLevel = LEVEL_ORDER.indexOf(String(profile.englishLevel || '').toLowerCase())
  if (score != null && bar != null) {
    checks.push(score >= bar
      ? { id: 'english', label: 'English certificate', state: 'met', detail: 'Your IELTS {score} is at or above the {bar} usually asked.', vars: { score, bar }, evidence: 'demo' }
      : { id: 'english', label: 'English certificate', state: score >= bar - 0.5 ? 'close' : 'missing', detail: 'Your IELTS {score} is below the {bar} usually asked.', vars: { score, bar }, evidence: 'demo' })
  } else {
    checks.push({
      id: 'english',
      label: 'English certificate',
      // A self-reported level is not a certificate, however high it is.
      state: selfLevel >= LEVEL_ORDER.indexOf('c1') ? 'close' : 'missing',
      detail: 'No certificate on file yet — the sitting is what proves the level.',
      vars: {},
      evidence: 'demo',
    })
  }

  const anyExam = (tests ?? []).some(test => test.status === 'completed')
  checks.push(anyExam
    ? { id: 'exams', label: 'Exam results recorded', state: 'met', detail: 'You have at least one completed exam on file.', vars: {}, evidence: 'profile' }
    : { id: 'exams', label: 'Exam results recorded', state: 'missing', detail: 'Nothing recorded yet, so nothing can be matched against requirements.', vars: {}, evidence: 'profile' })

  const earned = checks.reduce((sum, check) => sum + STATE_WEIGHT[check.state], 0)
  const ratio = checks.length ? earned / checks.length : 0
  const blocked = checks.some(check => BLOCKING.has(check.id) && check.state === 'missing')
  const band = blocked ? BANDS[BANDS.length - 1] : (BANDS.find(item => ratio >= item.from) ?? BANDS[BANDS.length - 1])

  return {
    band: band.id,
    label: band.label,
    tone: band.tone,
    met: checks.filter(check => check.state === 'met').length,
    total: checks.length,
    checks,
    // Said out loud in the payload as well as in the UI, so no later reader mistakes it.
    basis: 'Readiness against the requirements we know about, not a probability of admission.',
  }
}
