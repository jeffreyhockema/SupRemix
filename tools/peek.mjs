// Where is everything? `node tools/peek.mjs [level]`
//
// Authoring a solution means naming exact cells, and counting characters in an
// ASCII row by eye is how coordinate bugs get written. This prints the notable
// features of a level with their coordinates, and with `--map` the grid itself
// under a ruler.

import { createRequire } from 'node:module';
import { loadLevels } from './pack.mjs';
import { parseLevel, isChip, T, FL, isKey, isLock } from '../public/js/tiles.js';
import { Game } from '../public/js/engine.js';

const require = createRequire(import.meta.url);
const LEVELS = loadLevels();

const args = process.argv.slice(2);
const showMap = args.includes('--map');
const which = args.filter((a) => !a.startsWith('--')).map(Number);

const GLYPH = {
  [T.EMPTY]: '.', [T.ZONK]: 'O', [T.BASE]: ':', [T.MURPHY]: 'M', [T.INFOTRON]: 'I',
  [T.CHIP]: '=', [T.CHIP_L]: '[', [T.CHIP_R]: ']', [T.CHIP_T]: '"', [T.CHIP_B]: '_',
  [T.HARDWARE]: '#', [T.HW_GREEN]: '%', [T.HW_RED]: '&', [T.EXIT]: 'E',
  [T.ORANGE]: 'o', [T.YELLOW]: 'y', [T.RED]: 'r', [T.SNIKSNAK]: 'S', [T.ELECTRON]: 'e',
  [T.BUG]: 'B', [T.TERMINAL]: 'T', [T.RACK]: 'H', [T.SLIME]: '*', [T.BOOTS]: 'w',
};
const FLOOR_GLYPH = { [FL.ICE]: '~', [FL.PAD]: '@', [FL.PHASE]: ';', [FL.FIRE]: 'X', [FL.FORCE]: 'F' };

function glyph(g, i) {
  const t = g.tiles[i];
  if (t === T.EMPTY && g.floor[i]) return FLOOR_GLYPH[g.floor[i]] ?? '.';
  if (isKey(t)) return 'acgp'[t - T.KEY_A];
  if (isLock(t)) return 'ACGP'[t - T.LOCK_A];
  return GLYPH[t] ?? '?';
}

/** A capacitor walled in above and below is a plug: it has to be shoved. */
function isPlug(g, i) {
  if (g.tiles[i] !== T.ZONK) return false;
  const up = g.tiles[i - g.w], down = g.tiles[i + g.w];
  const solid = (t) => t === T.HARDWARE || isChip(t);
  return solid(up) && solid(down);
}

const targets = which.length ? which : LEVELS.map((_, i) => i + 1);

for (const n of targets) {
  const lvl = parseLevel(LEVELS[n - 1], n - 1);
  const g = new Game(lvl);
  const at = (i) => `${i % g.w},${(i / g.w) | 0}`;
  const find = (test) => {
    const out = [];
    for (let i = 0; i < g.tiles.length; i++) if (test(g, i)) out.push(at(i));
    return out;
  };

  console.log(`\n${n}. ${lvl.name}  ${lvl.w}x${lvl.h}  quota ${lvl.need}`);
  const lines = [
    ['murphy', [at(g.mi)]],
    ['exit', find((g2, i) => g2.tiles[i] === T.EXIT)],
    ['plugs', find(isPlug)],
    ['drives', find((g2, i) => g2.tiles[i] === T.RACK)],
    ['plates', g.pads.map(at)],
    ['switches', find((g2, i) => g2.tiles[i] === T.TERMINAL)],
    ['floppies', find((g2, i) => [T.ORANGE, T.YELLOW, T.RED].includes(g2.tiles[i]))],
    ['cards', find((g2, i) => isKey(g2.tiles[i]))],
    ['headers', find((g2, i) => isLock(g2.tiles[i]))],
    ['boots', find((g2, i) => g2.tiles[i] === T.BOOTS)],
    ['shorts', find((g2, i) => g2.tiles[i] === T.ELECTRON)],
    ['ooze', find((g2, i) => g2.tiles[i] === T.SLIME)],
  ];
  for (const [label, list] of lines) {
    if (list.length) console.log(`   ${label.padEnd(9)} ${list.join('  ')}`);
  }

  if (showMap) {
    const tens = [' '.repeat(5)];
    for (let x = 0; x < g.w; x++) tens.push(x % 10 === 0 ? String((x / 10) | 0) : ' ');
    console.log(tens.join(''));
    const ones = ['     '];
    for (let x = 0; x < g.w; x++) ones.push(String(x % 10));
    console.log(ones.join(''));
    for (let y = 0; y < g.h; y++) {
      let row = '';
      for (let x = 0; x < g.w; x++) row += glyph(g, y * g.w + x);
      console.log(String(y).padStart(4) + ' ' + row);
    }
  }
}
