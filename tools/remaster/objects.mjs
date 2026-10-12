// The game's objects as parametric drawings, shared by the fixed tiles and the
// animation sheet. Each returns SVG markup in a 16x16 cell's own coordinates;
// the caller places it.
//
// When an object turns -- a zonk rolling, an infotron tumbling -- its geometry
// turns and its lighting does not: the highlight stays at the top-left, as it
// does in the original's hand-drawn rotations. So these take an angle and work
// out where the light falls, rather than rotating a finished drawing.

import { P, darken, lighten, f2, rect, poly, path, circle, line, group, raised, bead } from './svg.mjs';

const rad = d => d * Math.PI / 180;
const LIGHT = [-Math.SQRT1_2, -Math.SQRT1_2]; // direction the light comes from

/** A rounded bar from `a` to `b` (each [x, y]) of the given width, as a path in world coordinates. */
function bar([ax, ay], [bx, by], width, r = width / 2) {
  const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
  const nx = -uy * width / 2, ny = ux * width / 2;
  const k = Math.min(r, width / 2, len / 2);
  // corners, inset by k along the bar so the ends can be rounded
  const p = (t, s) => [ax + ux * t + (s * nx), ay + uy * t + (s * ny)];
  const [a1, a2, b1, b2] = [p(k, -1), p(len - k, -1), p(len - k, 1), p(k, 1)];
  const c = q => q.map(f2).join(',');
  // the end caps are half-ellipses whose axes turn with the bar
  const tilt = f2(Math.atan2(uy, ux) * 180 / Math.PI);
  return `M${c(a1)} L${c(a2)} A${f2(k)},${f2(width / 2)} ${tilt} 0 1 ${c(b1)} L${c(b2)} A${f2(k)},${f2(width / 2)} ${tilt} 0 1 ${c(a1)} Z`;
}

/**
 * A zonk. `angle` is the band's direction in degrees, 0 = horizontal, turning
 * clockwise on screen; only 0/45/90/135 occur, and the band is symmetric.
 */
export function zonk(t, { angle = 0 } = {}) {
  const a = rad(angle);
  const u = [Math.cos(a), Math.sin(a)];
  // the band's normal that points away from the light: that side is the far hemisphere
  let v = [-u[1], u[0]];
  if (v[0] * LIGHT[0] + v[1] * LIGHT[1] > 0) v = [-v[0], -v[1]];
  // along the band, the end nearer the light
  const toLight = u[0] * LIGHT[0] + u[1] * LIGHT[1] > 0 ? u : [-u[0], -u[1]];
  const at = (s, n) => [8 + u[0] * s + v[0] * n, 8 + u[1] * s + v[1] * n];
  const half = (sign) => {
    // half-plane on one side of the band strip, as a big polygon
    const far = 30;
    const pts = [at(-far, sign * 1), at(far, sign * 1), at(far, sign * far), at(-far, sign * far)];
    return `<polygon points="${pts.map(q => q.map(f2).join(',')).join(' ')}"/>`;
  };
  const near = t.clip(half(-1)), farSide = t.clip(half(1));
  // the notches: the groove shows where the band stops short of the outline
  const notch = t.mask(`<rect x="-4" y="-4" width="24" height="24" fill="#fff"/>` +
    path(bar(at(6, 0), at(9.5, 0), 2.05, 0.2), '#000') + path(bar(at(-6, 0), at(-9.5, 0), 2.05, 0.2), '#000'));
  // In the upright tile the far hemisphere is lit just past the groove on the light's side.
  const fc = [8 + toLight[0] * 1.8 + v[0] * 1.4, 8 + toLight[1] * 1.8 + v[1] * 1.4];
  const groove = (sign, from, to, a0, a1) => {
    const p1 = at(0, sign * from), p2 = at(0, sign * to);
    return path(bar(at(-9, sign * (from + to) / 2), at(9, sign * (from + to) / 2), Math.abs(to - from), 0),
      t.lin(...p1, ...p2, [[0, '#000', a0], [1, '#000', a1]]));
  };
  const end1 = at(-6, 0), end2 = at(6, 0);
  return group(`mask="${notch}"`, [
    circle(8, 8, 7.95, t.rad(5.4, 4.3, 11.5, [[0, '#dcdcdc'], [0.13, '#bdbdbd'], [0.33, '#9b9b9b'], [0.56, '#848484'], [0.78, '#6c6c6c'], [1, '#4a4a4a']]), `clip-path="${near}"`),
    circle(8, 8, 7.95, t.rad(...fc, 9.5, [[0, '#939393'], [0.3, '#868686'], [0.62, '#727272'], [1, '#474747']]), `clip-path="${farSide}"`),
    group(`clip-path="${near}"`, groove(-1, 2.4, 1, 0, 0.35)),
    group(`clip-path="${farSide}"`, groove(1, 1, 2, 0.4, 0)),
    `<ellipse cx="5.7" cy="4.6" rx="2.4" ry="1.5" transform="rotate(-28 5.7 4.6)" fill="${t.rad(5.7, 4.6, 2.4, [[0, '#fff', 0.85], [0.5, '#fff', 0.3], [1, '#fff', 0]])}"/>`,
    // the glowing band, its length shaded hot in the middle, its width lit on the light's side
    path(bar(end1, end2, 2, 0.45), t.lin(...end1, ...end2, [[0, P.n], [0.07, P.r], [0.17, P.R], [0.29, P.O], [0.42, P.Y], [0.58, P.Y], [0.71, P.O], [0.83, P.R], [0.93, P.r], [1, P.n]])),
    path(bar(end1, end2, 2, 0.45), t.lin(...at(0, -1), ...at(0, 1), [[0, '#fff', 0.45], [0.4, '#fff', 0.05], [0.6, '#000', 0], [1, '#000', 0.35]])),
  ]);
}

