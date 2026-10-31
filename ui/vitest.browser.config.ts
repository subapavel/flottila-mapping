import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { chromiumExecutable } from './playwright.chromium';

// Component tests that need a real DOM run in Chromium (ADR-0013). jsdom is not used.
export default defineConfig({
  test: {
    include: ['src/**/*.browser.test.{ts,tsx}'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { executablePath: chromiumExecutable } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
