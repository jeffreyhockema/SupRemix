// Reads the extracted originals back as palette indices, for measuring.
//
// The remastered sheet is placed by looking at the original: where a zonk sits
// in a frame, which way its band points, how far Murphy's jaw is open. Those are
// read from assets/original/*.png (written by tools/extract-sprites.mjs), which
// are 8-bit indexed with no row filtering, so decoding is just an inflate.

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

// Palette indices by the letters the tile comments use.
export const I = { K: 0, W: 1, Y: 2, g: 3, G: 4, s: 5, R: 6, m: 7, L: 8, B: 9, n: 10, r: 11, O: 12, d: 13, e: 14, f: 15 };

export function loadIndexed(file) {
  const buf = readFileSync(file);
  let at = 8, w = 0, h = 0;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at), type = buf.toString('ascii', at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(data);
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    if (raw[y * (w + 1)] !== 0) throw new Error(`${file}: row ${y} uses a PNG filter; expected the extractor's unfiltered output`);
    px.set(raw.subarray(y * (w + 1) + 1, (y + 1) * (w + 1)), y * w);
  }
  return {
    w, h, px,
    at(x, y) { return x < 0 || y < 0 || x >= w || y >= h ? 0 : px[y * w + x]; },
    /** Every pixel in a rect whose index passes `test`, as [x, y, index] relative to the rect. */
    pick([rx, ry, rw, rh], test = c => c !== 0) {
      const out = [];
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        const c = this.at(rx + x, ry + y);
        if (test(c)) out.push([x, y, c]);
      }
      return out;
    },
  };
}

/** Bounding box [x0, y0, x1, y1] (exclusive) of a pixel list, or null. */
export function bbox(pts) {
  if (!pts.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
  return [x0, y0, x1, y1];
}

/** Centroid of a pixel list, in pixel-centre coordinates. */
export function centroid(pts) {
  let sx = 0, sy = 0;
  for (const [x, y] of pts) { sx += x + 0.5; sy += y + 0.5; }
  return [sx / pts.length, sy / pts.length];
}

/** Principal-axis angle of a pixel list in degrees, 0 = horizontal, in [0, 180). */
export function axisAngle(pts) {
  const [cx, cy] = centroid(pts);
  let xx = 0, yy = 0, xy = 0;
  for (const [x, y] of pts) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  const a = 0.5 * Math.atan2(2 * xy, xx - yy) * 180 / Math.PI;
  return (a + 180) % 180;
}

/**
 * Traces a set of pixels into smooth closed outlines, as one SVG path (use
 * fill-rule="evenodd" so holes stay holes).
 *
 * The outline is first walked along pixel edges, which gives a staircase; each
 * edge is then replaced by its midpoint and the polygon smoothed a few times
 * (Chaikin), so a one-pixel step becomes a straight diagonal and a corner
 * becomes a tight curve.
 * `pts` is a list of [x, y] pixels; `dx, dy` shift the output.
 */
export function trace(pts, { smooth = 2, sigma = 0, dx = 0, dy = 0 } = {}) {
  const on = new Set(pts.map(([x, y]) => `${x},${y}`));
  pts = [...on].map(k => k.split(',').map(Number));
  const has = (x, y) => on.has(`${x},${y}`);
  // directed boundary edges, clockwise around filled pixels (y down)
  const out = new Map(); // "x,y" -> list of [x2, y2]
  const add = (x1, y1, x2, y2) => { const k = `${x1},${y1}`; (out.get(k) || out.set(k, []).get(k)).push([x2, y2]); };
  for (const [x, y] of pts) {
    if (!has(x, y - 1)) add(x, y, x + 1, y);
    if (!has(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!has(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!has(x - 1, y)) add(x, y + 1, x, y);
  }
  const loops = [];
  for (const [start, list] of out) {
    while (list.length) {
      const loop = [start.split(',').map(Number)];
      let [px, py] = loop[0];
      let [nx, ny] = list.pop();
      let dirx = nx - px, diry = ny - py;
      while (!(nx === loop[0][0] && ny === loop[0][1])) {
        loop.push([nx, ny]);
        const cand = out.get(`${nx},${ny}`);
        // at a pinch (two pixels touching only at a corner) turn right, which
        // keeps diagonal neighbours as one shape -- what pixel art means by them
        let pick = 0;
        if (cand.length > 1) {
          const right = [-diry, dirx];
          pick = cand.findIndex(([cx, cy]) => cx - nx === right[0] && cy - ny === right[1]);
          if (pick < 0) pick = 0;
        }
        const [mx, my] = cand.splice(pick, 1)[0];
        dirx = mx - nx; diry = my - ny;
        [px, py] = [nx, ny]; [nx, ny] = [mx, my];
      }
      loops.push(loop);
    }
    out.delete(start);
  }
  return loops.map(loop => {
    // midpoints of each unit edge
    let p = loop.map((a, i) => { const b = loop[(i + 1) % loop.length]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; });
    // drop midpoints in the middle of straight runs; they add nothing
    p = p.filter((q, i) => {
      const a = p[(i - 1 + p.length) % p.length], b = p[(i + 1) % p.length];
      return Math.abs((q[0] - a[0]) * (b[1] - a[1]) - (q[1] - a[1]) * (b[0] - a[0])) > 1e-6;
    });
    // `sigma` (in pixels) smooths along the outline instead: resample evenly,
    // then a Gaussian over arc length. Flat runs on a pixel circle come out as
    // the arc they stand for, and the shape barely shrinks.
    if (sigma > 0 && p.length > 2) {
      const step = 0.25, even = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let s = 0; s < len; s += step) even.push([a[0] + (b[0] - a[0]) * s / len, a[1] + (b[1] - a[1]) * s / len]);
      }
      const n = even.length, r = Math.min(Math.floor(n / 2) - 1, Math.ceil(3 * sigma / step));
      const w = Array.from({ length: 2 * r + 1 }, (_, k) => Math.exp(-(((k - r) * step) ** 2) / (2 * sigma * sigma)));
      const ws = w.reduce((s, v) => s + v, 0);
      p = even.map((_, i) => {
        let x = 0, y = 0;
        for (let k = -r; k <= r; k++) { const q = even[(i + k + n) % n]; x += q[0] * w[k + r]; y += q[1] * w[k + r]; }
        return [x / ws, y / ws];
      }).filter((_, i) => i % 2 === 0);
      return 'M' + p.map(([x, y]) => `${+(x + dx).toFixed(2)},${+(y + dy).toFixed(2)}`).join('L') + 'Z';
    }
    for (let s = 0; s < smooth; s++) {
      const q = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      p = q;
    }
    return 'M' + p.map(([x, y]) => `${+(x + dx).toFixed(2)},${+(y + dy).toFixed(2)}`).join('L') + 'Z';
  }).join('');
}

/** Splits a pixel list into 8-connected groups. */
export function components(pts) {
  const left = new Map(pts.map(p => [`${p[0]},${p[1]}`, p]));
  const out = [];
  for (const [k0, p0] of left) {
    if (!left.has(k0)) continue;
    const group = [];
    const stack = [p0];
    left.delete(k0);
    while (stack.length) {
      const p = stack.pop();
      group.push(p);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const k = `${p[0] + dx},${p[1] + dy}`;
        if (left.has(k)) { stack.push(left.get(k)); left.delete(k); }
      }
    }
    out.push(group);
  }
  return out;
}