// The infotron's strands, upright: one closed trefoil whose colour changes
// along its length. Lobes centre on (8,4), (4,12) and (12,12), radius 3.5.
const STRANDS = [
  // [path, gradient (x1,y1,x2,y2, stops), extra]
  ['M11.4,15.45 C9.6,14.6 9.2,13.6 8.6,12.4 S7.2,10.3 6.6,9.2 S5.7,7.6 5.6,6.9', [0, 15.5, 0, 7, [[0, P.r], [0.45, '#a03000'], [1, P.n]]]],
  'gap:blue',
  ['M10.4,6.9 C9.9,9.2 8.6,11.2 7.5,12.6 S5.6,15 4.4,15.5', [10, 7, 4.5, 15.5, [[0, P.L], [0.45, '#6a80ea'], [1, P.B]]]],
  ['M5.6,6.9 A3.5,3.5 0 1 1 10.4,6.9', [4, 0.5, 11, 7, [[0, '#10d078'], [0.5, P.G], [1, P.g]]]],
  ['M4.4,15.48 A3.5,3.5 0 1 1 4,8.5', [0.5, 9, 3, 15.5, [[0, '#ffffff'], [0.3, '#d4d4d4'], [0.7, '#8e8e8e'], [1, '#666666']]]],
  ['M12,8.5 A3.5,3.5 0 1 1 11.4,15.45', [13, 8.5, 12, 15.5, [[0, P.R], [0.55, '#d80a0a'], [1, P.r]]]],
  'gap:band',
  ['M4,8.5 H12', [3, 0, 13, 0, [[0, '#d4d4d4'], [0.08, P.Y], [0.28, P.Y], [0.36, P.O], [0.78, P.O], [0.9, P.R], [1, P.R]]], 'stroke-linecap="butt"'],
];
export const INFOTRON_BEADS = [[8, 4], [4, 12], [12, 12]];

/**
 * An infotron, turned `angle` degrees clockwise about its cell centre and then
 * moved so that centre lands on (cx, cy). The beads keep their highlight at the
 * top-left whichever way the knot is turned.
 */
export function infotron(t, { angle = 0, cx = 8, cy = 8 } = {}) {
  const turn = `translate(${f2(cx)},${f2(cy)}) rotate(${f2(angle)}) translate(-8,-8)`;
  const W = 1.0;
  const out = [];
  for (const s of STRANDS) {
    if (s === 'gap:blue') {
      out.push(group(`transform="${turn}"`, line(STRANDS[2][0], '#000', W + 0.7, 'pathLength="100" stroke-dasharray="0 38 26 100" stroke-linecap="butt"')));
      continue;
    }
    if (s === 'gap:band') {
      out.push(group(`transform="${turn}"`, line('M4.9,8.5 H11.1', '#000', W + 0.7, 'stroke-linecap="butt"')));
      continue;
    }
    const [d, grad, extra = ''] = s;
    const face = t.lin(...grad);
    const rim = t.lin(...grad.slice(0, 4), grad[4].map(([o, c]) => [o, darken(c, 0.45)]));
    out.push(raised(t, (paint, k) => group(`transform="${turn}"`, line(d, paint === 'face' ? face : paint === 'rim' ? rim : paint, W * k, extra)),
      { face: 'face', rim: 'rim', shine: '#fff', shineOpacity: 0.55, cast: 0, depth: 0.12 }));
  }
  const a = rad(angle);
  for (const [bx, by] of INFOTRON_BEADS) {
    const dx = bx - 8, dy = by - 8;
    out.push(bead(t, cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)));
  }
  return out.join('');
}

