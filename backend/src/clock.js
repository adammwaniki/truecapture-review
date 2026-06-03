// Clock seam — injected wherever the code needs "now", so tests are
// deterministic and `Date.now()`/`new Date()` never appear in business logic.
export function systemClock() {
  return { now: () => new Date() };
}

export function fixedClock(date) {
  return { now: () => date };
}
