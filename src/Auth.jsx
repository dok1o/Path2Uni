import { useState } from 'react'
import mascot from './assets/leo-mascot.png'
import { useT, LanguageSwitch } from './i18n.jsx'
import Privacy from './Privacy.jsx'

export default function Auth({ onSignedIn }) {
  const { t } = useT()
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ username: '', password: '', displayName: '', consent: false })
  const [error, setError] = useState(null)
  const [field, setField] = useState(null)
  const [busy, setBusy] = useState(false)
  const registering = mode === 'register'

  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }))
  const setConsent = event => setForm(current => ({ ...current, consent: event.target.checked }))

  const submit = async event => {
    event.preventDefault()
    setBusy(true); setError(null); setField(null)
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registering ? form : { username: form.username, password: form.password }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) { setError(t(payload.error || 'Something went wrong', payload.vars)); setField(payload.field ?? null); return }
      onSignedIn(payload.user)
    } catch {
      setError(t('Cannot reach the server. Is it running?'))
    } finally { setBusy(false) }
  }

  const swap = () => {
    setMode(registering ? 'login' : 'register')
    setError(null); setField(null)
  }

  return <div className="auth-screen">
    {privacyOpen && <Privacy onClose={() => setPrivacyOpen(false)}/>}
    <LanguageSwitch/>
    <div className="auth-art">
      <div className="auth-orbit one"/><div className="auth-orbit two"/>
      <img src={mascot} alt={t('Leo, the Path2Uni mascot')}/>
      <div className="auth-bubble">{registering ? t('Nice to meet you!') : t('Welcome back!')}<span>{t('Your path is waiting.')}</span></div>
    </div>

    <form className="auth-card" onSubmit={submit}>
      <div className="auth-brand"><span className="brand-mark">P</span>path<span>2</span>uni</div>
      <h1>{registering ? t('Start your path') : t('Sign in')}</h1>
      <p className="auth-lead">{registering
        ? t('Pick a username and a password. No email needed.')
        : t('Pick up where you left off.')}</p>

      <label className={field === 'username' ? 'bad' : ''}>
        <span>{t('Username')}</span>
        <input value={form.username} onChange={set('username')} autoComplete="username"
          autoFocus required minLength={3} maxLength={32} placeholder={t('mila')} />
      </label>

      {registering && <label>
        <span>{t('Display name')} <i>{t('optional')}</i></span>
        <input value={form.displayName} onChange={set('displayName')} autoComplete="name"
          maxLength={80} placeholder={t('Mila A.')} />
      </label>}

      <label className={field === 'password' ? 'bad' : ''}>
        <span>{t('Password')}</span>
        <input type="password" value={form.password} onChange={set('password')}
          autoComplete={registering ? 'new-password' : 'current-password'}
          required minLength={8} placeholder={t('at least 8 characters')} />
      </label>

      {registering && <label className="auth-consent">
        <input type="checkbox" checked={form.consent} onChange={setConsent} required />
        <span>{t('I consent to the processing of my personal data as described in')} <button type="button" className="auth-privacy-link" onClick={event => { event.preventDefault(); setPrivacyOpen(true) }}>{t('what Path2Uni does with your data')}</button>.</span>
      </label>}

      {error && <div className="auth-error" role="alert">{error}</div>}

      <button className="button primary auth-submit" type="submit" disabled={busy}>
        {busy ? t('One moment…') : registering ? t('Create my account') : t('Sign in')}
        {!busy && <span>→</span>}
      </button>

      <button className="auth-swap" type="button" onClick={swap}>
        {registering ? t('Already have an account? Sign in') : t('New here? Create an account')}
      </button>
    </form>
  </div>
}
