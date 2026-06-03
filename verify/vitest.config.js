import { defineConfig } from 'vitest/config';

// 100% coverage for the frontend's pure logic (verify/lib). The thin DOM glue
// in the page scripts is the frontend analogue of the backend bootstrap — it is
// exercised by Playwright e2e, not unit coverage, so it is not under `include`.
export default defineConfig({
  test: {
    include: ['lib/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.js'],
      exclude: ['lib/**/*.test.js'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
      reporter: ['text'],
    },
  },
});
