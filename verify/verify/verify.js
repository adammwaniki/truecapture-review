// Verify page glue. The tested logic lives in ../lib; this only wires it to the
// DOM. ONE combined check: dropping/selecting a file (or opening a share link)
// sends it to the backend, which runs BOTH the C2PA signature check and the DeDi
// signer check in one pass and returns two axes. We render a plain-language
// headline plus the two explicit lines (Signature / Signer).
import { verifyByUpload, verifyByHash } from '../lib/verify-client.js';
import { toCombinedModel } from '../lib/render-model.js';
import { readInBrowser } from './c2pa-read.js';

// Backend base URL. When the page is served from localhost (local dev) we target
// the local backend on :3000 by default, so verifying works without editing this
// file. Override with window.TRUECAPTURE_BACKEND. In production it's the API domain.
const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const BACKEND_URL = window.TRUECAPTURE_BACKEND
  || (isLocalhost ? `${location.protocol}//${location.hostname}:3000` : 'https://api.truecapture.global');
const doFetch = (url, opts) => fetch(url, opts);

const ICONS = {
  check: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
  cross: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  warn: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  info: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
};

const $ = (id) => document.getElementById(id);

function showSection(id) {
  ['drop-section', 'verifying-section', 'result-section'].forEach((s) => {
    const el = $(s);
    if (el) el.classList.toggle('hidden', s !== id);
  });
  if (id === 'drop-section') $('drop-section').style.display = '';
}

function updateStatus(msg) {
  const el = $('verify-status');
  if (el) el.textContent = msg;
}

function escapeText(value) {
  const div = document.createElement('div');
  div.textContent = String(value);
  return div.innerHTML;
}

// Render the combined result: headline banner + the two explicit lines + entity.
function renderResult(result) {
  const m = toCombinedModel(result);
  showSection('result-section');
  $('verdict-banner').className = 'verdict ' + m.verdict;
  $('verdict-icon').innerHTML = ICONS[m.icon] || ICONS.info;
  $('verdict-title').textContent = m.headline;

  const details = $('verify-details');
  if (m.signatureLabel) {
    details.style.display = '';
    $('sig-status').textContent = m.signatureLabel;
    if (m.signerLabel) {
      $('signer-status').textContent = m.signerLabel;
      $('signer-row').style.display = '';
    } else {
      $('signer-row').style.display = 'none';
    }
  } else {
    details.style.display = 'none';
  }

  const dedi = $('dedi-section');
  if (m.entityName) {
    const link = m.entityUrl
      ? `<a class="dedi-url" href="${m.entityUrl}" target="_blank" rel="noopener">${escapeText(m.entityUrl)}</a>`
      : '';
    dedi.style.display = '';
    dedi.innerHTML = `<h3>Signed by <span style="font-weight:500;color:var(--muted)">via DeDi.global</span></h3>` +
      `<div class="dedi-card"><div class="dedi-name">${escapeText(m.entityName)}</div>${link}</div>`;
  } else {
    dedi.style.display = 'none';
  }
}

// Combined check. A fast IN-BROWSER read shows the signature/content result
// immediately (no upload); in parallel the file is uploaded so the server can
// run the authoritative check including the DeDi key binding (which the browser
// can't do). The server result is final and wins any race with the preview.
async function verifyFile(file) {
  showSection('verifying-section');
  updateStatus('Checking the signature and DeDi registry…');
  let serverDone = false;

  // Instant, no-upload preview of the signature axis (best-effort).
  readInBrowser(file)
    .then((read) => { if (!serverDone) renderResult({ signature: read.signature, signer: 'pending' }); })
    .catch(() => {}); // reader unavailable → just wait for the server

  try {
    const result = await verifyByUpload(doFetch, BACKEND_URL, file);
    serverDone = true;
    renderResult(result);
  } catch (err) {
    serverDone = true;
    console.error(`[verify] could not reach ${BACKEND_URL}/verify:`, err);
    renderResult({ verdict: 'unknown' });
  }
}

// Exposed globally because the file <input> uses inline onchange/onclick.
window.handleFile = function handleFile(file) {
  if (!file || window._handling) return;
  window._handling = true;
  setTimeout(() => { window._handling = false; }, 3000);
  setTimeout(() => verifyFile(file), 0);
};

window.startPolling = function startPolling(input) {
  const deadline = Date.now() + 30000;
  const id = setInterval(() => {
    if (input.files && input.files.length > 0) {
      clearInterval(id);
      window.handleFile(input.files[0]);
    } else if (Date.now() > deadline) {
      clearInterval(id);
    }
  }, 100);
};

function init() {
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
    document.documentElement.classList.add('is-mobile');
  }

  const dz = $('drop-zone');
  if (dz) {
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f) window.handleFile(f);
    });
  }

  const another = $('btn-verify-another');
  if (another) {
    another.addEventListener('click', () => {
      window._handling = false;
      showSection('drop-section');
      const fi = $('file-input');
      if (fi) fi.value = '';
    });
  }

  // Share-link flow: truecapture.global/verify/<hash> or ?hash=<hash> — looked up
  // by hash, no user upload. Contract: the backend emits a 24-char lowercase-hex
  // verify hash (sha256(signed).slice(0,24) — see backend src/app.js). This accepts
  // 16–32 lowercase hex; keep it in sync if that format ever changes.
  const HASH_RE = /^[0-9a-f]{16,32}$/;
  const pathTail = location.pathname.split('/').pop() || '';
  const queryHash = new URLSearchParams(location.search).get('hash') || '';
  const urlHash = (HASH_RE.test(pathTail) ? pathTail : queryHash).trim();
  if (HASH_RE.test(urlHash)) {
    showSection('verifying-section');
    updateStatus('Looking up the signed file…');
    verifyByHash(doFetch, BACKEND_URL, urlHash).then(renderResult).catch(() => renderResult({ verdict: 'unknown' }));
  }
}

init();
