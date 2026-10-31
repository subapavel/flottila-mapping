import { defineConfig } from '@playwright/test';
import { chromiumExecutable } from './playwright.chromium';

// The default e2e suite runs against `vite preview` with the fake ApiClient (ADR-0013).
export default defineConfig({
  testDir: 'e2e',
  testIgnore: '**/*.stack.spec.ts',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: { executablePath: chromiumExecutable },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
