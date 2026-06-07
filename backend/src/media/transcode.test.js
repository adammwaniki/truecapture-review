import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { createTranscoder, isTranscodableType, toMp4Filename } from './transcode.js';
import { sniffMimeType } from '../c2pa/sniff-format.js';
import { ensureChain } from '../keys/chain.js';
import { createC2pa } from '../c2pa/index.js';

describe('isTranscodableType', () => {
  it('is true for WebM/Matroska (incl. a codecs= parameter), false otherwise', () => {
    expect(isTranscodableType('video/webm')).toBe(true);
    expect(isTranscodableType('video/webm;codecs=vp9')).toBe(true);
    expect(isTranscodableType('video/x-matroska')).toBe(true);
    expect(isTranscodableType('video/mp4')).toBe(false);
    expect(isTranscodableType('image/jpeg')).toBe(false);
    expect(isTranscodableType('')).toBe(false);
    expect(isTranscodableType(undefined)).toBe(false);
  });
});

describe('toMp4Filename', () => {
  it('swaps any extension for .mp4 and defaults a missing name', () => {
    expect(toMp4Filename('recording.webm')).toBe('recording.mp4');
    expect(toMp4Filename('clip')).toBe('clip.mp4');
    expect(toMp4Filename('')).toBe('video.mp4');
    expect(toMp4Filename(undefined)).toBe('video.mp4');
  });
});

describe('createTranscoder', () => {
  it('exposes isTranscodable when constructed with no args', () => {
    expect(createTranscoder().isTranscodable('video/webm')).toBe(true);
  });

  it('toMp4 invokes ffmpeg and returns the produced file (injected runner)', async () => {
    let calledWith;
    const run = async (bin, args) => { calledWith = { bin, args }; writeFileSync(args[args.length - 1], Buffer.from('FAKE-MP4-BYTES')); };
    const out = await createTranscoder({ ffmpegPath: '/x/ffmpeg', run, timeoutMs: 5000 }).toMp4(Buffer.from('in'));
    expect(out.toString()).toBe('FAKE-MP4-BYTES');
    expect(calledWith.bin).toBe('/x/ffmpeg');
    expect(calledWith.args).toContain('libx264');
    expect(calledWith.args).toContain('+faststart');
  });

  it('cleans up and propagates when ffmpeg fails', async () => {
    const run = async () => { throw new Error('ffmpeg exploded'); };
    await expect(createTranscoder({ ffmpegPath: '/x/ffmpeg', run }).toMp4(Buffer.from('in'))).rejects.toThrow('ffmpeg exploded');
  });
});

describe('createTranscoder — real ffmpeg end-to-end (WebM → signable MP4)', () => {
  let webm;
  beforeAll(() => {
    // Generate a tiny real VP8 WebM with ffmpeg-static (what Chrome's MediaRecorder emits).
    const dir = mkdtempSync(join(tmpdir(), 'tc-webm-'));
    const out = join(dir, 'sample.webm');
    execFileSync(ffmpegStatic, ['-nostdin', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x64:rate=10', '-c:v', 'libvpx', out]);
    webm = readFileSync(out);
  });

  it('transcodes a real WebM to an MP4 that the C2PA engine can sign as Valid', async () => {
    expect(sniffMimeType(webm)).toBeNull(); // WebM is not a c2pa-signable container

    const mp4 = await createTranscoder({ ffmpegPath: ffmpegStatic }).toMp4(webm);
    expect(sniffMimeType(mp4)).toBe('video/mp4'); // now a BMFF MP4

    const c2pa = createC2pa(ensureChain(join(mkdtempSync(join(tmpdir(), 'tc-k-')), 'k')));
    const signed = await c2pa.sign(mp4, 'video/mp4', { claim_generator_info: [{ name: 'TrueCapture' }], assertions: [{ label: 'c2pa.actions.v2', data: { actions: [{ action: 'c2pa.created' }] } }] });
    const report = await c2pa.read(signed, 'video/mp4');
    expect(report.validationState).toBe('Valid');
  }, 60000);
});
