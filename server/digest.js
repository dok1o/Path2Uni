// The daily email, built from the same notices the bell shows.
//
// Three rules keep this from becoming the thing people mute:
//
//   * It carries only what server/notices.js produced, which means only dates the applicant
//     typed and their own progress. No invented application deadline, ever — that is the
//     whole discipline of this project, and an email is the worst place to break it because
//     the reader cannot see the demo badge next to it.
//   * Nothing goes out unless something actually needs them. A digest that says "nothing to
//     report" teaches people to stop opening it.
//   * One a day at most, in the reader's own timezone, and only after they turned it on.
//
// It runs on a plain interval rather than cron because the app is a single process and a
// second scheduler would be a second thing to deploy.

import { query } from './db.js'
import { buildNotices } from './notices.js'
import { readEmail } from './challenges.js'
import { sendMail, mailReady } from './mail.js'
import { digestEmail } from './mailTemplates.js'
import { purgeExpiredChallenges } from './challenges.js'

const CHECK_MINUTES = 30

/** @returns {{considered, sent, skipped}} — used by the timer and by a manual run. */
export async function sendDigests({ now = new Date() } = {}) {
  if (!mailReady()) return { considered: 0, sent: 0, skipped: 'not_configured' }

  const { rows } = await query(
    `select id, username, display_name, email_cipher, locale,
            (now() at time zone coalesce(timezone, 'Asia/Almaty'))::date as today
     from users
     where notify_by_email
       and email_verified_at is not null
       and email_cipher is not null
       and (digest_sent_on is null
            or digest_sent_on < (now() at time zone coalesce(timezone, 'Asia/Almaty'))::date)
     limit 200`)

  let sent = 0
  for (const row of rows) {
    const address = readEmail(row.email_cipher)
    if (!address) continue
    let notices
    try { ({ notices } = await buildNotices(row.id)) } catch { continue }
    // Only what the reader can act on. An `info` line is worth a badge, not an email.
    const actionable = (notices ?? []).filter(notice => notice.tone !== 'info')
    if (!actionable.length) {
      // Still stamp the day, or this user is reconsidered every thirty minutes forever.
      await query('update users set digest_sent_on = $2 where id = $1', [row.id, row.today])
      continue
    }

    const lang = String(row.locale || 'ru').slice(0, 2)
    const message = digestEmail({
      name: (row.display_name || row.username).split(/\s+/)[0],
      notices: actionable,
      lang: ['ru', 'kk', 'en'].includes(lang) ? lang : 'ru',
    })
    const result = await sendMail({ to: address, subject: message.subject, text: message.text })
    // Only a delivered message marks the day. A failed send must be retried, not swallowed.
    if (result.sent) {
      await query('update users set digest_sent_on = $2 where id = $1', [row.id, row.today])
      sent += 1
    }
  }
  return { considered: rows.length, sent }
}

/** Started by the server; harmless when SMTP is not configured. */
export function startDigestTimer() {
  const tick = () => {
    sendDigests().catch(error => console.error('[path2uni] digest failed:', error.message))
    purgeExpiredChallenges().catch(() => {})
  }
  const timer = setInterval(tick, CHECK_MINUTES * 60_000)
  timer.unref?.()
  // Not on boot: a restart loop would mean a burst of mail.
  return timer
}
