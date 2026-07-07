// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Le service worker se met à jour tout seul au prochain chargement
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ThyroTrack — Suivi thyroïdien',
        short_name: 'ThyroTrack',
        description:
          'Suivez votre santé thyroïdienne au quotidien : symptômes, médicaments, analyses de sang.',
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        background_color: '#f6f4f0',
        theme_color: '#f6f4f0',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Précache du "shell" applicatif (HTML, JS, CSS, icônes).
        // Les appels /api ne sont JAMAIS servis depuis le cache :
        // les données de santé doivent toujours être fraîches.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Les polices Google changent rarement : cache d'abord
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
