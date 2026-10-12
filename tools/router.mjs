// A careful automatic player, used to prove every level is still solvable.
//
// This is not a solver -- it will not invent a plan. It is the "walking" half of
// a plan: given a target cell it finds a route through the live grid and walks
// it safely, waiting out flashing bugs and monster passes on the way. Solutions
// in levels/solutions.js supply only the parts that take thought (which zonk to
// shove, where to plant a charge); the router handles the tedium.

import { T, FL, isFaller, isEnemy, isPort, portAllows, isKey, isLock, lockColour } from '../public/js/tiles.js';
import { UP, RIGHT, DOWN, LEFT, DIRS } from '../public/js/engine.js';

const IDLE = { dir: -1, grab: false, plant: false };
export const DIR_NAME = { U: UP, R: RIGHT, D: DOWN, L: LEFT };

export class RouteError extends Error {}

/**
 * Whether the router may shove things out of its way while pathfinding.
 *
 * Off by default, and deliberately so. `npm run audit` turns a player loose
 * with no plan to measure what walking about can reach, and almost every gate
 * in the pack is "you have to shove this" -- give that player a shove and the
 * measurement stops meaning anything. The recorded solutions turn it on,
 * because a capacitor lying in a corridor is navigation, not the puzzle.
 */
let pushAllowed = false;   // may the router shove at all
let pushing = false;       // is it shoving on this particular attempt

export function pushingAllowed() { return pushAllowed; }

export function allowPushing(on) {
  pushAllowed = !!on;
}

/** Mirrors the engine's own push rule, without moving anything. */
function shoveable(g, x, y, dx, dy) {
  const t = g.tiles[y * g.w + x];
  if (t === T.ZONK || t === T.ORANGE) {
    if (dy !== 0) return false;              // cans and orange floppies go sideways only
  } else if (t !== T.YELLOW && t !== T.RACK) {
    return false;
  }
  const bx = x + dx, by = y + dy;
  if (bx < 1 || by < 1 || bx >= g.w - 1 || by >= g.h - 1) return false;
  const j = by * g.w + bx;
  if (g.tiles[j] !== T.EMPTY) return false;
  return !(g.floor[j] === FL.FORCE && !g.forceOpen);
}

/**
 * Cells Murphy can walk into under his own power, given what he is carrying.
 * A locked header only counts as walkable while the matching card is in hand.
 */
function walkable(t, g) {
  if (isLock(t)) return !!(g && g.keys[lockColour(t)] > 0);
  return t === T.EMPTY || t === T.BASE || t === T.INFOTRON || t === T.RED
    || t === T.BUG || isKey(t) || t === T.BOOTS;
}

/**
 * Surfaces the router refuses to plan through: a live force field, fire without
 * boots, and ice -- sliding is not a one-cell step, so any level built on it
 * gets an explicit scripted route instead of pathfinding.
 */
function badFloor(g, i) {
  const f = g.floor[i];
  if (f === FL.FORCE && !g.forceOpen) return true;
  if (f === FL.FIRE && !g.boots) return true;
  return false;
}

/**
 * Where a step onto ice actually puts you.
 *
 * Stepping onto the bus is not a one-cell move -- you are carried until
 * something stops you. Treating the whole slide as a single edge is what lets
 * the router plan over ice at all, and it matches how the engine resolves it.
 */
/**
 * Where a step lands once gravity is on.
 *
 * With gravity the engine takes the controls whenever the cell below is empty,
 * so a sideways step into thin air is really a fall to the first solid thing
 * underneath. Modelling that as one edge is what lets the router plan at all --
 * and climbing is simply impossible, because any step up leaves Murphy over the
 * hole he just vacated and drops him straight back into it.
 */
function fallEnd(g, cell) {
  let cur = cell;
  for (let guard = 0; guard < 256; guard++) {
    const below = cur + g.w;
    if (below >= g.tiles.length) break;
    if (g.tiles[below] !== T.EMPTY) break;
    if (g.floor[below] === FL.FORCE && !g.forceOpen) break;
    cur = below;
  }
  return cur;
}

function slideEnd(g, entry, d) {
  const [dx, dy] = DIRS[d];
  let cur = entry;
  for (let guard = 0; guard < 256; guard++) {
    if (g.floor[cur] !== FL.ICE) break;
    const nx = (cur % g.w) + dx, ny = ((cur / g.w) | 0) + dy;
    if (nx < 1 || ny < 1 || nx >= g.w - 1 || ny >= g.h - 1) break;
    const next = ny * g.w + nx;
    if (g.tiles[next] !== T.EMPTY) break;
    if (g.floor[next] === FL.FORCE && !g.forceOpen) break;
    cur = next;
  }
  return cur;
}

