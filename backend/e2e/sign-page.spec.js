import { test, expect } from '@playwright/test';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// M4: the public sign client must send only a COARSE device class header and
// never the raw user-agent. Drives the real /sign page in headless Chromium.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'verify');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const BACKEND = 'https://api.truecapture.global';

let server;
let origin;
let jpeg;

test.beforeAll(async () => {
  jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();
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

test('sign page sends coarse X-Device-Class and NO raw user-agent (M4)', async ({ page }) => {
  // The custom header triggers a CORS preflight — answer OPTIONS, then POST.
  await page.route(`${BACKEND}/sign`, (route) => {
    const r = route.request();
    if (r.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'X-Device-Class, Content-Type' } });
    }
    return route.fulfill({ status: 200, headers: { 'X-Verify-Hash': 'h', 'X-Verify-URL': 'https://www.truecapture.global/verify/h', 'content-type': 'image/jpeg', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'X-Verify-Hash, X-Verify-URL' }, body: 'SIGNED' });
  });
  const reqPromise = page.waitForRequest((r) => r.url() === `${BACKEND}/sign` && r.method() === 'POST');
  await page.goto(`${origin}/sign/index.html`);
  await page.setInputFiles('#input-photo', { name: 'p.jpg', mimeType: 'image/jpeg', buffer: jpeg });

  const req = await reqPromise;
  expect(req.headers()['x-device-class']).toBe('Desktop'); // headless Chromium = Desktop
  const body = req.postData() || '';
  expect(body).not.toMatch(/"device"\s*:/); // no device field in metadata
  expect(body.toLowerCase()).not.toContain('mozilla'); // no UA string leaked
  expect(body).not.toContain('navigator');
});
