// Extracts the original Supaplex graphics into assets/original/ as PNGs.
// Run with `npm run sprites -- <path to the Supaplex folder>`.
//
// Every bitmap the game ships is 16-colour EGA, stored row by row with the four
// bit planes one after another inside each row: a row of W pixels is W/8 bytes
// of blue, then green, then red, then intensity, most significant bit leftmost.
// The colours themselves are not in the bitmaps -- they come from PALETTES.DAT,
// four palettes of sixteen 4-bit RGB entries plus a pad byte.
//
// The PNGs are written indexed, so each pixel keeps its original palette index.
// A remaster can repaint a sheet by swapping its PLTE and nothing else, and a
// script can ask "is this pixel colour 6" without guessing back from RGB.
//
// The two fonts are 1-bit, 64 characters from ASCII 32, stored a row at a time
// across all 64: byte (c + y * 64) is row y of character c.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const SRC = process.argv[2];
const OUT = process.argv[3] || 'assets/original';
if (!SRC || !existsSync(join(SRC, 'FIXED.DAT'))) {
  console.error('usage: node tools/extract-sprites.mjs <Supaplex folder> [out dir]');
  process.exit(1);
}

// Which palette each sheet is drawn in. 1 is the in-game palette; 0 is the
// blue gradient the controls screen and the backdrop are drawn in.
const GAME = 1;

// The three title screens are not drawn in any palette from PALETTES.DAT; their
// palettes are hard-coded in SUPAPLEX.EXE, back to back in the data segment
// (0x9AB0 in the SpeedFix build). That EXE is EXEPACKed, and the last palette
// straddles a fill run -- eight bytes of 0x08 -- which is expanded here.
const TITLE_PALETTES = {
  title: [
    0x02, 0x03, 0x05, 0x00, 0x0d, 0x0a, 0x04, 0x0c, 0x02, 0x06, 0x06, 0x02, 0x03, 0x09, 0x09, 0x03,
    0x0b, 0x08, 0x03, 0x06, 0x02, 0x07, 0x07, 0x0a, 0x08, 0x06, 0x0d, 0x09, 0x06, 0x04, 0x0b, 0x01,
    0x09, 0x01, 0x00, 0x04, 0x0b, 0x01, 0x00, 0x04, 0x0d, 0x01, 0x00, 0x0c, 0x0f, 0x01, 0x00, 0x0c,
    0x0f, 0x06, 0x04, 0x0c, 0x02, 0x05, 0x06, 0x08, 0x0f, 0x0c, 0x06, 0x0e, 0x0c, 0x0c, 0x0d, 0x0e,
  ],
  title1: [
    0x00, 0x00, 0x00, 0x00, 0x0f, 0x0f, 0x0f, 0x0f, 0x06, 0x06, 0x06, 0x08, 0x0a, 0x0a, 0x0a, 0x07,
    0x0a, 0x0a, 0x0a, 0x07, 0x0b, 0x0b, 0x0b, 0x07, 0x0e, 0x01, 0x01, 0x04, 0x09, 0x09, 0x09, 0x07,
    0x01, 0x03, 0x07, 0x00, 0x08, 0x08, 0x08, 0x08, 0x09, 0x00, 0x00, 0x04, 0x0b, 0x00, 0x00, 0x0c,
    0x00, 0x02, 0x0a, 0x01, 0x05, 0x05, 0x05, 0x08, 0x06, 0x06, 0x06, 0x08, 0x08, 0x08, 0x08, 0x07,
  ],
  title2: [
    0x00, 0x00, 0x00, 0x00, 0x0f, 0x0f, 0x0f, 0x0f, 0x08, 0x08, 0x08, 0x08, 0x0a, 0x0a, 0x0a, 0x07,
    0x0a, 0x0a, 0x0a, 0x07, 0x0b, 0x0b, 0x0b, 0x07, 0x0e, 0x01, 0x01, 0x04, 0x09, 0x09, 0x09, 0x07,
    0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x09, 0x00, 0x00, 0x04, 0x0b, 0x00, 0x00, 0x0c,
    0x08, 0x08, 0x08, 0x08, 0x05, 0x05, 0x05, 0x08, 0x06, 0x06, 0x06, 0x08, 0x08, 0x08, 0x08, 0x08,
  ],
};

