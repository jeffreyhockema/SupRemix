// How close a pack sits to the original Supaplex level set, by composition.
//
// Both sides are measured here by the same code, from the same LEVELS.DAT: the
// yardstick is not a table of numbers written down once and left to rot, it is
// the original set decoded and counted on every run. So when the pack IS the
// original set -- which it is unless SUPREMIX_PACK says otherwise -- every
// figure matching is a direct check that the import is faithful.
//
// What these measure is the thing that makes a Supaplex board look like a
// Supaplex board: it is not corridors cut through chassis, it is a field of
// board threaded with chips and with capacitors buried in it, and the route is
// whatever you dig. Shape matters as much as mix -- solid laid in lines rather
// than specks, a quarter of the walkable space tight, elements mildly clumped,
// and no symmetry, which is the one thing people assume and the original does
// not do.
//
//   node tools/compare-original.mjs
//   SUPREMIX_PACK=remix node tools/compare-original.mjs

import { loadLevels, PACK } from './pack.mjs';
import { readOriginal } from './original.mjs';
import { parseLevel, T } from '../public/js/tiles.js';

const WALL = new Set([T.HARDWARE, T.HW_GREEN, T.HW_RED, T.SLOT, T.HEATSINK, T.SOCKET]);
const CHIP = new Set([T.CHIP, T.CHIP_L, T.CHIP_R, T.CHIP_T, T.CHIP_B]);
const ENEMY = new Set([T.SNIKSNAK, T.ELECTRON, T.BUG]);
const BOMB = new Set([T.ORANGE, T.YELLOW, T.RED]);
const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const MIX = ['base', 'empty', 'wall', 'chip', 'zonk', 'infotron', 'enemy', 'bomb'];

function measure(defs) {
  const tot = Object.fromEntries([...MIX, 'cells'].map((k) => [k, 0]));
  const rows = [];
  let runs = 0, lone = 0, tight = 0, clumpI = 0, clumpO = 0, mirror = 0;

  for (const [i, def] of defs.entries()) {
    const l = parseLevel(def, i);
    const at = (x, y) => l.tiles[y * l.w + x];
    const inside = (x, y) => x >= 0 && y >= 0 && x < l.w && y < l.h;
    const solid = (x, y) => WALL.has(at(x, y)) || CHIP.has(at(x, y));

    const c = Object.fromEntries(MIX.map((k) => [k, 0]));
    for (const t of l.tiles) {
      if (t === T.BASE) c.base++;
      else if (t === T.EMPTY) c.empty++;
      else if (WALL.has(t)) c.wall++;
      if (CHIP.has(t)) c.chip++;
      if (t === T.ZONK) c.zonk++;
      if (t === T.INFOTRON) c.infotron++;
      if (ENEMY.has(t)) c.enemy++;
      if (BOMB.has(t)) c.bomb++;
    }
    tot.cells += l.tiles.length;
    for (const k of MIX) tot[k] += c[k];
    rows.push({ n: i + 1, name: l.name, size: `${l.w}x${l.h}`, cells: l.tiles.length, ...c });

    // Solid belonging to a straight line of four or more, in either direction.
    const inRun = new Set();
    for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w;) {
      if (!solid(x, y)) { x++; continue; }
      let j = x; while (j < l.w && solid(j, y)) j++;
      if (j - x >= 4) for (let k = x; k < j; k++) inRun.add(`${k},${y}`);
      x = j;
    }
    for (let x = 0; x < l.w; x++) for (let y = 0; y < l.h;) {
      if (!solid(x, y)) { y++; continue; }
      let j = y; while (j < l.h && solid(x, j)) j++;
      if (j - y >= 4) for (let k = y; k < j; k++) inRun.add(`${x},${k}`);
      y = j;
    }

    let nSolid = 0, nLone = 0, nPass = 0, nTight = 0;
    let nI = 0, sI = 0, nO = 0, sO = 0, same = 0, pairs = 0;
    for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
      const t = at(x, y);
      const near = (want) => N4.filter(([dx, dy]) => inside(x + dx, y + dy) && at(x + dx, y + dy) === want).length;
      if (solid(x, y)) {
        nSolid++;
        if (!N4.some(([dx, dy]) => inside(x + dx, y + dy) && solid(x + dx, y + dy))) nLone++;
      } else {
        nPass++;
        if (N4.filter(([dx, dy]) => inside(x + dx, y + dy) && !solid(x + dx, y + dy)).length <= 2) nTight++;
      }
      if (t === T.INFOTRON) { nI++; sI += near(T.INFOTRON); }
      if (t === T.ZONK) { nO++; sO += near(T.ZONK); }
      if (x < l.w / 2) {
        pairs++;
        if (t === at(l.w - 1 - x, y) || (solid(x, y) && solid(l.w - 1 - x, y))) same++;
      }
    }
    runs += inRun.size / Math.max(nSolid, 1);
    lone += nLone / Math.max(nSolid, 1);
    tight += nTight / Math.max(nPass, 1);
    clumpI += nI ? sI / nI : 0;
    clumpO += nO ? sO / nO : 0;
    mirror += same / pairs;
  }

  const n = defs.length;
  return {
    rows,
    cells: tot.cells,
    levels: n,
    pct: Object.fromEntries(MIX.map((k) => [k, (tot[k] / tot.cells) * 100])),
    per: { zonk: tot.zonk / n, infotron: tot.infotron / n },
    shape: {
      runs: runs / n * 100, lone: lone / n * 100, tight: tight / n * 100,
      clumpI: clumpI / n, clumpO: clumpO / n, mirror: mirror / n,
    },
  };
}

