import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // One origin for the browser, no CORS (ADR-0014, ADR-0017): /api goes to the service.
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
});
