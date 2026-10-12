// Records every cell each recorded solution actually walks through.
//
// The level generator uses this to decide where it may bury capacitors and
// thread chips: a Supaplex board is mostly hazard, but a hazard dropped on the
// one route through is not difficulty, it is a broken level. Everything the
// solution touches, plus a cell of margin, is left as drawn.
//
//   node tools/trace-solutions.mjs > path.json

import { createRequire } from 'node:module';
import { parseLevel } from '../public/js/tiles.js';
import { Game } from '../public/js/engine.js';
import { loadLevels, loadSolutions } from './pack.mjs';
import * as router from './router.mjs';

const require = createRequire(import.meta.url);
const LEVELS = loadLevels();
const SOLUTIONS = await loadSolutions();

const out = {};
for (const [i, def] of LEVELS.entries()) {
  const solution = SOLUTIONS[i];
  const lvl = parseLevel(def, i);
  const g = new Game(lvl);
  const seen = new Set();

  // Watch every step, not just the ones the solution names: the router does
  // most of the walking and that is exactly the part that must stay clear.
  const step = g.step.bind(g);
  g.step = (input) => {
    seen.add(g.mi);
    const r = step(input);
    seen.add(g.mi);
    return r;
  };

  try {
    solution?.play({
      goTo: (x, y) => router.goTo(g, [x, y]),
      press: (d, n) => router.press(g, d, n),
      grab: (d) => router.grab(g, d),
      plant: (d) => router.plant(g, d),
      wait: (n) => router.wait(g, n),
      collect: (n) => router.collect(g, n),
      gather: () => router.gather(g),
      sweep: (n) => router.sweep(g, n),
      toExit: () => router.toExit(g),
    });
  } catch { /* a partial trace is still worth protecting */ }

  // Interior coordinates, which is what the generator draws in.
  out[def.name] = [...seen]
    .map((idx) => [(idx % g.w) - 1, ((idx / g.w) | 0) - 1])
    .filter(([x, y]) => x >= 0 && y >= 0);
}
console.log(JSON.stringify(out));
