import { describe, it, expect } from 'vitest';
import { createMemoryStore } from './memory.js';

describe('createMemoryStore', () => {
  it('returns null for a missing key and the record after put', () => {
    const s = createMemoryStore();
    expect(s.get('missing')).toBeNull();
    expect(s.has('missing')).toBe(false);
    expect(s.size()).toBe(0);

    s.put('h1', { manifest: 1 });
    expect(s.get('h1')).toEqual({ manifest: 1 });
    expect(s.has('h1')).toBe(true);
    expect(s.size()).toBe(1);
  });

  it('prune removes records older than maxAgeMs (H-3)', () => {
    let t = 0;
    const s = createMemoryStore({ now: () => t });
    s.put('old', { a: 1 }); // createdAt 0
    t = 5000;
    s.put('new', { b: 2 }); // createdAt 5000
    t = 10000;
    expect(s.prune(6000)).toBe(1); // cutoff 4000 → 'old' (0<4000) pruned, 'new' (5000) kept
    expect(s.has('old')).toBe(false);
    expect(s.has('new')).toBe(true);
    expect(s.size()).toBe(1);
  });
});
