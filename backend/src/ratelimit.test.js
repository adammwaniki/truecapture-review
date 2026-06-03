import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './ratelimit.js';

describe('createRateLimiter', () => {
  it('allows up to the limit, blocks beyond it, and resets after the window', () => {
    let t = 0;
    const rl = createRateLimiter({ max: 2, windowMs: 1000, now: () => t });
    expect(rl.check('a')).toBe(true); // 1st (new window)
    expect(rl.check('a')).toBe(true); // 2nd (under max)
    expect(rl.check('a')).toBe(false); // 3rd (over max)
    t = 1000; // window elapsed
    expect(rl.check('a')).toBe(true); // reset
  });

  it('uses the system clock by default', () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1000 });
    expect(rl.check('b')).toBe(true);
  });

  it('bounds memory: reclaims expired windows and evicts the oldest at the cap (H-2)', () => {
    let t = 0;
    const rl = createRateLimiter({ max: 5, windowMs: 100, now: () => t, maxKeys: 2 });
    rl.check('a');
    rl.check('b'); // at cap (2)
    expect(rl.size()).toBe(2);
    t = 200; // a + b windows have expired
    rl.check('c'); // at cap → reclaim() drops the two expired entries, then sets c
    expect(rl.size()).toBe(1);
    rl.check('d'); // under cap → just add
    rl.check('e'); // at cap, none expired (all t=200) → evict oldest (c), set e
    expect(rl.size()).toBe(2);
  });
});
