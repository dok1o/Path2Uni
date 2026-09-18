// What this app actually does with someone's data.
//
// It exists because the sign-up form asks people to consent to "the Privacy Policy", and
// until now there was no such document — a consent to something nobody wrote is not consent.
// Every line here is checkable against the code: server/auth.js for the password handling,
// server/plan.js `deidentify()` for the five fields, server/crypto.js for the encryption,
// and database/core/001_schema.sql for the ON DELETE CASCADE.
//
// If any of that changes, this changes with it. A privacy notice that drifts from the code
// is worse than none, because people rely on it.

import { motion } from 'motion/react'
import { useT } from './i18n.jsx'

const SECTIONS = [
  {
    title: 'What we keep',
    items: [
      'Your username, and your password as a scrypt hash. We cannot read your password, and neither can anyone who steals the database.',
      'A session token, stored only as its sha256, so a stolen database cannot be replayed as a login.',
      'The answers you gave at onboarding: destination countries, degree level, field, intake year and English level.',
      'Your exam results and their dates, and your plan with the quests you have completed.',
    ],
  },
  {
    title: 'What never reaches our server',
    items: [
      'Your motivation letter draft. It stays in this browser and is never sent or stored.',
      'Your saved universities and your friends list — also browser only.',
      'Identity documents, passport numbers, payment details. We never ask for them, and there is nowhere to put them.',
    ],
  },
  {
    title: 'What we send to the AI',
    items: [
      'Five fields only: destination, degree level, field of study, intake year and English level. Your name, your account, your contacts and anything you wrote about yourself are removed before the request is built.',
      'The exception is the text in Activities, Awards and Skills — and only when you press the button that says it is being sent, once, to be commented on.',
      'The model is Google Gemini on its free tier, where prompts may be reviewed by the provider. That is exactly why the list above is a whitelist and not a blacklist.',
    ],
  },
  {
    title: 'How it is protected, and how far that goes',
    items: [
      'Free text about a person is encrypted with AES-256-GCM before it is stored, bound to the column it belongs to.',
      'Over a secure connection the session cookie is marked Secure and the site asks browsers to use HTTPS only.',
      'What this does not protect against: an attacker who takes over the running application, because it holds the key. Encryption is worth doing; it is not worth false confidence.',
    ],
  },
  {
    title: 'Removing it',
    items: [
      'Deleting your account deletes your profile, your plans, your quest progress and your exam results with it, in the same operation.',
      'Ask the team at the address in the footer and we will do it.',
    ],
  },
]

export default function Privacy({ onClose }) {
  const { t } = useT()
  return <div className="privacy-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <motion.section className="privacy-sheet" role="dialog" aria-modal="true" aria-labelledby="privacy-title"
      initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }}>
      <header>
        <div>
          <span className="eyebrow purple">{t('YOUR DATA')}</span>
          <h2 id="privacy-title">{t('What Path2Uni does with what you type')}</h2>
          <p>{t('Short, specific, and checkable against the source code.')}</p>
        </div>
        <button className="exam-close" onClick={onClose} aria-label={t('Close')}>×</button>
      </header>
      <div className="privacy-body">
        {SECTIONS.map(section => <section key={section.title}>
          <h3>{t(section.title)}</h3>
          <ul>{section.items.map(item => <li key={item}>{t(item)}</li>)}</ul>
        </section>)}
      </div>
      <footer>
        <small>{t('This describes the product as it is today, including the parts that are not finished. Entry requirements, tuition and deadlines shown in the app are demonstration data and are labelled as such.')}</small>
        <button className="button primary" onClick={onClose}>{t('Close')}</button>
      </footer>
    </motion.section>
  </div>
}