/**
 * True if something above this cell will actually arrive on Murphy's head.
 *
 * A capacitor resting directly on the cell is harmless: step in and it is
 * resting on you instead, and it only falls once you leave. What kills is one
 * with air underneath it, because that one arrives moving -- and a moving
 * faller crushes whatever it lands on. Treating every capacitor overhead as
 * lethal was fine while there were two of them on a board; on a board with a
 * hundred it refuses nearly every cell there is.
 */
function underFaller(g, x, y) {
  for (let yy = y - 1; yy >= 0; yy--) {
    const i = yy * g.w + x;
    const t = g.tiles[i];
    if (t === T.EMPTY) continue;              // keep looking up through the gap
    if (yy === y - 1) return isFaller(t) && !!g.fall[i];
    return isFaller(t);                       // over a gap: it will arrive moving
  }
  return false;
}

function nearEnemy(g, x, y) {
  for (const [dx, dy] of [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
    if (isEnemy(g.tiles[ny * g.w + nx])) return true;
  }
  return false;
}

/**
 * Breadth-first route from Murphy to `goal`, over the grid as it stands now.
 * `care` 2 avoids monsters and falling hazards, 1 avoids only falling hazards,
 * 0 takes what it can get. Returns a list of direction indices, or null.
 */
export function findRoute(g, goal, care = 2) {
  const start = g.mi;
  const goalIdx = goal[1] * g.w + goal[0];
  if (start === goalIdx) return [];

  const prev = new Int32Array(g.w * g.h).fill(-1);
  const via = new Int8Array(g.w * g.h).fill(-1);
  const seen = new Uint8Array(g.w * g.h);
  const queue = [start];
  seen[start] = 1;

  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const cx = cur % g.w, cy = (cur / g.w) | 0;

    for (let d = 0; d < 4; d++) {
      if (g.gravity && d === UP) continue;   // cannot climb under gravity
      const [dx, dy] = DIRS[d];
      const nx = cx + dx, ny = cy + dy;
      if (nx < 1 || ny < 1 || nx >= g.w - 1 || ny >= g.h - 1) continue;

      let target = ny * g.w + nx;
      const t = g.tiles[target];

      // A port is a doorway: entering it lands you two cells along.
      if (isPort(t)) {
        if (!portAllows(t, dx, dy)) continue;
        // Hoovering does not take one-way trips, however bold it is being
        // about everything else. A gravity rail flips the board and nothing
        // climbs back up it, so a sweep that wanders through one is left with
        // the exit and most of the level behind it. A move a solution asked
        // for by name may still go through, and so may the walk to the bay.
        if ((care >= 3 || sweeping) && t >= T.GPORT_R && t <= T.GPORT_U) continue;
        const ex = nx + dx, ey = ny + dy;
        if (ex < 1 || ey < 1 || ex >= g.w - 1 || ey >= g.h - 1) continue;
        const exitIdx = ey * g.w + ex;
        if (g.tiles[exitIdx] !== T.EMPTY && exitIdx !== goalIdx) continue;
        target = exitIdx;
      } else if (target !== goalIdx && !walkable(t, g)) {
        // Not walkable -- but it may be shoveable, which costs a step of
        // lean-in and then puts Murphy where it was standing.
        if (!(pushing && shoveable(g, nx, ny, dx, dy))) continue;
      } else if (g.floor[target] === FL.ICE && t === T.EMPTY) {
        target = slideEnd(g, target, d);
      }
      if (g.gravity) target = fallEnd(g, target);
      if (target !== goalIdx && badFloor(g, target)) continue;

      if (seen[target]) continue;
      const tx = target % g.w, ty = (target / g.w) | 0;
      if (target !== goalIdx) {
        if (care >= 1 && underFaller(g, tx, ty)) continue;
        if (care >= 2 && nearEnemy(g, tx, ty)) continue;
        // Care 3 is for hoovering. Care 1 only fears what is already falling,
        // but the thing that actually seals a corridor is a capacitor resting
        // on the cell you are about to dig: it comes down the moment you take
        // the board out from under it and step on, and the way back is gone.
        if (care >= 3 && ty > 0 && isFaller(g.tiles[target - g.w])) continue;
      }

      seen[target] = 1;
      prev[target] = cur;
      via[target] = d;
      if (target === goalIdx) {
        const path = [];
        for (let at = target; at !== start; at = prev[at]) path.push(via[at]);
        return path.reverse();
      }
      queue.push(target);
    }
  }
  return null;
}

