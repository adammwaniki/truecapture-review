// Fixed-window rate limiter (anti-DoS, H3). check(key) returns false once `key`
// exceeds `max` requests within `windowMs`. The clock is injected so the window
// behaviour is deterministic in tests.
//
// Memory is bounded (review finding H-2): entries are reclaimed once their window
// expires, and a hard `maxKeys` cap evicts the oldest window if a flood of
// distinct keys would otherwise grow the Map without bound. NB: state is
// per-process — a multi-instance deployment should back this with a shared store
// (e.g. Redis) so the limit is global rather than per-instance.
export function createRateLimiter({ max, windowMs, now = () => Date.now(), maxKeys = 100_000 }) {
  const hits = new Map(); // key -> { count, windowStart }

  function reclaim(t) {
    for (const [k, e] of hits) {
      if (t - e.windowStart >= windowMs) hits.delete(k);
    }
  }

  return {
    check(key) {
      const t = now();
      const entry = hits.get(key);
      if (!entry || t - entry.windowStart >= windowMs) {
        if (hits.size >= maxKeys) {
          reclaim(t); // drop expired windows first
          if (hits.size >= maxKeys) hits.delete(hits.keys().next().value); // then the oldest
        }
        hits.set(key, { count: 1, windowStart: t });
        return true;
      }
      if (entry.count >= max) return false;
      entry.count += 1;
      return true;
    },
    size: () => hits.size,
  };
}
