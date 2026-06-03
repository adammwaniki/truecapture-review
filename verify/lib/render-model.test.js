import { describe, it, expect } from 'vitest';
import { toDisplayModel, toBrowserModel } from './render-model.js';

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

describe('toBrowserModel (in-browser read, H2)', () => {
  it('Valid + signed → "Content intact · signed", offers the DeDi confirm', () => {
    const m = toBrowserModel({ hasManifest: true, state: 'Valid' });
    expect(m).toEqual({ verdict: 'signed', icon: 'check', title: 'Content intact · signed', tone: 'success', canConfirm: true });
  });
  it('Trusted is treated as intact + signed', () => {
    expect(toBrowserModel({ hasManifest: true, state: 'Trusted' }).verdict).toBe('signed');
  });
  it('Invalid validation_state → tampered, no confirm', () => {
    const m = toBrowserModel({ hasManifest: true, state: 'Invalid' });
    expect(m.verdict).toBe('tampered');
    expect(m.canConfirm).toBe(false);
  });
  it('no manifest → unsigned, no confirm', () => {
    const m = toBrowserModel({ hasManifest: false });
    expect(m.verdict).toBe('unsigned');
    expect(m.canConfirm).toBe(false);
  });
  it('read error → unknown but still lets the user opt into a server check', () => {
    expect(toBrowserModel({ error: true })).toEqual({ verdict: 'unknown', icon: 'info', title: "Couldn't read in your browser", tone: 'neutral', canConfirm: true });
    expect(toBrowserModel(null).canConfirm).toBe(true);
  });
});