/** One simulation step, with a guard that a death aborts loudly. */
function advance(g, input, where) {
  g.step(input);
  if (g.state === 'dead') throw new RouteError(`Murphy died ${where}`);
}

/**
 * Walk to `goal`, re-planning after every step because the world moves.
 * Waits out flashing bugs and lets monsters pass rather than barging through.
 */
export function goTo(g, goal, opts = {}) {
  const budget = opts.budget ?? 600;
  // How reckless the walk is allowed to get. Care 0 walks under anything that
  // falls, which is fine for a move a solution asked for by name and is exactly
  // how a sweep seals itself into a pocket -- so hoovering asks for more care.
  const floor = opts.minCare ?? 0;
  let patience = 0;

  for (let n = 0; n < budget; n++) {
    if (g.state !== 'play') return;
    if (g.mi === goal[1] * g.w + goal[0]) return;

    let route = findRoute(g, goal, Math.max(2, floor));
    for (let care = Math.max(2, floor) - 1; care >= floor && (!route || !route.length); care--) {
      route = findRoute(g, goal, care);
    }

    // Only once walking has failed. Shoving is a last resort, not a short cut:
    // preferring it means barging a capacitor aside whenever that saves a step,
    // which is how a plug ends up somewhere the level did not intend.
    if ((!route || !route.length) && pushAllowed) {
      pushing = true;
      try {
        for (let care = 1; care >= floor && (!route || !route.length); care--) {
          route = findRoute(g, goal, care);
        }
      } finally {
        pushing = false;
      }
    }
    if (!route || !route.length) {
      throw new RouteError(`no route to ${goal[0]},${goal[1]} from ${g.mi % g.w},${(g.mi / g.w) | 0}`);
    }

    if (g.slide >= 0) {           // being carried; the engine has the controls
      advance(g, IDLE, 'riding the bus');
      continue;
    }

    const d = route[0];
    const [dx, dy] = DIRS[d];
    const nx = (g.mi % g.w) + dx, ny = ((g.mi / g.w) | 0) + dy;
    const next = ny * g.w + nx;

    // Never touch a bug mid-flash, and never step alongside a monster.
    const bugHot = g.tiles[next] === T.BUG && g.bugActive(next);
    const monster = nearEnemy(g, nx, ny) && patience < 40;
    if (bugHot || monster) {
      patience++;
      advance(g, IDLE, `waiting near ${nx},${ny}`);
      continue;
    }
    patience = 0;
    advance(g, { dir: d, grab: false, plant: false }, `moving to ${nx},${ny}`);
  }
  throw new RouteError(`ran out of budget heading for ${goal[0]},${goal[1]}`);
}

export function wait(g, n) {
  for (let i = 0; i < n && g.state === 'play'; i++) advance(g, IDLE, 'waiting');
}

export function press(g, dirName, times = 1) {
  const d = DIR_NAME[dirName];
  for (let i = 0; i < times && g.state === 'play'; i++) {
    advance(g, { dir: d, grab: false, plant: false }, `pressing ${dirName}`);
  }
}

export function grab(g, dirName) {
  advance(g, { dir: DIR_NAME[dirName], grab: true, plant: false }, `reaching ${dirName}`);
}

/**
 * Plant a red disk in the cell `dirName` of Murphy. The original puts it down
 * where he stands, after fire is held for a moment, so he steps into that cell,
 * holds, and leaves the getting clear to the caller -- two cells, inside the
 * fuse's five steps.
 */
export function plant(g, dirName) {
  advance(g, { dir: DIR_NAME[dirName], grab: false, plant: false }, 'stepping in to plant');
  advance(g, IDLE, 'settling to plant');
  for (let k = 0; k < 12 && !g.liveDisk && g.state === 'play'; k++) {
    advance(g, { dir: -1, grab: false, plant: true }, 'holding fire to plant');
  }
  if (!g.liveDisk) throw new RouteError('the red disk would not go down');
}

/**
 * Collect up to `count` infotrons, nearest first.
 *
 * An infotron pinned under a zonk is taken from the side with a reach rather
 * than walked into, which is the whole lesson of Dead Weight -- so the router
 * has to know it too.
 */
