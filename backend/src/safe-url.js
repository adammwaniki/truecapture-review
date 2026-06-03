// Returns the URL string only if it is a safe https: URL, otherwise null.
// Used to neutralize javascript:/data: scheme injection when rendering
// third-party (e.g. DeDi `entity.url`) values into href attributes. (Remediation M3.)
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
