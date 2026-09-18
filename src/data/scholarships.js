// Where funding for international students is actually administered, per destination.
//
// Every `url` here was fetched and its page title read back before it was written down —
// the same rule the university addresses follow. Two entries have no link because the site
// would not answer a non-browser request from here; a plausible-looking guess would be worse
// than the honest gap, because a wrong scholarship link costs an application cycle.
//
// What is deliberately absent: amounts, deadlines, eligibility and how many are awarded.
// Those change every cycle and belong to the OSINT pipeline with a source and a year. This
// file answers "who runs funding for this country and where is their page", nothing more.

export const SCHOLARSHIP_EVIDENCE = 'verified-link'

/** `kind` says who runs it, which is stable; it is not a claim about what it pays. */
export const scholarships = {
  de: [
    { name: 'DAAD Scholarship Database', kind: 'National academic exchange service', url: 'https://www.daad.de/en/study-and-research-in-germany/scholarships/' },
    { name: 'Erasmus+', kind: 'EU programme', url: 'https://erasmus-plus.ec.europa.eu/opportunities/individuals/students' },
  ],
  hu: [
    { name: 'Stipendium Hungaricum', kind: 'Government programme', url: 'https://stipendiumhungaricum.hu/' },
    { name: 'Erasmus+', kind: 'EU programme', url: 'https://erasmus-plus.ec.europa.eu/opportunities/individuals/students' },
  ],
  nl: [
    { name: 'Study in NL — scholarships', kind: 'National information portal', url: 'https://www.studyinnl.org/finances/scholarships' },
    { name: 'Erasmus+', kind: 'EU programme', url: 'https://erasmus-plus.ec.europa.eu/opportunities/individuals/students' },
  ],
  ch: [
    { name: 'Swiss Government Excellence Scholarships', kind: 'Government programme', url: 'https://www.sbfi.admin.ch/sbfi/en/home/education/scholarships-and-grants/swiss-government-excellence-scholarships.html' },
  ],
  it: [
    { name: 'Study in Italy', kind: 'Government information portal', url: 'https://studyinitaly.esteri.it/' },
    { name: 'Erasmus+', kind: 'EU programme', url: 'https://erasmus-plus.ec.europa.eu/opportunities/individuals/students' },
  ],
  us: [
    { name: 'EducationUSA', kind: 'State Department advising network', url: 'https://educationusa.state.gov/' },
  ],
  my: [
    { name: 'Education Malaysia Global Services', kind: 'Government agency', url: 'https://educationmalaysia.gov.my/' },
  ],
  ae: [
    { name: 'UAE higher education (official portal)', kind: 'Government portal', url: 'https://u.ae/en/information-and-services/education/higher-education' },
  ],
  // No link: chevening.org and campuschina.org did not answer a non-browser request from
  // here, so neither address could be checked. The names are stable and searchable.
  gb: [
    { name: 'Chevening Scholarships', kind: 'UK government programme', url: null },
    { name: 'Your university’s own international scholarships', kind: 'University', url: null },
  ],
  cn: [
    { name: 'Chinese Government Scholarship (CSC)', kind: 'Government programme', url: null },
    { name: 'Your university’s international office', kind: 'University', url: null },
  ],
}

export const scholarshipsFor = iso => scholarships[iso] ?? []
