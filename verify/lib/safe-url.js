// Returns the URL only if it is a safe https: URL, otherwise null. Neutralizes
// javascript:/data: scheme injection when rendering third-party DeDi
// `entity.url` values into href attributes (Remediation M3). Mirrors the
// backend src/safe-url.js so both sides agree.
export function httpsUrlOrNull(value) {
  if (typeof value !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  return parsed.protocol === 'https:' ? parsed.href : null;
}
