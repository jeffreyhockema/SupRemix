// Rasterises the remastered tiles with headless Chrome.
// Run with `npm run remaster`.
//
// Writes, under assets/remaster/:
//   fixed/NN-name.svg      the masters (from tools/remaster/fixed.mjs)
//   fixed-256/NN-name.png  each tile at 256x256, transparent where the original was space
//   fixed-atlas.png        all 40 in FIXED.DAT order, 10 across, 256px cells
//   compare-fixed.png      original (pixel-doubled) beside remaster, on black
//
// Chrome does the rasterising (tools/remaster/chrome.mjs).

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './chrome.mjs';
import { build, NAMES } from './fixed.mjs';

const ROOT = 'assets/remaster';
const SIZE = 256;

const svgs = build(join(ROOT, 'fixed'));
mkdirSync(join(ROOT, 'fixed-256'), { recursive: true });

const cols = 10, rows = Math.ceil(NAMES.length / cols);
const atlasHtml = join(ROOT, '.atlas.html');
writeFileSync(atlasHtml, `<!doctype html><style>html,body{margin:0;background:transparent}
.g{display:grid;grid-template-columns:repeat(${cols},${SIZE}px);grid-auto-rows:${SIZE}px}
img{width:${SIZE}px;height:${SIZE}px;display:block}</style>
<div class="g">${svgs.map(f => `<img src="fixed/${f.split(/[\\/]/).pop()}">`).join('')}</div>`);

const label = n => n.replace(/-/g, ' ');
const compareHtml = join(ROOT, '.compare.html');
writeFileSync(compareHtml, `<!doctype html><style>
html,body{margin:0;background:#111;color:#bbb;font:14px/1.2 system-ui,sans-serif}
.g{display:grid;grid-template-columns:repeat(5,300px);gap:18px 14px;padding:20px}
.c{display:flex;flex-direction:column;gap:6px}
.p{display:flex;gap:8px;background:#000;padding:8px;border-radius:6px}
img{width:138px;height:138px;display:block}
.o{image-rendering:pixelated}
.n{color:#888}.n b{color:#ddd;font-weight:600}</style>
<div class="g">${NAMES.map((n, i) => `<div class="c"><div class="p">
<img class="o" src="../original/fixed/${String(i).padStart(2, '0')}-${n}.png"><img src="fixed/${String(i).padStart(2, '0')}-${n}.svg"></div>
<div class="n"><b>${i}</b> ${label(n)}</div></div>`).join('')}</div>`);

const chrome = await launch();
try {
  const W = cols * SIZE, H = rows * SIZE;
  const clips = NAMES.map((_, i) => ({ x: (i % cols) * SIZE, y: Math.floor(i / cols) * SIZE, width: SIZE, height: SIZE }));
  const [atlas, ...tiles] = await chrome.shoot(atlasHtml, W, H, [{ x: 0, y: 0, width: W, height: H }, ...clips]);
  writeFileSync(join(ROOT, 'fixed-atlas.png'), atlas);
  tiles.forEach((png, i) => writeFileSync(join(ROOT, 'fixed-256', svgs[i].split(/[\\/]/).pop().replace(/\.svg$/, '.png')), png));
  const cRows = Math.ceil(NAMES.length / 5);
  const [compare] = await chrome.shoot(compareHtml, 5 * 300 + 4 * 14 + 40, cRows * (154 + 6 + 18 + 18) + 40);
  writeFileSync(join(ROOT, 'compare-fixed.png'), compare);
} finally {
  await chrome.close();
  rmSync(atlasHtml, { force: true });
  rmSync(compareHtml, { force: true });
}
console.log(`rendered ${NAMES.length} tiles to ${ROOT}`);
