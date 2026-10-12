// The SVG toolkit the remastered graphics are drawn with: the game palette,
// a small builder for one SVG document's defs, element helpers, and the parts
// that more than one object shares (pads, beads, pins, raised relief, plates).
//
// Everything is in the original's pixel units: 1 unit is one original pixel.

// PALETTES.DAT palette 1, the in-game palette, by the letter used for it when
// reading the tiles as text.
export const P = {
  K: '#000000', W: '#ffffff', Y: '#eeee00', g: '#008855', G: '#00bb66', s: '#bbbbbb',
  R: '#ee1111', m: '#999999', L: '#7799ee', B: '#5555dd', n: '#884400', r: '#bb0000',
  O: '#ff9944', d: '#666666', e: '#777777', f: '#888888',
};

// --- colour ----------------------------------------------------------------

export const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export const hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
export const lighten = (c, t) => mix(c, '#ffffff', t);
export const darken = (c, t) => mix(c, '#000000', t);

// --- svg -------------------------------------------------------------------

export const f2 = n => +n.toFixed(3);

export class Tile {
  constructor() { this.defs = []; this.body = []; this.ids = { n: 0 }; }
  id(p) { return `${p}${this.ids.n++}`; }
  /** A drawing context that shares this one's defs and ids but collects its own body. */
  sub() { const s = Object.create(this); s.body = []; return s; }
  add(...s) { this.body.push(...s); return this; }
  stops(list) {
    return list.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a === 1 ? '' : ` stop-opacity="${a}"`}/>`).join('');
  }
  lin(x1, y1, x2, y2, list) {
    const id = this.id('l');
    this.defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${this.stops(list)}</linearGradient>`);
    return `url(#${id})`;
  }
  rad(cx, cy, r, list, fx = cx, fy = cy) {
    const id = this.id('r');
    this.defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}" fx="${fx}" fy="${fy}">${this.stops(list)}</radialGradient>`);
    return `url(#${id})`;
  }
  clip(shape) {
    const id = this.id('c');
    this.defs.push(`<clipPath id="${id}">${shape}</clipPath>`);
    return `url(#${id})`;
  }
  blur(sd) {
    const id = this.id('b');
    this.defs.push(`<filter id="${id}" filterUnits="userSpaceOnUse" x="-20" y="-20" width="90" height="90"><feGaussianBlur stdDeviation="${sd}"/></filter>`);
    return `url(#${id})`;
  }
  mask(inner) {
    const id = this.id('m');
    this.defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="90" height="90">${inner}</mask>`);
    return `url(#${id})`;
  }
  svg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="256" height="256">\n<defs>${this.defs.join('\n')}</defs>\n${this.body.join('\n')}\n</svg>\n`;
  }
}

export const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" fill="${fill}"${extra ? ' ' + extra : ''}/>`;
export const poly = (pts, fill, extra = '') => `<polygon points="${pts.map(p => p.map(f2).join(',')).join(' ')}" fill="${fill}"${extra ? ' ' + extra : ''}/>`;
export const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra ? ' ' + extra : ''}/>`;
export const circle = (cx, cy, r, fill, extra = '') => `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r)}" fill="${fill}"${extra ? ' ' + extra : ''}/>`;
export const line = (d, stroke, w, extra = '') => {
  const cap = extra.includes('stroke-linecap') ? '' : ' stroke-linecap="round"';
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}"${cap} stroke-linejoin="round"${extra ? ' ' + extra : ''}/>`;
};
export const group = (attrs, inner) => `<g ${attrs}>${[].concat(inner).join('')}</g>`;

// Swap x and y. Light from the top-left stays light from the top-left.
export const TRANSPOSE = 'transform="matrix(0,1,1,0,0,0)"';
export const MIRROR_X = 'transform="matrix(-1,0,0,1,16,0)"';

// --- shared parts ------------------------------------------------------------

/** A domed silver solder pad: the 2x2 "W e / s d" blob on the boards. */
export function pad(t, x, y) {
  const cx = x + 1, cy = y + 1;
  return circle(cx + 0.15, cy + 0.2, 1.05, '#000', 'opacity="0.3"') +
    circle(cx, cy, 1.0, t.rad(cx - 0.4, cy - 0.4, 1.5, [[0, '#ffffff'], [0.3, '#d6d6d6'], [0.65, '#9a9a9a'], [1, '#5c5c5c']])) +
    circle(cx - 0.35, cy - 0.38, 0.28, '#fff', 'opacity="0.85"');
}

/** A small chrome bead -- the nuclei inside an infotron. */
export function bead(t, cx, cy, r = 0.95) {
  return circle(cx, cy, r, t.rad(cx - r * 0.35, cy - r * 0.4, r * 1.5, [[0, '#ffffff'], [0.25, '#e4e4e4'], [0.55, '#9c9c9c'], [0.85, '#666'], [1, '#444']])) +
    circle(cx - r * 0.33, cy - r * 0.38, r * 0.28, '#fff', 'opacity="0.9"');
}

/**
 * Raised relief lit from the top-left, built from geometry rather than a
 * lighting filter (those work in device pixels, so they would look different at
 * every size the master is rendered at). `draw(paint, scale)` returns the shapes
 * in a given paint; it is called for the cast shadow, the dark lower-right rim,
 * the face, and a thin highlight that is masked to the face.
 */
