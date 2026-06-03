import { defineConfig } from '@playwright/test';

// e2e "100%" = flow coverage: every journey in e2e/journeys.js has a spec.
// Real browser journeys run in CI after `npx playwright install`. A `webServer`
// block (backend binary + static verify/sign site) is wired as the sign/verify
// journeys are implemented (C2/C4/H2).
export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
});
