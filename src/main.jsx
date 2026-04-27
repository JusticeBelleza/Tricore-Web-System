import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './lib/AuthContext.jsx'
import * as Sentry from "@sentry/react" 

// 🚀 1. IMPORT REACT QUERY
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// 🚀 2. INITIALIZE SENTRY ERROR TRACKING
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || "", 
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  // Performance Monitoring
  tracesSampleRate: 1.0, 
  // Session Replay 
  replaysSessionSampleRate: 0.1, 
  replaysOnErrorSampleRate: 1.0, 
});

// PWA SERVICE WORKER
import { registerSW } from 'virtual:pwa-register'
registerSW({ immediate: true })

// 🚀 3. CREATE THE QUERY CLIENT (Controls caching rules)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Prevents unnecessary refetches when switching browser tabs
      retry: 1, // Only retry failed requests once before showing an error
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* 🚀 4. WRAP APP IN QUERY PROVIDER */}
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)