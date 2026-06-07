import { describe, it, expect } from 'vitest';
import { resolveBackendUrl, isLocalOrPrivateHost } from './backend-url.js';

describe('resolveBackendUrl', () => {
  it('an explicit override always wins', () => {
    expect(resolveBackendUrl({ hostname: 'example.com', protocol: 'https:' }, 'https://my.api')).toBe('https://my.api');
  });

  it('localhost / 127.0.0.1 → same host on :3000 (local dev)', () => {
    expect(resolveBackendUrl({ hostname: 'localhost', protocol: 'http:' }, '')).toBe('http://localhost:3000');
    expect(resolveBackendUrl({ hostname: '127.0.0.1', protocol: 'http:' }, '')).toBe('http://127.0.0.1:3000');
  });

  it('a private LAN IP or *.local → same host on :3000 (phone / self-host testing)', () => {
    expect(resolveBackendUrl({ hostname: '192.168.1.105', protocol: 'http:' }, '')).toBe('http://192.168.1.105:3000');
    expect(resolveBackendUrl({ hostname: '10.0.0.7', protocol: 'http:' }, '')).toBe('http://10.0.0.7:3000');
    expect(resolveBackendUrl({ hostname: '172.16.5.4', protocol: 'http:' }, '')).toBe('http://172.16.5.4:3000');
    expect(resolveBackendUrl({ hostname: 'mybox.local', protocol: 'http:' }, '')).toBe('http://mybox.local:3000');
  });

  it('a public domain or public IP → production API', () => {
    expect(resolveBackendUrl({ hostname: 'truecapture.global', protocol: 'https:' }, '')).toBe('https://api.truecapture.global');
    expect(resolveBackendUrl({ hostname: '172.32.0.1', protocol: 'http:' }, '')).toBe('https://api.truecapture.global'); // 172.32 is outside 16–31
    expect(resolveBackendUrl({ hostname: '8.8.8.8', protocol: 'http:' }, '')).toBe('https://api.truecapture.global');
  });

  it('falls back to production when location is absent', () => {
    expect(resolveBackendUrl(null, '')).toBe('https://api.truecapture.global');
  });

  it('isLocalOrPrivateHost handles edge cases', () => {
    expect(isLocalOrPrivateHost('')).toBe(false);
    expect(isLocalOrPrivateHost(undefined)).toBe(false);
    expect(isLocalOrPrivateHost('::1')).toBe(true);
    expect(isLocalOrPrivateHost('169.254.1.1')).toBe(false); // link-local, not RFC1918
  });
});