export function collect(g, count, within = Infinity, care = CARE_SWEEP) {
  let got = 0;
  // Anchored where the call started, and measured across the board rather than
  // along the route. Under gravity a drop of seventeen rows is one step of
  // route, so a bound on walking distance is no bound at all -- it let a
  // crusher's tidy-up fall down a rail it could never climb back up.
  const ax = g.mi % g.w, ay = (g.mi / g.w) | 0;
  while (got < count && g.state === 'play') {
    const targets = [];
    for (let i = 0; i < g.tiles.length; i++) {
      if (g.tiles[i] === T.INFOTRON) targets.push(i);
    }
    if (!targets.length) break;

    // Order by actual walking distance. Straight-line distance will happily
    // send the router through a one-way port after something on the far side.
    const far = 1e9;
    const reach = distanceField(g);
    targets.sort((a, b) => (reach[a] ?? far) - (reach[b] ?? far));

    let took = false;
    for (const idx of targets) {
      if (reach[idx] < 0) continue;   // walled off for good; leave it
      // A gate that has just produced a pile of infotrons wants that pile, not
      // the nearest one on the board. Unbounded, the walk to it can cross a
      // gravity rail or a one-way port, and there is no coming back up those.
      if (Math.abs(idx % g.w - ax) + Math.abs(((idx / g.w) | 0) - ay) > within) continue;
      const x = idx % g.w, y = (idx / g.w) | 0;
      if (takeOne(g, x, y, care)) {
        took = true; got++;
        if (process.env.ROUTER_TRACE) {
          console.log(`      took ${x},${y} -> murphy ${g.mi % g.w},${(g.mi / g.w) | 0} gravity ${g.gravity}`);
        }
        break;
      }
    }
    if (!took) break;
  }
  return got;
}

/** Walking distance from Murphy to every cell he can reach. */
export function distanceField(g) {
  const dist = new Int32Array(g.w * g.h).fill(-1);
  const queue = [g.mi];
  dist[g.mi] = 0;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const cx = cur % g.w, cy = (cur / g.w) | 0;
    for (let d = 0; d < 4; d++) {
      if (g.gravity && d === UP) continue;
      const [dx, dy] = DIRS[d];
      const nx = cx + dx, ny = cy + dy;
      if (nx < 1 || ny < 1 || nx >= g.w - 1 || ny >= g.h - 1) continue;
      let next = ny * g.w + nx;
      const t = g.tiles[next];
      if (isPort(t)) {
        if (!portAllows(t, dx, dy)) continue;
        const ex = nx + dx, ey = ny + dy;
        if (ex < 1 || ey < 1 || ex >= g.w - 1 || ey >= g.h - 1) continue;
        next = ey * g.w + ex;
        if (g.tiles[next] !== T.EMPTY && g.tiles[next] !== T.INFOTRON) continue;
      } else if (!walkable(t, g)) {
        if (!(pushing && shoveable(g, nx, ny, dx, dy))) continue;
      } else if (g.floor[next] === FL.ICE && t === T.EMPTY) {
        next = slideEnd(g, next, d);
      }
      if (g.gravity) next = fallEnd(g, next);
      if (badFloor(g, next)) continue;
      if (dist[next] >= 0) continue;
      dist[next] = dist[cur] + 1;
      queue.push(next);
    }
  }
  // An infotron pinned under a faller counts as reachable from beside it.
  const out = new Int32Array(dist.length).fill(-1);
  for (let i = 0; i < dist.length; i++) out[i] = dist[i] < 0 ? -1 : dist[i];
  for (let i = 0; i < g.tiles.length; i++) {
    if (g.tiles[i] !== T.INFOTRON || out[i] >= 0) continue;
    const x = i % g.w, y = (i / g.w) | 0;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1]]) {
      const j = (y + dy) * g.w + (x + dx);
      if (out[j] >= 0) { out[i] = out[j] + 1; break; }
    }
  }
  return out;
}

// Hoovering never takes a reckless route. One infotron is not worth digging
// under a capacitor for: the capacitor drops into the shaft behind you and the
// drive bay is on the other side of it.
const CARE_SWEEP = 3;

// Set while a sweep is running, so the one-way rule above can tell hoovering
// from a move the solution asked for by name.
let sweeping = false;

function takeOne(g, x, y, care = CARE_SWEEP) {
  const before = g.collected;

  // Pinned under something that falls: stand beside it and reach across.
  if (underFaller(g, x, y)) {
    for (const [dx, dy, name] of [[-1, 0, 'R'], [1, 0, 'L'], [0, 1, 'U']]) {
      const sx = x + dx, sy = y + dy;
      if (sx < 1 || sy < 1 || sx >= g.w - 1 || sy >= g.h - 1) continue;
      if (!walkable(g.tiles[sy * g.w + sx], g)) continue;
      if (underFaller(g, sx, sy)) continue;
      try {
        goTo(g, [sx, sy], { minCare: care });
        grab(g, name);
        if (g.collected > before) return true;
      } catch (err) {
        if (err instanceof RouteError && g.state === 'play') continue;
        throw err;
      }
    }
    return false;
  }

  try {
    goTo(g, [x, y], { minCare: care });
  } catch (err) {
    if (err instanceof RouteError && g.state === 'play') return false;
    throw err;
  }
  return g.collected > before;
}

