import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Generates/loads an EC P-256 CA→leaf chain for C2PA ES256 signing.
// Spike findings (truecap-spike-c2pa-dedi.md): the signer needs a PKCS#8 leaf
// key, and a self-signed leaf is rejected — the leaf must chain to a CA that is
// then used as the c2pa trust anchor (digitalSignature + emailProtection EKU).
function openssl(args) {
  execFileSync('openssl', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

export function ensureChain(dir, { org = 'TrueCapture' } = {}) {
  const f = (n) => join(dir, n);
  if (!existsSync(f('chain.pem'))) {
    mkdirSync(dir, { recursive: true });
    // CA (EC P-256)
    openssl(['genpkey', '-algorithm', 'EC', '-pkeyopt', 'ec_paramgen_curve:P-256', '-out', f('ca.key')]);
    openssl(['req', '-x509', '-key', f('ca.key'), '-out', f('ca.crt'), '-days', '3650',
      '-subj', `/CN=${org} CA/O=${org}`,
      '-addext', 'basicConstraints=critical,CA:TRUE',
      '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
    // Leaf (PKCS#8 key) chained to the CA, with the EKU c2pa accepts
    openssl(['genpkey', '-algorithm', 'EC', '-pkeyopt', 'ec_paramgen_curve:P-256', '-out', f('leaf.key')]);
    openssl(['req', '-new', '-key', f('leaf.key'), '-out', f('leaf.csr'), '-subj', `/CN=${org} Signer/O=${org}`]);
    writeFileSync(f('leaf.ext'), 'keyUsage=critical,digitalSignature\nextendedKeyUsage=emailProtection\n');
    openssl(['x509', '-req', '-in', f('leaf.csr'), '-CA', f('ca.crt'), '-CAkey', f('ca.key'),
      '-CAcreateserial', '-out', f('leaf.crt'), '-days', '825', '-extfile', f('leaf.ext')]);
    writeFileSync(f('chain.pem'), Buffer.concat([readFileSync(f('leaf.crt')), readFileSync(f('ca.crt'))]));
  }
  return {
    chainPem: readFileSync(f('chain.pem')),
    leafKeyPem: readFileSync(f('leaf.key')),
    caCertPem: readFileSync(f('ca.crt'), 'utf8'),
  };
}
