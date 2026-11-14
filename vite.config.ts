import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

const r = (p: string) => resolve(import.meta.dirname, p);

export default defineConfig({
  plugins: [preact()],
  server: {
    host: true,
    port: 5173,
    // Public preview tunnels (localhost.run / lhr.life) must not be blocked.
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    assetsInlineLimit: 1024,
    rollupOptions: {
      input: {
        root: r('index.html'),
        enHome: r('en/index.html'),
        enGridshot: r('en/gridshot/index.html'),
        enFlick: r('en/flick/index.html'),
        enTracking: r('en/tracking/index.html'),
        enPrecision: r('en/precision/index.html'),
        enReaction: r('en/reaction/index.html'),
        enCps: r('en/cps/index.html'),
      },
    },
  },
});
