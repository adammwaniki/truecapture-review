import { defineConfig } from 'vitest/config';

// 100% coverage is enforced (lines/branches/functions/statements). While the
// backend testability refactor lands, coverage is SCOPED to `src/**` (the new
// injectable modules) and ratcheted up as code moves out of the legacy
// `server.js`. The process bootstrap is the only permitted exclusion.
export default defineConfig({
  test: {
    include: ['src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js', 'src/bootstrap.js'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
      reporter: ['text', 'lcov'],
    },
  },
});
