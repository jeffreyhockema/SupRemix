// Murphy, alone or with what he is pushing, eating or carrying.
//
// The other object in a frame -- the base he is eating through, the zonk he is
// pushing, a disk -- is the original's own tile, shifted and partly cut away.
// So each is found by matching that tile against the frame: the best offset is
// where it sits, and the pixels that agree are the part still showing. It is
// drawn from the remaster's tile, clipped to that part. Whatever no tile claims
// is Murphy, and is read and redrawn by ./ball.mjs.

import { loadIndexed, bbox, components, I } from '../pixels.mjs';
import { readBall, drawBall } from './ball.mjs';
import { T } from '../fixed.mjs';
import { zonk } from '../objects.mjs';

const FIXED = loadIndexed('assets/original/fixed.png');
const tileRef = id => Array.from({ length: 256 }, (_, i) => FIXED.at(id * 16 + (i % 16), i >> 4));

// What each family of frames might have in it besides Murphy.
const OBJECTS = {
  base: { ref: () => tileRef(2), draw: t => { T.base(t); return ''; } },
  infotron: { ref: () => tileRef(4), draw: t => { T.infotron(t); return ''; } },
  'orange-disk': { ref: () => tileRef(8), draw: t => { T['orange-disk'](t); return ''; } },
  'yellow-disk': { ref: () => tileRef(18), draw: t => { T['yellow-disk'](t); return ''; } },
  'red-disk': { ref: () => tileRef(20), draw: t => { T['red-disk'](t); return ''; } },
};
const WITH = [
  [/eat-base/, ['base']], [/eat-infotron/, ['infotron']], [/push-zonk/, ['zonk']],
  [/yellow-disk/, ['yellow-disk']], [/orange-disk/, ['orange-disk']], [/red-disk/, ['red-disk']],
];

/**
 * Where the other object in a frame sits. An object being eaten stays in its
 * own cell -- the half of the window Murphy is heading into -- while a pushed
 * one leads him, so it is at the far edge of what the frame shows.
 */
function locate(orig, name, [wx, wy, ww, wh]) {
  const pts = orig.pick([wx, wy, ww, wh]);
  const [x0, y0, x1, y1] = bbox(pts);
  const dir = (name.match(/-(left|right|up|down)$/) || [])[1];
  if (/eat-/.test(name)) return dir === 'left' ? [wx, wy] : [wx + ww - 16, wy];
  if (dir === 'left') return [wx + x0, wy];
  if (dir === 'right') return [wx + x1 - 16, wy];
  if (dir === 'up') return [wx, wy + y0];
  return [wx, wy + y1 - 16];
}

/** The pixels of a 16x16 reference placed at (x, y) that the frame shows unchanged, in window coordinates. */
function shown(orig, [wx, wy, ww, wh], ref, x, y) {
  const pts = [];
  for (let i = 0; i < 256; i++) {
    const px = x - wx + (i % 16), py = y - wy + (i >> 4);
    if (px < 0 || py < 0 || px >= ww || py >= wh) continue;
    if (ref[i] && orig.at(wx + px, wy + py) === ref[i]) pts.push([px, py]);
  }
  return pts;
}

/** The zonk at each of its four band angles, cut from the original's own roll. */
function zonkRefs(scene) {
  const out = [];
  for (const [i, angle] of [[3, 0], [2, 45], [1, 90], [0, 135]]) {
    const [x, y] = scene.anims['zonk-roll-left'].frames[i];
    const pts = scene.orig.pick([x, y, 32, 16]);
    const x0 = bbox(pts)[0];
    out.push({ angle, ref: Array.from({ length: 256 }, (_, k) => scene.orig.at(x + x0 + (k % 16), y + (k >> 4))) });
  }
  return out;
}

