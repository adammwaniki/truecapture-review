import { describe, it, expect } from 'vitest';
import { httpsUrlOrNull } from './safe-url.js';

describe('httpsUrlOrNull', () => {
  it('returns the href for an https URL', () => {
    expect(httpsUrlOrNull('https://bbc.com/x')).toBe('https://bbc.com/x');
  });
  it('rejects javascript:', () => expect(httpsUrlOrNull('javascript:alert(1)')).toBeNull());
  it('rejects http:', () => expect(httpsUrlOrNull('http://bbc.com')).toBeNull());
  it('rejects unparseable input', () => expect(httpsUrlOrNull('not a url')).toBeNull());
  it('rejects non-strings', () => {
    expect(httpsUrlOrNull(null)).toBeNull();
    expect(httpsUrlOrNull(undefined)).toBeNull();
  });
});
