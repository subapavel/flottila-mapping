// PROTOTYPE (#10, throwaway): Vite config for the mapping-editor prototype entry only.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 4000,
    rolldownOptions: {
      input: { 'prototype-mapping-editor': 'prototype-mapping-editor.html' }
    }
  },
  server: { port: 5173, strictPort: false },
  preview: { port: 4173 }
});
