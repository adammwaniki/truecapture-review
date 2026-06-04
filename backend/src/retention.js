// Periodically prunes stored records older than retentionMs (H-3 — the store's
// prune() existed but was never invoked, so the DB grew unbounded). Returns the
// timer handle, or null when retention is disabled. setIntervalFn is injected so
// the scheduling is testable without real timers.
export function scheduleRetention({ store, retentionMs, intervalMs = 60 * 60 * 1000, setIntervalFn = setInterval }) {
  if (!retentionMs || retentionMs <= 0) return null; // disabled (opt-in)
  const tick = () => store.prune(retentionMs);
  tick(); // prune once at startup
  const timer = setIntervalFn(tick, intervalMs);
  timer.unref?.(); // don't keep the process alive just for retention
  return timer;
}
