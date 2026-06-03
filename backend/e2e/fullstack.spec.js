import { test, expect } from '@playwright/test';
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ensureChain } from '../src/keys/chain.js';
import { createC2pa } from '../src/c2pa/index.js';
import { createMemoryStore } from '../src/store/memory.js';
import { systemClock } from '../src/clock.js';
import { createApp } from '../src/app.js';

// The full-stack journey the review (L-1) flagged as missing: a REAL backend and
// the REAL verify page together. Signs a file through the live /sign endpoint,
// drives the verify page's in-browser read, then confirms against the live
// backend (real c2pa read + cert extraction + DeDi key compare → authentic).
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', 'verify');
const VENDOR = join(ROOT, 'vendor');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.map': 'application/json' };

let backend;
let backendOrigin;
let web;
let webOrigin;
let signedJpeg;

test.beforeAll(async () => {
  if (!existsSync(join(VENDOR, 'c2pa-web.js'))) return; // needs the in-browser reader
  const keysDir = join(await mkdtemp(join(tmpdir(), 'fs-k-')), 'k');
  const keys = ensureChain(keysDir);
  const leafPem = readFileSync(join(keysDir, 'leaf.crt'), 'utf8');
  const identity = { org: { name: 'TrueCapture', url: 'https://www.truecapture.global' }, dedi: { record_id: 'rec-1', namespace: 'truecapture', registry: 'signing-keys' } };
  // Fake DeDi publishes the org's OWN signing key as live → verify reaches `authentic`.
  const dedi = {
    async lookup({ recordId }) {
      return recordId === 'rec-1'
        ? { recordId, state: 'live', publicKey: leafPem, entity: { name: 'TrueCapture', url: 'https://www.truecapture.global' } }
        : null;
    },
  };
  backend = createApp({ c2pa: createC2pa(keys), store: createMemoryStore(), clock: systemClock(), dedi, identity, corsOrigin: true });
  backendOrigin = await backend.listen({ port: 0, host: '127.0.0.1' });

  // Sign a real file THROUGH the live /sign endpoint.
  const jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 7, g: 8, b: 9 } } }).jpeg().toBuffer();
  const fd = new FormData();
  fd.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'p.jpg');
  const signRes = await fetch(`${backendOrigin}/sign`, { method: 'POST', body: fd });
  signedJpeg = Buffer.from(await signRes.arrayBuffer());

  // Serve the real verify site.
  web = http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://x');
      const f = join(ROOT, pathname.endsWith('/') ? `${pathname}index.html` : pathname);
      const b = await readFile(f);
      res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
      res.end(b);
    } catch { res.writeHead(404); res.end('nf'); }
  });
  await new Promise((r) => web.listen(0, '127.0.0.1', r));
  webOrigin = `http://127.0.0.1:${web.address().port}`;
});

test.afterAll(async () => {
  if (backend) await backend.close();
  if (web) web.close();
});

test('full stack: live sign → verify page in-browser read → confirm → authentic (L-1)', async ({ page }) => {
  test.skip(!signedJpeg, 'vendored c2pa-web not built — run: cd verify && npm run vendor');
  await page.addInitScript((origin) => { window.TRUECAPTURE_BACKEND = origin; }, backendOrigin);
  await page.goto(`${webOrigin}/verify/index.html`);
  await page.setInputFiles('#file-input', { name: 'signed.jpg', mimeType: 'image/jpeg', buffer: signedJpeg });

  // In-browser read (no upload) of a genuinely-signed, intact file.
  await expect(page.locator('#verdict-title')).toHaveText('Content intact · signed', { timeout: 20000 });

  // Confirm → live POST /verify → real c2pa read + extract-cert + DeDi key compare.
  await page.click('#btn-confirm-signer');
  await expect(page.locator('#verdict-title')).toHaveText('Authentic', { timeout: 20000 });
  await expect(page.locator('#dedi-section')).toContainText('TrueCapture');
});
