// HD redraws of the 40 tiles in FIXED.DAT, written as SVG.
// Run with `npm run remaster` (which also rasterises them).
//
// Each tile is drawn in the original's own 16x16 coordinate space, so a shape
// here sits exactly where its pixels sat: (3,5) is the top-left corner of the
// pixel at column 3, row 5. The aim is the original, not a reinterpretation --
// same silhouettes, same palette, same light from the top-left -- with the
// dithering and 1px bevels replaced by real gradients and edges.
//
// Where the original shows black space around an object (a zonk, a port, the
// gaps between chip pins), the redraw leaves it transparent, so the remaster can
// put whatever it likes behind. Black that is part of the object -- a terminal's
// screen, the shadow on the exit's E -- stays black.
//
// Several tiles are transposes of others (vertical ports, the vertical RAM chip)
// and are generated that way. Swapping x and y keeps light from the top-left
// coming from the top-left, which is why the original artists could do it too.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  P, rgb, hex, mix, lighten, darken, f2, Tile, rect, poly, path, circle, line, group, TRANSPOSE, MIRROR_X, pad, bead, raised, traces, traceFills, board, shadow, plate, pin,
} from './svg.mjs';
import { zonk, infotron, terminal, sparkles, findSparkles } from './objects.mjs';
import { loadIndexed } from './pixels.mjs';

const FIXED_SHEET = loadIndexed('assets/original/fixed.png');
const FIXED_PX = id => Array.from({ length: 256 }, (_, i) => FIXED_SHEET.at(id * 16 + (i % 16), i >> 4));

const OUT = 'assets/remaster/fixed';

// --- tiles -------------------------------------------------------------------

export const T = {};

T.space = t => t.add(rect(0, 0, 16, 16, P.K));

T.zonk = t => t.add(zonk(t));

/** Murphy's outline: rounder at the bottom than the top, as in the original. */
function murphyShape(scale = 1) {
  const pts = [];
  for (let i = 0; i < 240; i++) {
    const a = (i / 240) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const n = s < 0 ? 2.6 : 2.15;
    const x = Math.sign(c) * Math.abs(c) ** (2 / n), y = Math.sign(s) * Math.abs(s) ** (2 / n);
    pts.push([8 + 7.98 * scale * x, 8 + 7.98 * scale * y]);
  }
  return pts;
}

T.murphy = t => {
  const outline = murphyShape();
  const d = 'M' + outline.map(p => p.map(f2).join(',')).join('L') + 'Z';
  const arc = (from, to, scale) => {
    const pts = murphyShape(scale).filter((_, i) => { const a = (i / 240) * 360; return a >= from && a <= to; });
    return 'M' + pts.map(p => p.map(f2).join(',')).join('L');
  };
  // Small, wide-set eyes: a dark pupil with a glint on the inner side and a
  // grey rim toward the outside, as the original's three pixels have it.
  const eye = (cx, inward) =>
    `<ellipse cx="${cx}" cy="5.1" rx="0.86" ry="0.95" fill="${t.rad(cx - inward * 0.7, 5.7, 1.3, [[0, '#a0a0a0'], [0.5, '#5e5e5e'], [1, '#1e1e1e']])}"/>` +
    `<ellipse cx="${cx + inward * 0.22}" cy="5.25" rx="0.52" ry="0.6" fill="#040404"/>` +
    circle(cx + inward * 0.36, 4.6, 0.3, '#fff');
  t.add(
    path(d, t.rad(6.2, 5.2, 11, [[0, '#ff7a55'], [0.1, '#ff4030'], [0.38, P.R], [0.66, '#cc0909'], [0.86, '#9c0000'], [1, '#6e0500']], 5.4, 4.2)),
    // the lower jaw sits in shadow
    path(d, t.lin(0, 9, 0, 16, [[0, '#300', 0], [1, '#300', 0.45]])),
    line(arc(198, 240, 0.93), P.O, 0.8, 'opacity="0.95"'),
    line(arc(300, 342, 0.93), P.O, 0.8, 'opacity="0.95"'),
    line(arc(206, 230, 0.93), '#ffd8b0', 0.28, 'opacity="0.75"'),
    path(d, 'none', 'stroke="#5a0c00" stroke-width="0.35" opacity="0.7"'),
    eye(4.0, 1),
    eye(12.0, -1),
    // the smile: a brown crease with a dark lip under it
    line('M2.3,8.7 Q8,13.9 13.7,8.7', '#900', 0.95, 'opacity="0.75" transform="translate(0,0.45)"'),
    line('M2.3,8.7 Q8,13.9 13.7,8.7', '#4e1800', 0.7),
    line('M3.4,9.3 Q8,12.9 12.6,9.3', '#ff6040', 0.18, 'opacity="0.45" transform="translate(0,-0.5)"'),
  );
};

T.infotron = t => t.add(infotron(t));

