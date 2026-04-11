import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: true,
        type: 'module'
      },
      // 🚀 THIS FIXES THE REACT ROUTER "/driver" ERROR
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: '/index.html'
      },
      includeAssets: ['tricore-logo.png', 'tricore-logo-192.png', 'tricore-logo.png'],
      manifest: {
        name: 'Tricore',
        short_name: 'Tricore',
        description: 'Tricore Medical Supply',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/images/tricore-logo-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/images/tricore-logo.png',
            sizes: '500x500',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})