const ours = measure(loadLevels());
const orig = measure(readOriginal());

console.log(`SupRemix: ${PACK} against the original level set\n`);
console.log(`${'#'.padStart(3)} ${'level'.padEnd(20)} ${'size'.padStart(7)}` +
  `${'base%'.padStart(7)}${'chip%'.padStart(7)}${'zonk%'.padStart(7)}${'wall%'.padStart(7)}${'zonks'.padStart(7)}`);
for (const r of ours.rows) {
  console.log(`${String(r.n).padStart(3)} ${r.name.padEnd(20)} ${r.size.padStart(7)}` +
    `${(r.base / r.cells * 100).toFixed(1).padStart(7)}${(r.chip / r.cells * 100).toFixed(1).padStart(7)}` +
    `${(r.zonk / r.cells * 100).toFixed(1).padStart(7)}${(r.wall / r.cells * 100).toFixed(1).padStart(7)}` +
    `${String(r.zonk).padStart(7)}`);
}

console.log(`\n${'element'.padEnd(12)}${'ours'.padStart(8)}${'original'.padStart(10)}${'  '}gap`);
for (const k of MIX) {
  const a = ours.pct[k], b = orig.pct[k], d = a - b;
  const bar = Math.abs(d) < 0.05 ? 'exact'
    : Math.abs(d) < 3 ? 'close'
      : d > 0 ? `+${d.toFixed(1)} over` : `${d.toFixed(1)} under`;
  console.log(`${k.padEnd(12)}${a.toFixed(2).padStart(7)}%${b.toFixed(2).padStart(9)}%  ${bar}`);
}

console.log(`\n${'shape'.padEnd(24)}${'ours'.padStart(8)}${'original'.padStart(10)}`);
for (const [k, fmt] of [
  ['solid in runs of 4+', (v) => `${v.runs.toFixed(0)}%`],
  ['isolated solid cells', (v) => `${v.lone.toFixed(0)}%`],
  ['tight (corridor) cells', (v) => `${v.tight.toFixed(0)}%`],
  ['infotron clustering', (v) => v.clumpI.toFixed(2)],
  ['capacitor clustering', (v) => v.clumpO.toFixed(2)],
  ['left-right symmetry', (v) => v.mirror.toFixed(2)],
]) {
  console.log(`${k.padEnd(24)}${fmt(ours.shape).padStart(8)}${fmt(orig.shape).padStart(10)}`);
}

const line = (m, tag) => `${tag}: ${m.levels} levels, ${m.cells} cells, `
  + `${m.per.zonk.toFixed(0)} capacitors and ${m.per.infotron.toFixed(0)} infotrons a level`;
console.log(`\n${line(ours, 'ours')}`);
console.log(line(orig, 'orig'));
