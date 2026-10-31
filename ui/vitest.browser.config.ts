import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Component tests that need a real DOM run in Chromium (ADR-0013). jsdom is not used.
// The `playwright` devDependency is pinned to 1.63.0 (package.json): the provider takes `playwright` as a
// peer, and an unpinned peer resolves to a newer release that wants a Chromium build the image lacks.
export default defineConfig({
  test: {
    include: ['src/**/*.browser.test.{ts,tsx}'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
