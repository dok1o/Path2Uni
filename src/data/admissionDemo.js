// DEMONSTRATION DATA — NOT VERIFIED AGAINST ANY OFFICIAL SOURCE.
//
// Entry requirements, deadlines and costs are the facts an applicant actually comes for, and
// they are also the facts nobody publishes in a machine-readable form: they live on thousands
// of university pages, in dozens of languages, and change every admission cycle. Until the
// OSINT pipeline in docs/DATABASE_ARCHITECTURE.md can fetch and review them, this file stands
// in for that layer so the product can be walked end to end.
//
// Every record carries `evidence: 'demo'`, and every screen that renders one of these numbers
// must show the marker next to it. That is the rule in database/README.md, and it is the only
// thing that makes showing them acceptable: a student who mistakes a plausible-looking band
// score for a checked one applies to the wrong place and loses a year.
//
// The figures are typical rather than invented at random — an English-taught bachelor's in the
// Netherlands really does sit around IELTS 6.0-6.5 — but "typical" is not "true for your
// programme", which is exactly what the marker says.

export const EVIDENCE_DEMO = 'demo'

export const DEMO_NOTICE = 'Demonstration data — confirm on the university’s official page before you rely on it.'

/** Typical entry requirements per destination, for an English-taught programme. */
export const countryRequirements = {
  it: {
    english: { test: 'IELTS', band: 6.0, alt: [{ test: 'TOEFL iBT', band: 80 }, { test: 'Duolingo', band: 105 }] },
    gpaGuidance: 'Most public universities expect a solid secondary certificate; selective programmes ask for an entrance test (TOLC).',
    documents: ['Secondary school diploma', 'Declaration of Value or CIMEA statement', 'Sworn translation', 'Passport'],
    rounds: [
      { name: 'Early round', opens: 'November', closes: 'January' },
      { name: 'Main round', opens: 'February', closes: 'April' },
    ],
    tuition: { min: 900, max: 4000, currency: 'EUR', period: 'year', note: 'Public universities; income-based reductions are common.' },
    visaNote: 'Pre-enrolment through Universitaly is required before the visa appointment.',
    evidence: EVIDENCE_DEMO,
  },
  de: {
    english: { test: 'IELTS', band: 6.5, alt: [{ test: 'TOEFL iBT', band: 90 }] },
    gpaGuidance: 'A recognised Abitur equivalent; applicants from many countries need a Studienkolleg year or an APS certificate first.',
    documents: ['Secondary school diploma', 'APS certificate (country-dependent)', 'Certified translation', 'Passport'],
    rounds: [
      { name: 'Winter intake', opens: 'May', closes: 'July' },
      { name: 'Summer intake', opens: 'December', closes: 'January' },
    ],
    tuition: { min: 0, max: 1500, currency: 'EUR', period: 'year', note: 'Most public universities charge only a semester contribution.' },
    visaNote: 'A blocked account covering living costs is usually required for the student visa.',
    evidence: EVIDENCE_DEMO,
  },
  nl: {
    english: { test: 'IELTS', band: 6.5, alt: [{ test: 'TOEFL iBT', band: 90 }, { test: 'Cambridge', band: 'C1 Advanced' }] },
    gpaGuidance: 'A secondary diploma judged equivalent to the Dutch VWO; technical programmes expect mathematics and physics.',
    documents: ['Secondary school diploma', 'Nuffic diploma evaluation', 'Motivation letter', 'Passport'],
    rounds: [
      { name: 'Studielink deadline', opens: 'October', closes: 'January' },
      { name: 'Late round (non-selective)', opens: 'February', closes: 'May' },
    ],
    tuition: { min: 2500, max: 15000, currency: 'EUR', period: 'year', note: 'EU and non-EU rates differ sharply.' },
    visaNote: 'The university applies for the residence permit on the student’s behalf.',
    evidence: EVIDENCE_DEMO,
  },
  hu: {
    english: { test: 'IELTS', band: 5.5, alt: [{ test: 'TOEFL iBT', band: 72 }] },
    gpaGuidance: 'Secondary diploma plus a subject entrance exam; medicine requires biology and chemistry.',
    documents: ['Secondary school diploma with apostille', 'Sworn translation', 'Medical certificate', 'Passport'],
    rounds: [
      { name: 'Main round', opens: 'January', closes: 'May' },
      { name: 'Late round', opens: 'June', closes: 'August' },
    ],
    tuition: { min: 4000, max: 18000, currency: 'EUR', period: 'year', note: 'Medicine sits at the top of this range.' },
    visaNote: 'Stipendium Hungaricum covers tuition and a stipend for selected applicants.',
    evidence: EVIDENCE_DEMO,
  },
  gb: {
    english: { test: 'IELTS', band: 6.5, alt: [{ test: 'TOEFL iBT', band: 92 }, { test: 'PTE', band: 62 }] },
    gpaGuidance: 'A-levels, IB or a recognised foundation year; competitive courses publish grade offers.',
    documents: ['Secondary qualifications', 'Personal statement', 'Academic reference', 'Passport'],
    rounds: [
      { name: 'UCAS equal consideration', opens: 'September', closes: 'January' },
      { name: 'UCAS late / Clearing', opens: 'February', closes: 'June' },
    ],
    tuition: { min: 11000, max: 38000, currency: 'GBP', period: 'year', note: 'International rates; medicine is higher again.' },
    visaNote: 'A Student visa needs a CAS from the university and proof of maintenance funds.',
    evidence: EVIDENCE_DEMO,
  },
  us: {
    english: { test: 'IELTS', band: 6.5, alt: [{ test: 'TOEFL iBT', band: 90 }, { test: 'Duolingo', band: 120 }] },
    gpaGuidance: 'Transcripts for the last four years; many universities are test-optional for SAT/ACT but still read them.',
    documents: ['Transcripts', 'Essays', 'Two recommendation letters', 'Financial statement', 'Passport'],
    rounds: [
      { name: 'Early action / decision', opens: 'August', closes: 'November' },
      { name: 'Regular decision', opens: 'August', closes: 'January' },
    ],
    tuition: { min: 12000, max: 62000, currency: 'USD', period: 'year', note: 'Public in-state, public out-of-state and private differ enormously.' },
    visaNote: 'An I-20 from the university is needed before the F-1 visa interview.',
    evidence: EVIDENCE_DEMO,
  },
  ch: {
    english: { test: 'IELTS', band: 6.5, alt: [{ test: 'TOEFL iBT', band: 92 }] },
    gpaGuidance: 'Most bachelor programmes are taught in a national language; English-taught study starts mainly at master level.',
    documents: ['Secondary school diploma', 'Recognition statement (swissuniversities)', 'Translation', 'Passport'],
    rounds: [{ name: 'Autumn intake', opens: 'November', closes: 'April' }],
    tuition: { min: 1200, max: 8000, currency: 'CHF', period: 'year', note: 'Low tuition, high living costs.' },
    visaNote: 'Proof of sufficient funds is checked closely at the cantonal level.',
    evidence: EVIDENCE_DEMO,
  },
  cn: {
    english: { test: 'IELTS', band: 6.0, alt: [{ test: 'TOEFL iBT', band: 80 }] },
    gpaGuidance: 'Secondary diploma and transcripts; Chinese-taught programmes ask for HSK 4-5 instead.',
    documents: ['Secondary school diploma', 'Notarised transcripts', 'Physical examination form', 'Passport'],
    rounds: [{ name: 'Main intake', opens: 'March', closes: 'June' }],
    tuition: { min: 3000, max: 12000, currency: 'USD', period: 'year', note: 'CSC scholarships cover tuition and accommodation for some applicants.' },
    visaNote: 'A JW202 form from the university is required for the X1 student visa.',
    evidence: EVIDENCE_DEMO,
  },
  ae: {
    english: { test: 'IELTS', band: 6.0, alt: [{ test: 'TOEFL iBT', band: 79 }, { test: 'EmSAT', band: 1250 }] },
    gpaGuidance: 'Attested secondary certificate; engineering programmes check mathematics separately.',
    documents: ['Attested secondary certificate', 'Passport and Emirates ID application', 'Medical fitness test'],
    rounds: [
      { name: 'Autumn intake', opens: 'February', closes: 'July' },
      { name: 'Spring intake', opens: 'September', closes: 'December' },
    ],
    tuition: { min: 9000, max: 30000, currency: 'AED', period: 'year', note: 'Branch campuses charge close to their home rates.' },
    visaNote: 'The university normally sponsors the student residence visa.',
    evidence: EVIDENCE_DEMO,
  },
  my: {
    english: { test: 'IELTS', band: 5.5, alt: [{ test: 'TOEFL iBT', band: 70 }, { test: 'MUET', band: 'Band 4' }] },
    gpaGuidance: 'Secondary certificate accepted widely; foundation programmes bridge most gaps.',
    documents: ['Secondary school certificate', 'EMGS application', 'Medical screening', 'Passport'],
    rounds: [
      { name: 'February intake', opens: 'October', closes: 'January' },
      { name: 'September intake', opens: 'April', closes: 'August' },
    ],
    tuition: { min: 3000, max: 12000, currency: 'USD', period: 'year', note: 'Branch campuses of UK and Australian universities cost more.' },
    visaNote: 'EMGS handles the student pass before arrival.',
    evidence: EVIDENCE_DEMO,
  },
}

