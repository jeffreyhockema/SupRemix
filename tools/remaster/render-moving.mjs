// Renders the remastered animation sheet and cuts it into frames.
// Run with `npm run remaster:moving`.
//
// Writes, under assets/remaster/:
//   moving.svg               the master: MOVING.DAT's layout, redrawn
//   moving-16x.png           that sheet at 16x (5120x7392), transparent where the original is space
//   moving/<animation>/NN.png every frame at 16x, cut from the sheet by tools/remaster/frames.mjs
//   moving/manifest.json     animations -> frame files, sizes and per-frame movement
//   compare-moving.png       each animation's original frames above its remastered ones
//
// Pass animation names (or prefixes) to compare just those: `npm run remaster:moving -- zonk murphy-left`.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './chrome.mjs';
import { decode, encode, crop } from './png.mjs';
import { ANIMATIONS } from './frames.mjs';
import { buildSheet, uncovered, SHEET_W, SHEET_H } from './moving.mjs';

const ROOT = 'assets/remaster';
const K = 16;
const only = process.argv.slice(2);

const { sheet, placed, orig } = await buildSheet();
writeFileSync(join(ROOT, 'moving.svg'), sheet.svg(K));
const left = uncovered(orig, placed);

const page = (name, body, style = '') => {
  const file = join(ROOT, `.${name}.html`);
  writeFileSync(file, `<!doctype html><style>html,body{margin:0;background:transparent}${style}</style>${body}`);
  return file;
};

const chrome = await launch();
let hd;
try {
  const [png] = await chrome.shoot(page('sheet', `<img src="moving.svg" style="display:block;width:${SHEET_W * K}px;height:${SHEET_H * K}px">`), SHEET_W * K, SHEET_H * K);
  writeFileSync(join(ROOT, 'moving-16x.png'), png);
  hd = decode(png);

  // frames
  rmSync(join(ROOT, 'moving'), { recursive: true, force: true });
  const manifest = { scale: K, sheet: 'moving-16x.png', animations: {} };
  for (const a of ANIMATIONS) {
    mkdirSync(join(ROOT, 'moving', a.name), { recursive: true });
    manifest.animations[a.name] = {
      width: a.w * K, height: a.h * K, ...(a.step ? { stepPerFrame: a.step.map(v => v * K) } : {}),
      frames: a.frames.map(([x, y], i) => {
        const file = `${a.name}/${String(i).padStart(2, '0')}.png`;
        writeFileSync(join(ROOT, 'moving', file), encode(a.w * K, a.h * K, crop(hd, x * K, y * K, a.w * K, a.h * K)));
        return { file, sheet: [x * K, y * K] };
      }),
    };
  }
  writeFileSync(join(ROOT, 'moving', 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');

  // comparison: original above, remaster below, at 4x
  const Z = 4;
  const pick = only.length ? ANIMATIONS.filter(a => only.some(o => a.name.startsWith(o))) : ANIMATIONS;
  const cell = (src, sw, sh, [x, y], w, h, pixelated) =>
    `<div style="width:${w * Z}px;height:${h * Z}px;background:url(${src}) -${x * Z}px -${y * Z}px/${sw * Z}px ${sh * Z}px no-repeat;${pixelated ? 'image-rendering:pixelated;' : ''}"></div>`;
  const rows = pick.map(a => `<div class="a"><div class="n">${a.name}</div>
<div class="r">${a.frames.map(f => cell('../original/moving.png', SHEET_W, SHEET_H, f, a.w, a.h, true)).join('')}</div>
<div class="r">${a.frames.map(f => cell('moving-16x.png', SHEET_W, SHEET_H, f, a.w, a.h, false)).join('')}</div></div>`).join('');
  const W = 1600;
  const file = page('compare', `<div class="w">${rows}</div>`,
    `body{background:#111;color:#aaa;font:13px system-ui,sans-serif}.w{width:${W - 24}px;padding:12px}.a{margin:0 0 14px}.n{margin:0 0 4px}
.r{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 4px}.r>div{background-color:#000;outline:1px solid #333}`);
  const rowsH = pick.reduce((s, a) => {
    const perRow = Math.max(1, Math.floor((W - 24) / (a.w * Z + 4)));
    return s + 2 * Math.ceil(a.frames.length / perRow) * (a.h * Z + 4) + 40;
  }, 40);
  const [cmp] = await chrome.shoot(file, W, rowsH);
  writeFileSync(join(ROOT, 'compare-moving.png'), cmp);
} finally {
  await chrome.close();
  for (const n of ['sheet', 'compare']) rmSync(join(ROOT, `.${n}.html`), { force: true });
}
const frames = ANIMATIONS.reduce((s, a) => s + a.frames.length, 0);
console.log(`rendered ${ANIMATIONS.length} animations (${frames} frames); ${left} original pixels not yet redrawn`);
