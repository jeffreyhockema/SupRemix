// Packs the remastered graphics into the atlas the game loads.
// Run with `npm run remaster:game` (after `npm run remaster` and `remaster:moving`).
//
// Writes assets/game/remaster.png and assets/game/remaster.json, then packs
// them into public/packs/gfx.pak (tools/pack-assets.mjs). Every sprite is
// cut from the HD renders -- the 40 tiles, and windows of the animation sheet --
// and brought down to CELL pixels per original 16, which covers the largest
// tile the board usually draws (the close view's ~60-80 CSS px). The downscale averages area with
// premultiplied alpha, so transparent edges do not pick up a dark fringe.
//
// A sprite is a list of frames of one size, w x h in original pixels. Most are
// one cell. The moves that the original draws as a window over two or three
// cells -- Murphy walking, eating, pushing -- keep that window, with `anchor`
// saying which cell of it the mover ends up in, so the game can lay the window
// over the board exactly where the original would.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { decode, encode } from './png.mjs';
import { loadIndexed, bbox, centroid, I } from './pixels.mjs';
import { ANIMATIONS } from './frames.mjs';
import { NAMES as TILE_NAMES } from './fixed.mjs';
import { measureZonk, measureInfotron } from './moving/rolling.mjs';
import { packGroup } from '../pack-assets.mjs';

const CELL = 128;
const K = CELL / 16;          // atlas pixels per original pixel
const ATLAS_W = 2048;
const OUT = 'assets/game';

const orig = loadIndexed('assets/original/moving.png');
const sheet = decode(readFileSync('assets/remaster/moving-16x.png'));
const tiles = TILE_NAMES.map((n, i) => decode(readFileSync(`assets/remaster/fixed-256/${String(i).padStart(2, '0')}-${n}.png`)));
const anim = Object.fromEntries(ANIMATIONS.map(a => [a.name, a]));

/** Area-average a source rect (in source pixels, may be fractional) down to dw x dh, premultiplied. */
function shrink(img, sx, sy, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const fx = sw / dw, fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = sy + y * fy, y1 = y0 + fy;
    for (let x = 0; x < dw; x++) {
      const x0 = sx + x * fx, x1 = x0 + fx;
      let r = 0, g = 0, b = 0, a = 0, area = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        const wy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const wx = Math.min(x1, xx + 1) - Math.max(x0, xx);
          const w = wx * wy;
          area += w;
          if (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h) continue;
          const o = (yy * img.w + xx) * 4, al = img.rgba[o + 3] / 255;
          r += img.rgba[o] * al * w; g += img.rgba[o + 1] * al * w; b += img.rgba[o + 2] * al * w; a += al * w;
        }
      }
      const o = (y * dw + x) * 4;
      if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
      out[o + 3] = Math.round(255 * a / area);
    }
  }
  return out;
}

// --- what goes in ------------------------------------------------------------

const sprites = {};   // key -> { w, h, anchor?, extra?, frames: [rgba...] }
const add = (key, w, h, frames, more = {}) => { sprites[key] = { w, h, ...more, frames }; };
const fromSheet = (x, y, w, h) => shrink(sheet, x * 16, y * 16, w * 16, h * 16, Math.round(w * K), Math.round(h * K));

// the 40 tiles, by their FIXED.DAT number
tiles.forEach((img, i) => add(`tile-${i}`, 16, 16, [shrink(img, 0, 0, img.w, img.h, CELL, CELL)]));

// Cut whole windows of these, as the original draws them.
const WINDOWS = [
  'murphy-left', 'murphy-right', 'murphy-eat-base-left', 'murphy-eat-base-right',
  'murphy-eat-infotron-left', 'murphy-eat-infotron-right', 'murphy-eat-red-disk-left', 'murphy-eat-red-disk-right',
  'murphy-push-zonk-left', 'murphy-push-zonk-right', 'murphy-push-orange-disk-left', 'murphy-push-orange-disk-right',
  'murphy-push-yellow-disk-left', 'murphy-push-yellow-disk-right', 'murphy-push-yellow-disk-up', 'murphy-push-yellow-disk-down',
  'murphy-port-left-in', 'murphy-port-left-out', 'murphy-port-right-in', 'murphy-port-right-out',
  'murphy-port-up-in', 'murphy-port-up-out', 'murphy-port-down-in', 'murphy-port-down-out',
  'murphy-exit', 'murphy-yawn', 'murphy-doze-a', 'murphy-doze-b', 'murphy-shove-left', 'murphy-shove-right',
  'murphy-look-left', 'murphy-look-right', 'murphy-strain-left', 'murphy-strain-right',
  'explosion', 'infotron-explosion', 'bug', 'base-snap', 'infotron-snap', 'red-disk-snap', 'terminal-active',
  'electron-turn',
];
const MURPHY = c => c === I.R || c === I.r;
for (const name of WINDOWS) {
  const a = anim[name];
  const more = {};
  if (a.w > 16 || a.h > 16) {
    // which cell of the window Murphy finishes in: where most of his red is in
    // the last frame (a zonk's band is red too, but it is a sliver of him)
    const [x, y] = a.frames.at(-1);
    const [cx, cy] = centroid(orig.pick([x, y, a.w, a.h], MURPHY));
    more.anchor = [Math.min(Math.floor(cx / 16), a.w / 16 - 1), Math.min(Math.floor(cy / 16), Math.floor(a.h / 16) - 1)];
    if (a.w === 16 && a.h === 18) more.anchor = [0, 0];
  }
  add(name, a.w, a.h, a.frames.map(([x, y]) => fromSheet(x, y, a.w, a.h)), more);
}

