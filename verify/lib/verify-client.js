// Client calls to the new backend contract (client reconciliation). `fetchImpl`
// is injected so these are unit-testable; the page glue passes the real fetch.
//
// Every call carries a TIMEOUT (AbortSignal.timeout): if the backend is
// unreachable — wrong host, blocked by CORS at the network layer, or simply down
// — the request rejects instead of hanging forever, so the UI can show a clear
// "couldn't verify" instead of being stuck on the in-browser preview.

const VERIFY_TIMEOUT_MS = 30000;
const SIGN_TIMEOUT_MS = 60000;

export async function verifyByUpload(fetchImpl, baseUrl, file, { timeoutMs = VERIFY_TIMEOUT_MS } = {}) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetchImpl(`${baseUrl}/verify`, { method: 'POST', body: fd, signal: AbortSignal.timeout(timeoutMs) });
  return res.json();
}

export async function verifyByHash(fetchImpl, baseUrl, hash, { timeoutMs = VERIFY_TIMEOUT_MS } = {}) {
  const res = await fetchImpl(`${baseUrl}/verify/${encodeURIComponent(hash)}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) return { verdict: 'unknown' };
  return res.json();
}

// Public sign: send the CAPTCHA token (no secret key) and the COARSE device
// class only (M4 — never the raw user-agent). Returns the verify hash + blob.
export async function signFile(fetchImpl, baseUrl, file, { captchaToken, deviceClass, timeoutMs = SIGN_TIMEOUT_MS } = {}) {
  const fd = new FormData();
  fd.append('file', file);
  const headers = {};
  if (captchaToken) headers['x-captcha-token'] = captchaToken;
  if (deviceClass) headers['x-device-class'] = deviceClass;
  const res = await fetchImpl(`${baseUrl}/sign`, { method: 'POST', headers, body: fd, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`sign failed: ${res.status}`);
  return { verifyHash: res.headers.get('x-verify-hash'), blob: await res.blob() };
}