/** Collect every access card and pair of boots currently within reach. */
export function gather(g) {
  let got = 0;
  for (let guard = 0; guard < 12; guard++) {
    const reach = distanceField(g);
    let best = -1, bestD = Infinity;
    for (let i = 0; i < g.tiles.length; i++) {
      const t = g.tiles[i];
      // Charges too. A red floppy is carried, not collected, and it is the
      // only thing that opens a vault packed to its own plug -- so a plan that
      // says to plant one has to have been given the chance to pick it up.
      if (!isKey(t) && t !== T.BOOTS && t !== T.RED) continue;
      if (reach[i] < 0 || reach[i] >= bestD) continue;
      best = i; bestD = reach[i];
    }
    if (best < 0) break;
    try {
      goTo(g, [best % g.w, (best / g.w) | 0]);
      got++;
    } catch (err) {
      if (err instanceof RouteError && g.state === 'play') break;
      throw err;
    }
  }
  return got;
}

/**
 * Alternate between picking up kit and collecting, until the quota is met.
 *
 * A level gated by coloured doors needs both, in the only order that works:
 * take the card in this bay, open the door, take the card in the next one.
 */
export function sweep(g, count) {
  let got = 0;
  // Careful first, then once boldly. Care 3 will not dig under anything that
  // falls and will not go down a one-way rail, which is what keeps a sweep
  // from sealing itself in -- but on a level whose back half is past a rail it
  // leaves that half alone, and the quota is measured from what the sweep
  // takes, so the level ends up asking for very little. The second pass is
  // what the last of a board is worth: by then the quota is nearly met, so
  // there is little left to lose if it strands.
  // Three stages, each giving up something the one before it would not.
  // Careful takes what can be had without digging under anything; bold digs;
  // and only when this side of the board is exhausted and the bay still wants
  // more does it commit to a one-way rail, because past one there is no coming
  // back for whatever was left behind.
  for (const [care, oneWay] of [[CARE_SWEEP, false], [1, false], [1, true]]) {
    if (got >= count) break;
    sweeping = !oneWay;
    try {
      for (let round = 0; round < 24 && got < count && g.state === 'play'; round++) {
        gather(g);
        const before = g.collected;
        collect(g, count - got, Infinity, care);
        got += g.collected - before;
        if (g.collected === before && !gather(g)) break;
      }
    } finally {
      sweeping = false;
    }
  }
  return got;
}

export function toExit(g) {
  // A level may have more than one bay -- a fork under gravity needs one at the
  // foot of each shaft. Take the nearest one actually reachable from here
  // rather than the first in row order, which may be down the branch not taken.
  const reach = distanceField(g);
  let exit = -1, best = Infinity;
  let any = false;
  for (let i = 0; i < g.tiles.length; i++) {
    if (g.tiles[i] !== T.EXIT) continue;
    any = true;
    const x = i % g.w, y = (i / g.w) | 0;
    let d = reach[i];
    if (d < 0) {
      // The bay itself is not walkable until it opens, so measure to its doorstep.
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const j = (y + dy) * g.w + (x + dx);
        if (j >= 0 && j < reach.length && reach[j] >= 0) d = Math.min(d < 0 ? Infinity : d, reach[j] + 1);
      }
    }
    if (d >= 0 && d < best) { best = d; exit = i; }
  }
  if (!any) throw new RouteError('level has no exit');
  // Say which of the two it is. Walking to a shut bay and pressing against it
  // reads as "ran out of budget", and an unreachable one reads the same as a
  // shut one unless the quota is checked first.
  if (!g.exitOpen()) {
    throw new RouteError(`bay is still shut: ${g.collected}/${g.need} infotrons`);
  }
  if (exit < 0) throw new RouteError('no drive bay is reachable from here');
  // Walking to a shut bay and pressing against it forever reads as "ran out of
  // budget", which says nothing. The real fault is almost always the quota.
  if (!g.exitOpen()) {
    throw new RouteError(`bay is still shut: ${g.collected}/${g.need} infotrons`);
  }
  goTo(g, [exit % g.w, (exit / g.w) | 0]);
  // leaving takes the exit animation's five steps, the world running on
  for (let k = 0; k < 12 && g.state === 'exiting'; k++) g.step(IDLE);
}
