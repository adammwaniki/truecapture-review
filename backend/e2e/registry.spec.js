import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JOURNEYS } from './journeys.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// The verdicts the verifier can emit — keep in sync with src/verify/verdict.js.
const VERDICTS = ['unsigned', 'tampered', 'invalid', 'untrusted', 'forged', 'authentic'];

// Meta-test (no browser): the journey registry is the source of truth for e2e
// flow coverage. This actually enforces it — a journey whose named spec is missing,
// or a verdict with no journey, fails CI.
test('journey registry is well-formed, wired to real specs, and covers every verdict', async () => {
  expect(JOURNEYS.length).toBeGreaterThan(0);
  const ids = new Set();
  for (const j of JOURNEYS) {
    expect(j.id).toMatch(/^[a-z-]+$/);
    expect(typeof j.desc).toBe('string');
    expect(ids.has(j.id)).toBe(false);
    ids.add(j.id);
    // The named spec must exist (in e2e/, src/, or src/verify/).
    const found =
      existsSync(join(HERE, j.spec)) ||
      existsSync(join(HERE, '..', 'src', j.spec)) ||
      existsSync(join(HERE, '..', 'src', 'verify', j.spec));
    expect(found, `journey "${j.id}" names a missing spec: ${j.spec}`).toBe(true);
  }
  // Every verdict the system can return must have at least one journey.
  const covered = new Set(JOURNEYS.map((j) => j.verdict).filter(Boolean));
  for (const v of VERDICTS) expect(covered.has(v), `no journey covers verdict "${v}"`).toBe(true);
});
