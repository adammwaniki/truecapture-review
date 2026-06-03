import { createContentAuthC2pa } from './contentauth.js';

// Factory for the `c2pa` seam. Default engine: @contentauth/c2pa-node.
// A `c2patool` subprocess engine implementing the same contract is the
// documented fallback (deferred; see the C2PA library decision in the plan).
export function createC2pa(keys) {
  return createContentAuthC2pa(keys);
}
