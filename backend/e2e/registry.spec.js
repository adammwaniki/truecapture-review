import { test, expect } from '@playwright/test';
import { JOURNEYS } from './journeys.js';

// Meta-test (no browser): the journey registry is the source of truth for e2e
// flow coverage. Per-journey browser specs are added as each finding lands.
test('journey registry is populated and well-formed', async () => {
  expect(JOURNEYS.length).toBeGreaterThan(0);
  const ids = new Set();
  for (const j of JOURNEYS) {
    expect(j.id).toMatch(/^[a-z-]+$/);
    expect(typeof j.desc).toBe('string');
    expect(ids.has(j.id)).toBe(false);
    ids.add(j.id);
  }
  // Every verdict outcome the verifier can return must have a journey.
  const verdicts = JOURNEYS.map((j) => j.verdict).filter(Boolean);
  for (const required of ['authentic', 'tampered', 'unsigned', 'forged-key', 'revoked-key']) {
    expect(verdicts).toContain(required);
  }
});
