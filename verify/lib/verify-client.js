// Client calls to the new backend contract (client reconciliation). `fetchImpl`
// is injected so these are unit-testable; the page glue passes the real fetch.

export async function verifyByUpload(fetchImpl, baseUrl, file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetchImpl(`${baseUrl}/verify`, { method: 'POST', body: fd });
  return res.json();
}

export async function verifyByHash(fetchImpl, baseUrl, hash) {
  const res = await fetchImpl(`${baseUrl}/verify/${encodeURIComponent(hash)}`);
  if (!res.ok) return { verdict: 'unknown' };
  return res.json();
}

// Public sign: send the CAPTCHA token (no secret key) and the COARSE device
// class only (M4 — never the raw user-agent). Returns the verify hash + blob.
export async function signFile(fetchImpl, baseUrl, file, { captchaToken, deviceClass } = {}) {
  const fd = new FormData();
  fd.append('file', file);
  const headers = {};
  if (captchaToken) headers['x-captcha-token'] = captchaToken;
  if (deviceClass) headers['x-device-class'] = deviceClass;
  const res = await fetchImpl(`${baseUrl}/sign`, { method: 'POST', headers, body: fd });
  if (!res.ok) throw new Error(`sign failed: ${res.status}`);
  return { verifyHash: res.headers.get('x-verify-hash'), blob: await res.blob() };
}
