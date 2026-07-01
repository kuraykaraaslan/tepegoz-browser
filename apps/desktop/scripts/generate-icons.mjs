/**
 * Rasterize the brand icon (resources/icon.svg) into resources/icon.png + resources/icon.ico.
 *
 * Pure Node (no GPU/Electron) via @resvg/resvg-js, so it runs the same on a dev box or in CI. One-off:
 * run `pnpm --filter @tepegoz/desktop icons` when the SVG changes; the generated PNG/ICO are committed
 * so a normal build/install never re-rasterizes.
 */
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RES = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources');
const SVG = readFileSync(join(RES, 'icon.svg'), 'utf8');
const ICO_SIZES = [16, 32, 48, 64, 128, 256];

/** Render the SVG to a PNG buffer at an exact square pixel size. */
function renderPng(size) {
  return new Resvg(SVG, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

/** Pack PNG buffers into a Windows .ico (PNG-compressed entries; supported Vista+). */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + entries.length * 16;
  const dir = [];
  for (const { size, png } of entries) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width  (0 == 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    dir.push(e);
  }
  return Buffer.concat([header, ...dir, ...entries.map((x) => x.png)]);
}

// 512px master PNG (BrowserWindow icon on Linux + macOS dock / future packaging).
writeFileSync(join(RES, 'icon.png'), renderPng(512));

// Multi-resolution .ico for Windows taskbar/window crispness.
const ico = buildIco(ICO_SIZES.map((size) => ({ size, png: renderPng(size) })));
writeFileSync(join(RES, 'icon.ico'), ico);

console.log(`Wrote icon.png (512) and icon.ico (${ICO_SIZES.join(', ')}) to ${RES}`);
