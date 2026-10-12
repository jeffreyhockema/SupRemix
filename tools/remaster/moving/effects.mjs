// Everything on the sheet that is not Murphy or a rolling object: explosions,
// sparks, the bug, things being snapped up, disks, the used terminal, electrons
// and snik snaks, and the spare pieces nothing in the game draws.
//
// Where the original frame is a known tile -- shrunk, shifted, sparked over --
// the tile's redraw is used. Where it is loose pixel art with no tile behind it
// (fire, lightning, an infotron coming apart), the pixels are traced and filled
// colour by colour, brightest innermost: each colour's layer covers itself and
// every brighter colour, so smoothing the outlines never opens gaps between
// them, and a hot core stays inside its flame.

import { I, trace, strokes, bbox, loadIndexed } from '../pixels.mjs';
import { P, darken, lighten, group, path, circle, line, raised, bead } from '../svg.mjs';
import { T } from '../fixed.mjs';
import { terminal, findSparkles, sparkles } from '../objects.mjs';

const PAL = ['#000000', P.W, P.Y, P.g, P.G, P.s, P.R, P.m, P.L, P.B, P.n, P.r, P.O, P.d, P.e, P.f];
const FIXED = loadIndexed('assets/original/fixed.png');
const tilePx = id => Array.from({ length: 256 }, (_, i) => FIXED.at(id * 16 + (i % 16), i >> 4));
const tile = name => t => { const s = t.sub(); T[name](s); return s.body.join(''); };

/**
 * Pixels traced in nested layers. `order` lists palette indices from the
 * outermost layer in; a pixel belongs to its own layer and every one before
 * it. `glow` adds a soft bloom under the bright layers.
 */
function layered(t, pts, order, { glow = 0, sigma = 0.55 } = {}) {
  const rank = new Map(order.map((c, i) => [c, i]));
  const out = [];
  for (let i = 0; i < order.length; i++) {
    const layer = pts.filter(([, , c]) => rank.has(c) && rank.get(c) >= i);
    if (!layer.length || !pts.some(([, , c]) => c === order[i])) continue;
    const d = trace(layer, { sigma });
    if (glow && i >= order.length / 2) out.push(path(d, PAL[order[i]], `opacity="${glow}" filter="${t.blur(0.7)}"`));
    out.push(path(d, PAL[order[i]], 'fill-rule="evenodd"'));
  }
  return out.join('');
}

const FIRE = [I.d, I.e, I.f, I.m, I.n, I.r, I.R, I.O, I.Y, I.W];
const ZAP = [I.d, I.e, I.B, I.L, I.s, I.W];
const METAL = [I.d, I.e, I.f, I.m, I.s, I.W];

/** Strands of a coming-apart infotron: each colour family raised like the whole one's. */
function strands(t, pts) {
  const fam = [[[I.g, I.G], P.G], [[I.B, I.L], P.L], [[I.n], P.n], [[I.r, I.R], P.R], [[I.Y, I.O], P.O], [[I.W, I.s, I.m, I.e, I.f, I.d], '#c8c8c8']];
  const beads = [];
  const at = new Map(pts.map(([x, y, c]) => [`${x},${y}`, c]));
  const c = (x, y) => at.get(`${x},${y}`);
  const inBead = new Set();
  for (const [x, y, k] of pts) {
    if (k === I.W && c(x + 1, y) === I.f && c(x, y + 1) === I.f && c(x + 1, y + 1) === I.d) {
      beads.push([x + 1, y + 1]);
      for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) inBead.add(`${x + a},${y + b}`);
    }
  }
  const out = [];
  for (const [cols, face] of fam) {
    const mine = pts.filter(([x, y, k]) => cols.includes(k) && !inBead.has(`${x},${y}`));
    if (!mine.length) continue;
    const d = strokes(mine, { sigma: 1.1 });
    out.push(raised(t, (paint, k) => line(d, paint, 1.0 * k), { face, rim: darken(face, 0.45), shine: '#fff', shineOpacity: 0.5, cast: 0, depth: 0.12 }));
  }
  return out.join('') + beads.map(([x, y]) => bead(t, x, y)).join('');
}

/** A snik snak in any pose, from its pixels. */
function scissors(t, pts) {
  const grey = pts.filter(([, , c]) => METAL.includes(c));
  const red = pts.filter(([, , c]) => c === I.R || c === I.r || c === I.n);
  const out = [];
  if (red.length) {
    // the rings are two pixels thick round a hole, so they are filled shapes, not lines
    const d = trace(red, { sigma: 0.45 });
    const m = t.mask(path(d, '#fff', 'fill-rule="evenodd"'));
    out.push(
      path(d, '#5a0000', 'fill-rule="evenodd" transform="translate(0.15,0.15)"'),
      path(d, P.R, 'fill-rule="evenodd"'),
      group(`mask="${m}"`, path(d, 'none', `stroke="#7a0000" stroke-width="0.5" opacity="0.8" transform="translate(0.18,0.18)"`)),
      group(`mask="${m}"`, path(d, 'none', 'stroke="#ffb8a8" stroke-width="0.4" opacity="0.75" transform="translate(-0.16,-0.16)"')),
    );
  }
  if (grey.length) {
    const outline = trace(grey, { sigma: 0.4 });
    out.push(path(outline, '#000', `opacity="0.4" transform="translate(0.25,0.3)" filter="${t.blur(0.25)}"`));
    out.push(layered(t, grey, METAL, { sigma: 0.4 }));
    const m = t.mask(path(outline, '#fff'));
    out.push(group(`mask="${m}"`, path(outline, 'none', 'stroke="#fff" stroke-width="0.35" opacity="0.45" transform="translate(-0.2,-0.2)"')));
  }
  return out.join('');
}