const SHEETS = [
  { file: 'FIXED.DAT',    name: 'fixed',    w: 640, h: 16,  pal: GAME },
  { file: 'MOVING.DAT',   name: 'moving',   w: 320, h: 462, pal: GAME },
  { file: 'PANEL.DAT',    name: 'panel',    w: 320, h: 24,  pal: GAME },
  { file: 'BACK.DAT',     name: 'back',     w: 320, h: 200, pal: 0 },
  { file: 'MENU.DAT',     name: 'menu',     w: 320, h: 200, pal: GAME },
  { file: 'CONTROLS.DAT', name: 'controls', w: 320, h: 200, pal: 0 },
  { file: 'GFX.DAT',      name: 'gfx',      w: 320, h: 200, pal: GAME },
  { file: 'TITLE.DAT',    name: 'title',    w: 320, h: 200, pal: 'title' },
  { file: 'TITLE1.DAT',   name: 'title1',   w: 320, h: 200, pal: 'title1' },
  { file: 'TITLE2.DAT',   name: 'title2',   w: 320, h: 200, pal: 'title2' },
];

// FIXED.DAT is the static tile set, 40 tiles of 16x16 in level-byte order: tile
// n is what a level byte n looks like when nothing is moving.
export const FIXED_NAMES = [
  'space', 'zonk', 'base', 'murphy', 'infotron',
  'ram-chip', 'hardware', 'exit', 'orange-disk', 'port-right',
  'port-down', 'port-left', 'port-up', 'special-port-right', 'special-port-down',
  'special-port-left', 'special-port-up', 'snik-snak', 'yellow-disk', 'terminal',
  'red-disk', 'port-vertical', 'port-horizontal', 'port-cross', 'electron',
  'bug', 'ram-chip-left', 'ram-chip-right', 'hardware-01', 'hardware-02',
  'hardware-03', 'hardware-04', 'hardware-05', 'hardware-06', 'hardware-07',
  'hardware-08', 'hardware-09', 'hardware-10', 'ram-chip-top', 'ram-chip-bottom',
];

const TILE = 16;