T['ram-chip'] = t => {
  for (let c = 3; c <= 13; c += 2) t.add(pin(t, c + 0.1, 0, 0.8, 2.3, 'up', true));
  for (let r = 2; r <= 12; r += 2) t.add(pin(t, 0, r + 0.1, 2.3, 0.8, 'left', true));
  for (let r = 3; r <= 13; r += 2) t.add(pin(t, 13.7, r + 0.1, 2.3, 0.8, 'right', false));
  for (let c = 2; c <= 12; c += 2) t.add(pin(t, c + 0.1, 13.7, 0.8, 2.3, 'down', false));
  t.add(
    rect(2, 2, 12, 12, t.lin(0, 2, 0, 14, [[0, '#7e7e7e'], [1, '#717171']]), 'rx="0.25"'),
    poly([[2, 2], [14, 2], [13.25, 2.75], [2.75, 2.75]], t.lin(0, 2, 0, 2.75, [[0, '#a8a8a8'], [1, '#949494']])),
    poly([[2, 2], [2.75, 2.75], [2.75, 13.25], [2, 14]], t.lin(2, 0, 2.75, 0, [[0, '#a2a2a2'], [1, '#929292']])),
    poly([[14, 2], [14, 14], [13.25, 13.25], [13.25, 2.75]], '#5e5e5e'),
    poly([[2, 14], [2.75, 13.25], [13.25, 13.25], [14, 14]], '#626262'),
  );
  // The faint moulded marking on the lid.
  const marks = [[5, 5, 5, 1], [5, 7, 1, 1], [7, 7, 3, 1], [5, 9, 1, 1], [7, 9, 1, 1], [9, 9, 1, 1]];
  t.add(...marks.map(([x, y, w, h]) => rect(x + 0.08, y + 0.18, w - 0.16, h - 0.36, '#6a6a6a', 'rx="0.3" transform="translate(0.12,0.14)"')));
  t.add(...marks.map(([x, y, w, h]) => rect(x + 0.08, y + 0.18, w - 0.16, h - 0.36, '#8c8c8c', 'rx="0.3"')));
};

T.hardware = t => {
  t.add(
    poly([[0, 0], [16, 0], [12, 5], [4, 5]], t.lin(0, 0, 0, 5, [[0, '#c6c6c6'], [1, '#b0b0b0']])),
    poly([[0, 0], [4, 5], [4, 11], [0, 16]], t.lin(0, 0, 4, 0, [[0, '#a2a2a2'], [1, '#909090']])),
    poly([[16, 0], [16, 16], [12, 11], [12, 5]], t.lin(12, 0, 16, 0, [[0, '#6c6c6c'], [1, '#5c5c5c']])),
    poly([[0, 16], [4, 11], [12, 11], [16, 16]], t.lin(0, 11, 0, 16, [[0, '#7c7c7c'], [1, '#6e6e6e']])),
    // the recessed pit: lit from the top-left, so its lower faces catch the light
    poly([[4, 5], [12, 5], [9, 8], [7, 8]], t.lin(0, 5, 0, 8, [[0, '#6e6e6e'], [1, '#7a7a7a']])),
    poly([[4, 11], [12, 11], [9, 8], [7, 8]], t.lin(0, 8, 0, 11, [[0, '#b2b2b2'], [1, '#c2c2c2']])),
    poly([[4, 5], [7, 8], [4, 11]], t.lin(4, 0, 7, 0, [[0, '#5c5c5c'], [1, '#686868']])),
    poly([[12, 5], [9, 8], [12, 11]], t.lin(9, 0, 12, 0, [[0, '#9a9a9a'], [1, '#a4a4a4']])),
    line('M0.1,15.9 V0.1 H15.9', '#dadada', 0.18, 'opacity="0.6" stroke-linecap="butt"'),
    line('M4,11 V5 H12', '#4c4c4c', 0.14, 'opacity="0.7" stroke-linecap="butt"'),
    line('M4,11 H12 V5', '#d0d0d0', 0.14, 'opacity="0.5" stroke-linecap="butt"'),
  );
};

T.exit = t => {
  const E = 'M3,3 H13 V5 H5 V7 H11 V9 H5 V11 H13 V13 H3 Z';
  t.add(
    rect(0, 0, 16, 16, t.lin(0, 0, 16, 16, [[0, '#ffae6a'], [0.5, P.O], [1, '#f0842e']])),
    poly([[0, 0], [16, 0], [15, 1], [1, 1]], t.lin(0, 0, 0, 1, [[0, '#ffff70'], [1, P.Y]])),
    poly([[0, 0], [1, 1], [1, 15], [0, 16]], t.lin(0, 0, 1, 0, [[0, '#ffff60'], [1, '#e2e200']])),
    poly([[16, 0], [16, 16], [15, 15], [15, 1]], t.lin(15, 0, 16, 0, [[0, P.R], [1, '#b80808']])),
    poly([[0, 16], [1, 15], [15, 15], [16, 16]], t.lin(0, 15, 0, 16, [[0, P.R], [1, '#b00606']])),
    path(E, '#000', 'transform="translate(1,1)"'),
    path(E, t.lin(3, 3, 13, 13, [[0, '#ffffff'], [1, '#e6e6e6']])),
    line('M3.15,12.85 V3.15 H12.85', '#fff', 0.12, 'opacity="0.9" stroke-linecap="butt"'),
  );
};