// --- terminal ------------------------------------------------------------------

/**
 * A terminal, its screen and lights read from the original's 16x16 cell `px`
 * (256 palette indices): the glyphs are its green screen pixels, and any vent
 * or key that is coloured rather than grey is lit in that colour. The plain
 * tile and the one the game shows once a terminal is used differ only there.
 */
export function terminal(t, px) {
  const at = (x, y) => px[y * 16 + x];
  const glyph = [];
  for (let y = 2; y < 10; y++) {
    for (let x = 2; x < 11; x++) {
      if (at(x, y) !== 4) continue;
      let w = 1;
      while (x + w < 11 && at(x + w, y) === 4) w++;
      glyph.push([x, y, w]);
      x += w - 1;
    }
  }
  const PAL = ['#000', P.W, P.Y, P.g, P.G, P.s, P.R, P.m, P.L, P.B, P.n, P.r, P.O, P.d, P.e, P.f];
  const greyish = c => [5, 7, 13, 14, 15].includes(c);
  const glow = t.blur(0.35);
  const lamp = (cx, cy, c, r = 0.5) => circle(cx, cy, r + 0.35, c, `opacity="0.55" filter="${glow}"`) +
    circle(cx, cy, r, t.rad(cx - 0.15, cy - 0.15, r * 1.2, [[0, '#fff'], [0.35, c], [1, darken(c, 0.35)]]));
  const keys = [2, 5, 8].map(x => {
    const c = at(x, 12);
    return rect(x, 12, 2, 2, t.lin(x, 12, x + 2, 14, [[0, '#a4a4a4'], [0.45, '#5a5a5a'], [1, '#111']]), 'rx="0.35"') +
      (greyish(c) ? rect(x + 0.45, 12.45, 1.1, 1.1, t.lin(x, 12, x + 2, 14, [[0, '#2a2a2a'], [1, '#000']]), 'rx="0.25"')
        : rect(x + 0.35, 12.35, 1.3, 1.3, t.rad(x + 0.8, 12.8, 1.2, [[0, lighten(PAL[c], 0.5)], [0.5, PAL[c]], [1, darken(PAL[c], 0.4)]]), `rx="0.3"`) +
          rect(x + 0.1, 12.1, 1.8, 1.8, PAL[c], `rx="0.4" opacity="0.4" filter="${glow}"`));
  });
  const vents = [2, 4, 6, 8, 10].map(y => {
    const c = at(13, y);
    const bar = y < 10 ? rect(12.3, y + 0.15, 2.4, 0.75, t.lin(0, y, 0, y + 1, [[0, '#d4d4d4'], [0.5, '#9a9a9a'], [1, '#5a5a5a']]), 'rx="0.3"') : '';
    return bar + (greyish(c) ? '' : lamp(13.5, y + 0.5, PAL[c], 0.42));
  });
  const leds = [11, 13].map(x => rect(x, 13, 1, 1, '#4a4a4a', 'rx="0.2"') + lamp(x + 0.5, 12.55, PAL[at(x, 12)]));
  return [
    rect(0, 0, 16, 16, t.lin(0, 0, 16, 16, [[0, '#919191'], [1, '#808080']])),
    poly([[0, 0], [16, 0], [15, 1], [1, 1]], P.s), poly([[0, 0], [1, 1], [1, 15], [0, 16]], P.s),
    poly([[16, 0], [16, 16], [15, 15], [15, 1]], P.d), poly([[0, 16], [1, 15], [15, 15], [16, 16]], P.d),
    // recessed screen: shadowed top-left lip, lit bottom-right lip
    poly([[1, 1], [12, 1], [11, 2], [2, 2]], '#626262'), poly([[1, 1], [2, 2], [2, 10], [1, 11]], '#626262'),
    poly([[12, 1], [12, 11], [11, 10], [11, 2]], '#a2a2a2'), poly([[1, 11], [2, 10], [11, 10], [12, 11]], '#a2a2a2'),
    rect(2, 2, 9, 8, t.rad(5.5, 5, 7, [[0, '#06140c'], [1, '#000']])),
    group(`filter="${glow}" opacity="0.9"`, glyph.map(([x, y, w]) => rect(x, y, w, 1, '#00ff88', 'rx="0.3"'))),
    ...glyph.map(([x, y, w]) => rect(x + 0.08, y + 0.1, w - 0.16, 0.8, t.lin(0, y, 0, y + 1, [[0, '#7dffbe'], [0.5, P.G], [1, '#009a55']]), 'rx="0.25"')),
    ...[2.5, 4.5, 6.5, 8.5].map(y => rect(2, y, 9, 0.12, '#000', 'opacity="0.35"')),
    poly([[2, 2], [6.5, 2], [2, 6]], '#fff', 'opacity="0.05"'),
    ...vents,
    line('M2,11.05 H14', '#9a9a9a', 0.1, 'opacity="0.6"'),
    ...keys, ...leds,
  ].join('');
}

