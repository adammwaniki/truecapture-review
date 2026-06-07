// Detect a media container format from a buffer's magic bytes, returning a
// mimetype that c2pa-node's reader understands. Used as a FALLBACK when the
// declared mimetype is missing or unhelpful — e.g. a browser upload that arrived
// as `application/octet-stream` because the client couldn't determine `file.type`
// — so a genuinely-signed file is never misread as "Not signed" (the reader needs
// the right format hint to pick its parser). Returns null when the bytes match no
// known container.
export function sniffMimeType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const b = buffer;
  const ascii = (start, str) => {
    for (let i = 0; i < str.length; i += 1) {
      if (b[start + i] !== str.charCodeAt(i)) return false;
    }
    return true;
  };

  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 'PNG')) return 'image/png';
  if (ascii(0, 'GIF8')) return 'image/gif';
  if (ascii(0, 'RIFF')) {
    if (ascii(8, 'WEBP')) return 'image/webp';
    if (ascii(8, 'WAVE')) return 'audio/wav';
    return null;
  }
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00)
    || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)) return 'image/tiff';
  if (ascii(0, '%PDF')) return 'application/pdf';
  if (ascii(0, 'ID3')) return 'audio/mpeg';

  // ISO Base Media (BMFF): mp4 / mov / heic / avif — 'ftyp' box at offset 4, then
  // the major brand at offset 8. c2pa parses any BMFF once given a BMFF mimetype.
  if (ascii(4, 'ftyp')) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (/^(heic|heix|heim|heis|hevc|hevx|mif1|msf1)$/.test(brand)) return 'image/heic';
    if (/^(avif|avis)$/.test(brand)) return 'image/avif';
    if (brand === 'qt  ') return 'video/quicktime';
    return 'video/mp4';
  }
  return null;
}
