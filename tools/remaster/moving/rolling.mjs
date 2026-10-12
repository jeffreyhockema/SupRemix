// Zonks and infotrons on their own: rolling off things, falling, at rest.
// Frames where Murphy is pushing or eating one are placed with Murphy.

import { I, bbox, axisAngle } from '../pixels.mjs';
import { zonk, infotron, INFOTRON_BEADS } from '../objects.mjs';

const BAND = [I.Y, I.O, I.R, I.r, I.n];

/** Where the zonk in a window is, and which way its band points. */
export function measureZonk(orig, win, test = c => c !== 0) {
  const pts = orig.pick(win, test);
  const [x0, y0] = bbox(pts);
  return { x: win[0] + x0, y: win[1] + y0, angle: Math.round(axisAngle(pts.filter(p => BAND.includes(p[2]))) / 45) * 45 % 180 };
}

/**
 * The infotron in a window, as a rotation of the upright one: its three beads
 * (a 2x2 "W f / f d" each) are matched to the upright beads by the rotation
 * and shift that fit best.
 */
export function measureInfotron(orig, [wx, wy, ww, wh]) {
  const beads = [];
  for (let y = 0; y < wh - 1; y++) for (let x = 0; x < ww - 1; x++) {
    const at = (dx, dy) => orig.at(wx + x + dx, wy + y + dy);
    if (at(0, 0) === I.W && at(1, 0) === I.f && at(0, 1) === I.f && at(1, 1) === I.d) beads.push([x + 1, y + 1]);
  }
  if (beads.length !== 3) throw new Error(`infotron at ${wx},${wy}: found ${beads.length} beads`);
  const rest = INFOTRON_BEADS.map(([x, y]) => [x - 8, y - 8]);
  const mc = beads.reduce((s, b) => [s[0] + b[0] / 3, s[1] + b[1] / 3], [0, 0]);
  const rc = rest.reduce((s, b) => [s[0] + b[0] / 3, s[1] + b[1] / 3], [0, 0]);
  let best = null;
  for (const perm of [[0, 1, 2], [1, 2, 0], [2, 0, 1]]) {
    let dot = 0, cross = 0;
    perm.forEach((j, i) => {
      const [ax, ay] = [rest[i][0] - rc[0], rest[i][1] - rc[1]];
      const [bx, by] = [beads[j][0] - mc[0], beads[j][1] - mc[1]];
      dot += ax * bx + ay * by; cross += ax * by - ay * bx;
    });
    const a = Math.atan2(cross, dot);
    let err = 0;
    perm.forEach((j, i) => {
      const [ax, ay] = [rest[i][0] - rc[0], rest[i][1] - rc[1]];
      const px = ax * Math.cos(a) - ay * Math.sin(a) + mc[0], py = ax * Math.sin(a) + ay * Math.cos(a) + mc[1];
      err += (px - beads[j][0]) ** 2 + (py - beads[j][1]) ** 2;
    });
    if (!best || err < best.err) best = { err, a };
  }
  // the cell centre goes where the rotated rest centroid lands on the measured one
  const a = best.a;
  const cx = mc[0] - (rc[0] * Math.cos(a) - rc[1] * Math.sin(a));
  const cy = mc[1] - (rc[0] * Math.sin(a) + rc[1] * Math.cos(a));
  return { cx, cy, angle: a * 180 / Math.PI };
}

export function place(scene) {
  const { orig } = scene;
  for (const name of ['zonk-roll-left', 'zonk-roll-right', 'zonk-fall', 'spare-zonk']) {
    for (const win of scene.windows(name)) {
      const z = measureZonk(orig, win);
      scene.put(`zonk@${z.x},${z.y}`, z.x, z.y, t => zonk(t, { angle: z.angle }), win);
    }
  }
  for (const name of ['infotron-roll-left', 'infotron-roll-right', 'infotron-fall', 'spare-infotron']) {
    for (const win of scene.windows(name)) {
      const f = measureInfotron(orig, win);
      // snap to the half-pixel and the 15-degree step the hand-drawn frames approximate
      const cx = Math.round(f.cx * 2) / 2, cy = Math.round(f.cy * 2) / 2;
      const angle = Math.round(f.angle / 15) * 15;
      scene.put(`infotron@${win[0] + cx},${win[1] + cy}`, win[0], win[1], t => infotron(t, { angle, cx, cy }), win);
    }
  }
}
