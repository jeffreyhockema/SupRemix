// Murphy as the original draws him in any pose, read from its pixels.
//
// Murphy is posed in well over a hundred hand-drawn frames -- profile, three-
// quarter, chomping, straining, yawning, shrinking -- and no handful of
// parameters reproduces them all. So each frame is read for its features and
// each feature is redrawn in the remaster's materials:
//
//   silhouette   every pixel of him, traced smooth; the red body fills it
//   highlight    the orange and yellow pixels, as a soft glow inside it
//   shade        the dark red, as soft shadow
//   creases      the brown, as soft dark lines (mouth, strain, brow)
//   eyes         each white glint, with the dark pupil and grey rim beside it
//   jaw / teeth  grey pixels that are not an eye, as metal
//   mouth        black enclosed by his outline, as a dark cavity
//
// The result is the frame's own drawing, smoothed and lit, rather than a
// generic Murphy turned to roughly the right angle.

import { I, trace, components, hull } from '../pixels.mjs';
import { P, group, path, circle } from '../svg.mjs';

const REDS = [I.R, I.r, I.n, I.O, I.Y];
const GREYS = [I.d, I.e, I.f, I.m, I.s];
const N8 = [[-1, 0], [1, 0], [0, 1], [0, -1], [-1, 1], [1, 1], [-1, -1], [1, -1]];

/** Splits a cell's pixels ([x, y, c] in cell coordinates) into Murphy's features. */
export function readBall(pts) {
  const at = new Map(pts.map(([x, y, c]) => [`${x},${y}`, c]));
  const c = (x, y) => at.get(`${x},${y}`) ?? 0;
  const key = (x, y) => `${x},${y}`;
  // eyes: a white glint with dark or grey beside it
  const eyes = [];
  const eyePix = new Set();
  for (const [x, y, k] of pts) {
    if (k !== I.W) continue;
    const near = N8.map(([dx, dy]) => [x + dx, y + dy, c(x + dx, y + dy)]);
    const dark = near.filter(([, , k2]) => k2 === I.K);
    const grey = near.filter(([, , k2]) => GREYS.includes(k2));
    const pupil = dark.length ? dark.reduce((s, [a, b]) => [s[0] + (a + 0.5) / dark.length, s[1] + (b + 0.5) / dark.length], [0, 0]) : null;
    eyes.push({ glint: [x + 0.5, y + 0.5], pupil });
    eyePix.add(key(x, y));
    for (const [a, b] of [...dark, ...grey]) eyePix.add(key(a, b));
  }
  const solid = new Set(pts.filter(([, , k]) => k !== I.K).map(([x, y]) => key(x, y)));
  // black that the outline encloses: pupils, and a mouth open toward the viewer
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs) - 1, Math.max(...xs) + 1, Math.min(...ys) - 1, Math.max(...ys) + 1];
  const outside = new Set([key(x0, y0)]);
  const stack = [[x0, y0]];
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || outside.has(k) || solid.has(k)) continue;
      outside.add(k); stack.push([nx, ny]);
    }
  }
  const holes = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = key(x, y);
    if (!solid.has(k) && !outside.has(k)) holes.push([x, y]);
  }
  const of = list => pts.filter(([, , k]) => list.includes(k)).map(([x, y]) => [x, y]);
  // grey that is not an eye is his jaw or teeth -- unless it is a speck on his
  // rim, which the original uses as a highlight
  const greys = components(pts.filter(([x, y, k]) => GREYS.includes(k) && !eyePix.has(key(x, y))).map(([x, y]) => [x, y]));
  const jaw = greys.filter(g => g.length >= 3).flat();
  const specks = greys.filter(g => g.length < 3).flat();
  // a mouth open sideways is black that his outline does not quite enclose:
  // black inside his overall hull, touching both him and his jaw
  const whole = pts.filter(([, , k]) => k !== I.K).map(([x, y]) => [x, y]);
  const h = hull(whole);
  const jawSet = new Set(jaw.map(([x, y]) => key(x, y)));
  const gap = [];
  if (jaw.length) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (solid.has(key(x, y)) || !h.inside([x, y])) continue;
      const near = N8.map(([dx, dy]) => key(x + dx, y + dy));
      if (near.some(k => jawSet.has(k)) && near.some(k => solid.has(k) && !jawSet.has(k))) gap.push([x, y]);
    }
  }
  return {
    eyes, jaw,
    silhouette: [...pts.filter(([, , k]) => REDS.includes(k) || k === I.W).map(([x, y]) => [x, y]),
      ...holes, ...specks, ...[...eyePix].map(s => s.split(',').map(Number))],
    glow: of([I.O, I.Y]), hot: of([I.Y]), shade: of([I.r, I.n]), crease: of([I.n]),
    cavity: [...holes.filter(([x, y]) => !eyePix.has(key(x, y))), ...gap],
    box: [x0 + 1, y0 + 1, x1, y1],
  };
}

