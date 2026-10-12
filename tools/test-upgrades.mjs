// Drives the machinery that levels/upgrades.mjs added, in the engine.
// Run with `npm run test:upgrades`.
//
// It reports nothing while UPGRADES is empty, which it currently is -- the pack
// is the original 111 designs untouched. This is here for the next time an
// edit is made to one of them.
//
// `npm run validate` reads a board and says whether it could work. This plays
// it. A pressure plate that the drive cannot actually be shoved onto, a data bus
// that does not carry, a header whose cap is a cell out of reach -- all of those
// read fine and none of them survive being tried.
//
// The tests are found rather than written down: any level with a drive and a
// plate on the same row is a plate puzzle, and gets driven as one. Nothing here
// names a level or a coordinate, so it cannot rot when a widget moves.
//
// Murphy is put on the widget's doorstep rather than walked there from spawn.
// These are real Supaplex boards and the automatic player finishes four of the
// 111 unaided, so routing across STONE-AGE would be a test of the router. That
// a widget can be reached at all is settled statically -- `place()` in
// tools/upgrade-kit.mjs will not put one anywhere a player cannot walk to, and
// `npm run validate` re-checks it on the finished board.
//
// Only imported levels are looked at; the remix pack has its own machinery and
// its own recorded solutions.

import { parseLevel, T, FL, isLock, lockColour } from '../public/js/tiles.js';
import { Game } from '../public/js/engine.js';
import { loadLevels } from './pack.mjs';
import * as router from './router.mjs';

// The original boards are dense with capacitors, and a player who will not
// shove one aside cannot cross most of them. That is a fact about the router,
// not about the level, so it is allowed to shove while getting into position.
router.allowPushing(true);

const LEVELS = loadLevels();
let passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (err) { failed++; console.log(`  FAIL ${name}\n         ${err.message}`); }
}

/** Start Murphy at (x, y) instead of wherever the level puts him. */
function standAt(def, i, x, y) {
  const g = new Game(parseLevel(def, i));
  g.tiles[g.mi] = T.EMPTY;
  g.mi = y * g.w + x;
  g.tiles[g.mi] = T.MURPHY;
  return g;
}

const cells = (g, want) => {
  const out = [];
  for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i] === want) out.push(i);
  return out;
};
const floors = (g, want) => {
  const out = [];
  for (let i = 0; i < g.floor.length; i++) if (g.floor[i] === want) out.push(i);
  return out;
};