export function raised(t, draw, { face, rim, shine = '#fff', shineOpacity = 0.5, shineWidth = 0.38, cast = 0.3, depth = 0.1 }) {
  const out = [];
  if (cast) out.push(group(`transform="translate(${depth * 1.8},${depth * 2.2})" opacity="${cast}"`, draw('#000', 1)));
  out.push(group(`transform="translate(${depth},${depth})"`, draw(rim, 1)));
  out.push(draw(face, 1));
  const m = t.mask(draw('#fff', 1));
  out.push(group(`mask="${m}"`, group(`transform="translate(${-depth * 1.5},${-depth * 1.5})" opacity="${shineOpacity}"`, draw(shine, shineWidth))));
  return out.join('');
}

/** Bright green PCB traces, raised off the board. */
export function traces(t, segments, { width = 1, colour = P.G } = {}) {
  const segs = segments.map(s => typeof s === 'string' ? { d: s, w: width } : s);
  return raised(t, (paint, k) => segs.map(s => line(s.d, paint, s.w * k, 'stroke-linecap="square"')).join(''),
    { face: colour, rim: '#007a46', shine: '#7dffbb', shineOpacity: 0.4, shineWidth: 0.28, cast: 0.22 });
}

/** Blocky bright regions of a board that are not lines, raised the same way. */
export function traceFills(t, rects, colour = P.G) {
  return raised(t, (paint, k) => rects.map(([x, y, w, h]) => k === 1
    ? rect(x, y, w, h, paint, 'rx="0.3"')
    : rect(x + 0.1, y + 0.1, Math.max(0.2, (w - 0.2) * 0.45), h - 0.2, paint, 'rx="0.15"')).join(''),
  { face: colour, rim: '#007a46', shine: '#7dffbb', shineOpacity: 0.4, shineWidth: 0.28, cast: 0.22 });
}

/** The plain green circuit board under several of the hardware tiles. */
export const board = () => rect(0, 0, 16, 16, P.g);

/** A drop shadow: the same shapes, black, nudged down-right and softened. */
export function shadow(t, inner, dx = 0.6, dy = 0.7, opacity = 0.4, sd = 0.3) {
  return group(`transform="translate(${dx},${dy})" filter="${t.blur(sd)}" opacity="${opacity}"`, inner);
}

/** The square bevelled frame of the grey hardware plates (tiles 29-32). */
export function plate(t) {
  return [
    poly([[0, 0], [16, 0], [14, 2], [2, 2]], t.lin(0, 0, 0, 2, [[0, '#a8a8a8'], [1, '#949494']])),
    poly([[0, 0], [2, 2], [2, 14], [0, 16]], t.lin(0, 0, 2, 0, [[0, '#a2a2a2'], [1, '#919191']])),
    poly([[16, 0], [16, 16], [14, 14], [14, 2]], t.lin(14, 0, 16, 0, [[0, '#6a6a6a'], [1, '#5a5a5a']])),
    poly([[0, 16], [2, 14], [14, 14], [16, 16]], t.lin(0, 14, 0, 16, [[0, '#6a6a6a'], [1, '#585858']])),
    rect(2, 2, 12, 12, t.lin(2, 2, 14, 14, [[0, '#7c7c7c'], [1, '#727272']])),
    // crisp edge lines where the bevel turns
    line('M0.1,15.9 V0.1 H15.9', '#c4c4c4', 0.18, 'opacity="0.7" stroke-linecap="butt"'),
    line('M2,14 V2 H14', '#5a5a5a', 0.14, 'opacity="0.6" stroke-linecap="butt"'),
    line('M2,14 H14 V2', '#a0a0a0', 0.14, 'opacity="0.6" stroke-linecap="butt"'),
  ].join('');
}

/** A gold chip pin. `lit` pins (top, left) run white to yellow; shaded ones yellow to orange. */
export function pin(t, x, y, w, h, along, lit) {
  // `along` is the direction from the body out to the tip: 'up' | 'down' | 'left' | 'right'
  const [x1, y1, x2, y2] = {
    up: [0, y + h, 0, y], down: [0, y, 0, y + h], left: [x + w, 0, x, 0], right: [x, 0, x + w, 0],
  }[along];
  const stops = lit
    ? [[0, '#d8d800'], [0.35, P.Y], [0.75, '#ffff9a'], [1, '#ffffff']]
    : [[0, '#f2e200'], [0.4, '#eecc22'], [0.8, P.O], [1, '#e07a30']];
  const across = along === 'up' || along === 'down'
    ? t.lin(x, 0, x + w, 0, [[0, '#000', 0.25], [0.35, '#fff', 0.25], [0.6, '#fff', 0], [1, '#000', 0.3]])
    : t.lin(0, y, 0, y + h, [[0, '#000', 0.25], [0.35, '#fff', 0.25], [0.6, '#fff', 0], [1, '#000', 0.3]]);
  return rect(x, y, w, h, t.lin(x1, y1, x2, y2, stops), 'rx="0.12"') + rect(x, y, w, h, across, 'rx="0.12"');
}

