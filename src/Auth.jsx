import { useState } from 'react'
import mascot from './assets/leo-mascot.png'
import { useT, LanguageSwitch } from './i18n.jsx'
import Privacy from './Privacy.jsx'

export default function Auth({ onSignedIn }) {
  const { t, lang } = useT()
  const [privacyOpen, setPrivacyOpen] = useState(false)
  // 'login' (username + password) · 'email' (address + code, no password) · 'register'
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ username: '', password: '', displayName: '', email: '', consent: false })
  const [error, setError] = useState(null)
  const [field, setField] = useState(null)
  const [busy, setBusy] = useState(false)
  // Set once a code is on its way; until it clears, the form is the code form.
  const [pending, setPending] = useState(null)
  const [code, setCode] = useState('')
  const registering = mode === 'register'
  const byEmail = mode === 'email'

  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }))
  const setConsent = event => setForm(current => ({ ...current, consent: event.target.checked }))

  const call = async (path, body) => {
    const response = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, lang }),
    })
    const payload = await response.json().catch(() => ({}))
    return { ok: response.ok, payload }
  }

  const submit = async event => {
    event.preventDefault()
    setBusy(true); setError(null); setField(null)
    try {
      const path = byEmail ? '/api/auth/email-code' : `/api/auth/${mode}`
      const body = registering ? form
        : byEmail ? { email: form.email }
        : { username: form.username, password: form.password }
      const { ok, payload } = await call(path, body)
      if (!ok) { setError(t(payload.error || 'Something went wrong', payload.vars)); setField(payload.field ?? null); return }

      // Signing in by address, or with a second factor on, hands back a challenge instead of
      // a session. An unknown address gets the same reply with a null token, so this screen
      // cannot be used to find out which addresses have accounts.
      if (payload.needsCode) { setPending({ token: payload.token, hint: payload.hint }); return }
      onSignedIn(payload.user)
    } catch {
      setError(t('Cannot reach the server. Is it running?'))
    } finally { setBusy(false) }
  }

  const submitCode = async event => {
    event.preventDefault()
    setBusy(true); setError(null)
    try {
      const { ok, payload } = await call('/api/auth/verify', { token: pending.token, code })
      if (!ok) { setError(t(payload.error || 'Something went wrong', payload.vars)); return }
      onSignedIn(payload.user)
    } catch {
      setError(t('Cannot reach the server. Is it running?'))
    } finally { setBusy(false) }
  }

  const goTo = next => { setMode(next); setError(null); setField(null); setPending(null); setCode('') }

  return <div className="auth-screen">
    {privacyOpen && <Privacy onClose={() => setPrivacyOpen(false)}/>}
    <LanguageSwitch/>
    <div className="auth-art">
      <div className="auth-orbit one"/><div className="auth-orbit two"/>
      <img src={mascot} alt={t('Leo, the Path2Uni mascot')}/>
      <div className="auth-bubble">{registering ? t('Nice to meet you!') : t('Welcome back!')}<span>{t('Your path is waiting.')}</span></div>
    </div>

    {pending ? <form className="auth-card" onSubmit={submitCode}>
      <div className="auth-brand"><span className="brand-mark">P</span>path<span>2</span>uni</div>
      <h1>{t('Check your email')}</h1>
      <p className="auth-lead">{t('We sent a 6-digit code to {email}. It works once and expires in 10 minutes.', { email: pending.hint })}</p>

      <label>
        <span>{t('Code from the email')}</span>
        <input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric" autoComplete="one-time-code" autoFocus required
          placeholder="000000" className="auth-code"/>
      </label>

      {error && <div className="auth-error" role="alert">{error}</div>}

      <button className="button primary auth-submit" type="submit" disabled={busy || code.length < 4}>
        {busy ? t('One moment…') : t('Sign in')}{!busy && <span>→</span>}
      </button>
      <button className="auth-swap" type="button" onClick={() => goTo(mode)}>{t('Use a different way to sign in')}</button>
    </form> : <form className="auth-card" onSubmit={submit}>
      <div className="auth-brand"><span className="brand-mark">P</span>path<span>2</span>uni</div>
      <h1>{registering ? t('Start your path') : t('Sign in')}</h1>
      <p className="auth-lead">{registering
        ? t('Pick a username, a password and an email we can reach you at.')
        : byEmail ? t('Enter your address and we will send you a code.') : t('Pick up where you left off.')}</p>

      {!byEmail && <label className={field === 'username' ? 'bad' : ''}>
        <span>{t('Username')}</span>
        <input value={form.username} onChange={set('username')} autoComplete="username"
          autoFocus required minLength={3} maxLength={32} placeholder={t('mila')} />
      </label>}

      {registering && <label>
        <span>{t('Display name')} <i>{t('optional')}</i></span>
        <input value={form.displayName} onChange={set('displayName')} autoComplete="name"
          maxLength={80} placeholder={t('Mila A.')} />
      </label>}

      {(registering || byEmail) && <label className={field === 'email' ? 'bad' : ''}>
        <span>{t('Email')}{registering && <i>{t('we send sign-in codes and reminders here')}</i>}</span>
        <input type="email" value={form.email} onChange={set('email')} autoComplete="email"
          autoFocus={byEmail} required maxLength={190} placeholder="you@example.com" />
      </label>}

      {!byEmail && <label className={field === 'password' ? 'bad' : ''}>
        <span>{t('Password')}</span>
        <input type="password" value={form.password} onChange={set('password')}
          autoComplete={registering ? 'new-password' : 'current-password'}
          required minLength={8} placeholder={t('at least 8 characters')} />
      </label>}

      {registering && <label className="auth-consent">
        <input type="checkbox" checked={form.consent} onChange={setConsent} required />
        <span>{t('I consent to the processing of my personal data as described in')} <button type="button" className="auth-privacy-link" onClick={event => { event.preventDefault(); setPrivacyOpen(true) }}>{t('what Path2Uni does with your data')}</button>.</span>
      </label>}

      {error && <div className="auth-error" role="alert">{error}</div>}

      <button className="button primary auth-submit" type="submit" disabled={busy}>
        {busy ? t('One moment…') : registering ? t('Create my account') : byEmail ? t('Send me a code') : t('Sign in')}
        {!busy && <span>→</span>}
      </button>

      {!registering && <button className="auth-swap" type="button" onClick={() => goTo(byEmail ? 'login' : 'email')}>
        {byEmail ? t('Sign in with a username and password instead') : t('Sign in with an email code instead')}
      </button>}
      <button className="auth-swap" type="button" onClick={() => goTo(registering ? 'login' : 'register')}>
        {registering ? t('Already have an account? Sign in') : t('New here? Create an account')}
      </button>
    </form>}
  </div>
}