/** Convex hull of the pixels' squares, and a test for whether a pixel's centre is inside it. */
export function hull(pts) {
  const corners = [];
  for (const [x, y] of pts) corners.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]);
  corners.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of corners) { while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  for (const p of corners.reverse()) { while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  const h = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return {
    points: h,
    inside([x, y]) {
      const c = [x + 0.5, y + 0.5];
      for (let i = 0; i < h.length; i++) if (cross(h[i], h[(i + 1) % h.length], c) < 0) return false;
      return true;
    },
  };
}

/**
 * One-pixel-wide line art as polylines: pixels joined to their neighbours
 * (a diagonal only where no square route joins them), walked into chains
 * between ends and junctions, then smoothed along their length. Returns SVG
 * path data, open chains as M..L and closed loops ending in Z.
 */
export function strokes(pts, { sigma = 0.9, dx = 0, dy = 0 } = {}) {
  const key = (x, y) => `${x},${y}`;
  const on = new Map(pts.map(([x, y]) => [key(x, y), [x, y]]));
  const nb = new Map();
  for (const [k, [x, y]] of on) {
    const list = [];
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (on.has(key(x + ox, y + oy))) list.push(key(x + ox, y + oy));
    for (const [ox, oy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      if (!on.has(key(x + ox, y + oy))) continue;
      if (on.has(key(x + ox, y)) || on.has(key(x, y + oy))) continue;
      list.push(key(x + ox, y + oy));
    }
    nb.set(k, list);
  }
  const used = new Set();
  const edge = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const chains = [];
  const walk = (start, next) => {
    const chain = [start];
    let prev = start, cur = next;
    used.add(edge(prev, cur));
    while (true) {
      chain.push(cur);
      const ns = nb.get(cur);
      if (ns.length !== 2) break;
      const n2 = ns.find(n => n !== prev && !used.has(edge(cur, n)));
      if (!n2) break;
      used.add(edge(cur, n2));
      prev = cur; cur = n2;
      if (cur === start) { chain.push(cur); break; }
    }
    return chain;
  };
  for (const [k, ns] of nb) if (ns.length !== 2) for (const n of ns) if (!used.has(edge(k, n))) chains.push(walk(k, n));
  for (const [k, ns] of nb) for (const n of ns) if (!used.has(edge(k, n))) chains.push(walk(k, n));
  for (const [k, ns] of nb) if (!ns.length) chains.push([k]);
  return chains.map(ch => {
    const closed = ch.length > 2 && ch[0] === ch.at(-1);
    let p = ch.map(k => on.get(k).map(v => v + 0.5));
    if (closed) p.pop();
    if (p.length > 2 && sigma > 0) {
      const r = Math.ceil(sigma * 2.5), w = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
      p = p.map((q, i) => {
        if (!closed && (i === 0 || i === p.length - 1)) return q;
        let sx = 0, sy = 0, sw = 0;
        for (let k = -r; k <= r; k++) {
          let j = i + k;
          if (closed) j = (j + p.length) % p.length; else if (j < 0 || j >= p.length) continue;
          sx += p[j][0] * w[k + r]; sy += p[j][1] * w[k + r]; sw += w[k + r];
        }
        return [sx / sw, sy / sw];
      });
    }
    if (p.length === 1) p = [p[0], [p[0][0] + 0.01, p[0][1]]];
    return 'M' + p.map(([x, y]) => `${+(x + dx).toFixed(2)},${+(y + dy).toFixed(2)}`).join('L') + (closed ? 'Z' : '');
  }).join('');
}