for (const [i, def] of LEVELS.entries()) {
  // Only the imported boards. These tests know the shape of the widgets in
  // levels/upgrades.mjs -- one drive, one plate, one field -- and the remix
  // pack builds different machinery on purpose: three plates on one circuit, a
  // bus with a brake, an alcove reached only from a stopped slide. That pack
  // is held to its recorded solutions instead, which is a stronger check.
  if (def.gate !== 'original') continue;
  const lvl = parseLevel(def, i);
  const label = `${i + 1}. ${def.name}`;
  const g0 = new Game(lvl);

  const drives = cells(g0, T.RACK);
  const plates = floors(g0, FL.PAD);
  const fields = floors(g0, FL.FORCE);

  // A drive, a plate on its row and a field somewhere: shove and see.
  if (drives.length && plates.length && fields.length) {
    check(`${label}: the drive reaches the plate and the field drops`, () => {
      const probe = new Game(parseLevel(def, i));
      const drive = cells(probe, T.RACK)[0];
      const dx = drive % probe.w, dy = (drive / probe.w) | 0;
      const plate = floors(probe, FL.PAD).find((p) => ((p / probe.w) | 0) === dy);
      if (plate === undefined) throw new Error('no plate on the drive\'s row');
      const px = plate % probe.w;
      const g = standAt(def, i, dx - 1, dy);
      router.press(g, 'R', (px - dx) * 2 + 6);
      if (g.tiles[plate] !== T.RACK) {
        throw new Error(`drive stopped at ${g.mi % g.w + 1},${dy} short of the plate at ${px},${dy}`);
      }
      // The field is not erased when it drops -- the floor stays a force field
      // and the game simply stops sealing it, so `forceOpen` is the thing to
      // ask. Checking the floor map instead is checking nothing.
      if (!g.forceOpen) throw new Error('the drive is parked but the field is still up');
      const mouth = floors(g, FL.FORCE)[0];
      if (g.sealed(mouth)) throw new Error('forceOpen is set but the mouth is still sealed');
    });
  }

  // A bus: stepping on has to carry you further than one cell.
  const ice = floors(g0, FL.ICE);
  if (ice.length) {
    check(`${label}: the data bus carries`, () => {
      const probe = new Game(parseLevel(def, i));
      const run = floors(probe, FL.ICE).filter((k) => probe.tiles[k] === T.EMPTY);
      const y = (run[0] / probe.w) | 0;
      const row = run.filter((k) => ((k / probe.w) | 0) === y).sort((a, b) => a - b);
      const from = (row[0] % probe.w) - 1;
      const g = standAt(def, i, from, y);
      const before = g.mi % g.w;
      router.press(g, 'R', 1);
      router.wait(g, 40);          // a slide plays out over several steps
      const after = g.mi % g.w;
      if (after - before < 3) throw new Error(`slid ${after - before} cells, not carried`);
    });
  }

  // Electrolyte: boxed in with nowhere to creep, it has to set into infotrons.
  if (cells(g0, T.SLIME).length) {
    check(`${label}: the sealed tank sets into infotrons`, () => {
      const g = new Game(parseLevel(def, i));
      const seeded = cells(g, T.SLIME).length;
      const was = cells(g, T.INFOTRON).length;
      const zonksWere = cells(g, T.ZONK).length;
      for (let s = 0; s < 600; s++) g.step({ dir: -1, grab: false, plant: false });
      if (cells(g, T.ZONK).length > zonksWere) {
        throw new Error('the tank overflowed and hardened into capacitors');
      }
      const gained = cells(g, T.INFOTRON).length - was;
      if (gained < seeded) throw new Error(`tank yielded ${gained} from ${seeded} seeds`);
    });
  }

  // Heat: fatal, and then not, and the boots are the whole difference. A hot
  // component does not stop you the way a header does -- it kills you, which is
  // the Chip's Challenge rule the engine has always had. Worth pinning down,
  // because a level designed as though heat were a wall would be a level that
  // quietly kills the player at the door.
  const heat = floors(g0, FL.FIRE);
  if (heat.length) {
    check(`${label}: the heat kills, and the boots are the difference`, () => {
      const dirs = [['R', -1, 0], ['L', 1, 0], ['D', 0, -1], ['U', 0, 1]];
      const why = [];
      for (const cell of heat) {
        const hx = cell % g0.w, hy = (cell / g0.w) | 0;
        for (const [key, dx, dy] of dirs) {
          const sx = hx + dx, sy = hy + dy;
          if (sx < 1 || sy < 1 || sx > g0.w - 2 || sy > g0.h - 2) continue;
          const on = g0.tiles[sy * g0.w + sx];
          if (on !== T.EMPTY && on !== T.BASE) continue;
          const bare = standAt(def, i, sx, sy);
          try { router.press(bare, key, 2); } catch { /* dying is the point */ }
          if (bare.state !== 'dead') { why.push(`${sx},${sy} ${key}: survived it bare`); continue; }
          const shod = standAt(def, i, sx, sy);
          shod.boots = true;
          try { router.press(shod, key, 2); } catch { /* something else got him */ }
          if (shod.state === 'dead' || shod.mi === sy * shod.w + sx) {
            why.push(`${sx},${sy} ${key}: the boots did not get him across`);
            continue;
          }
          return;
        }
      }
      throw new Error(`no hot cell behaved -- ${why[0] ?? 'none had a doorstep'}`);
    });
  }

  // A header: shut, and then open, and the cap is the whole difference.
  const locks = [];
  for (let k = 0; k < g0.tiles.length; k++) if (isLock(g0.tiles[k])) locks.push(k);
  if (locks.length) {
    check(`${label}: the header holds until the cap is in hand`, () => {
      const lx = locks[0] % g0.w, ly = (locks[0] / g0.w) | 0;
      const colour = lockColour(g0.tiles[locks[0]]);
      const bare = standAt(def, i, lx - 1, ly);
      router.press(bare, 'R', 3);
      if (bare.mi % bare.w !== lx - 1) throw new Error('walked through a header with no cap');
      const capped = standAt(def, i, lx - 1, ly);
      capped.keys[colour] = 1;
      router.press(capped, 'R', 3);
      if (capped.mi % capped.w === lx - 1) throw new Error('the cap did not open the header');
    });
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
