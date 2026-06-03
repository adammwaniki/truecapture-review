import { createHttpDedi } from './http.js';

// Factory for the `dedi` seam. Default: the DeDi HTTP client.
export function createDedi(opts) {
  return createHttpDedi(opts);
}
