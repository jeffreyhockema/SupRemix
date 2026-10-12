// Replays one level's solution and says where it went wrong.
// Run with `npm run inspect <level>`.
//
//   --trace   one line per move: where Murphy ended up, what he has
//             collected, and how many drive bays he can still reach.
//             A bay count that drops to nought is the move that
//             stranded him, which is the only thing worth knowing.
//   --fresh   skip the solution and report the board as authored.
//
// The board is printed afterwards in the same glyphs as `npm run peek`,
// except that an empty cell the router cannot reach is a comma rather
// than a dot, and Murphy is an at-sign.
//
// ROUTER_TRACE=1 additionally logs every infotron the collector takes.

import { createRequire } from 'node:module';
import { parseLevel, T, FL, isKey, isLock } from '../public/js/tiles.js';
import { Game } from '../public/js/engine.js';
import { loadLevels, loadSolutions } from './pack.mjs';
import * as router from './router.mjs';
router.allowPushing(true);
const require = createRequire(import.meta.url);
const LEVELS = loadLevels();
const SOLUTIONS = await loadSolutions();
const n = Number(process.argv[2]) - 1;
const def = LEVELS[n];
const g = new Game(parseLevel(def, n));
const api = {
  goTo: (x, y) => router.goTo(g, [x, y]), press: (d, k) => router.press(g, d, k),
  grab: (d) => router.grab(g, d), plant: (d) => router.plant(g, d),
  wait: (k) => router.wait(g, k), collect: (...a) => router.collect(g, ...a),
  gather: () => router.gather(g), sweep: (k) => router.sweep(g, k),
  toExit: () => router.toExit(g),
};
function bays(gg) {
  const r = router.distanceField(gg);
  let n = 0;
  for (let i = 0; i < gg.tiles.length; i++) {
    if (gg.tiles[i] !== T.EXIT) continue;
    if (r[i] >= 0 || [-1, 1, -gg.w, gg.w].some((d) => r[i + d] >= 0)) n++;
  }
  return n;
}
if (process.argv.includes('--trace')) {
  for (const k of Object.keys(api)) {
    const fn = api[k];
    api[k] = (...a) => {
      const before = bays(g);
      let err = '';
      try { return fn(...a); } catch (e) { err = ' !! ' + e.message; throw e; }
      finally {
        const mx2 = g.mi % g.w, my2 = (g.mi / g.w) | 0;
        console.log(`  ${k}(${a.join(', ')})`.padEnd(24)
          + ` murphy ${mx2},${my2}  got ${g.collected}  bays ${before}->${bays(g)}${err}`);
      }
    };
  }
}
if (!process.argv.includes('--fresh')) {
  try { SOLUTIONS[n].play(api); } catch (e) { console.log('threw:', e.message); }
}
{
  const r = router.distanceField(g);
  const bays = [];
  for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i] === T.EXIT) bays.push(i);
  const near = bays.filter((i) => r[i] >= 0 || [-1, 1, -g.w, g.w].some((d) => r[i + d] >= 0));
  console.log(`drive bays ${bays.length}, reachable ${near.length}`);
}
const mx = g.mi % g.w, my = (g.mi / g.w) | 0;
console.log(`${def.name}: murphy ${mx},${my} state ${g.state} got ${g.collected}/${g.need}`);
const reach = router.distanceField(g);
let left = 0, near = 0;
for (let i = 0; i < g.tiles.length; i++) {
  if (g.tiles[i] !== T.INFOTRON) continue;
  left++; if (reach[i] >= 0) near++;
}
console.log(`infotrons left ${left}, reachable ${near}`);
const G = {
  [T.EMPTY]: '.', [T.ZONK]: 'O', [T.BASE]: ':', [T.MURPHY]: 'M', [T.INFOTRON]: 'I',
  [T.CHIP]: '=', [T.CHIP_L]: '[', [T.CHIP_R]: ']', [T.CHIP_T]: '"', [T.CHIP_B]: '_',
  [T.HARDWARE]: '#', [T.HW_GREEN]: '%', [T.HW_RED]: '&', [T.EXIT]: 'E',
  [T.ORANGE]: 'o', [T.YELLOW]: 'y', [T.RED]: 'r', [T.SNIKSNAK]: 'S', [T.ELECTRON]: 'e',
  [T.BUG]: 'B', [T.TERMINAL]: 'T', [T.RACK]: 'H', [T.SLIME]: '*', [T.BOOTS]: 'w',
  [T.PORT_U]: '^', [T.PORT_R]: '>', [T.PORT_D]: 'v', [T.PORT_L]: '<',
};
const FG = { [FL.ICE]: '~', [FL.PAD]: '+', [FL.PHASE]: ';', [FL.FIRE]: 'X', [FL.FORCE]: 'F' };
const M = new Proxy({}, { get: () => undefined });
for (let y = 0; y < g.h; y++) {
  let row = String(y).padStart(3) + ' ';
  for (let x = 0; x < g.w; x++) {
    const i = y * g.w + x;
    const t = g.tiles[i];
    let ch = t === T.EMPTY && g.floor[i] ? (FG[g.floor[i]] ?? '.')
      : isKey(t) ? 'acgp'[t - T.KEY_A] : isLock(t) ? 'ACGP'[t - T.LOCK_A] : (G[t] ?? '?');
    if (i === g.mi) ch = '@';
    else if (ch === '.' && reach[i] < 0) ch = ',';   // open but the router cannot get there
    row += ch;
  }
  console.log(row);
}
