import { test, expect } from '@playwright/test';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ensureChain } from '../src/keys/chain.js';
import { createC2pa } from '../src/c2pa/index.js';

// H2 end-to-end: drives the REAL verify page in headless Chromium and proves the
// privacy-maximal flow — the file is read in-browser (no upload), and only the
// explicit "Confirm signer with DeDi" button uploads it for the server verdict.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'verify');
const VENDOR = join(ROOT, 'vendor');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.map': 'application/json' };
const BACKEND = 'https://api.truecapture.global';

let server;
let origin;
let signedJpeg;
let tamperedJpeg;

test.beforeAll(async () => {
  if (!existsSync(join(VENDOR, 'c2pa-web.js'))) return; // run: cd verify && npm run vendor
  const keys = ensureChain(join(await mkdtemp(join(tmpdir(), 'k-')), 'k'));
  const jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 9, g: 9, b: 9 } } }).jpeg().toBuffer();
  signedJpeg = await createC2pa(keys).sign(jpeg, 'image/jpeg', {
    claim_generator_info: [{ name: 'TrueCapture' }],
    assertions: [
      { label: 'c2pa.actions.v2', data: { actions: [{ action: 'c2pa.created' }] } },
      { label: 'org.truecapture.dedi', data: { record_id: 'r', namespace: 'truecapture', registry: 'signing-keys' } },
    ],
  });
  // Flip a byte inside the entropy-coded scan data (after the SOS marker) so the
  // pixels change but the JUMBF manifest stays intact -> validation_state Invalid.
  tamperedJpeg = Buffer.from(signedJpeg);
  const sos = tamperedJpeg.indexOf(Buffer.from([0xff, 0xda]));
  tamperedJpeg[sos + 12] ^= 0xff;

  server = http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://x');
      const file = join(ROOT, pathname.endsWith('/') ? `${pathname}index.html` : pathname);
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('nf'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(() => server && server.close());

test('signed file: in-browser read says "Content intact · signed" with NO upload; confirm then uploads (H2/C1)', async ({ page }) => {
  test.skip(!origin, 'vendored c2pa-web not built — run: cd verify && npm run vendor');
  let posts = 0;
  await page.route(`${BACKEND}/**`, (route) => {
    if (route.request().method() === 'POST') posts += 1;
    route.fulfill({ json: { verdict: 'authentic', entity: { name: 'BBC', url: 'https://bbc.com' } } });
  });
  await page.goto(`${origin}/verify/index.html`);
  await page.setInputFiles('#file-input', { name: 'signed.jpg', mimeType: 'image/jpeg', buffer: signedJpeg });

  await expect(page.locator('#verdict-title')).toHaveText('Content intact · signed', { timeout: 20000 });
  await expect(page.locator('#verdict-banner')).toHaveClass(/signed/);
  await expect(page.locator('#btn-confirm-signer')).toBeVisible();
  expect(posts).toBe(0); // PROVEN: the in-browser read uploaded nothing

  await page.click('#btn-confirm-signer');
  await expect(page.locator('#verdict-title')).toHaveText('Authentic', { timeout: 20000 });
  await expect(page.locator('#dedi-section')).toContainText('BBC');
  expect(posts).toBeGreaterThan(0); // confirm performed the server (DeDi) check
});

test('tampered file: in-browser read says "Content modified", no confirm, no upload', async ({ page }) => {
  test.skip(!origin, 'vendored c2pa-web not built');
  let posts = 0;
  await page.route(`${BACKEND}/**`, (route) => {
    if (route.request().method() === 'POST') posts += 1;
    route.fulfill({ json: { verdict: 'authentic' } });
  });
  await page.goto(`${origin}/verify/index.html`);
  await page.setInputFiles('#file-input', { name: 't.jpg', mimeType: 'image/jpeg', buffer: tamperedJpeg });

  await expect(page.locator('#verdict-title')).toHaveText('Content modified', { timeout: 20000 });
  await expect(page.locator('#btn-confirm-signer')).toBeHidden();
  expect(posts).toBe(0);
});