/** The three disks share a body; only the label strip changes colour. */
function disk(label) {
  return t => {
    const body = 'M0.35,0 H14.9 L16,1.1 V15.65 Q16,16 15.65,16 H0.35 Q0,16 0,15.65 V0.35 Q0,0 0.35,0 Z';
    t.add(
      path(body, t.lin(0, 0, 16, 16, [[0, '#7070ee'], [0.45, P.B], [1, '#4444c4']])),
      line('M0.15,15.6 V0.35 Q0.15,0.15 0.4,0.15 H14.8', '#9a9af8', 0.2, 'opacity="0.8"'),
      line('M15.85,1.2 V15.6 Q15.85,15.85 15.6,15.85 H0.4', '#3434a8', 0.2, 'opacity="0.8"'),
      // label: a coloured strip over a white sticker
      rect(3, 0, 11, 2, t.lin(0, 0, 0, 2, [[0, lighten(label, 0.35)], [0.5, label], [1, darken(label, 0.12)]])),
      rect(3, 2, 11, 5, t.lin(0, 2, 0, 7, [[0, '#ffffff'], [1, '#e2e2ec']])),
      rect(3, 6.75, 11, 0.25, '#3a3aa8', 'opacity="0.5"'),
      // write-protect hole
      rect(0.95, 0.95, 1.1, 1.1, '#000', 'rx="0.2"'),
      rect(0.95, 0.95, 1.1, 1.1, 'none', 'rx="0.2" stroke="#9a9af8" stroke-width="0.12" opacity="0.6" transform="translate(0.06,0.06)"'),
      // metal shutter with its window
      rect(4, 10, 9, 6, t.lin(4, 10, 13, 16, [[0, '#c8c8c8'], [0.5, '#a2a2a2'], [1, '#8a8a8a']])),
      line('M4.1,16 V10.1 H12.9', '#e4e4e4', 0.16, 'opacity="0.8" stroke-linecap="butt"'),
      rect(10, 11, 2, 4, t.lin(10, 11, 12, 15, [[0, '#3a3ab0'], [1, '#5a5ae0']]), 'rx="0.12"'),
      line('M10.05,15 V11.05 H11.95', '#2a2a80', 0.14, 'stroke-linecap="butt"'),
    );
  };
}
T['orange-disk'] = disk(P.O);
T['yellow-disk'] = disk(P.Y);
T['red-disk'] = disk(P.R);

// --- ports -----------------------------------------------------------------
//
// A port is a red ribbed roller between grey end caps, lying across the way you
// pass through it. A one-way port swaps the entry-side cap for a wide grey
// funnel. Everything is drawn for a horizontal roller lit from above, and the
// vertical ports are its transpose.

const GREY_ROD = [[0, '#5a5a5a'], [0.06, '#6e6e6e'], [0.13, '#909090'], [0.22, '#b8b8b8'], [0.3, '#bdbdbd'], [0.37, '#a0a0a0'], [0.45, '#8c8c8c'], [0.55, '#7c7c7c'], [0.72, '#727272'], [0.8, '#666'], [1, '#545454']];

function roller(t, x0, x1, y0, y1) {
  const h = y1 - y0;
  const out = [rect(x0, y0, x1 - x0, h, t.lin(0, y0, 0, y1, [
    [0, '#7a1400'], [0.07, P.r], [0.15, P.R], [0.21, '#ff8c40'], [0.3, P.O], [0.4, '#f2401a'], [0.55, P.R], [0.68, '#c80404'], [0.82, '#a01000'], [1, '#6e2c00']]), 'rx="0.35"')];
  // ribs: a groove on every odd column, a glint on every ridge
  const groove = t.lin(0, y0, 0, y1, [[0, '#000', 0.25], [0.3, '#000', 0.12], [1, '#2a0800', 0.5]]);
  const glint = t.lin(0, y0, 0, y1, [[0, '#fff', 0], [0.2, '#ffd8a0', 0.55], [0.38, '#fff', 0.15], [0.6, '#fff', 0]]);
  for (let x = x0; x < x1 - 0.5; x += 2) {
    out.push(rect(x + 1.05, y0, 0.9, h, groove, 'rx="0.3"'));
    out.push(rect(x + 0.32, y0 + 0.1, 0.32, h - 0.2, glint, 'rx="0.16"'));
  }
  out.push(rect(x0, y0, x1 - x0, h, 'none', 'rx="0.35" stroke="#300" stroke-width="0.14" opacity="0.6"'));
  return out.join('');
}

