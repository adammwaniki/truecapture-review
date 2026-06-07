// Resolve the backend base URL for the static verify/sign pages from the page's
// own location. An explicit override (window.TRUECAPTURE_BACKEND, set via
// config.js) always wins. Otherwise:
//   - localhost / 127.0.0.1 / ::1     → http://<host>:3000   (local dev)
//   - a private LAN IP (RFC1918) or a
//     *.local host                    → http://<host>:3000   (self-host / testing
//                                        from another device, e.g. a phone, on the
//                                        same machine that serves the page)
//   - anything else (a public domain) → https://api.truecapture.global (production)
//
// The LAN case is what makes verifying work from another device on your network
// (e.g. a phone at http://192.168.1.50:8080) WITHOUT editing config.js — the
// backend is assumed to run on the same host on port 3000. Remember to add that
// page origin to the backend's CORS_ORIGINS (it is a comma-separated list).
const DEFAULT_PROD = 'https://api.truecapture.global';
const BACKEND_PORT = 3000;

export function isLocalOrPrivateHost(hostname) {
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
  if (hostname.endsWith('.local')) return true;
  if (/^10\./.test(hostname)) return true; // 10.0.0.0/8
  if (/^192\.168\./.test(hostname)) return true; // 192.168.0.0/16
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true; // 172.16.0.0/12
  return false;
}

export function resolveBackendUrl(location, override) {
  if (override) return override;
  const { hostname, protocol } = location || {};
  if (isLocalOrPrivateHost(hostname)) return `${protocol}//${hostname}:${BACKEND_PORT}`;
  return DEFAULT_PROD;
}
