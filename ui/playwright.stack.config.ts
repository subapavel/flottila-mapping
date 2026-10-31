import { defineConfig } from '@playwright/test';
import { chromiumExecutable } from './playwright.chromium';

// The @stack suite runs against the real service, which serves the UI from the -Pui jar (ADR-0017):
//   ./mvnw -B -Pui -pl service -am clean package -DskipTests
// The service answers on a fixed port over corpus/ as its workspace.
const port = 18080;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.stack.spec.ts',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: { executablePath: chromiumExecutable },
  },
  webServer: {
    command: `java -Dquarkus.http.port=${port} -Dflottila.mapping.workspace=../corpus -jar ../service/target/quarkus-app/quarkus-run.jar`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
