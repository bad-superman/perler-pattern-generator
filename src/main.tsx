import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initAnalytics } from './analytics'
import './index.css'
import App from './App.tsx'

if (import.meta.env.VITE_SITE_MODE === 'pro') {
  const match = window.location.pathname.match(/^\/access\/([^/]+)\/?$/)
  if (match) {
    try {
      sessionStorage.setItem('perler-pro-access-token', decodeURIComponent(match[1]))
    } catch {
      sessionStorage.removeItem('perler-pro-access-token')
    }
    window.history.replaceState({}, '', '/')
  }
}

initAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
