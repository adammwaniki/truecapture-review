import { describe, it, expect } from 'vitest';
import { createApiKeyAuth } from './apikey.js';

const identity = { org: { name: 'BBC', url: 'https://bbc.com' }, dedi: { record_id: 'r', namespace: 'bbc', registry: 'signing-keys' } };
const auth = createApiKeyAuth({ 'good-key': identity });

describe('createApiKeyAuth', () => {
  it('authenticates a Bearer token', () => {
    expect(auth.authenticate({ authorization: 'Bearer good-key' })).toBe(identity);
  });
  it('authenticates an X-API-Key header', () => {
    expect(auth.authenticate({ 'x-api-key': 'good-key' })).toBe(identity);
  });
  it('rejects an unknown key', () => {
    expect(auth.authenticate({ authorization: 'Bearer nope' })).toBeNull();
  });
  it('rejects a request with no credential', () => {
    expect(auth.authenticate({})).toBeNull();
  });
});
