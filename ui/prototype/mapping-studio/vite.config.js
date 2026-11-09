import { defineConfig } from 'vite';

export default defineConfig({
  cacheDir: '.vite-cache',
  build: { modulePreload: false, assetsInlineLimit: 1000000 },
});
