// The HD redraw of MOVING.DAT, the animation sheet.
//
// The sheet is redrawn as a scene: every object the original has on it -- a
// zonk mid-roll, Murphy halfway into a port, a spark on a bug -- is placed where
// it sits in the original, posed as it is posed there, and clipped to the
// frame window it belongs to. Positions and poses are measured from the
// original's pixels (tools/remaster/pixels.mjs), not typed in, so a frame that
// moves 4px where its neighbours move 2px still does.
//
// The frames are then cut from the rendered sheet by the windows in
// tools/remaster/frames.mjs. Drawing the sheet rather than the frames is what
// lets overlapping windows agree: a 16x18 vertical-move frame shares rows with
// the frame below it, and both see the same pixels.
//
// Each family of objects lives in tools/remaster/moving/ and exports
// `place(scene)`.

import { Tile, f2 } from './svg.mjs';
import { ANIMATIONS } from './frames.mjs';
import { loadIndexed } from './pixels.mjs';

export const SHEET_W = 320, SHEET_H = 462;
const FAMILIES = ['rolling', 'murphy', 'effects'];

class Sheet extends Tile {
  svg(scale = 16) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET_W} ${SHEET_H}" width="${SHEET_W * scale}" height="${SHEET_H * scale}">\n<defs>${this.defs.join('\n')}</defs>\n${this.body.join('\n')}\n</svg>\n`;
  }
}

export async function buildSheet() {
  const sheet = new Sheet();
  const orig = loadIndexed('assets/original/moving.png');
  const anims = Object.fromEntries(ANIMATIONS.map(a => [a.name, a]));
  const placed = new Map();
  const scene = {
    sheet, orig, anims,
    /** The windows of an animation, as [x, y, w, h]. */
    windows(name) {
      const a = anims[name];
      if (!a) throw new Error(`no animation ${name}`);
      return a.frames.map(([x, y]) => [x, y, a.w, a.h]);
    },
    /**
     * Put an object on the sheet with its cell's top-left at (x, y), clipped
     * to `clip` ([x, y, w, h] in sheet coordinates). The same `key` placed twice
     * -- the same object seen through two overlapping windows -- draws once.
     */
    put(key, x, y, draw, clip) {
      if (placed.has(key)) return;
      const t = sheet.sub();
      const markup = draw(t);
      const [cx, cy, cw, ch] = clip;
      const c = sheet.clip(`<rect x="${f2(cx - x)}" y="${f2(cy - y)}" width="${cw}" height="${ch}"/>`);
      placed.set(key, clip);
      sheet.add(`<g transform="translate(${f2(x)},${f2(y)})" clip-path="${c}">${markup}</g>`);
    },
  };
  for (const f of FAMILIES) (await import(`./moving/${f}.mjs`)).place(scene);
  return { sheet, placed: [...placed.values()], orig };
}

/** Original pixels that nothing on the redrawn sheet covers: the work still to do. */
export function uncovered(orig, clips) {
  const cov = new Uint8Array(SHEET_W * SHEET_H);
  for (const [x, y, w, h] of clips) {
    for (let j = Math.max(0, y); j < Math.min(SHEET_H, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(SHEET_W, x + w); i++) cov[j * SHEET_W + i] = 1;
    }
  }
  let n = 0;
  for (let i = 0; i < cov.length; i++) if (orig.px[i] && !cov[i]) n++;
  return n;
}