function cap(t, side, y0 = 0, y1 = 16) {
  // a 2-wide end cap, tapered at its outer corners
  const d = side === 'left'
    ? `M0,${y0} H1 L2,${y0 + 1} V${y1 - 1} L1,${y1} H0 Z`
    : `M16,${y0} H15 L14,${y0 + 1} V${y1 - 1} L15,${y1} H16 Z`;
  return path(d, t.lin(0, y0, 0, y1, GREY_ROD)) +
    path(d, t.lin(side === 'left' ? 0 : 16, 0, side === 'left' ? 2 : 14, 0, [[0, '#000', 0.18], [0.6, '#fff', 0.06], [1, '#000', 0.12]]));
}

function funnel(t) {
  // entry side, on the left: full height at the edge, rounding into the roller at x=6
  const d = 'M0,0 H3 C5,0.35 6,1.2 6,2.4 V13.6 C6,14.8 5,15.65 3,16 H0 Z';
  return path(d, t.lin(0, 0, 0, 16, GREY_ROD)) +
    path(d, t.lin(2, 0, 6, 0, [[0, '#000', 0], [0.6, '#000', 0.12], [1, '#000', 0.32]])) +
    line('M0.1,0.1 H2.9', '#d8d8d8', 0.14, 'opacity="0.5"');
}

function port(kind) {
  return t => {
    const parts = [];
    if (kind === 'one-way') parts.push(funnel(t), roller(t, 6, 14, 2, 14), cap(t, 'right'));
    if (kind === 'two-way') parts.push(cap(t, 'left'), roller(t, 2, 14, 2, 14), cap(t, 'right'));
    if (kind === 'cross') {
      const across = [cap(t, 'left', 2, 14), cap(t, 'right', 2, 14), roller(t, 2, 14, 4, 12)];
      t.add(group('', across));
      t.add(group(TRANSPOSE, [cap(t, 'left', 2, 14), cap(t, 'right', 2, 14), roller(t, 2, 14, 4, 12)]));
      // Where the two rollers cross, the original weaves them: ribs both ways.
      const groove = '#2a0800';
      t.add(
        rect(4, 4, 8, 8, t.rad(6.2, 6.2, 7.5, [[0, P.O], [0.22, '#ff5a28'], [0.45, P.R], [0.75, P.r], [1, '#6e1800']])),
        ...[5, 7, 9, 11].map(c => rect(c + 0.05, 4, 0.9, 8, groove, 'opacity="0.3" rx="0.3"')),
        ...[5, 7, 9, 11].map(r => rect(4, r + 0.05, 8, 0.9, groove, 'opacity="0.3" rx="0.3"')),
        ...[4, 6, 8, 10].flatMap(c => [4, 6, 8, 10].map(r => circle(c + 0.5, r + 0.5, 0.28, '#ffd0a0', `opacity="${Math.max(0.08, 0.55 - (c + r - 8) * 0.04)}"`))),
        rect(4, 4, 8, 8, 'none', 'stroke="#300" stroke-width="0.16" opacity="0.6"'),
      );
      return;
    }
    t.add(...parts);
  };
}

function oriented(make, transform) {
  return t => {
    const inner = t.sub();
    make(inner);
    t.add(transform ? group(transform, inner.body) : inner.body.join(''));
  };
}

T['port-right'] = oriented(port('one-way'));
T['port-left'] = oriented(port('one-way'), MIRROR_X);
T['port-down'] = oriented(port('one-way'), TRANSPOSE);
T['port-up'] = oriented(oriented(port('one-way'), MIRROR_X), TRANSPOSE);
T['special-port-right'] = T['port-right'];
T['special-port-down'] = T['port-down'];
T['special-port-left'] = T['port-left'];
T['special-port-up'] = T['port-up'];
T['port-horizontal'] = oriented(port('two-way'));
T['port-vertical'] = oriented(port('two-way'), TRANSPOSE);
T['port-cross'] = port('cross');

