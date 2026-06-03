// Coarse device class derived from the user agent, used instead of embedding
// the full UA string in signed manifests / requests (Remediation M4 — minimize
// the fingerprinting surface while keeping useful provenance).
export function deviceClass(userAgent) {
  const ua = typeof userAgent === 'string' ? userAgent : '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows|Macintosh|Mac OS|Linux|CrOS/i.test(ua)) return 'Desktop';
  return 'unknown';
}