/** A few universities whose bar sits noticeably above the country norm. */
export const universityOverrides = {
  'university-of-oxford': { english: { test: 'IELTS', band: 7.5 }, selectivity: 'very high' },
  'university-of-cambridge': { english: { test: 'IELTS', band: 7.5 }, selectivity: 'very high' },
  'imperial-college-london': { english: { test: 'IELTS', band: 7.0 }, selectivity: 'very high' },
  'london-school-of-economics-and-political-science': { english: { test: 'IELTS', band: 7.0 }, selectivity: 'very high' },
  'massachusetts-institute-of-technology': { english: { test: 'IELTS', band: 7.0 }, selectivity: 'very high' },
  'harvard-university': { english: { test: 'IELTS', band: 7.0 }, selectivity: 'very high' },
  'stanford-university': { english: { test: 'IELTS', band: 7.0 }, selectivity: 'very high' },
  'bocconi-university': { english: { test: 'IELTS', band: 6.5 }, selectivity: 'high' },
  'politecnico-di-milano': { english: { test: 'IELTS', band: 6.0 }, selectivity: 'high' },
  'delft-university-of-technology': { english: { test: 'IELTS', band: 6.5 }, selectivity: 'high' },
  'eth-zurich': { english: { test: 'IELTS', band: 7.0 }, selectivity: 'very high' },
  'semmelweis-university': { english: { test: 'IELTS', band: 6.0 }, selectivity: 'high' },
  'tsinghua-university': { english: { test: 'IELTS', band: 6.5 }, selectivity: 'very high' },
  'peking-university': { english: { test: 'IELTS', band: 6.5 }, selectivity: 'very high' },
}

