import { createContentAuthC2pa } from './contentauth.js';

// Factory for the `c2pa` seam. The engine is @contentauth/c2pa-node (a native
// addon). It is the single implementation — there is no subprocess fallback, so
// if the addon fails to load on a platform, signing/verify are unavailable. A
// `c2patool` subprocess engine implementing the same seam could be added behind
// this factory if a fallback is ever needed.
export function createC2pa(keys) {
  return createContentAuthC2pa(keys);
}
