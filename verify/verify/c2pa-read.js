// Fast in-browser C2PA read (no upload) for an instant signature/content result
// while the server does the authoritative combined check (incl. the DeDi key
// binding, which the browser can't do). Lazy-loads the vendored @contentauth/c2pa-web
// bundle + WASM on first use, so the 8.3 MB WASM is not on the initial page load.
//
// Returns { signature: 'none' | 'valid' | 'modified' | 'invalid' } — the same
// signature axis the backend reports. (The signer/DeDi axis is server-only.)
let _c2paPromise = null;

function getC2pa() {
  if (!_c2paPromise) {
    _c2paPromise = import('../vendor/c2pa-web.js').then(({ createC2pa }) =>
      createC2pa({ wasmSrc: new URL('../vendor/c2pa_bg.wasm', import.meta.url).href }),
    );
  }
  return _c2paPromise;
}

export async function readInBrowser(file) {
  const c2pa = await getC2pa();
  const reader = await c2pa.reader.fromBlob(file.type || 'image/jpeg', file);
  if (!reader) return { signature: 'none' }; // fromBlob returns null when there's no manifest
  const store = await reader.manifestStore();
  if (!store || !store.active_manifest) return { signature: 'none' };
  if (store.validation_state === 'Valid') return { signature: 'valid' };
  // Distinguish content tampering (a hash mismatch) from other invalidity — same
  // rule as the backend's isContentTampered.
  const codes = Array.isArray(store.validation_status) ? store.validation_status : [];
  const contentModified = codes.some((s) => s && typeof s.code === 'string' && /mismatch/i.test(s.code) && /hash/i.test(s.code));
  return { signature: contentModified ? 'modified' : 'invalid' };
}
