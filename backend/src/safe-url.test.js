import { describe, it, expect } from 'vitest';
import { httpsUrlOrNull } from './safe-url.js';

describe('httpsUrlOrNull', () => {
  it('returns the normalized href for an https URL', () => {
    expect(httpsUrlOrNull('https://example.com/x')).toBe('https://example.com/x');
  });

  it('rejects a javascript: scheme', () => {
    expect(httpsUrlOrNull('javascript:alert(1)')).toBeNull();
  });

  it('rejects http: (non-TLS)', () => {
    expect(httpsUrlOrNull('http://example.com')).toBeNull();
  });

  it('rejects an unparseable value', () => {
    expect(httpsUrlOrNull('not a url')).toBeNull();
  });

  it('rejects non-string input', () => {
    expect(httpsUrlOrNull(undefined)).toBeNull();
    expect(httpsUrlOrNull(null)).toBeNull();
    expect(httpsUrlOrNull(42)).toBeNull();
  });
});