T['snik-snak'] = t => {
  // Closed scissors, points up. The original sits half a pixel left of centre;
  // this one is centred, which is what the rotated frames turn about.
  const blade = 'M6.65,0 H9.35 Q9.85,0.9 9.95,2 L10.5,2.45 V7.6 L9.4,8.6 H6.6 L5.5,7.6 V2.45 L6.05,2 Q6.15,0.9 6.65,0 Z';
  const loop = cx => `M${cx - 2.5},13.55 a2.5,2.45 0 1,0 5,0 a2.5,2.45 0 1,0 -5,0 Z M${cx - 1.3},13.55 a1.3,1.25 0 1,1 2.6,0 a1.3,1.25 0 1,1 -2.6,0 Z`;
  const red = cx => t.rad(cx - 0.9, 12.4, 3.6, [[0, '#ff7060'], [0.25, P.R], [0.65, P.r], [1, '#5e0800']]);
  t.add(
    shadow(t, [path(blade, '#000')], 0.35, 0.35, 0.45, 0.25),
    path(blade, t.lin(5.5, 0, 10.5, 0, [[0, '#505050'], [0.14, '#787878'], [0.28, '#a8a8a8'], [0.46, '#8a8a8a'], [0.5, '#606060'], [0.54, '#8a8a8a'], [0.72, '#929292'], [0.88, '#6e6e6e'], [1, '#4a4a4a']])),
    line('M8,0.2 V8.5', '#3e3e3e', 0.18),
    line('M6.95,0.5 V7.6', '#fff', 0.22, 'opacity="0.45"'),
    // shanks down to the finger loops
    rect(6.5, 9.4, 1.0, 4.4, red(7)), rect(8.5, 9.4, 1.0, 4.4, red(9)),
    path(loop(5), red(5), 'fill-rule="evenodd"'),
    path(loop(11), red(11), 'fill-rule="evenodd"'),
    path(loop(5), 'none', 'fill-rule="evenodd" stroke="#4a0a00" stroke-width="0.18" opacity="0.7"'),
    path(loop(11), 'none', 'fill-rule="evenodd" stroke="#4a0a00" stroke-width="0.18" opacity="0.7"'),
    line('M3.1,12.6 Q3.8,11.5 5.0,11.35', '#ffb0a0', 0.25, 'opacity="0.6"'),
    line('M9.1,12.6 Q9.8,11.5 11.0,11.35', '#ffb0a0', 0.25, 'opacity="0.6"'),
    // the pivot screw
    circle(8, 9.25, 1.05, t.rad(7.6, 8.8, 1.6, [[0, '#e0e0e0'], [0.45, '#999'], [1, '#4a4a4a']])),
    line('M7.4,9.85 L8.6,8.65', '#3a3a3a', 0.2),
  );
};

// Both read from the original tile, so the animated versions (a terminal that
// has been used, an electron's other sparkles) come from the same drawings.
T.terminal = t => t.add(terminal(t, FIXED_PX(19)));
T.electron = t => t.add(sparkles(t, findSparkles(FIXED_PX(24))));

T.base = t => {
  t.add(board());
  // Laid out pixel for pixel from the original. The board tiles: a trace that
  // leaves one edge arrives at the opposite one, so those run past the edge and
  // the relief does not see a cut there.
  t.add(traces(t, [
    'M11.5,1.5 H14.5 V4.5 H11.5 Z',               // ring round the top-right pad
    'M14.5,1.5 H17', 'M-1,1.5 H0.5 V0.5 H6.5 V-1', // ... running off the right, round to the top
    'M6.5,17 V15.5 H7.5 V13',                    // ... and in again at the bottom
    'M11.5,2.5 H2.5 L1.5,3.5 V9.5 L2.5,10.5 V11.5',
    'M1.5,11.5 H4.5 V14.5 H1.5 Z',                // ring round the bottom-left pad
    'M11.5,11.5 H14.5 V14.5 H11.5 Z',             // ring round the bottom-right pad
    'M1.5,12.5 H-1', 'M14.5,12.5 H17',
    'M12.5,14.5 V17', 'M12.5,-1 V1.5',
    'M14.5,4.5 H4.5 Q3.5,4.5 3.5,5.5 V7 Q3.5,8.5 4.5,8.5 H12.5 V11.5',
    { d: 'M4.5,13 H11.5', w: 2 },
  ]));
  t.add(traceFills(t, [[11, 5, 4, 1], [12, 6, 2, 1], [7, 7, 2, 3], [12, 9, 2, 2]]));
  t.add(pad(t, 12, 2), pad(t, 2, 12), pad(t, 12, 12));
};
T.bug = T.base;

