import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '../extension/icons');

if (!existsSync(iconsDir)) await mkdir(iconsDir, { recursive: true });

const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#0f0f13"/>
    <circle cx="${size/2}" cy="${size/2}" r="${size*0.38}" stroke="#6366f1" stroke-width="${size*0.08}" fill="none"/>
    <circle cx="${size/2}" cy="${size/2}" r="${size*0.1}" fill="#6366f1"/>
    <line x1="${size*0.12}" y1="${size/2}" x2="${size*0.88}" y2="${size/2}" stroke="#6366f1" stroke-width="${size*0.06}"/>
  </svg>`;

  await sharp(Buffer.from(svg)).png().toFile(join(iconsDir, `icon${size}.png`));
  console.log(`Generated icon${size}.png`);
}

console.log('All icons generated!');
