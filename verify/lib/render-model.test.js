import { describe, it, expect } from 'vitest';
import { toDisplayModel } from './render-model.js';

describe('toDisplayModel', () => {
  it('maps an authentic result with a safe entity link', () => {
    const m = toDisplayModel({ verdict: 'authentic', entity: { name: 'BBC', url: 'https://bbc.com' } });
    expect(m).toEqual({ verdict: 'authentic', icon: 'check', title: 'Authentic', tone: 'success', entityName: 'BBC', entityUrl: 'https://bbc.com/' });
  });
  it('strips an unsafe entity link (M3)', () => {
    const m = toDisplayModel({ verdict: 'forged', entity: { name: 'X', url: 'javascript:evil()' } });
    expect(m.tone).toBe('error');
    expect(m.entityUrl).toBeNull();
    expect(m.entityName).toBe('X');
  });
  it('falls back to unknown for an unrecognized verdict', () => {
    expect(toDisplayModel({ verdict: 'weird' }).title).toBe('Unknown');
  });
  it('handles a null/empty result', () => {
    const m = toDisplayModel(null);
    expect(m.verdict).toBe('unknown');
    expect(m.entityName).toBeNull();
    expect(m.entityUrl).toBeNull();
  });
});
