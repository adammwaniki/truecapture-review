import { describe, it, expect } from 'vitest';
import { scheduleRetention } from './retention.js';

describe('scheduleRetention', () => {
  it('is disabled when retentionMs is missing or non-positive (H-3)', () => {
    const noop = { prune() {} };
    expect(scheduleRetention({ store: noop, retentionMs: null })).toBeNull();
    expect(scheduleRetention({ store: noop, retentionMs: -5 })).toBeNull();
  });

  it('prunes at startup, on each tick, and unrefs the timer', () => {
    const calls = [];
    const store = { prune: (ms) => calls.push(ms) };
    let cb;
    let unrefed = false;
    const setIntervalFn = (fn) => { cb = fn; return { unref: () => { unrefed = true; } }; };
    const timer = scheduleRetention({ store, retentionMs: 1000, intervalMs: 50, setIntervalFn });
    expect(calls).toEqual([1000]); // startup prune
    cb();
    expect(calls).toEqual([1000, 1000]); // interval tick
    expect(unrefed).toBe(true);
    expect(timer).toBeTruthy();
  });

  it('tolerates a timer without unref', () => {
    expect(() => scheduleRetention({ store: { prune() {} }, retentionMs: 1000, setIntervalFn: () => ({}) })).not.toThrow();
  });
});