// --- electron sparkles -----------------------------------------------------------

const BRIGHT = { 1: 4, 5: 3, 8: 2, 9: 1 }; // white, light grey, light blue, blue

/**
 * The sparkles in a patch of pixels ([x, y, c] list): each cluster's brightest
 * pixel is its centre, and its arms run as far as the cluster does along that
 * row and column.
 */
export function findSparkles(pts) {
  if (!Array.isArray(pts[0])) pts = pts.map((c, i) => [i % 16, i >> 4, c]).filter(p => p[2]);
  const on = new Map(pts.filter(p => BRIGHT[p[2]]).map(p => [`${p[0]},${p[1]}`, p]));
  const seen = new Set(), out = [];
  for (const [k, p0] of on) {
    if (seen.has(k)) continue;
    const group = [], stack = [p0];
    seen.add(k);
    while (stack.length) {
      const p = stack.pop();
      group.push(p);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const q = `${p[0] + dx},${p[1] + dy}`;
        if (on.has(q) && !seen.has(q)) { seen.add(q); stack.push(on.get(q)); }
      }
    }
    const top = Math.max(...group.map(p => BRIGHT[p[2]]));
    const core = group.filter(p => BRIGHT[p[2]] === top);
    const cx = core.reduce((s, p) => s + p[0], 0) / core.length, cy = core.reduce((s, p) => s + p[1], 0) / core.length;
    const has = (x, y) => group.some(p => p[0] === x && p[1] === y);
    const run = (dx, dy) => { let n = 0; while (has(Math.round(cx) + dx * (n + 1), Math.round(cy) + dy * (n + 1))) n++; return n; };
    out.push({
      cx: cx + 0.5, cy: cy + 0.5,
      h: Math.max(run(1, 0), run(-1, 0)) + 0.5, v: Math.max(run(0, 1), run(0, -1)) + 0.5,
      bright: top, halo: has(Math.round(cx) + 1, Math.round(cy) + 1) || has(Math.round(cx) - 1, Math.round(cy) - 1),
    });
  }
  return out;
}

/** Draws sparkles found by findSparkles: four-pointed stars with a soft blue glow. */
export function sparkles(t, list) {
  return list.map(({ cx, cy, h, v, bright, halo }) => {
    const arm = Math.max(h, v), w = 0.5, core = bright >= 4 ? (halo ? 0.8 : 0.5) : bright === 3 ? 0.45 : 0.3;
    const fill = t.rad(cx, cy, arm, [[0, bright >= 3 ? '#ffffff' : '#dfe7ff'], [0.2, '#dfe7ff'], [0.5, P.L], [0.85, P.B], [1, P.B, 0.4]]);
    if (arm <= 0.6) return circle(cx, cy, 0.75, bright >= 2 ? P.L : P.B, `opacity="0.5" filter="${t.blur(0.3)}"`) + circle(cx, cy, 0.35, bright >= 2 ? P.L : P.B);
    return circle(cx, cy, arm * 0.7, P.L, `opacity="0.35" filter="${t.blur(0.45)}"`) +
      (halo ? `<g transform="rotate(45 ${f2(cx)} ${f2(cy)})">${poly([[cx - 1.2, cy], [cx, cy - 1.2], [cx + 1.2, cy], [cx, cy + 1.2]], P.s, 'opacity="0.6"')}</g>` : '') +
      poly([[cx - h, cy], [cx - core * 0.5, cy - w], [cx, cy - v], [cx + core * 0.5, cy - w], [cx + h, cy], [cx + core * 0.5, cy + w], [cx, cy + v], [cx - core * 0.5, cy + w]], fill) +
      poly([[cx - h, cy], [cx, cy - w * 0.6], [cx + h, cy], [cx, cy + w * 0.6]], fill) +
      poly([[cx, cy - v], [cx + w * 0.6, cy], [cx, cy + v], [cx - w * 0.6, cy]], fill) +
      circle(cx, cy, core * 0.6, '#fff');
  }).join('');
}
