import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './game.css'
import './explorer.css'
import './osint.css'
import './premium.css'
import './social.css'
import './worldmap.css'
import './auth.css'
import './advisor.css'
import './streak.css'
import './footer.css'
import './not-found.css'
import { LanguageProvider } from './i18n.jsx'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode><LanguageProvider><App /></LanguageProvider></StrictMode>,
)
