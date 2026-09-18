import { useEffect } from 'react'
import mascot from './assets/leo-mascot.png'
import SiteFooter from './SiteFooter.jsx'
import { useT, LanguageSwitch } from './i18n.jsx'

export default function NotFound() {
  const { t } = useT()
  useEffect(() => {
    const previousTitle = document.title
    document.title = `404 — ${t('Leo lost the trail.')} | Path2Uni`
    return () => { document.title = previousTitle }
  }, [t])

  const goHome = () => window.location.assign('/')

  return <div className="not-found-shell">
    <main className="not-found-page">
      <LanguageSwitch compact/>
      <button className="not-found-brand brand" type="button" onClick={goHome} aria-label={t('Home')}>
        <span className="brand-mark">P</span><span>path<span>2</span>uni</span>
      </button>

      <section className="not-found-card">
        <div className="not-found-copy">
          <span className="not-found-code">404</span>
          <span className="eyebrow purple">{t('WRONG TURN')}</span>
          <h1>{t('Leo lost the trail.')}</h1>
          <p>{t('This page is not on the map. Your university path is still safe — let’s get you back to it.')}</p>
          <div className="not-found-actions">
            <a className="button primary" href="/">{t('Back to Path2Uni')} <span>→</span></a>
            <button className="not-found-back" type="button" onClick={() => window.history.back()}>{t('Go back')}</button>
          </div>
        </div>

        <div className="not-found-leo" aria-label={t('Leo is looking for the missing page')}>
          <span className="not-found-orbit orbit-one"/><span className="not-found-orbit orbit-two"/>
          <span className="not-found-star star-one">✦</span><span className="not-found-star star-two">✦</span>
          <img src={mascot} alt={t('Leo, the Path2Uni mascot')}/>
          <p>{t('Hmm… this path ends here.')}</p>
        </div>
      </section>
    </main>
    <SiteFooter onNavigate={goHome}/>
  </div>
}
