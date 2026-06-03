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
});
