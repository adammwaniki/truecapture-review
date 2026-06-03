// Verify page glue. The logic lives in the tested ../lib modules; this module
// only wires them to the DOM.
//
// H2 — privacy-maximal public verify:
//   • Default (file drop / picker): the file is read IN YOUR BROWSER via the
//     vendored c2pa-web (./c2pa-read.js). Nothing is uploaded. We can prove the
//     content is intact and signed, but NOT that the signer is genuine (the key
//     is not exposed to the browser).
//   • "Confirm signer with DeDi": an explicit action that uploads the file to
//     the backend for the forgery-proof key-vs-DeDi check (C1) and the real
//     verdict (authentic / forged / untrusted).
//   • Share-link (/verify/<hash> or ?hash=): the file was signed server-side, so
//     the server already holds it — that path verifies on the server directly.
import { verifyByUpload, verifyByHash } from '../lib/verify-client.js';
import { toDisplayModel, toBrowserModel } from '../lib/render-model.js';
import { readInBrowser } from './c2pa-read.js';

const BACKEND_URL = window.TRUECAPTURE_BACKEND || 'https://api.truecapture.global';
const doFetch = (url, opts) => fetch(url, opts);

const ICONS = {
  check: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
  cross: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  warn: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  info: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
};

const DESCRIPTIONS = {
  authentic: 'The content is unchanged since signing, and the signing key is registered to the organisation below on DeDi.global.',
  tampered: 'This file carries a signature, but its content has changed since it was signed.',
  invalid: 'This file carries a signature that could not be validated — it may be corrupted or was not produced as claimed.',
  forged: "This file's signature does not match the key registered to the claimed organisation on DeDi.global.",
  untrusted: "The signer's key is not currently live on DeDi.global (unregistered or revoked).",
  unsigned: 'This file does not contain a TrueCapture / C2PA signature.',
  unknown: "We couldn't determine this file's status.",
  signed: 'Read in your browser — your file was not uploaded. Confirm the signer to check it against the DeDi.global registry.',
};

const $ = (id) => document.getElementById(id);

// The file awaiting an explicit server confirm (set by the in-browser read).
let pendingFile = null;

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

function paintBanner(verdict, icon, title) {
  showSection('result-section');
  $('verdict-banner').className = 'verdict ' + verdict;
  $('verdict-icon').innerHTML = ICONS[icon] || ICONS.info;
  $('verdict-title').textContent = title;
  $('verdict-desc').textContent = DESCRIPTIONS[verdict] || DESCRIPTIONS.unknown;
}

function setConfirmVisible(visible) {
  const btn = $('btn-confirm-signer');
  if (btn) btn.style.display = visible ? '' : 'none';
}

// Server verdict (forgery-proof): the authoritative result + DeDi entity.
function render(result) {
  const m = toDisplayModel(result);
  paintBanner(m.verdict, m.icon, m.title);
  pendingFile = null;
  setConfirmVisible(false);

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

// In-browser read (no upload): content integrity + signed/not. Offers the
// explicit DeDi confirm when there is something to confirm.
function renderBrowser(read, file) {
  const m = toBrowserModel(read);
  paintBanner(m.verdict, m.icon, m.title);
  $('dedi-section').style.display = 'none';
  if (m.canConfirm) {
    pendingFile = file;
    setConfirmVisible(true);
  } else {
    pendingFile = null;
    setConfirmVisible(false);
  }
}

function escapeText(value) {
  const div = document.createElement('div');
  div.textContent = String(value);
  return div.innerHTML;
}

async function readLocally(file) {
  showSection('verifying-section');
  updateStatus('Reading in your browser…');
  try {
    renderBrowser(await readInBrowser(file), file);
  } catch {
    // Could not load/run the in-browser reader. Do NOT silently upload — show an
    // error state that lets the user opt into the server check explicitly.
    renderBrowser({ error: true }, file);
  }
}

// Explicit, user-initiated upload for the forgery-proof signer check.
async function confirmSigner() {
  if (!pendingFile) return;
  const file = pendingFile;
  showSection('verifying-section');
  updateStatus('Confirming signer with DeDi…');
  try {
    render(await verifyByUpload(doFetch, BACKEND_URL, file));
  } catch {
    render({ verdict: 'unknown' });
  }
}

// Exposed globally because the file <input> uses inline onchange/onclick.
window.handleFile = function handleFile(file) {
  if (!file || window._handling) return;
  window._handling = true;
  setTimeout(() => { window._handling = false; }, 3000);
  const heic = /image\/(heic|heif)/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (heic) {
    paintBanner('unknown', 'info', 'Unsupported Format');
    $('verdict-desc').textContent = 'HEIC photos cannot be verified in the browser — export as JPEG and try again.';
    setConfirmVisible(false);
    return;
  }
  setTimeout(() => readLocally(file), 0);
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

  const confirm = $('btn-confirm-signer');
  if (confirm) confirm.addEventListener('click', confirmSigner);

  const another = $('btn-verify-another');
  if (another) {
    another.addEventListener('click', () => {
      window._handling = false;
      pendingFile = null;
      showSection('drop-section');
      const fi = $('file-input');
      if (fi) fi.value = '';
    });
  }

  // Share-link flow: truecapture.global/verify/<hash> or ?hash=<hash>. The file
  // was signed server-side, so the server verifies it directly (no user upload).
  const HASH_RE = /^[0-9a-f]{16,32}$/;
  const pathTail = location.pathname.split('/').pop() || '';
  const queryHash = new URLSearchParams(location.search).get('hash') || '';
  const urlHash = (HASH_RE.test(pathTail) ? pathTail : queryHash).trim();
  if (HASH_RE.test(urlHash)) {
    showSection('verifying-section');
    updateStatus('Looking up signed file…');
    verifyByHash(doFetch, BACKEND_URL, urlHash).then(render).catch(() => render({ verdict: 'unknown' }));
  }
}

init();
