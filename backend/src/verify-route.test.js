import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ensureChain } from './keys/chain.js';
import { createC2pa } from './c2pa/index.js';
import { createMemoryStore } from './store/memory.js';
import { systemClock } from './clock.js';
import { createApp } from './app.js';

// Org and attacker each get their own CA→leaf chain. The DeDi record publishes
// the ORG's signing cert; the verifier binds the asset's signer key to it.
let app;
let base;
let orgC2pa;
let attackerC2pa;
let jpeg;

const NS = { namespace: 'truecapture', registry: 'signing-keys' };

beforeAll(async () => {
  const orgDir = join(mkdtempSync(join(tmpdir(), 'tc-org-')), 'k');
  const orgKeys = ensureChain(orgDir);
  const orgLeafPem = readFileSync(join(orgDir, 'leaf.crt'), 'utf8');
  orgC2pa = createC2pa(orgKeys);
  attackerC2pa = createC2pa(ensureChain(join(mkdtempSync(join(tmpdir(), 'tc-att-')), 'k')));

  const dedi = {
    async lookup({ recordId }) {
      const map = {
        'org-rec': { recordId, state: 'live', publicKey: orgLeafPem, entity: { name: 'TrueCapture' } },
        'revoked-rec': { recordId, state: 'revoked', publicKey: orgLeafPem, entity: { name: 'TrueCapture' } },
      };
      return map[recordId] || null; // 'missing-rec' → null
    },
  };

  app = createApp({
    c2pa: orgC2pa,
    store: createMemoryStore(),
    clock: systemClock(),
    dedi,
    dediRef: { record_id: 'org-rec', ...NS },
  });
  base = await app.listen({ port: 0, host: '127.0.0.1' });
  jpeg = await sharp({ create: { width: 24, height: 24, channels: 3, background: { r: 7, g: 8, b: 9 } } })
    .jpeg().toBuffer();
});

afterAll(async () => {
  await app.close();
});

async function sign(engine, recordId) {
  const assertions = [{ label: 'c2pa.actions.v2', data: { actions: [{ action: 'c2pa.created' }] } }];
  if (recordId) assertions.push({ label: 'org.truecapture.dedi', data: { record_id: recordId, ...NS } });
  return engine.sign(jpeg, 'image/jpeg', { claim_generator_info: [{ name: 'TrueCapture' }], assertions });
}

async function verify(buf) {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'image/jpeg' }), 'a.jpg');
  const res = await fetch(`${base}/verify`, { method: 'POST', body: fd });
  return res.json();
}

describe('POST /verify (forgery-proof, C1)', () => {
  it('authentic: org-signed asset whose key matches the live DeDi record', async () => {
    expect((await verify(await sign(orgC2pa, 'org-rec'))).verdict).toBe('authentic');
  });

  it('forged: attacker key + copied dedi_record_id → NOT authentic', async () => {
    // The headline adversarial case from the architectural review.
    expect((await verify(await sign(attackerC2pa, 'org-rec'))).verdict).toBe('forged');
  });

  it('tampered: a modified signed asset', async () => {
    const signed = await sign(orgC2pa, 'org-rec');
    const t = Buffer.from(signed);
    const sos = t.indexOf(Buffer.from([0xff, 0xda])); // Start Of Scan — image data follows, manifest precedes
    t[sos + 5] ^= 0xff; // flip a hashed content byte (manifest JUMBF stays intact)
    expect((await verify(t)).verdict).toBe('tampered');
  });

  it('untrusted: signer key revoked in DeDi', async () => {
    expect((await verify(await sign(orgC2pa, 'revoked-rec'))).verdict).toBe('untrusted');
  });

  it('untrusted: DeDi record not found', async () => {
    expect((await verify(await sign(orgC2pa, 'missing-rec'))).verdict).toBe('untrusted');
  });

  it('untrusted: signed asset with no DeDi reference', async () => {
    expect((await verify(await sign(orgC2pa, null))).verdict).toBe('untrusted');
  });

  it('unsigned: a plain file with no C2PA manifest', async () => {
    expect((await verify(jpeg)).verdict).toBe('unsigned');
  });

  it('returns 400 when no file part is present', async () => {
    const fd = new FormData();
    fd.append('note', 'no file');
    const res = await fetch(`${base}/verify`, { method: 'POST', body: fd });
    expect(res.status).toBe(400);
  });
});
