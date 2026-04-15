import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './lib/AuthContext.jsx'
import * as Sentry from "@sentry/react" // 🚀 1. IMPORT SENTRY

// 🚀 2. INITIALIZE SENTRY ERROR TRACKING
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || "", // You will get this from sentry.io later
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  // Performance Monitoring
  tracesSampleRate: 1.0, 
  // Session Replay (Records a video of the user's screen when it crashes!)
  replaysSessionSampleRate: 0.1, 
  replaysOnErrorSampleRate: 1.0, 
});

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