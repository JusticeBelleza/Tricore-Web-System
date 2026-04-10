import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './lib/AuthContext.jsx'

// 🚀 THIS IS THE MISSING PIECE FOR THE PWA:
import { registerSW } from 'virtual:pwa-register'

// This wakes up the Service Worker so the browser knows it's an installable app
registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)