// Replays the recorded solution for every level and proves it still wins.
// Run with `npm run solve`.
//
// This is the test that actually protects the level pack: a level can look fine
// and validate structurally while being impossible to finish. Here the router
// has to walk it, from spawn to exit, without dying.

import { createRequire } from 'node:module';
import { parseLevel } from '../public/js/tiles.js';
import { Game } from '../public/js/engine.js';
import { loadLevels, loadSolutions } from './pack.mjs';
import * as router from './router.mjs';

// The recorded solutions may shove a capacitor out of a corridor; the audit may
// not. Every gate in the pack is a shove of one kind or another, so a player
// that shoves by reflex would measure nothing.
router.allowPushing(true);

const require = createRequire(import.meta.url);
const LEVELS = loadLevels();
const SOLUTIONS = await loadSolutions();

/** The verbs a solution may use; everything binds to one running game. */
function api(g) {
  return {
    goTo: (x, y) => router.goTo(g, [x, y]),
    press: (dir, n) => router.press(g, dir, n),
    grab: (dir) => router.grab(g, dir),
    plant: (dir) => router.plant(g, dir),
    wait: (n) => router.wait(g, n),
    collect: (...a) => router.collect(g, ...a),
    gather: () => router.gather(g),
    sweep: (n) => router.sweep(g, n),
    toExit: () => router.toExit(g),
  };
}

let failures = 0;
let skipped = 0;
const report = [];

for (const [i, def] of LEVELS.entries()) {
  const label = `${String(i + 1).padStart(2)}. ${def.name}`;
  const solution = SOLUTIONS[i];

  if (!solution) {
    // An imported original has no recorded solution and is not going to get
    // one: nothing here has walked all 111, and a level nobody has solved is
    // not evidence of a broken level. Its structure is checked by `npm run
    // validate` instead. A level we wrote without a solution is still a fault.
    if (def.gate === 'original') {
      skipped++;
      report.push({ label, status: 'skip', detail: 'original design, no recorded solution' });
      continue;
    }
    report.push({ label, status: 'FAIL', detail: 'no recorded solution' });
    failures++;
    continue;
  }

  let lvl;
  try {
    lvl = parseLevel(def, i);
  } catch (err) {
    report.push({ label, status: 'FAIL', detail: `will not parse: ${err.message}` });
    failures++;
    continue;
  }

  const g = new Game(lvl);
  let detail = '';
  let status = 'FAIL';

  try {
    solution.play(api(g));
    if (g.state === 'won') {
      status = ' ok ';
      detail = `won in ${g.steps} moves, ${g.tick} steps, ${g.collected}/${g.need} infotrons`;
    } else if (g.state === 'dead') {
      detail = `Murphy died with ${g.collected}/${g.need} at ${g.mi % g.w},${(g.mi / g.w) | 0}`;
    } else {
      detail = `ran out of plan with ${g.collected}/${g.need} at ${g.mi % g.w},${(g.mi / g.w) | 0}`;
    }
  } catch (err) {
    detail = `${err.message} (had ${g.collected}/${g.need}, state ${g.state})`;
  }

  if (status !== ' ok ') failures++;
  report.push({ label, status, detail });
}

console.log('SupRemix solution replay\n');
for (const r of report) {
  if (r.status === 'skip' && !process.env.VERBOSE) continue;
  console.log(`${r.status} ${r.label.padEnd(24)} ${r.detail}`);
}
const played = LEVELS.length - skipped;
console.log(`\n${played - failures}/${played} levels replayed`
  + (skipped ? `, ${skipped} original designs have no recorded solution (VERBOSE=1 to list)` : ''));
process.exit(failures ? 1 : 0);
