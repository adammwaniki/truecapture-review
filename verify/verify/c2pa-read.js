// In-browser C2PA read (H2). Lazy-loads the vendored @contentauth/c2pa-web
// bundle + WASM the first time a file is verified, so the 8.3 MB WASM is NOT on
// the initial page load. The read happens entirely in the browser — the file is
// never uploaded for this check. The signer's public key is NOT exposed by
// c2pa-web (only issuer/serial/alg/time), so this proves content integrity and
// that the file is signed, but the forgery-proof key-vs-DeDi check stays on the
// server (see verify.js "Confirm signer with DeDi").
let _c2paPromise = null;

function getC2pa() {
  if (!_c2paPromise) {
    _c2paPromise = import('../vendor/c2pa-web.js').then(({ createC2pa }) =>
      createC2pa({ wasmSrc: new URL('../vendor/c2pa_bg.wasm', import.meta.url).href }),
    );
  }
  return _c2paPromise;
}

// Reads a File/Blob locally. Returns { hasManifest, state, issuer } — never throws
// for an unsigned file; callers handle a thrown error as "couldn't read in browser".
export async function readInBrowser(file) {
  const c2pa = await getC2pa();
  const reader = await c2pa.reader.fromBlob(file.type || 'image/jpeg', file);
  const store = await reader.manifestStore();
  if (!store || !store.active_manifest) return { hasManifest: false };
  const m = store.manifests[store.active_manifest] || {};
  return {
    hasManifest: true,
    state: store.validation_state, // 'Valid' | 'Invalid' | 'Trusted'
    issuer: (m.signature_info || {}).issuer || null,
  };
}
