// TrueCapture verify/sign — backend base URL.
//
// This is a plain script served alongside the static site (no build step), so it
// is the single place to point the pages at your backend. Loaded before the page
// scripts; they read `window.TRUECAPTURE_BACKEND`.
//
//   • Leave it blank to AUTO-DETECT: http://localhost:3000 when the page is served
//     from localhost (local dev), otherwise https://api.truecapture.global.
//   • Set it to your backend for a self-hosted deploy, e.g.
//       window.TRUECAPTURE_BACKEND = 'https://api.yourdomain.com';
//
// At deploy you can generate this file from an env var instead of editing it:
//   echo "window.TRUECAPTURE_BACKEND='${VERIFY_BACKEND_URL}';" > verify/config.js
//
// The `|| ''` keeps any value already set (e.g. by a host that injects one) and
// otherwise falls back to auto-detect.
window.TRUECAPTURE_BACKEND = window.TRUECAPTURE_BACKEND || '';
