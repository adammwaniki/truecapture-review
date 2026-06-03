import { describe, it, expect } from 'vitest';
import { deviceClass } from './device.js';

describe('deviceClass', () => {
  it('detects iOS', () => expect(deviceClass('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('iOS'));
  it('detects Android', () => expect(deviceClass('Mozilla/5.0 (Linux; Android 14; Pixel)')).toBe('Android'));
  it('detects Desktop', () => expect(deviceClass('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Desktop'));
  it('returns unknown for an unrecognized UA', () => expect(deviceClass('SomeBot/1.0')).toBe('unknown'));
  it('returns unknown for a non-string', () => expect(deviceClass(undefined)).toBe('unknown'));
});