/** A window's pixels that differ from a tile drawn at the window's origin. */
function diff(orig, [wx, wy, ww, wh], ref) {
  const out = [];
  for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) {
    const c = orig.at(wx + x, wy + y);
    if (c !== (x < 16 && y < 16 ? ref[y * 16 + x] : 0)) out.push([x, y, c]);
  }
  return out;
}

export function place(scene) {
  const { orig } = scene;
  const each = (name, fn) => scene.windows(name).forEach((w, i) => fn(w, i));

  for (const name of ['explosion', 'infotron-explosion']) {
    each(name, w => scene.put(`fire@${w}`, w[0], w[1], t => layered(t, orig.pick(w), FIRE, { glow: 0.6 }), w));
  }
  for (const name of ['zap-a', 'zap-b']) {
    each(name, w => scene.put(`zap@${w}`, w[0], w[1], t => layered(t, orig.pick(w), ZAP, { glow: 0.7, sigma: 0.4 }), w));
  }
  for (const name of ['spare-piece-a', 'spare-hardware', 'spare-piece-b']) {
    each(name, w => scene.put(`piece@${w}`, w[0], w[1], t => layered(t, orig.pick(w), [...METAL, I.R, I.r].reverse().reverse(), { sigma: 0.4 }), w));
  }

  // the bug: a base with a spark crawling over it
  const base = tilePx(2);
  each('bug', w => {
    const spark = diff(orig, w, base).filter(([, , c]) => c);
    scene.put(`bug@${w}`, w[0], w[1], t => tile('base')(t) + (spark.length ? layered(t, spark, ZAP, { glow: 0.8, sigma: 0.4 }) : ''), w);
  });

  // base snapped up: it collapses into rings, raised like the board's traces
  each('base-snap', w => {
    const pts = orig.pick(w);
    if (!pts.length) return;
    if (!diff(orig, w, base).length) { scene.put(`base@${w}`, w[0], w[1], tile('base'), w); return; }
    scene.put(`basesnap@${w}`, w[0], w[1], t => {
      const board = pts.filter(([, , c]) => c === I.g || c === I.G);
      const lit = pts.filter(([, , c]) => c === I.G);
      const out = [];
      if (board.length) out.push(path(trace(board, { sigma: 0.35 }), P.g, 'fill-rule="evenodd"'));
      if (lit.length) {
        // the rings are one-pixel traces, like the board's own
        const d = strokes(lit, { sigma: 0.6 });
        out.push(raised(t, (paint, k) => line(d, paint, k, 'stroke-linecap="square"'), { face: P.G, rim: '#007a46', shine: '#7dffbb', shineOpacity: 0.4, shineWidth: 0.28, cast: 0.22 }));
      }
      for (const [x, y] of pts.filter(([, , c]) => c === I.W)) out.push(circle(x + 0.7, y + 0.7, 0.55, t.rad(x + 0.5, y + 0.5, 0.9, [[0, '#fff'], [0.5, '#bbb'], [1, '#666']])));
      return out.join('');
    }, w);
  });

  // an infotron snapped up: its strands come apart
  for (const name of ['infotron-snap', 'infotron-snap-spare']) {
    each(name, w => { const pts = orig.pick(w); if (pts.length) scene.put(`isnap@${w}`, w[0], w[1], t => strands(t, pts), w); });
  }

  // disks: the tile, scaled to whatever size the frame has it at
  const disks = [['red-disk-snap', 'red-disk'], ['red-disk-planted', 'red-disk'], ['orange-disk-fall', 'orange-disk'], ['spare-yellow-disk', 'yellow-disk']];
  for (const [name, kind] of disks) {
    each(name, w => {
      const pts = orig.pick(w);
      if (!pts.length) return;
      const [x0, y0, x1, y1] = bbox(pts);
      const sx = (x1 - x0) / 16, sy = (y1 - y0) / 16;
      scene.put(`${kind}@${w[0] + x0},${w[1] + y0},${sx}`, w[0] + x0, w[1] + y0,
        t => group(`transform="scale(${sx},${sy})"`, tile(kind)(t)), w);
    });
  }

  // the terminal as it looks once used
  each('terminal-active', w => {
    const px = Array.from({ length: 256 }, (_, i) => orig.at(w[0] + (i % 16), w[1] + (i >> 4)));
    scene.put(`terminal@${w}`, w[0], w[1], t => terminal(t, px), w);
  });

  // snik snaks: closed or scissoring, in every direction -- the blades as
  // metal, the finger rings and shanks as red tubes
  for (const name of Object.keys(scene.anims).filter(n => n.startsWith('snik-snak'))) {
    each(name, w => { const pts = orig.pick(w); if (pts.length) scene.put(`snik@${w}`, w[0], w[1], t => scissors(t, pts), w); });
  }

  // electrons: every sparkle in every frame, found and redrawn
  for (const name of Object.keys(scene.anims).filter(n => n.startsWith('electron'))) {
    each(name, w => { const pts = orig.pick(w); if (pts.length) scene.put(`electron@${w}`, w[0], w[1], t => sparkles(t, findSparkles(pts)), w); });
  }
}

export { layered, PAL, lighten };
