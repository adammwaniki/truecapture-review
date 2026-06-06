// Canonical user-journey registry — the source of truth for e2e flow coverage.
// Each journey names the spec that covers it (registry.spec.js fails CI if that
// file is missing), and the `verdict` set must cover every verdict the verifier
// can emit (kept in sync with src/verify/verdict.js).
export const JOURNEYS = [
  { id: 'sign-photo', desc: 'sign a photo through the backend → download signed file', verdict: null, spec: 'fullstack.spec.js' },
  { id: 'verify-authentic', desc: 'sign → verify page upload → combined check → authentic', verdict: 'authentic', spec: 'fullstack.spec.js' },
  { id: 'verify-tampered', desc: 'verify a file with modified content', verdict: 'tampered', spec: 'verify-route.test.js' },
  { id: 'verify-invalid', desc: 'verify a file whose signature is invalid but content untampered', verdict: 'invalid', spec: 'verify.test.js' },
  { id: 'verify-unsigned', desc: 'verify a file with no C2PA manifest', verdict: 'unsigned', spec: 'verify-route.test.js' },
  { id: 'verify-forged', desc: 'attacker key + copied DeDi record id → forged', verdict: 'forged', spec: 'verify-route.test.js' },
  { id: 'verify-untrusted', desc: 'signer key revoked or unknown in DeDi → untrusted', verdict: 'untrusted', spec: 'verify-route.test.js' },
  { id: 'verify-link', desc: 'open a share link → content-bound server verdict', verdict: null, spec: 'verify-link.test.js' },
];