/** The long RAM chip, lying across two tiles. `end` is 'left' or 'right'. */
function ramHalf(end) {
  return t => {
    const last = end === 'left' ? 15 : 13;
    for (let c = 1; c <= last; c += 2) {
      t.add(pin(t, c + 0.1, 0, 0.8, 2.3, 'up', true), pin(t, c + 0.1, 13.7, 0.8, 2.3, 'down', false));
    }
    const x0 = end === 'left' ? 0.0 : -1, x1 = end === 'left' ? 17 : 16;
    t.add(
      rect(x0, 2, x1 - x0, 12, t.lin(0, 2, 0, 14, [[0, '#888'], [0.07, '#7e7e7e'], [0.5, '#777'], [0.92, '#717171'], [1, '#606060']]), end === 'left' ? 'rx="0.3"' : 'rx="0.3"'),
      rect(x0, 2, x1 - x0, 0.7, t.lin(0, 2, 0, 2.7, [[0, '#a6a6a6'], [1, '#8c8c8c']])),
      rect(x0, 13.25, x1 - x0, 0.75, t.lin(0, 13.25, 0, 14, [[0, '#686868'], [1, '#585858']])),
    );
    if (end === 'left') {
      t.add(
        poly([[0, 2], [0.7, 2.7], [0.7, 13.3], [0, 14]], t.lin(0, 0, 0.7, 0, [[0, '#a2a2a2'], [1, '#8a8a8a']])),
        // orientation notch at the end
        path('M0,5.6 A2.4,2.4 0 0 1 0,10.4 Z', t.lin(0, 5.6, 2.4, 10.4, [[0, '#585858'], [0.5, '#6c6c6c'], [1, '#7c7c7c']])),
        path('M0,5.6 A2.4,2.4 0 0 1 2.4,8', 'none', 'stroke="#4e4e4e" stroke-width="0.2"'),
        path('M2.4,8 A2.4,2.4 0 0 1 0,10.4', 'none', 'stroke="#949494" stroke-width="0.2"'),
      );
    } else {
      t.add(poly([[16, 2], [16, 14], [15.3, 13.3], [15.3, 2.7]], '#5e5e5e'));
    }
    // pin-1 dimple, and the faint moulding marks
    t.add(
      circle(7, 8, 0.75, t.lin(6.3, 7.3, 7.7, 8.7, [[0, '#585858'], [0.6, '#707070'], [1, '#929292']])),
    );
    const marks = end === 'left'
      ? [[13, 6, 1, 1], [12, 7, 1, 1], [14, 7, 1, 1], [12, 9, 3, 1]]
      : [[1, 6, 1, 1], [0, 7, 1, 1], [0, 9, 2, 1]];
    t.add(...marks.map(([x, y, w, h]) => rect(x + 0.12, y + 0.2, w - 0.24, h - 0.4, '#858585', 'rx="0.3" opacity="0.8"')));
  };
}
T['ram-chip-left'] = ramHalf('left');
T['ram-chip-right'] = ramHalf('right');
T['ram-chip-top'] = oriented(ramHalf('left'), TRANSPOSE);
T['ram-chip-bottom'] = oriented(ramHalf('right'), TRANSPOSE);

// --- the decorative hardware ---------------------------------------------------

/** A resistor lying across, its top edge on row `y`. */
function resistorH(t, y, body, bands) {
  const cy = y + 1.5;
  const capsule = rect(4, y + 0.05, 8, 2.9, '#000', 'rx="1.1"');
  const wire = t.lin(0, cy - 0.4, 0, cy + 0.4, [[0, '#f2f2f2'], [0.4, '#bdbdbd'], [1, '#6a6a6a']]);
  const bodyFill = t.lin(0, y, 0, y + 3, [[0, lighten(body[0], 0.55)], [0.22, body[0]], [0.62, body[0]], [1, body[1]]]);
  const clip = t.clip(rect(4, y + 0.05, 8, 2.9, '#000', 'rx="1.1"'));
  return [
    shadow(t, [line(`M1,${cy} H15`, '#000', 0.8), capsule], 0.55, 0.85, 0.42),
    line(`M0.9,${cy} H15.1`, wire, 0.75),
    rect(4, y + 0.05, 8, 2.9, bodyFill, 'rx="1.1"'),
    group(`clip-path="${clip}"`, bands.map(([col, top, bottom]) =>
      rect(col + 0.12, y, 0.76, 3, t.lin(0, y, 0, y + 3, [[0, lighten(top, 0.4)], [0.25, top], [0.65, top], [1, bottom]])))),
    rect(4.7, y + 0.5, 6.6, 0.42, '#fff', 'rx="0.21" opacity="0.32"'),
  ].join('');
}

/** A resistor standing up, its left edge on column `x`. */
function resistorV(t, x) {
  const cx = x + 1.5;
  const capsule = rect(x + 0.05, 4, 2.9, 8, '#000', 'rx="1.1"');
  const wire = t.lin(cx - 0.4, 0, cx + 0.4, 0, [[0, '#f2f2f2'], [0.4, '#bdbdbd'], [1, '#6a6a6a']]);
  const clip = t.clip(rect(x + 0.05, 4, 2.9, 8, '#000', 'rx="1.1"'));
  const bands = [[7, P.L, P.B], [8, P.G, P.g], [9, P.Y, P.O]];
  return [
    shadow(t, [line(`M${cx},1 V17`, '#000', 0.8), capsule], 0.85, 0.55, 0.42),
    line(`M${cx},0.9 V17`, wire, 0.75),
    rect(x + 0.05, 4, 2.9, 8, t.lin(x, 0, x + 3, 0, [[0, lighten(P.R, 0.55)], [0.22, P.R], [0.62, P.R], [1, P.r]]), 'rx="1.1"'),
    group(`clip-path="${clip}"`, bands.map(([row, top, bottom]) =>
      rect(x, row + 0.12, 3, 0.76, t.lin(x, 0, x + 3, 0, [[0, lighten(top, 0.4)], [0.25, top], [0.65, top], [1, bottom]])))),
    rect(x + 0.5, 4.7, 0.42, 6.6, '#fff', 'rx="0.21" opacity="0.32"'),
  ].join('');
}

const YELLOW_RESISTOR = [[P.Y, P.O], [[7, P.L, P.B], [8, P.O, P.R]]];
const RED_RESISTOR = [[P.R, P.r], [[7, P.L, P.B], [8, P.G, P.g], [9, P.Y, P.O]]];
const BLUE_RESISTOR = [[P.L, P.B], [[7, P.R, P.r], [8, P.G, P.g], [9, P.Y, P.O]]];

