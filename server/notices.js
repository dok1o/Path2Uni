// The notification centre.
//
// The hard part is what NOT to notify about. The obvious feature — "your application
// deadline is in 9 days" — is the one thing this app cannot honestly do: application
// deadlines live in the demonstration layer, and waking someone for an invented date is
// worse than staying silent, because they will act on it.
//
// So every notice here is built from something the applicant themselves put in, or from
// their own progress:
//
//   * an exam they booked (a real date, typed by them)
//   * an exam whose date has passed with no result recorded
//   * a stage they started and have not touched
//   * a streak that ends tonight
//   * a gap in the profile that is blocking the matching
//
// The one procedural item — when application rounds usually open — carries evidence:'demo'
// and says "usually", because it is a stable pattern and not this year's date.
//
// Titles are English template strings with {placeholders}; the client translates them the
// same way it translates everything else.

import { query } from './db.js'
import { getProfile } from './profiles.js'
import { getTests } from './tests.js'
import { getActivity } from './activity.js'
import { requirementsFor } from '../src/data/admissionDemo.js'
import { destinations } from '../src/services/planContext.js'

const DAY = 86_400_000
const daysBetween = (from, to) => Math.round((new Date(to) - new Date(from)) / DAY)

/** Ordered by how soon it matters, not by kind: the top of the list is what to do next. */
const RANK = { urgent: 0, soon: 1, info: 2 }

export async function buildNotices(userId) {
  const profile = await getProfile(userId)
  if (!profile) return { notices: [], unread: 0 }

  const [tests, activity] = await Promise.all([getTests(userId), getActivity(userId).catch(() => null)])
  const today = activity?.today ?? new Date().toISOString().slice(0, 10)
  const notices = []

  // --- exams the applicant booked themselves
  for (const test of tests) {
    if (test.status === 'planned' && test.planned_date) {
      const days = daysBetween(today, test.planned_date)
      if (days < 0) {
        notices.push({
          key: `exam-past-${test.test_code}`, tone: 'urgent', page: 'profile', evidence: 'yours',
          title: '{exam} was {days} days ago', vars: { exam: test.test_name || test.test_code, days: Math.abs(days) },
          detail: 'Record the result so it can be matched against the requirements.',
        })
      } else if (days <= 30) {
        notices.push({
          key: `exam-soon-${test.test_code}`, tone: days <= 7 ? 'urgent' : 'soon', page: 'profile', evidence: 'yours',
          title: days === 0 ? '{exam} is today' : '{exam} in {days} days',
          vars: { exam: test.test_name || test.test_code, days },
          detail: 'You booked this date yourself.',
        })
      }
    }
  }

  if (!tests.length) {
    notices.push({
      key: 'no-exams', tone: 'soon', page: 'profile', evidence: 'yours',
      title: 'No exam results on file', vars: {},
      detail: 'Nothing can be matched against entry requirements until at least one is recorded.',
    })
  }

  // --- a stage started and left alone
  const { rows: stalled } = await query(
    `select rt.short_title, rt.title, r.created_at
     from roadmap_tasks rt
     join roadmaps r on r.id = rt.roadmap_id and r.is_current
     join applicant_profiles p on p.id = r.profile_id
     where p.user_id = $1 and rt.status = 'in_progress'
       and coalesce(jsonb_array_length(rt.completed_subtasks), 0) = 0
     order by rt.position limit 1`, [userId])
  if (stalled[0]) {
    const age = daysBetween(stalled[0].created_at, today)
    if (age >= 3) {
      notices.push({
        key: 'task-stalled', tone: age >= 10 ? 'soon' : 'info', page: 'roadmap', evidence: 'yours',
        title: '“{task}” has not moved in {days} days',
        vars: { task: stalled[0].short_title || stalled[0].title, days: age },
        detail: 'One quest is enough to start it again.',
      })
    }
  }

  // --- a streak about to end
  if (activity?.streak?.current > 0 && !activity.streak.activeToday) {
    notices.push({
      key: 'streak-ends', tone: 'soon', page: 'roadmap', evidence: 'yours',
      title: 'Your {count} day streak ends tonight', vars: { count: activity.streak.current },
      detail: 'Completing one quest today keeps it.',
    })
  }

  // --- when rounds usually open, for the destination the roadmap is written for
  const key = Object.keys(destinations).find(name => destinations[name].iso === profile.destination)
  const month = key ? destinations[key].earliest : null
  if (month) {
    notices.push({
      key: 'rounds-open', tone: 'info', page: 'advisor', evidence: 'demo',
      title: 'Applications for {country} usually open in {month}',
      vars: { country: profile.destinationLabel, month },
      detail: 'This is the usual pattern, not this year’s date — confirm it on the university’s own page.',
    })
  }

  const requirements = requirementsFor({ country: profile.destination, id: null })
  const hasCertificate = tests.some(test => test.status === 'completed' && test.score != null)
  if (requirements?.english?.band && !hasCertificate) {
    notices.push({
      key: 'english-proof', tone: 'info', page: 'advisor', evidence: 'demo',
      title: 'No English certificate yet', vars: {},
      detail: 'Programmes in {country} usually ask for around {test} {band}. A self-reported level does not count.',
      detailVars: { country: profile.destinationLabel, test: requirements.english.test, band: requirements.english.band },
    })
  }

  notices.sort((a, b) => RANK[a.tone] - RANK[b.tone])
  return { notices, unread: notices.filter(item => item.tone !== 'info').length, today }
}