/** Draws a ball read by readBall, in the cell's coordinates shifted by (dx, dy). */
export function drawBall(t, f, { dx = 0, dy = 0 } = {}) {
  const tr = (pts, smooth = 2) => pts.length ? trace(pts, { smooth, dx, dy }) : '';
  const sil = f.silhouette.length ? trace(f.silhouette, { sigma: 1.7, dx, dy }) : '';
  if (!sil) return '';
  const out = [];
  // the open mouth sits behind him, so it never shows the background through
  if (f.cavity.length) out.push(path(trace(f.cavity, { sigma: 0.5, dx, dy }), '#160000'));
  // lit from the top-left like the tile, whatever way he is facing
  const [bx0, by0, bx1, by1] = f.box;
  const [w, h] = [bx1 - bx0, by1 - by0];
  const lx = bx0 + dx + w * 0.35, ly = by0 + dy + h * 0.3;
  out.push(path(sil, t.rad(lx, ly, Math.max(w, h) * 0.85, [[0, '#ff3a26'], [0.35, P.R], [0.75, '#d00a0a'], [1, '#9a0000']]), 'fill-rule="evenodd"'));
  const inside = [];
  if (f.shade.length) inside.push(path(tr(f.shade), '#a80000', `opacity="0.9" filter="${t.blur(0.55)}"`));
  if (f.crease.length) inside.push(path(tr(f.crease, 1), '#4a1400', `opacity="0.9" filter="${t.blur(0.18)}"`));
  if (f.glow.length) inside.push(path(tr(f.glow), P.O, `opacity="0.95" filter="${t.blur(0.55)}"`));
  if (f.hot.length) inside.push(path(tr(f.hot), '#ffff70', `opacity="0.95" filter="${t.blur(0.45)}"`));
  // a darkened rim, so it reads as a ball rather than a disc
  inside.push(path(sil, 'none', `fill-rule="evenodd" stroke="#4a0000" stroke-width="0.9" opacity="0.45" filter="${t.blur(0.35)}"`));
  out.push(group(`clip-path="${t.clip(path(sil, '#000', 'fill-rule="evenodd"'))}"`, inside));
  if (f.jaw.length) {
    const j = tr(f.jaw);
    const ys = f.jaw.map(p => p[1]);
    const [a, b] = [Math.min(...ys) + dy, Math.max(...ys) + 1 + dy];
    out.push(path(j, t.lin(0, a, 0, b, [[0, '#5a5a5a'], [0.35, '#7a7a7a'], [0.7, '#8e8e8e'], [1, '#6a6a6a']])));
    out.push(path(j, 'none', 'stroke="#2a2a2a" stroke-width="0.18" opacity="0.6"'));
  }
  for (const e of f.eyes) {
    const [gx, gy] = [e.glint[0] + dx, e.glint[1] + dy];
    const [px, py] = e.pupil ? [e.pupil[0] + dx, e.pupil[1] + dy] : [gx, gy + 0.6];
    const cx = (gx + px) / 2, cy = (gy + py) / 2;
    out.push(`<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="0.95" ry="1.0" fill="${t.rad(cx, cy + 0.4, 1.3, [[0, '#9a9a9a'], [0.5, '#555'], [1, '#1e1e1e']])}"/>`);
    out.push(`<ellipse cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" rx="0.55" ry="0.62" fill="#040404"/>`);
    out.push(circle(gx, gy, 0.32, '#fff'));
  }
  return out.join('');
}
