import { describe, it, expect } from 'vitest';
import { systemClock, fixedClock } from './clock.js';

describe('clock', () => {
  it('systemClock returns a Date', () => {
    expect(systemClock().now()).toBeInstanceOf(Date);
  });

  it('fixedClock returns the injected instant', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(fixedClock(d).now()).toBe(d);
  });
});
