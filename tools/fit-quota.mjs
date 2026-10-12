// Measures what each level actually yields, and records it for the generator.
// Run with `npm run quota`, then rebuild the pack.
//
// Quotas used to be written by hand alongside the level, and several of them
// asked for more infotrons than the board could ever produce -- level 14 wanted
// 38 from a board holding 27. On a dig-field the authored count is not the
// answer either: the field lays what the seed lays, and some of it ends up
// behind chassis a gate put there.
//
// So the quota is measured. This plays the generated solution, lets it open
// every gate and sweep, and writes down what came back. `npm run audit` is what
// stops a measured quota from being a soft one: it turns a naive collector
// loose on the same board and fails the build if walking about is enough.

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { parseLevel } from '../public/js/tiles.js';
import { Game } from '../public/js/engine.js';
import { loadLevels, loadSolutions } from './pack.mjs';
import * as router from './router.mjs';

router.allowPushing(true);
const require = createRequire(import.meta.url);
const LEVELS = loadLevels();
const SOLUTIONS = await loadSolutions();

// The quota has to sit in the gap between two measurements: above what a naive
// walker can reach, so the gate means something, and at or below what the
// solution yields, so the level can be finished. Picking a fixed fraction of
// the yield satisfied neither reliably -- it made half the pack walkable.
const REACH = 0.95;   // headroom under the solution's yield
const BITE = 0.6;     // how far up the gap between walking and solving to sit

/** What a player with no plan can collect, which is what the gate must beat. */
function walkerCeiling(lvl) {
  const g = new Game(lvl);
  const was = router.pushingAllowed();
  router.allowPushing(false);   // a walker does not shove; every gate here is a shove
  try { router.sweep(g, 9999); } catch { /* it stops where it stops */ }
  router.allowPushing(was);
  return g.collected;
}

const out = {};
for (const [i, def] of LEVELS.entries()) {
  const g = new Game(parseLevel(def, i));
  const api = {
    goTo: (x, y) => router.goTo(g, [x, y]), press: (d, k) => router.press(g, d, k),
    grab: (d) => router.grab(g, d), plant: (d) => router.plant(g, d),
    wait: (k) => router.wait(g, k), collect: (...a) => router.collect(g, ...a),
    gather: () => router.gather(g), sweep: (k) => router.sweep(g, k),
    // The bay being shut is the whole point of running this: swallow it and
    // read off what the sweep managed before it got there.
    toExit: () => { try { router.toExit(g); } catch { /* measured anyway */ } },
  };
  let swept = false;
  // Both sides are measured at full stretch. The solution's own sweep stops at
  // the quota, and comparing that against a walker who sweeps until nothing is
  // left says only that the quota is low -- it made every early level look
  // ungateable. What is wanted is the ceiling each can reach.
  const watched = { ...api, sweep: () => { swept = true; return api.sweep(9999); } };
  try { SOLUTIONS[i].play(watched); } catch { /* a gate may strand it */ }

  const yielded = g.collected;
  const label = `${String(i + 1).padStart(2)}. ${def.name}`;
  if (!swept || g.state === 'dead') {
    console.log(`${label.padEnd(26)} skipped -- ${g.state === 'dead' ? 'died' : 'never reached the sweep'}`);
    continue;
  }
  const walker = walkerCeiling(parseLevel(def, i));
  const ceiling = Math.floor(yielded * REACH);
  const fitted = Math.max(Math.min(walker + 1 + Math.round((ceiling - walker) * BITE), ceiling), 1);
  out[def.name] = fitted;
  const gated = fitted > walker ? '' : '  UNGATEABLE: walking gets it all';
  console.log(`${label.padEnd(24)} walk ${String(walker).padStart(3)}  yield ${String(yielded).padStart(3)}`
    + `  quota ${String(fitted).padStart(3)}${gated}`);
}

writeFileSync('tools/levelgen/quota.json', JSON.stringify(out, null, 2) + '\n');
console.log(`\n${Object.keys(out).length} quotas measured`);