export function place(scene) {
  const { orig } = scene;
  const zonks = zonkRefs(scene);
  const murphy = tileRef(3);
  const names = Object.keys(scene.anims).filter(n => n.startsWith('murphy') || n === 'spare-murphy');
  // biggest windows first, so a window that is a part of another (a port frame
  // is half of a walking frame) finds its Murphy already drawn
  const wins = names.flatMap(n => scene.windows(n).map(w => ({ n, w }))).sort((a, b) => b.w[2] * b.w[3] - a.w[2] * a.w[3]);
  const taken = new Set();
  for (const { n, w } of wins) {
    const [wx, wy, ww, wh] = w;
    const claimed = new Set();
    for (const kind of (WITH.find(([re]) => re.test(n)) || [, []])[1]) {
      const [ox, oy] = locate(orig, n, w);
      if (kind === 'zonk') {
        // the band angle whose zonk agrees best with the frame here
        const best = zonks.map(z => ({ ...z, pts: shown(orig, w, z.ref, ox, oy) })).sort((p, q) => q.pts.length - p.pts.length)[0];
        // all of it is zonk, whether or not this angle's pixels agree exactly
        orig.pick([ox, oy, 16, 16]).forEach(([x, y]) => claimed.add(`${ox - wx + x},${oy - wy + y}`));
        scene.put(`zonk@${ox},${oy}`, ox, oy, t => zonk(t, { angle: best.angle }), w);
        continue;
      }
      let pts = shown(orig, w, OBJECTS[kind].ref(), ox, oy);
      // An object being eaten survives as whole columns on the side away from
      // Murphy. Elsewhere its pixels can agree with his by chance -- a red disk's
      // label is the same red as his head -- so only that run of columns counts.
      if (/eat-/.test(n)) {
        const far = (n.match(/-(left|right)$/) || [])[1] === 'left' ? 0 : 15;
        const per = new Map();
        for (const [x] of pts) per.set(x - (ox - wx), (per.get(x - (ox - wx)) || 0) + 1);
        const keep = new Set();
        for (let c = far; c >= 0 && c < 16 && (per.get(c) || 0) >= 4; c += far ? -1 : 1) keep.add(c);
        pts = pts.filter(([x]) => keep.has(x - (ox - wx)));
      }
      if (pts.length < 4) continue;
      pts.forEach(([x, y]) => claimed.add(`${x},${y}`));
      // drawn whole but clipped to the part that still shows -- the columns it
      // spans, which is where it was cut as Murphy ate into it
      const [x0, y0, x1, y1] = bbox(pts);
      const eaten = /eat-/.test(n);
      const clip = eaten ? [wx + x0, wy + y0, x1 - x0, y1 - y0] : w;
      // the cut-off edge may still carry pixels the tile does not (its pads, half eaten)
      // -- its own colours, and what of a half-eaten pad still touches its green.
      // Murphy can be over it too, so nothing else there is taken from him.
      if (eaten) {
        const own = [I.g, I.G, I.B, I.L];
        const region = orig.pick(clip).map(([x, y, c]) => [clip[0] - wx + x, clip[1] - wy + y, c]);
        const green = new Set(region.filter(([, , c]) => c === I.g || c === I.G).map(([x, y]) => `${x},${y}`));
        for (const [x, y, c] of region) {
          const touchesGreen = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => green.has(`${x + dx},${y + dy}`));
          if (own.includes(c) || ([I.W, I.s, I.e, I.d].includes(c) && touchesGreen)) claimed.add(`${x},${y}`);
        }
      }
      scene.put(`${kind}@${ox},${oy}:${clip}`, ox, oy,
        t => { const sub = t.sub(); OBJECTS[kind].draw(sub); return sub.body.join(''); }, clip);
    }
    // what is left is Murphy (or nothing)
    let left = orig.pick(w).filter(([x, y]) => !claimed.has(`${x},${y}`));
    // Murphy is the big piece; slivers of whatever he is eating that the tile
    // match missed are left to that tile, which is drawn whole underneath
    const parts = components(left).sort((p, q) => q.length - p.length);
    if (parts.length > 1) {
      const [mx0, my0, mx1, my1] = bbox(parts[0]);
      left = parts.filter((g, i) => {
        if (i === 0) return true;
        const [a, b, c, d] = bbox(g);
        return g.length >= 12 && a <= mx1 + 1 && c >= mx0 - 1 && b <= my1 + 1 && d >= my0 - 1;
      }).flat();
    }
    // an infotron's strands are one pixel wide; where one still touches him, pare it off
    if (/eat-infotron/.test(n)) {
      for (let pass = 0; pass < 3; pass++) {
        const on = new Set(left.map(([x, y]) => `${x},${y}`));
        left = left.filter(([x, y]) => {
          let k = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && on.has(`${x + dx},${y + dy}`)) k++;
          return k >= 3;
        });
      }
    }
    if (left.length < 4) continue;
    const fresh = left.filter(([x, y]) => !taken.has(`${wx + x},${wy + y}`));
    if (fresh.length < left.length * 0.1) continue;
    left.forEach(([x, y]) => taken.add(`${wx + x},${wy + y}`));
    // exactly the resting tile? then the hand-drawn tile, so he matches it
    if (left.length === murphy.filter(Boolean).length) {
      const [x0, y0] = bbox(left);
      const mx = wx + x0, my = wy + y0;
      if (shown(orig, w, murphy, mx, my).length === left.length) {
        scene.put(`murphy@${mx},${my}`, mx, my, t => { const sub = t.sub(); T.murphy(sub); return sub.body.join(''); }, w);
        continue;
      }
    }
    scene.put(`ball@${wx},${wy},${ww},${wh}`, wx, wy, t => drawBall(t, readBall(left)), w);
  }
}
