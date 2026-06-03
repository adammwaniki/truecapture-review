// Canonical user-journey registry — the source of truth for e2e flow coverage.
// Every entry must have a corresponding spec; CI fails a journey without one
// (wired as the journeys are implemented). Every verdict outcome is required.
export const JOURNEYS = [
  { id: 'sign-photo', desc: 'capture/upload a photo → sign → download signed file', verdict: null },
  { id: 'verify-authentic', desc: 'verify a genuine signed file', verdict: 'authentic' },
  { id: 'verify-tampered', desc: 'verify a modified file', verdict: 'tampered' },
  { id: 'verify-unsigned', desc: 'verify a file with no manifest', verdict: 'unsigned' },
  { id: 'verify-forged-key', desc: 'attacker key + copied dedi_record_id', verdict: 'forged-key' },
  { id: 'verify-revoked-key', desc: 'signer key revoked in DeDi', verdict: 'revoked-key' },
  { id: 'verify-link', desc: 'open a share link → content-bound verdict', verdict: null },
];
