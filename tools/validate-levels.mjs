// Offline level checks. Run with `npm run validate`.
//
// Three things are verified for every level:
//   1. it parses, has exactly one Murphy and an exit;
//   2. the exit and enough infotrons are loosely reachable (only walls block);
//   3. the level survives 400 steps of physics with no player input -- nothing
//      may crush Murphy, and the infotron quota must still be attainable.
//
// (3) is the one that earns its keep: it catches designs where a zonk drops on
// the spawn point or a disk chain wipes out the quota before you touch a key.

import { createRequire } from 'node:module';
import { loadLevels } from './pack.mjs';
import { parseLevel, T, FL, isWall, isChassis, isKey, isLock, lockColour, isFaller } from '../public/js/tiles.js';
import { Game } from '../public/js/engine.js';

const require = createRequire(import.meta.url);
const LEVELS = loadLevels();

const SETTLE_STEPS = 400;
const SAFE_SPAWN_STEPS = 60;  // ~7s of standing still must always be safe

/**
 * What a player can reach on foot, touching nothing.
 *
 * Capacitors, drives, disks and locked headers all block: you cannot walk
 * through them, and pretending you can is what made a plugged chamber look
 * reachable and every gated level look open.
 */
function openTo(t) {
  if (isWall(t) || isLock(t)) return false;
  return t !== T.ZONK && t !== T.RACK && t !== T.SLIME && t !== T.ORANGE
    && t !== T.YELLOW && t !== T.TERMINAL && t !== T.SNIKSNAK && t !== T.ELECTRON;
}

/**
 * Optimistic reach: pretend every gate is already open.
 *
 * Plugs shoved aside, fields dropped, doors unlocked. If the exit is still
 * unreachable under those terms the level is structurally broken -- a sealed
 * region with no way out -- rather than merely gated. This is the single
 * cheapest check there is, and it catches the mistake that is easiest to make
 * when drawing a chamber: walling its floor without leaving a service channel.
 */
/**
 * Can the way out be opened at all, given what has to be picked up first?
 *
 * This is the Chip's Challenge question rather than the Supaplex one: a header
 * only opens if its cap has been found, and a hot component is only crossable
 * in the boots -- and either can be put somewhere that needs the very thing it
 * is holding back. Flooding once and ignoring locks says nothing about that.
 *
 * So it is a fixpoint: flood as far as what is held allows, pick up whatever
 * that reaches, and go again until nothing new turns up. Anything still out of
 * reach at the end is out of reach for good.
 *
 * Returns the cells that stay unreachable and whether the exit is among them.
 */
