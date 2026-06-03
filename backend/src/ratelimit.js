// Fixed-window rate limiter (anti-DoS, H3). check(key) returns false once `key`
// exceeds `max` requests within `windowMs`. The clock is injected so the window
// behaviour is deterministic in tests.
export function createRateLimiter({ max, windowMs, now = () => Date.now() }) {
  const hits = new Map(); // key -> { count, windowStart }
  return {
    check(key) {
      const t = now();
      const entry = hits.get(key);
      if (!entry || t - entry.windowStart >= windowMs) {
        hits.set(key, { count: 1, windowStart: t });
        return true;
      }
      if (entry.count >= max) return false;
      entry.count += 1;
      return true;
    },
  };
}
