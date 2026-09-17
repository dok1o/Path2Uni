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
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>,
)
