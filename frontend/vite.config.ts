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
      // Illustrations de « Comprendre » précachées : les fiches sont lisibles hors ligne
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'assets/comprendre/*.webp'],
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
        // Polices auto-hébergées incluses dans le précache
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
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
    rollupOptions: {
      output: {
        // Bibliothèques lourdes et stables dans leurs propres morceaux : une
        // mise à jour de l'application ne force pas à retélécharger React ou
        // Recharts, déjà en cache du navigateur et du service worker. Forme
        // fonction : Vite 8 (rolldown) n'accepte plus l'objet. react-markdown
        // n'a pas besoin d'entrée : seule la page « Comprendre », chargée à la
        // demande, l'importe, il part donc dans son morceau.
        manualChunks(id: string) {
          if (!id.includes('/node_modules/')) return undefined;
          if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react';
          if (/\/node_modules\/(recharts|d3-[a-z-]+|victory-vendor|internmap)\//.test(id)) return 'recharts';
          return undefined;
        },
      },
    },
  },
});