// Vertical moves: the original's 16x18 windows ride along with Murphy, so only
// the cell he is drawn in matters. Cut it where his body is.
for (const name of ['murphy-up-facing-left', 'murphy-up-facing-right', 'murphy-down-facing-left', 'murphy-down-facing-right']) {
  const a = anim[name];
  add(name, 16, 16, a.frames.map(([x, y]) => {
    const [, y0] = bbox(orig.pick([x, y, a.w, a.h]));
    return fromSheet(x, y + Math.min(y0, a.h - 16), 16, 16);
  }));
}

// Rolling zonks: the cell the zonk is in at each band angle.
add('zonk-roll', 16, 16, [3, 2, 1, 0].map(i => {
  const [x, y] = anim['zonk-roll-left'].frames[i];
  const z = measureZonk(orig, [x, y, 32, 16]);
  return fromSheet(z.x, z.y, 16, 16);
}), { angles: [0, 45, 90, 135] });

// Rolling infotrons: the cell round each fitted centre, both ways round.
for (const dir of ['left', 'right']) {
  const a = anim[`infotron-roll-${dir}`];
  add(`infotron-roll-${dir}`, 16, 16, a.frames.map(([x, y]) => {
    const f = measureInfotron(orig, [x, y, 32, 16]);
    const cx = Math.round(f.cx * 2) / 2, cy = Math.round(f.cy * 2) / 2;
    return fromSheet(x + cx - 8, y + cy - 8, 16, 16);
  }));
}

// Snik snaks: which way each frame points, measured from finger rings to blade tips.
const METAL = [I.d, I.e, I.f, I.m, I.s, I.W];
const heading = (x, y, w, h) => {
  const red = orig.pick([x, y, w, h], c => c === I.R || c === I.r || c === I.n);
  const grey = orig.pick([x, y, w, h], c => METAL.includes(c));
  const [rx, ry] = centroid(red), [gx, gy] = centroid(grey);
  return (Math.round(Math.atan2(gx - rx, ry - gy) * 180 / Math.PI / 45) * 45 + 360) % 360;
};
{
  const a = anim['snik-snak-turn'];
  add('snik-snak-turn', 16, 16, a.frames.map(([x, y]) => fromSheet(x, y, 16, 16)), { headings: a.frames.map(([x, y]) => heading(x, y, 16, 16)) });
}
// Moving snik snaks, one sprite per way of going: horizontal windows whole,
// vertical ones cut to the cell, like Murphy's.
for (const g of ['a', 'b', 'c', 'd']) {
  const a = anim[`snik-snak-move-${g}`];
  const hs = a.frames.map(([x, y]) => heading(x, y, a.w, a.h));
  const dir = ['up', 'right', 'down', 'left'][Math.round(hs[0] / 90) % 4];
  if (a.h === 18) {
    add(`snik-snak-${dir}`, 16, 16, a.frames.map(([x, y]) => {
      const [, y0] = bbox(orig.pick([x, y, a.w, a.h]));
      return fromSheet(x, y + Math.min(y0, 2), 16, 16);
    }));
  } else {
    const [x, y] = a.frames.at(-1);
    const [x0] = bbox(orig.pick([x, y, a.w, a.h]));
    add(`snik-snak-${dir}`, a.w, a.h, a.frames.map(([fx, fy]) => fromSheet(fx, fy, a.w, a.h)), { anchor: [Math.round(x0 / 16), 0] });
  }
}

// --- packing -----------------------------------------------------------------

const placed = [];
let px = 0, py = 0, rowH = 0;
for (const [key, s] of Object.entries(sprites)) {
  const fw = Math.round(s.w * K), fh = Math.round(s.h * K);
  s.rects = s.frames.map(() => {
    if (px + fw > ATLAS_W) { px = 0; py += rowH; rowH = 0; }
    const r = [px, py];
    px += fw; rowH = Math.max(rowH, fh);
    return r;
  });
  placed.push([key, s, fw, fh]);
}
const H = py + rowH;
const atlas = Buffer.alloc(ATLAS_W * H * 4);
for (const [, s, fw, fh] of placed) {
  s.frames.forEach((rgba, f) => {
    const [ax, ay] = s.rects[f];
    for (let y = 0; y < fh; y++) rgba.copy(atlas, ((ay + y) * ATLAS_W + ax) * 4, y * fw * 4, (y + 1) * fw * 4);
  });
}
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'remaster.png'), encode(ATLAS_W, H, atlas));
const meta = { cell: CELL, sprites: {} };
for (const [key, s] of Object.entries(sprites)) {
  const { frames, rects, ...rest } = s;
  meta.sprites[key] = { ...rest, frames: rects };
}
writeFileSync(join(OUT, 'remaster.json'), JSON.stringify(meta) + '\n');
const n = Object.values(sprites).reduce((s, x) => s + x.frames.length, 0);
console.log(`packed ${Object.keys(sprites).length} sprites (${n} frames) into ${ATLAS_W}x${H}`);
packGroup('gfx');
