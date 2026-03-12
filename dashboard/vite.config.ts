import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: ['gradually-embedded-lives-manga.trycloudflare.com'],
    proxy: {
      '/api': 'http://localhost:3141',
      '/ws': {
        target: 'ws://localhost:3142',
        ws: true,
        rewriteWsOrigin: true,
      },
    },
  },
});