// --- PNG ------------------------------------------------------------------

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** An 8-bit indexed PNG. `trns` makes index 0 transparent. */
function png(w, h, pixels, palette, { trns = false } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 3;
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    pixels.copy(raw, y * (w + 1) + 1, y * w, (y + 1) * w);
  }
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from(palette.flat())),
  ];
  if (trns) parts.push(chunk('tRNS', Buffer.from([0])));
  parts.push(chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

// --- decoding ---------------------------------------------------------------

/** Sixteen RGBX entries of 4-bit channels; x17 spreads 0-15 across 0-255. */
function toPalette(bytes) {
  return Array.from({ length: 16 }, (_, i) => [0, 1, 2].map(c => (bytes[i * 4 + c] & 15) * 17));
}

function readPalettes() {
  const buf = readFileSync(join(SRC, 'PALETTES.DAT'));
  const palettes = { 0: null, 1: null, 2: null, 3: null };
  for (let p = 0; p < 4; p++) palettes[p] = toPalette(buf.subarray(p * 64, p * 64 + 64));
  for (const [name, bytes] of Object.entries(TITLE_PALETTES)) palettes[name] = toPalette(bytes);
  return palettes;
}

function decodePlanar(buf, w, h) {
  const pixels = Buffer.alloc(w * h);
  const plane = w / 8;
  for (let y = 0; y < h; y++) {
    const row = y * plane * 4;
    for (let x = 0; x < w; x++) {
      const at = row + (x >> 3);
      const bit = 7 - (x & 7);
      pixels[y * w + x] =
        ((buf[at] >> bit) & 1) |
        (((buf[at + plane] >> bit) & 1) << 1) |
        (((buf[at + plane * 2] >> bit) & 1) << 2) |
        (((buf[at + plane * 3] >> bit) & 1) << 3);
    }
  }
  return pixels;
}

function crop(pixels, w, x0, y0, cw, ch) {
  const out = Buffer.alloc(cw * ch);
  for (let y = 0; y < ch; y++) {
    pixels.copy(out, y * cw, (y0 + y) * w + x0, (y0 + y) * w + x0 + cw);
  }
  return out;
}

/** Nearest-neighbour upscale, for the preview sheets. */
function scale(pixels, w, h, k) {
  const out = Buffer.alloc(w * k * h * k);
  for (let y = 0; y < h * k; y++) {
    for (let x = 0; x < w * k; x++) out[y * w * k + x] = pixels[((y / k) | 0) * w + ((x / k) | 0)];
  }
  return out;
}

function decodeFont(file, cw, ch) {
  const buf = readFileSync(join(SRC, file));
  const cols = 16, rows = 4;
  const w = cols * cw, h = rows * ch;
  const pixels = Buffer.alloc(w * h);
  for (let c = 0; c < 64; c++) {
    const ox = (c % cols) * cw, oy = ((c / cols) | 0) * ch;
    for (let y = 0; y < ch; y++) {
      const bits = buf[c + y * 64];
      for (let x = 0; x < cw; x++) {
        if ((bits >> (7 - x)) & 1) pixels[(oy + y) * w + ox + x] = 1;
      }
    }
  }
  return { w, h, pixels };
}

// --- output -----------------------------------------------------------------

const palettes = readPalettes();
mkdirSync(join(OUT, 'fixed'), { recursive: true });
const manifest = { source: 'Supaplex (1991), Dream Factory / Digital Integration', palettes, sheets: {} };

for (const s of SHEETS) {
  const buf = readFileSync(join(SRC, s.file));
  const pixels = decodePlanar(buf, s.w, s.h);
  const pal = palettes[s.pal];
  writeFileSync(join(OUT, `${s.name}.png`), png(s.w, s.h, pixels, pal));
  manifest.sheets[s.name] = { file: s.file, w: s.w, h: s.h, palette: s.pal };
  if (s.name === 'fixed') {
    FIXED_NAMES.forEach((name, i) => {
      const tile = crop(pixels, s.w, i * TILE, 0, TILE, TILE);
      const file = `fixed/${String(i).padStart(2, '0')}-${name}.png`;
      writeFileSync(join(OUT, file), png(TILE, TILE, tile, pal));
    });
    manifest.sheets.fixed.tiles = FIXED_NAMES.map((name, i) => ({ id: i, name, x: i * TILE, y: 0, w: TILE, h: TILE }));
    // A 10x4 grid at 4x reads far better than one 640px strip.
    const grid = Buffer.alloc(160 * 64);
    for (let i = 0; i < 40; i++) {
      const tile = crop(pixels, s.w, i * TILE, 0, TILE, TILE);
      for (let y = 0; y < TILE; y++) tile.copy(grid, ((i / 10 | 0) * TILE + y) * 160 + (i % 10) * TILE, y * TILE, (y + 1) * TILE);
    }
    writeFileSync(join(OUT, 'preview-fixed-4x.png'), png(640, 256, scale(grid, 160, 64, 4), pal));
  }
  if (s.name === 'moving') {
    writeFileSync(join(OUT, 'preview-moving-2x.png'), png(640, 924, scale(pixels, s.w, s.h, 2), pal));
  }
}

const ink = [[0, 0, 0], [255, 255, 255]];
for (const [file, name, cw, ch] of [['CHARS6.DAT', 'chars6', 6, 8], ['CHARS8.DAT', 'chars8', 8, 8]]) {
  const f = decodeFont(file, cw, ch);
  writeFileSync(join(OUT, `${name}.png`), png(f.w, f.h, f.pixels, ink, { trns: true }));
  writeFileSync(join(OUT, `preview-${name}-4x.png`), png(f.w * 4, f.h * 4, scale(f.pixels, f.w, f.h, 4), ink));
  manifest.sheets[name] = { file, w: f.w, h: f.h, cell: [cw, ch], columns: 16, firstChar: 32, count: 64 };
}

// One strip of sixteen swatches per palette.
const swatch = Buffer.from(Array.from({ length: 16 }, (_, i) => i));
for (const [name, colours] of Object.entries(palettes)) {
  writeFileSync(join(OUT, `palette-${name}.png`), png(256, 16, scale(swatch, 16, 1, 16), colours));
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${Object.keys(manifest.sheets).length} sheets and ${FIXED_NAMES.length} tiles to ${OUT}`);