function lamp(dark, bright, glint) {
  return t => {
    t.add(plate(t));
    t.add(
      shadow(t, [circle(7.5, 7.5, 3.5, '#000')], 0.9, 0.9, 0.5, 0.35),
      circle(7.5, 7.5, 3.6, '#4a4a4a'),
      circle(7.5, 7.5, 3.35, t.rad(8.7, 8.7, 4.6, [[0, lighten(bright, 0.45)], [0.3, bright], [0.7, dark], [1, darken(dark, 0.35)]], 9.2, 9.2)),
      circle(7.5, 7.5, 3.35, t.rad(7.5, 7.5, 3.35, [[0.7, '#000', 0], [1, '#000', 0.35]])),
      `<ellipse cx="5.9" cy="5.9" rx="0.95" ry="0.6" transform="rotate(-45 5.9 5.9)" fill="${glint}" opacity="0.95"/>`,
      circle(9.6, 9.7, 0.35, '#fff', 'opacity="0.35"'),
    );
  };
}

T['hardware-01'] = t => {
  t.add(board());
  t.add(traces(t, [
    'M9.5,2.5 V8.5 H8.5 V11', 'M9.5,2.5 H11', 'M9.5,5.5 H11',
    'M2.5,7.5 L1.5,8.5 V14.5 H11.5', 'M1.5,8.5 H3.5', 'M2.5,8.5 V10.5', 'M14.5,4.5 H15.2', 'M14.5,7.5 H15.2',
    { d: 'M4,12 H7', w: 2 },
  ]));
  t.add(
    shadow(t, [circle(4.5, 4.5, 3.4, '#000')], 0.9, 0.9, 0.45),
    circle(4.5, 4.5, 3.0, 'none', `stroke="${t.lin(1.5, 1.5, 7.5, 7.5, [[0, '#c0ccff'], [0.35, P.L], [1, P.B]])}" stroke-width="1"`),
    circle(4.5, 4.5, 2.5, t.rad(3.5, 3.4, 3.2, [[0, '#b0b0b0'], [0.4, P.f], [1, '#5e5e5e']])),
    circle(3.5, 3.4, 0.45, '#fff', 'opacity="0.4"'),
    shadow(t, [rect(11, 1, 3, 2, '#000'), rect(11, 4, 3, 2, '#000'), rect(10, 7, 4, 7, '#000')], 0.6, 0.6, 0.45),
    rect(11, 1, 3, 2, t.lin(0, 1, 0, 3, [[0, '#ffff90'], [0.45, P.Y], [0.55, P.O], [1, '#d87028']]), 'rx="0.3"'),
    rect(11, 4, 3, 2, t.lin(0, 4, 0, 6, [[0, '#ff6050'], [0.45, P.R], [0.55, P.r], [1, '#800']]), 'rx="0.3"'),
    rect(10, 7, 4, 7, t.lin(10, 0, 14, 0, [[0, '#a6a6a6'], [0.25, '#8e8e8e'], [0.75, '#7e7e7e'], [1, '#5e5e5e']]), 'rx="0.4"'),
    line('M10.2,13.6 V7.3 H13.7', '#c8c8c8', 0.16, 'opacity="0.6"'),
    circle(12.5, 9.5, 0.35, '#a8a8a8'), circle(12.5, 11.5, 0.35, '#a8a8a8'),
    pad(t, 2, 11), pad(t, 7, 11),
  );
};

T['hardware-02'] = lamp(P.g, P.G, '#dddddd');
T['hardware-03'] = lamp(P.B, P.L, '#ffffff');
T['hardware-04'] = lamp(P.r, P.R, '#ffb070');

T['hardware-05'] = t => {
  t.add(plate(t));
  const inner = t.clip(rect(2, 2, 12, 12, '#000'));
  const stripes = [];
  for (let k = -1; k <= 5; k++) {
    const a = 6 * k + 2.5, b = 6 * k + 5.5;
    stripes.push(poly([[a, 0], [b, 0], [b - 20, 20], [a - 20, 20]], P.Y));
  }
  t.add(
    group(`clip-path="${inner}"`, [
      rect(2, 2, 12, 12, '#0c0c0c'),
      ...stripes,
      rect(2, 2, 12, 12, t.lin(2, 2, 14, 14, [[0, '#fff', 0.18], [0.45, '#fff', 0], [1, '#000', 0.22]])),
      line('M2,14 V2 H14', '#000', 0.5, 'opacity="0.35"'),
    ]),
  );
};

