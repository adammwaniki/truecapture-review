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
});
