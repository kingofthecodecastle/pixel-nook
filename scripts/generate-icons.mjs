// Rasterize the existing favicon's cartridge motif. No new brand or game assets.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function icon(path, size, padding = 0, height = size) {
  const row = size * 3 + 1, data = Buffer.alloc(row * height);
  const colors = [[0x1a, 0x1a, 0x2e], [0xe9, 0x45, 0x60], [0x0f, 0x34, 0x60]];
  const scale = Math.min(size, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < size; x++) {
    const px = ((x - (size - scale) / 2) / scale * 32 - padding) * 32 / (32 - 2 * padding);
    const py = ((y - (height - scale) / 2) / scale * 32 - padding) * 32 / (32 - 2 * padding);
    let c = 0;
    if (px >= 6 && px < 26 && py >= 4 && py < 28) c = 1;
    if (px >= 10 && px < 22 && py >= 8 && py < 16) c = 2;
    const at = y * row + 1 + x * 3;
    data.set(colors[c], at);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(data)), chunk('IEND', Buffer.alloc(0))]));
}
icon('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024);
for (const [density, size] of Object.entries({mdpi:48, hdpi:72, xhdpi:96, xxhdpi:144, xxxhdpi:192})) {
  const dir = `android/app/src/main/res/mipmap-${density}`;
  icon(`${dir}/ic_launcher.png`, size);
  icon(`${dir}/ic_launcher_round.png`, size);
  icon(`${dir}/ic_launcher_foreground.png`, size * 2.25, 5);
}
for (const file of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  icon(`ios/App/App/Assets.xcassets/Splash.imageset/${file}`, 2732, 12);
}
const res = 'android/app/src/main/res';
for (const directory of readdirSync(res).filter(name => name.startsWith('drawable'))) {
  const path = `${res}/${directory}/splash.png`;
  if (existsSync(path)) {
    const png = readFileSync(path);
    icon(path, png.readUInt32BE(16), 11, png.readUInt32BE(20));
  }
}
console.log('Generated native icons from the existing Pixel Nook cartridge.');
