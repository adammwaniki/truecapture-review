import { describe, it, expect } from 'vitest';
import { sniffMimeType } from './sniff-format.js';

// Build a 16-byte buffer from leading bytes (the rest is zero-padded), so each
// case is long enough to clear the minimum-length guard.
const buf = (...bytes) => { const b = Buffer.alloc(16); for (let i = 0; i < bytes.length; i += 1) b[i] = bytes[i]; return b; };
const ascii = (str, padTo = 16) => { const b = Buffer.alloc(padTo); b.write(str, 'ascii'); return b; };
// A BMFF file: 4 bytes box size, 'ftyp', then a 4-char major brand.
const ftyp = (brand) => { const b = Buffer.alloc(16); b.write('????ftyp', 0, 'ascii'); b.write(brand, 8, 'ascii'); return b; };

describe('sniffMimeType (magic-byte format detection)', () => {
  it('detects images', () => {
    expect(sniffMimeType(buf(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffMimeType(buf(0x89, 0x50, 0x4e, 0x47))).toBe('image/png');
    expect(sniffMimeType(ascii('GIF89a'))).toBe('image/gif');
    expect(sniffMimeType(buf(0x49, 0x49, 0x2a, 0x00))).toBe('image/tiff'); // little-endian TIFF
    expect(sniffMimeType(buf(0x4d, 0x4d, 0x00, 0x2a))).toBe('image/tiff'); // big-endian TIFF
  });

  it('detects RIFF containers (WebP image, WAVE audio) and rejects unknown RIFF', () => {
    const riff = (tag) => { const b = Buffer.alloc(16); b.write('RIFF', 0, 'ascii'); b.write(tag, 8, 'ascii'); return b; };
    expect(sniffMimeType(riff('WEBP'))).toBe('image/webp');
    expect(sniffMimeType(riff('WAVE'))).toBe('audio/wav');
    expect(sniffMimeType(riff('AVI '))).toBeNull(); // RIFF but not a C2PA media type
  });

  it('detects documents and audio', () => {
    expect(sniffMimeType(ascii('%PDF-1.7'))).toBe('application/pdf');
    expect(sniffMimeType(ascii('ID3\x04\x00'))).toBe('audio/mpeg');
  });

  it('detects BMFF by ftyp box and maps the major brand', () => {
    expect(sniffMimeType(ftyp('isom'))).toBe('video/mp4');
    expect(sniffMimeType(ftyp('mp42'))).toBe('video/mp4');
    expect(sniffMimeType(ftyp('heic'))).toBe('image/heic');
    expect(sniffMimeType(ftyp('mif1'))).toBe('image/heic');
    expect(sniffMimeType(ftyp('avif'))).toBe('image/avif');
    expect(sniffMimeType(ftyp('qt  '))).toBe('video/quicktime');
  });

  it('returns null for unknown bytes, empty, or too-short input', () => {
    expect(sniffMimeType(buf(0x00, 0x01, 0x02, 0x03))).toBeNull();
    expect(sniffMimeType(Buffer.alloc(4))).toBeNull(); // shorter than the 12-byte guard
    expect(sniffMimeType(null)).toBeNull();
  });
});
