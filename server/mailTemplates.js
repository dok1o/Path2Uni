// What the emails say. Plain text on purpose: an HTML mail from a Gmail address is what a
// spam filter looks for, and the whole message here is three lines and a number.
//
// Written through the same dictionary the interface uses, so a Russian reader gets a Russian
// email. The address is the one thing we hold about a person outside the product; every
// message says why it arrived and how to stop it.

import { translate } from '../src/locales/index.js'

const FOOT = {
  code: 'You are receiving this because someone asked to sign in to Path2Uni with this address. If that was not you, ignore this email — nothing has changed.',
  digest: 'You are receiving this because you turned on email reminders in your Path2Uni profile. Turn them off there at any time.',
}

export function codeEmail({ code, purpose, lang = 'en' }) {
  const t = (text, vars) => translate(lang, text, vars)
  const heading = purpose === 'verify_email'
    ? t('Confirm your email for Path2Uni')
    : t('Your Path2Uni sign-in code')
  return {
    subject: `${code} — ${heading}`,
    text: [
      heading,
      '',
      t('Your code is {code}', { code }),
      t('It works once and expires in 10 minutes.'),
      '',
      t(FOOT.code),
      'Path2Uni',
    ].join('\n'),
  }
}

/**
 * The digest carries the same notices the bell shows, and nothing else. It must never invent
 * an application deadline to create urgency — see server/notices.js for why.
 */
export function digestEmail({ name, notices, lang = 'en' }) {
  const t = (text, vars) => translate(lang, text, vars)
  const lines = notices.map(notice => `• ${t(notice.title, notice.vars)}\n  ${t(notice.detail, notice.detailVars)}`)
  return {
    subject: t('{count} things need you on Path2Uni', { count: notices.length }),
    text: [
      t('Hi {name},', { name }),
      '',
      t('Here is what needs you, built from the dates you entered and your own progress:'),
      '',
      ...lines,
      '',
      t('We do not hold verified application deadlines, so we never invent one to remind you about.'),
      '',
      t(FOOT.digest),
      'Path2Uni',
    ].join('\n'),
  }
}
