/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Overridable so the same build works at a domain root or under a sub-path (e.g. GitHub Pages).
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      // Custom worker (src/sw.ts): Workbox precaching for offline use, plus push reminders.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts', // emitted as sw.js, the same name as the v1 worker so installs upgrade
      manifest: {
        name: 'DoneIt Planner',
        short_name: 'DoneIt',
        description: 'Tactile daily and weekly planner that works offline and syncs across devices.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#F7F7F4',
        theme_color: '#2F44C8',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // Precache the entire app shell (code, styles, fonts, images) so it boots with no network.
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,woff2,webmanifest}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
});