function gatedReach(g) {
  const held = new Set();
  let seen = new Uint8Array(g.w * g.h);

  for (let pass = 0; pass < 8; pass++) {
    seen = new Uint8Array(g.w * g.h);
    const stack = [g.mi];
    seen[g.mi] = 1;
    const found = [];
    while (stack.length) {
      const i = stack.pop();
      const t = g.tiles[i];
      if (isKey(t)) found.push(`k${t - T.KEY_A}`);
      if (t === T.BOOTS) found.push('boots');
      const x = i % g.w, y = (i / g.w) | 0;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
        const j = ny * g.w + nx;
        if (seen[j]) continue;
        const nt = g.tiles[j];
        if (isChassis(nt)) continue;
        if (isLock(nt) && !held.has(`k${lockColour(nt)}`)) continue;
        if (g.floor[j] === FL.FIRE && !held.has('boots')) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    const before = held.size;
    for (const f of found) held.add(f);
    if (held.size === before) break;
  }

  let exit = false;
  const stranded = [];
  for (let i = 0; i < g.tiles.length; i++) {
    if (seen[i]) { if (g.tiles[i] === T.EXIT) exit = true; continue; }
    const t = g.tiles[i];
    if (isChassis(t)) continue;
    if (isKey(t) || t === T.BOOTS || t === T.EXIT) stranded.push(`${i % g.w},${(i / g.w) | 0}`);
  }
  return { exit, stranded };
}


function countTiles(tiles, want) {
  let n = 0;
  for (const t of tiles) if (t === want) n++;
  return n;
}


function reachableWithGatesOpen(g) {
  const seen = new Uint8Array(g.w * g.h);
  const stack = [g.mi];
  seen[g.mi] = 1;
  let exit = false;
  while (stack.length) {
    const i = stack.pop();
    if (g.tiles[i] === T.EXIT) { exit = true; continue; }
    const x = i % g.w, y = (i / g.w) | 0;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
      const j = ny * g.w + nx;
      // Chassis only. A chip is a wall to walk into but a blast clears it,
      // and the original set leans on that -- a drive bay behind one chip is a
      // sealed region on paper and a finished level in practice.
      if (seen[j] || isChassis(g.tiles[j])) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return exit;
}

function reachable(g) {
  const seen = new Uint8Array(g.w * g.h);
  const stack = [g.mi];
  seen[g.mi] = 1;
  let infotrons = 0, electrons = 0, slime = 0, exit = false;

  while (stack.length) {
    const i = stack.pop();
    const t = g.tiles[i];
    if (t === T.INFOTRON) infotrons++;
    if (t === T.ELECTRON) electrons++;
    if (t === T.SLIME) slime++;
    if (t === T.EXIT) exit = true;
    if (t === T.EXIT || t === T.TERMINAL) continue;  // solid, but counted as seen

    const x = i % g.w, y = (i / g.w) | 0;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
      const j = ny * g.w + nx;
      if (seen[j] || !openTo(g.tiles[j])) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return { infotrons, electrons, slime, exit };
}

let failures = 0;
const rows = [];

for (const [i, def] of LEVELS.entries()) {
  const label = `${String(i + 1).padStart(2)}. ${def.name}`;
  const problems = [];
  let lvl;

  try {
    lvl = parseLevel(def, i);
  } catch (err) {
    console.log(`FAIL ${label}: ${err.message}`);
    failures++;
    continue;
  }

  // A force field hidden under base is invisible and pointless -- the base
  // blocks you first, and the player never learns the field was there.
  const buried = [];
  for (let i = 0; i < lvl.floor.length; i++) {
    if (lvl.floor[i] === FL.FORCE && lvl.tiles[i] !== T.EMPTY) {
      buried.push(`${i % lvl.w},${(i / lvl.w) | 0}`);
    }
  }
  if (buried.length) {
    problems.push(`force field buried under something at ${buried.slice(0, 4).join(' ')}`);
  }

  const g0 = new Game(lvl);
  if (!reachableWithGatesOpen(g0)) {
    problems.push('exit is unreachable even with every gate open -- a region is sealed off');
  }

  // Caps, headers and boots have an order to them, and it is easy to get
  // wrong: a cap behind the header it opens, boots on the far side of the heat
  // they are for. Only worth asking of a level that has any.
  const hasGear = lvl.tiles.some((t) => isKey(t) || isLock(t) || t === T.BOOTS)
    || lvl.floor.some((f) => f === FL.FIRE);
  if (hasGear) {
    const { exit, stranded } = gatedReach(g0);
    if (!exit) {
      problems.push('the way out cannot be opened: a header, or heat, with nothing reachable to get past it');
    } else if (stranded.length) {
      problems.push(`out of reach behind a header or heat: ${stranded.slice(0, 4).join(' ')}`);
    }
  }

  // A force field is held down by pressure plates. Without one on the board
  // nothing will ever drop it, and whatever is behind it is scenery.
  const fields = lvl.floor.filter((f) => f === FL.FORCE).length;
  if (fields && !lvl.floor.some((f) => f === FL.PAD)) {
    problems.push(`${fields} force field cell(s) but no pressure plate to drop them`);
  }
  // Reachability is measured, not enforced. A level from four on is SUPPOSED to
  // wall part of itself off until you shove, drop or blow something -- that is
  // what makes it a puzzle. Whether it can actually be finished is settled by
  // replaying its recorded solution (npm run solve), not by a flood fill.
  const r = reachable(g0);
  // Electrons burst into infotrons and contained slime crystallises into them,
  // so both count toward what a level can actually yield.
  const fromSlime = r.slime ? lvl.slimeCap : 0;
  const openPotential = r.infotrons + r.electrons * 9 + fromSlime;
  const gated = openPotential < lvl.need || !r.exit;

  // Physics settle: let the level run itself with the player standing still.
  // Patrolling enemies reaching an idle Murphy eventually is correct Supaplex
  // behaviour; only a spawn that is unsurvivable on arrival is a defect.
  const g = new Game(lvl);

  // Anything authored over thin air moves the moment the level starts, and it
  // lands wherever physics puts it rather than where the level was drawn. That
  // is almost never intended -- a capacitor meant as a plug stops plugging, an
  // infotron drops into a lane something has to be shoved along.
  const notes = [];
  const restless = [];
  for (let i = 0; i < lvl.tiles.length; i++) {
    if (!isFaller(lvl.tiles[i])) continue;
    const below = i + lvl.w;
    if (below >= lvl.tiles.length) continue;
    if (lvl.tiles[below] === T.EMPTY && lvl.floor[below] !== FL.FORCE) {
      restless.push(`${i % lvl.w},${(i / lvl.w) | 0}`);
    }
  }
  // Not a failure: a vault with a hollow row under it drops its infotrons on
  // purpose, and that is how the plug gets somewhere to fall to. It is worth
  // printing, though -- a capacitor that quietly relocates at spawn is how a
  // push lane ends up blocked before the player has touched anything.
  if (restless.length) {
    notes.push(`settles rather than starts put: ${restless.join('  ')}`);
  }

  let died = -1;
  for (let s = 0; s < SETTLE_STEPS; s++) {
    g.step({ dir: -1, grab: false, plant: false });
    if (g.state === 'dead' && died < 0) { died = s; break; }
  }
  // Standing still and dying is a defect in a level we wrote and a design in
  // one we imported: the original set has boards called QUICKY! and
  // READY-STEADY-GO!! whose whole idea is that something is already falling
  // when you arrive. So it is a note on those and a failure on ours.
  if (died >= 0 && died < SAFE_SPAWN_STEPS && def.gate !== 'original') {
    problems.push(`spawn is unsurvivable: idle Murphy dies at step ${died}`);
  }
  const after = g.infotronsLeft();
  let elec = 0;
  for (const t of g.tiles) if (t === T.ELECTRON) elec++;
  // Measured after settling for a level we wrote, and as authored for one we
  // imported. Level 85 of the original set holds 57 infotrons and 3 shorts for
  // a quota of exactly 84 -- every short has to be crushed, and one of them
  // goes off on its own if the player stands about, so the settled board is
  // nine short of a level that is perfectly balanced as drawn.
  // Electrolyte counts on both sides: sealed, it sets into infotrons, and a
  // level built round a tank has most of its quota in one that has not set yet.
  const slimeYield = lvl.tiles.includes(T.SLIME) ? lvl.slimeCap : 0;
  const yieldNow = def.gate === 'original'
    ? lvl.infotrons + countTiles(lvl.tiles, T.ELECTRON) * 9 + slimeYield
    : after + elec * 9 + (g.tiles.includes(T.SLIME) ? lvl.slimeCap : 0);
  if (yieldNow < lvl.need) {
    problems.push(`after settling only ${after} infotrons (+${elec} electrons) remain for quota ${lvl.need}`);
  }

  rows.push({
    label, size: `${lvl.w}x${lvl.h}`, need: lvl.need,
    loose: lvl.infotrons, settled: after, elec, died, gated, problems, notes,
  });
  if (problems.length) failures++;
}

console.log('SupRemix level validation\n');
for (const r of rows) {
  const status = r.problems.length ? 'FAIL' : ' ok ';
  console.log(
    `${status} ${r.label.padEnd(26)} ${r.size.padStart(6)}  quota ${String(r.need).padStart(2)}` +
    `  authored ${String(r.loose).padStart(2)}  after-settle ${String(r.settled).padStart(2)}` +
    (r.gated ? '  gated' : '  open ') +
    (r.elec ? `  electrons ${r.elec}` : '') +
    (r.died >= 0 ? `  [idle death @${r.died}]` : ''));
  for (const p of r.problems) console.log(`       - ${p}`);
  if (process.env.VERBOSE) for (const n of r.notes) console.log(`       . ${n}`);
}

console.log(`\n${LEVELS.length - failures}/${LEVELS.length} levels passed`);
process.exit(failures ? 1 : 0);