T['hardware-06'] = t => {
  t.add(board());
  t.add(traces(t, ['M1.5,3 V12.5 H2.5', 'M14.5,3 V11.5']));
  const cyl = (x, light, mid, darkC) => [
    shadow(t, [rect(x, 1, 2, 7, '#000', 'rx="0.9"')], 1.3, 0.8, 0.45),
    rect(x - 0.9, 3.15, 1.2, 0.6, '#9a9a9a', 'rx="0.2"'), rect(x - 0.9, 5.15, 1.2, 0.6, '#9a9a9a', 'rx="0.2"'),
    rect(x, 1, 2, 7, t.lin(x, 0, x + 2, 0, [[0, lighten(light, 0.35)], [0.3, light], [0.65, mid], [1, darkC]]), 'rx="0.9"'),
    rect(x + 0.35, 1.6, 0.35, 5.8, '#fff', 'rx="0.17" opacity="0.35"'),
  ].join('');
  t.add(cyl(3, P.L, P.B, '#3434a8'), cyl(8, P.R, P.r, '#700'));
  t.add(pad(t, 12, 2), pad(t, 12, 6));
  t.add(resistorH(t, 10, ...YELLOW_RESISTOR));
};

T['hardware-07'] = t => {
  t.add(board());
  t.add(traces(t, [
    'M1.5,13.5 V1.5 H14.5 V3.5', 'M1.5,4.5 H3.5 V3.5 H8.5 V2.5 H9', 'M11.5,2.5 V3.5', 'M1.5,12.5 H2.5',
  ]));
  t.add(pad(t, 9, 2), pad(t, 12, 2));
  const leadFill = y => t.lin(0, y - 0.6, 0, y + 0.6, [[0, '#e8e8e8'], [0.4, '#a8a8a8'], [1, '#555']]);
  const body = rect(4, 5, 10, 8, '#000', 'rx="1.1"');
  t.add(
    shadow(t, [body, line('M1.3,8 H4.5 M1.3,11 H4.5', '#000', 1.2)], 1.3, 1.4, 0.45, 0.4),
    line('M1.3,8 H4.5', leadFill(8), 1.2), line('M1.3,11 H4.5', leadFill(11), 1.2),
    circle(1.6, 8, 0.75, '#c8c8c8'), circle(1.6, 11, 0.75, '#c8c8c8'),
    rect(4, 5, 10, 8, t.lin(0, 5, 0, 13, [[0, '#8a1a00'], [0.12, P.R], [0.27, '#ff7a3a'], [0.36, P.O], [0.46, '#f0301a'], [0.6, P.R], [0.74, P.r], [0.9, '#8a1000'], [1, '#6a3000']]), 'rx="1.1"'),
    rect(4, 5, 10, 8, t.lin(4, 0, 14, 0, [[0, '#000', 0.3], [0.12, '#000', 0], [0.88, '#000', 0], [1, '#000', 0.35]]), 'rx="1.1"'),
    // the polarity stripe
    rect(6, 5, 1, 8, t.lin(0, 5, 0, 13, [[0, '#5a1000', 0.6], [0.5, '#5a1000', 0.35], [1, '#3a1800', 0.6]])),
    rect(5, 6.9, 8.5, 0.5, '#fff', 'rx="0.25" opacity="0.28"'),
  );
};

T['hardware-08'] = t => {
  t.add(board(), resistorH(t, 1, ...RED_RESISTOR), resistorH(t, 6, ...YELLOW_RESISTOR), resistorH(t, 11, ...BLUE_RESISTOR));
};

T['hardware-09'] = t => {
  t.add(board(), resistorV(t, 1), resistorV(t, 6), resistorV(t, 11));
};

T['hardware-10'] = t => {
  t.add(board(), resistorH(t, 1, ...YELLOW_RESISTOR), resistorH(t, 6, ...YELLOW_RESISTOR), resistorH(t, 11, ...YELLOW_RESISTOR));
};

// --- output ------------------------------------------------------------------

export const NAMES = [
  'space', 'zonk', 'base', 'murphy', 'infotron',
  'ram-chip', 'hardware', 'exit', 'orange-disk', 'port-right',
  'port-down', 'port-left', 'port-up', 'special-port-right', 'special-port-down',
  'special-port-left', 'special-port-up', 'snik-snak', 'yellow-disk', 'terminal',
  'red-disk', 'port-vertical', 'port-horizontal', 'port-cross', 'electron',
  'bug', 'ram-chip-left', 'ram-chip-right', 'hardware-01', 'hardware-02',
  'hardware-03', 'hardware-04', 'hardware-05', 'hardware-06', 'hardware-07',
  'hardware-08', 'hardware-09', 'hardware-10', 'ram-chip-top', 'ram-chip-bottom',
];

export const fileName = i => `${String(i).padStart(2, '0')}-${NAMES[i]}.svg`;

/** Writes every tile's SVG into `out`. */
export function build(out = OUT) {
  mkdirSync(out, { recursive: true });
  NAMES.forEach((name, i) => {
    const t = new Tile();
    T[name](t);
    writeFileSync(join(out, fileName(i)), t.svg());
  });
  return NAMES.map((_, i) => join(out, fileName(i)));
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  build();
  console.log(`wrote ${NAMES.length} tiles to ${OUT}`);
}
