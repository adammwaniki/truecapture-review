import { test, expect } from '@playwright/test';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdtemp, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ensureChain } from '../src/keys/chain.js';
import { createC2pa } from '../src/c2pa/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.jpg': 'image/jpeg', '.json': 'application/json', '.map': 'application/json' };

let server;
let origin;

test.beforeAll(async () => {
  const VENDOR = join(HERE, '..', '..', 'verify', 'vendor');
  if (!existsSync(join(VENDOR, 'c2pa-web.js'))) return; // run: cd verify && npm run vendor
  const dir = await mkdtemp(join(tmpdir(), 'c2pa-web-'));
  await cp(join(VENDOR, 'c2pa-web.js'), join(dir, 'c2pa-web.js'));
  await cp(join(VENDOR, 'c2pa_bg.wasm'), join(dir, 'c2pa_bg.wasm'));

  const keys = ensureChain(join(await mkdtemp(join(tmpdir(), 'k-')), 'k'));
  const jpeg = await sharp({ create: { width: 24, height: 24, channels: 3, background: { r: 5, g: 6, b: 7 } } }).jpeg().toBuffer();
  const signed = await createC2pa(keys).sign(jpeg, 'image/jpeg', {
    claim_generator_info: [{ name: 'TrueCapture' }],
    assertions: [
      { label: 'c2pa.actions.v2', data: { actions: [{ action: 'c2pa.created' }] } },
      { label: 'org.truecapture.dedi', data: { record_id: 'org-rec', namespace: 'truecapture', registry: 'signing-keys' } },
    ],
  });
  await writeFile(join(dir, 'signed.jpg'), signed);
  await writeFile(join(dir, 'index.html'), `<!DOCTYPE html><html><body><pre id="out">pending</pre>
<script type="module">
import { createC2pa } from './c2pa-web.js';
(async () => {
  try {
    const c2pa = await createC2pa({ wasmSrc: './c2pa_bg.wasm' });
    const blob = await (await fetch('./signed.jpg')).blob();
    const reader = await c2pa.reader.fromBlob('image/jpeg', blob);
    const store = await reader.manifestStore();
    const m = store.manifests[store.active_manifest];
    document.getElementById('out').textContent = JSON.stringify({ state: store.validation_state, labels: (m.assertions || []).map((a) => a.label), issuer: (m.signature_info || {}).issuer });
  } catch (e) { document.getElementById('out').textContent = 'ERR: ' + ((e && e.message) || e); }
})();
</script></body></html>`);

  server = http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://x');
      const f = join(dir, pathname === '/' ? '/index.html' : pathname);
      const b = await readFile(f);
      res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
      res.end(b);
    } catch { res.writeHead(404); res.end('nf'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(() => server && server.close());

test('c2pa-web reads a signed asset IN-BROWSER (content + assertions, no upload)', async ({ page }) => {
  test.skip(!origin, 'vendored c2pa-web not built — run: cd verify && npm run vendor');
  page.on('console', (m) => console.log('PAGE:', m.text()));
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(`${origin}/index.html`);
  await expect.poll(async () => page.textContent('#out'), { timeout: 20000 }).not.toBe('pending');
  const out = await page.textContent('#out');
  console.log('RESULT:', out);
  expect(out.startsWith('ERR:')).toBe(false);
  const parsed = JSON.parse(out);
  expect(['Valid', 'Invalid', 'Trusted']).toContain(parsed.state);
  expect(parsed.labels).toContain('org.truecapture.dedi');
});
