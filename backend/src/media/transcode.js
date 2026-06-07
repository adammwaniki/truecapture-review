import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Containers c2pa-node cannot sign but ffmpeg can convert to a signable MP4.
// WebM (Matroska / VP8|VP9 + Opus|Vorbis) is what Chrome's MediaRecorder produces;
// c2pa-rs has no Matroska asset handler, so we transcode to H.264/AAC MP4 first.
const TRANSCODABLE = new Set(['video/webm', 'video/x-matroska', 'video/matroska']);

export function isTranscodableType(mimeType) {
  if (!mimeType) return false;
  return TRANSCODABLE.has(String(mimeType).split(';')[0].trim().toLowerCase());
}

// Rename a transcoded upload to a .mp4 (drop any existing extension; default 'video').
export function toMp4Filename(name) {
  const base = (name || 'video').replace(/\.[^.]+$/, '');
  return `${base}.mp4`;
}

// ffmpeg seam. `ffmpegPath` is the binary (bundled ffmpeg-static, or FFMPEG_PATH).
// `run` is injectable so the conversion is unit-testable without spawning ffmpeg.
export function createTranscoder({ ffmpegPath, timeoutMs = 120000, run = execFileAsync } = {}) {
  return {
    isTranscodable: isTranscodableType,

    // Transcode an input buffer to a faststart H.264/AAC MP4 buffer. Goes via temp
    // files (ffmpeg needs seekable I/O for the MP4 moov atom) and always cleans up.
    async toMp4(buffer) {
      const dir = mkdtempSync(join(tmpdir(), 'tc-transcode-'));
      const input = join(dir, 'in');
      const output = join(dir, 'out.mp4');
      try {
        writeFileSync(input, buffer);
        await run(ffmpegPath, [
          '-nostdin', '-y', '-loglevel', 'error', '-nostats',
          '-i', input,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23',
          '-c:a', 'aac', '-b:a', '128k',
          '-movflags', '+faststart',
          output,
        ], { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
        return readFileSync(output);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
