// Playwright 1.63.0 expects Chromium build 1248. The Claude Code cloud image carries build 1243, and
// deploy/claude-cloud/setup.sh points PW_CHROMIUM_EXECUTABLE at it. Everywhere else (CI, a laptop)
// the variable is unset and Playwright uses its own browser. Playwright is never downgraded and
// `playwright install` is never run on the cloud image (ADR-0013).
export const chromiumExecutable: string | undefined = process.env.PW_CHROMIUM_EXECUTABLE || undefined;
