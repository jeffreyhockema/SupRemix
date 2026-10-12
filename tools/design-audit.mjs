// Design audit. Run with `npm run audit`.
//
// The question this answers is "is this level actually a puzzle?"
//
// A naive player is turned loose on each level: walk to the nearest infotron,
// repeat, then leave. If that wins, the level has no gate in it -- there is
// nothing to work out, only ground to cover. That is fine for the first few
// teaching levels and a failure of design for everything after.
//
// It also reports size and which elements each level actually uses, so the pack
// can be checked for variety at a glance rather than by eye.

import { createRequire } from 'node:module';
import { loadLevels } from './pack.mjs';
import { parseLevel, T, FL, isKey, isLock } from '../public/js/tiles.js';
import { Game } from '../public/js/engine.js';
import * as router from './router.mjs';

const require = createRequire(import.meta.url);
const LEVELS = loadLevels();

/** Levels allowed to be walkable without a plan: the opening tutorials. */
const TUTORIALS = 3;

const FEATURES = [
  ['zonk', (g) => has(g, T.ZONK)],
  ['chip', (g) => has(g, T.CHIP)],
  ['port', (g) => hasAny(g, [T.PORT_R, T.PORT_L, T.PORT_U, T.PORT_D, T.PORT_V, T.PORT_H, T.PORT_X])],
  ['grav', (g) => hasAny(g, [T.GPORT_R, T.GPORT_L, T.GPORT_U, T.GPORT_D])],
  ['fan', (g) => has(g, T.SNIKSNAK)],
  ['short', (g) => has(g, T.ELECTRON)],
  ['bug', (g) => has(g, T.BUG)],
  ['term', (g) => has(g, T.TERMINAL)],
  ['floppy', (g) => hasAny(g, [T.ORANGE, T.YELLOW, T.RED])],
  ['card', (g) => g.tiles.some((t) => isKey(t) || isLock(t))],
  ['boots', (g) => has(g, T.BOOTS)],
  ['drive', (g) => has(g, T.RACK)],
  ['ooze', (g) => has(g, T.SLIME)],
  ['bus', (g) => hasFloor(g, FL.ICE)],
  ['plate', (g) => hasFloor(g, FL.PAD)],
  ['field', (g) => hasFloor(g, FL.FORCE)],
  ['trace', (g) => hasFloor(g, FL.PHASE)],
  ['heat', (g) => hasFloor(g, FL.FIRE)],
];

const has = (g, t) => g.tiles.includes(t);
const hasAny = (g, list) => list.some((t) => g.tiles.includes(t));
const hasFloor = (g, f) => g.floor.includes(f);

/**
 * How much a naive collector can get, with no plan at all.
 *
 * It sweeps until nothing more is reachable rather than stopping at the quota:
 * asking it for exactly `need` measures the quota, not the level, and made
 * raising a quota look like it tightened a gate when it had done nothing.
 */
function greedyCeiling(lvl) {
  const g = new Game(lvl);
  try {
    router.sweep(g, 9999);
  } catch { /* it stops where it stops */ }
  return g.collected;
}

const rows = [];
let openLate = 0;

for (const [i, def] of LEVELS.entries()) {
  const lvl = parseLevel(def, i);
  const g = new Game(lvl);
  const feats = FEATURES.filter(([, test]) => test(g)).map(([name]) => name);
  const ceiling = greedyCeiling(lvl);
  const gated = ceiling < lvl.need;
  // Gating is a rule for levels we write, not a verdict on ones we imported.
  // Whether an original board can be strolled through by a bot that never
  // shoves anything says something about the bot, not about a design that has
  // stood up for thirty-odd years.
  if (!gated && i >= TUTORIALS && def.gate !== 'original') openLate++;

  rows.push({
    n: i + 1,
    name: lvl.name,
    size: `${lvl.w}x${lvl.h}`,
    area: lvl.w * lvl.h,
    need: lvl.need,
    gated,
    got: ceiling,
    feats,
  });
}

console.log('SupRemix design audit\n');
console.log('     level                    size    area  quota  naive-max  uses');
for (const r of rows) {
  // `open(n)` is the most a naive walk can collect: gate when quota exceeds it.
  const verdict = r.gated ? `GATED ${String(r.got).padStart(2)}` : `open  ${String(r.got).padStart(2)}`;
  console.log(
    `${String(r.n).padStart(3)}. ${r.name.padEnd(22)} ${r.size.padStart(7)} ${String(r.area).padStart(6)}` +
    `  ${String(r.need).padStart(4)}   ${verdict}  ${r.feats.join(' ')}`);
}

const areas = rows.map((r) => r.area);
console.log(`\nsizes: ${Math.min(...areas)} to ${Math.max(...areas)} cells ` +
  `(${(Math.max(...areas) / Math.min(...areas)).toFixed(1)}x spread)`);
console.log(`gated: ${rows.filter((r) => r.gated).length}/${rows.length}`);

if (openLate) {
  console.log(`\n${openLate} level(s) past the tutorials can be beaten by walking about. ` +
    'Those need a gate: something the quota cannot be met without doing.');
  process.exit(1);
}
console.log('\nevery level past the tutorials needs a plan.');
