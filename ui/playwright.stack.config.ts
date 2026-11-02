import { defineConfig } from '@playwright/test';
import { stackWorkspace } from './e2e/stack-workspace';

// The @stack suite runs against the real service, which serves the UI from the -Pui jar (ADR-0017):
//   ./mvnw -B -Pui -pl service -am clean package -DskipTests
// The service answers on a fixed port over a temporary copy of corpus/ in which order-id-copy is unlinked.
const port = 18080;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.stack.spec.ts',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
  },
  webServer: {
    command: `rm -rf ${stackWorkspace} && cp -r ../corpus ${stackWorkspace} && node e2e/stack-unlink.mjs ${stackWorkspace} && exec java -Dquarkus.http.host=127.0.0.1 -Dquarkus.http.port=${port} -Dflottila.mapping.workspace=${stackWorkspace} -jar ../service/target/quarkus-app/quarkus-run.jar`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