/** Everything known about one university's requirements, with its evidence marker. */
export function requirementsFor(university) {
  const base = countryRequirements[university.country]
  if (!base) return null
  const override = universityOverrides[university.id]
  return {
    ...base,
    english: override?.english ? { ...base.english, ...override.english } : base.english,
    selectivity: override?.selectivity ?? 'moderate',
    evidence: EVIDENCE_DEMO,
    notice: DEMO_NOTICE,
  }
}

const BAND_ORDER = ['a2', 'b1', 'b2', 'c1', 'c2', 'native']

/**
 * Compares what the applicant has against what a university asks, in bands rather than a
 * score, because a single number here would read as a probability of admission — which this
 * data cannot support and which the product must not imply.
 */
export function englishGap({ englishLevel, tests = [] }, requirement) {
  const sat = tests.find(test => test.test_code === 'IELTS' && test.status === 'completed' && test.score != null)
  if (sat && requirement?.band && typeof requirement.band === 'number') {
    const margin = Number(sat.score) - requirement.band
    if (margin >= 0.5) return { status: 'clear', detail: `Your IELTS ${sat.score} is above the ${requirement.band} typically asked.` }
    if (margin >= 0) return { status: 'just', detail: `Your IELTS ${sat.score} meets the ${requirement.band} typically asked, with little margin.` }
    return { status: 'short', detail: `Your IELTS ${sat.score} is below the ${requirement.band} typically asked.` }
  }
  // No certificate yet: fall back to the self-reported level.
  const level = BAND_ORDER.indexOf(String(englishLevel || '').toLowerCase())
  if (level < 0) return { status: 'unknown', detail: 'No English certificate on file yet.' }
  if (level >= BAND_ORDER.indexOf('c1')) return { status: 'likely', detail: `Your ${englishLevel} suggests you would reach the usual bar, but a certificate is still required.` }
  if (level >= BAND_ORDER.indexOf('b2')) return { status: 'plan', detail: `Your ${englishLevel} is close; a certificate is the step that proves it.` }
  return { status: 'short', detail: `Your ${englishLevel} is below the usual bar, so the certificate comes first.` }
}
