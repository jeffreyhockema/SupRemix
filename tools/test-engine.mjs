// Engine rule tests. Run with `npm test`.
//
// Each case builds a tiny hand-made grid, drives it with a scripted input
// string, and asserts on the resulting tiles. Scripts read as movement:
//   R L U D  step that way      .  stand still
//   !        tap plant          gR gL gU gD  reach (space + direction)
//
// mk() lays a hardware floor under short scenes, so a test only sees the
// physics it is actually about.

import { parseLevel, T, FL } from '../public/js/tiles.js';
import { Game } from '../public/js/engine.js';
import { Fx, playFx } from '../public/js/fx.js';

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n         ${err.message}`);
  }
}

function eq(actual, expected, what = 'value') {
  if (actual !== expected) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function ok(cond, what) {
  if (!cond) throw new Error(what || 'expected truthy');
}

function mk(rows, opts = {}) {
  const width = Math.max(3, ...rows.map((r) => r.length));
  const w = Math.max(5, width + 2);
  const h = Math.max(5, rows.length + 2);
  const padded = rows.slice();
  while (padded.length < h - 2) padded.push('#'.repeat(width));
  return new Game(parseLevel({
    w, h, rows: padded, name: 'test',
    need: opts.need ?? 0,
    gravity: !!opts.gravity,
    slimeCap: opts.slimeCap,
  }, 0));
}

const DIR = { U: 0, R: 1, D: 2, L: 3 };
const IDLE = { dir: -1, grab: false, plant: false };

function go(g, script) {
  for (let k = 0; k < script.length; k++) {
    const ch = script[k];
    if (ch === '.') g.step(IDLE);
    else if (ch === '!') g.step({ dir: -1, grab: false, plant: true });
    else if (ch === 'g') g.step({ dir: DIR[script[++k]], grab: true, plant: false });
    else g.step({ dir: DIR[ch], grab: false, plant: false });
  }
  return g;
}

function idle(g, n) {
  for (let i = 0; i < n; i++) g.step(IDLE);
  return g;
}

function count(g, tile) {
  let n = 0;
  for (const t of g.tiles) if (t === tile) n++;
  return n;
}

const at = (g, x, y) => g.tiles[y * g.w + x];
const idx = (g, x, y) => y * g.w + x;

console.log('SupRemix engine tests\n');

// --- movement and collection ------------------------------------------------

test('walks into empty space', () => {
  const g = mk([' M  E']);
  go(g, 'R');
  eq(at(g, 3, 1), T.MURPHY, 'murphy moved right');
  eq(at(g, 2, 1), T.EMPTY, 'old cell cleared');
});

test('digs through base', () => {
  const g = mk([' M::E']);
  go(g, 'R');
  eq(at(g, 3, 1), T.MURPHY, 'murphy in the dug cell');
  eq(g.steps, 1, 'move counted');
});

test('collects infotrons and counts them', () => {
  const g = mk([' MII E'], { need: 2 });
  go(g, 'RR');
  eq(g.collected, 2, 'collected');
  ok(g.exitOpen(), 'exit should be open once the quota is met');
});

test('hardware blocks movement', () => {
  const g = mk([' M#  E']);
  go(g, 'RRR');
  eq(at(g, 2, 1), T.MURPHY, 'murphy stayed put');
  eq(g.steps, 0, 'no move counted');
});

test('reach (space+dir) takes the item without moving', () => {
  const g = mk([' MI E']);
  go(g, 'gR');
  eq(g.collected, 1, 'infotron taken');
  eq(at(g, 2, 1), T.MURPHY, 'murphy did not move');
  eq(at(g, 3, 1), T.EMPTY, 'infotron cell emptied');
});

// --- the exit ---------------------------------------------------------------

test('exit refuses entry below quota, opens on quota', () => {
  const g = mk([' MIE'], { need: 1 });
  go(g, 'R');
  eq(g.collected, 1, 'picked up the infotron');
  eq(g.state, 'play', 'still playing');
  go(g, 'R');
  eq(g.state, 'exiting', 'entering the open exit starts the way out');
  idle(g, 5);
  eq(g.state, 'won', 'the 40-frame exit animation later, the level is won');
});

test('exit stays shut when the quota is unmet', () => {
  const g = mk([' ME  I'], { need: 1 });
  go(g, 'RRR');
  eq(g.state, 'play', 'must not win');
  eq(at(g, 2, 1), T.MURPHY, 'blocked by the closed exit');
});

// --- gravity ----------------------------------------------------------------

test('zonk falls into empty space', () => {
  const g = mk([' O E', '    ', '   M']);
  idle(g, 2);
  eq(at(g, 2, 3), T.ZONK, 'zonk fell to the floor');
});

test('a falling zonk crushes Murphy', () => {
  const g = mk([' O E', '    ', ' M  ']);
  idle(g, 2);
  eq(g.state, 'dead', 'murphy is dead');
  eq(at(g, 2, 3), T.BOOM, 'blast where murphy stood');
});

test('zonk rolls off another zonk', () => {
  const g = mk(['M O E', '  O  ']);
  idle(g, 1);
  eq(at(g, 2, 1), T.ZONK, 'top zonk rolled left');
  eq(at(g, 3, 1), T.EMPTY, 'and left its old cell');
});

test('zonk does not roll off flat hardware', () => {
  const g = mk(['M O E', '  #  ']);
  idle(g, 2);
  eq(at(g, 3, 1), T.ZONK, 'zonk stays put on the wall');
});

test('a falling column comes apart a tile at a time', () => {
  // Each zonk waits for the cell below it to be properly free, not merely being
  // left, so the one on top starts a step behind the one under it.
  const g = mk([' O E', ' O  ', '    ', '   M']);
  idle(g, 1);
  eq(at(g, 2, 3), T.ZONK, 'lower zonk has dropped a tile');
  eq(at(g, 2, 1), T.ZONK, 'upper zonk still waiting');
  idle(g, 1);
  eq(at(g, 2, 4), T.ZONK, 'lower zonk on the floor');
  eq(at(g, 2, 3), T.EMPTY, 'a tile of daylight between them');
  eq(at(g, 2, 2), T.ZONK, 'upper zonk a tile behind');
});

test('a zonk follows Murphy a tile behind, never on his head', () => {
  // The reported case: up under a zonk, then straight back down. The cell he
  // leaves is his until he has left it, so the zonk can only start into it
  // after, and trails him by a tile for as long as he keeps going.
  const g = mk([' O   E', ' :    ', ' M    ', ' :    ', ' :    ']);
  go(g, 'U');
  eq(at(g, 2, 1), T.ZONK, 'zonk rests on Murphy while he is under it');
  go(g, 'D');
  eq(at(g, 2, 1), T.ZONK, 'not yet: he is still leaving the cell below it');
  go(g, 'D');
  eq(at(g, 2, 2), T.ZONK, 'now it falls');
  eq(at(g, 2, 3), T.EMPTY, 'with a tile of space between it and Murphy');
  eq(at(g, 2, 4), T.MURPHY, 'Murphy a tile further on');
  eq(g.state, 'play', 'alive');
});

test('stopping under a falling zonk gives a step of grace, and no more', () => {
  const run = (after) => {
    const g = mk([' O   E', ' :    ', ' M    ', '      ']);
    go(g, 'UD');                 // up under it and straight back
    go(g, after);
    return g;
  };
  eq(run('.R').state, 'play', 'one step stood still, then away: it comes to rest behind him');
  eq(run('..').state, 'dead', 'two steps stood still: it lands on him');
});

// --- pushing ----------------------------------------------------------------

test('pushing a zonk needs a moment of lean-in', () => {
  const g = mk([' MO  E']);
  go(g, 'R');
  eq(at(g, 3, 1), T.ZONK, 'one tap only leans');
  eq(at(g, 2, 1), T.MURPHY, 'murphy has not moved yet');
  go(g, 'R');
  eq(at(g, 4, 1), T.ZONK, 'second step shoves it');
  eq(at(g, 3, 1), T.MURPHY, 'and murphy follows');
});

test('a zonk with no room behind it will not move', () => {
  const g = mk([' MO# E']);
  go(g, 'RRRR');
  eq(at(g, 3, 1), T.ZONK, 'zonk pinned');
  eq(at(g, 2, 1), T.MURPHY, 'murphy blocked');
});

test('zonks cannot be pushed vertically', () => {
  const g = mk([' M E', ' O  ', ' #  ']);
  go(g, 'DD');
  eq(at(g, 2, 1), T.MURPHY, 'murphy stayed above');
  eq(at(g, 2, 2), T.ZONK, 'zonk stayed below');
});

test('yellow disks push in any direction', () => {
  const g = mk([' M E', ' y  ', '    ', '    ']);
  go(g, 'DD');
  eq(at(g, 2, 2), T.MURPHY, 'murphy moved into the vacated cell');
  eq(at(g, 2, 3), T.YELLOW, 'yellow disk shoved downward');
});

// --- disks and explosions ---------------------------------------------------

test('orange disks detonate when they land', () => {
  const g = mk([' o E', '    ', ' # M']);
  idle(g, 3);
  ok(g.tiles.includes(T.BOOM), 'something went off');
  eq(g.state, 'play', 'murphy was clear of it');
});

test('explosions leave hardware standing', () => {
  const g = mk([' o E', '    ', ' # M']);
  idle(g, 5);
  eq(at(g, 2, 3), T.HARDWARE, 'wall survived the blast');
});

// --- effects ---------------------------------------------------------------
// fx.js builds its canvases lazily precisely so this can run with no DOM.

test('every positioned event reports a cell on the board', () => {
  const g = mk([' o E', '    ', ' = M']);
  // Both channels are drained at the top of every step, so they have to be
  // collected as the level runs rather than read afterwards.
  const seen = [];
  for (let i = 0; i < 8; i++) {
    g.step({ dir: -1, grab: false, plant: false });
    for (const e of g.fx) seen.push({ ...e, events: g.events.slice() });
  }
  ok(seen.length > 0, 'something was reported');
  for (const e of seen) {
    ok(typeof e.k === 'string' && e.k.length, 'the event has a kind');
    ok(e.i >= 0 && e.i < g.tiles.length, `${e.k} reported cell ${e.i}, off the board`);
    ok(e.events.includes(e.k), `${e.k} reached the sound channel too`);
  }
});

test('a burst puts real numbers on the board', () => {
  const fx = new Fx();
  playFx(fx, 'boom', 10, 5);
  const live = fx.parts.filter((p) => p.life > 0);
  ok(live.length > 20, `boom made ${live.length} particles`);
  for (const p of live) {
    ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'position is a number');
    ok(Number.isFinite(p.vx) && Number.isFinite(p.vy), 'velocity is a number');
  }
});

test('a directed burst does not fire at NaN', () => {
  // `land` throws debris sideways, and it is the one shape that goes through
  // the angle-and-spread path. Written carelessly that path yields NaN and
  // nothing is ever seen.
  const fx = new Fx();
  playFx(fx, 'land', 4, 4);
  const live = fx.parts.filter((p) => p.life > 0);
  ok(live.length > 0, 'something was thrown');
  ok(live.every((p) => Number.isFinite(p.vx) && Number.isFinite(p.vy)), 'all velocities real');
});

test('particles expire and the pool is reused, not grown', () => {
  const fx = new Fx();
  const size = fx.parts.length;
  for (let k = 0; k < 400; k++) playFx(fx, 'infotron', k % 20, 3);
  eq(fx.parts.length, size, 'pool size held');
  for (let k = 0; k < 60; k++) fx.update(0.05);
  eq(fx.parts.filter((p) => p.life > 0).length, 0, 'everything died off');
});

test('effects back off when frames run long', () => {
  const fx = new Fx();
  for (let k = 0; k < 12; k++) fx.pace(0.05);
  ok(fx.quality < 1, `quality dropped to ${fx.quality.toFixed(2)}`);
  const low = fx.quality;
  for (let k = 0; k < 200; k++) fx.pace(0.008);
  ok(fx.quality > low, 'and comes back when they do not');
});

test('explosions take chips out', () => {
  // A DIP chip is a wall to walk into and it is not chassis: a blast clears it.
  // The original set leans on this -- level 105 has its drive bay walled in on
  // three sides by hardware and on the fourth by a single chip, so blowing
  // that chip is the only way the level is ever finished. Forty-four of the
  // 111 have an exit that is sealed off until a chip goes.
  const g = mk([' o E', '    ', ' = M']);
  idle(g, 5);
  ok(at(g, 2, 3) !== T.CHIP, 'chip did not survive the blast');
});

test('a blast sets off disks it catches (chain reaction)', () => {
  const g = mk(['  o  E', '      ', '  y   ', '     M']);
  idle(g, 14);
  eq(count(g, T.YELLOW), 0, 'yellow disk consumed by the chain');
});

test('terminals detonate every yellow disk', () => {
  const g = mk([' MT E', '     ', 'y   y']);
  go(g, 'R');
  idle(g, 10);
  eq(count(g, T.YELLOW), 0, 'all yellows gone');
  eq(at(g, 3, 1), T.TERMINAL, 'terminal itself is untouched');
});

test('a red disk goes down where Murphy stands once fire is held', () => {
  // As the original: fire held with no direction, from a standstill, for 64
  // frames; the disk is put down under him and shows once he steps off it.
  const g = mk([' Mr   E', '       ']);
  go(g, 'R');
  eq(g.redDisks, 1, 'pocketed');
  go(g, '.!!!!!!!!');
  eq(g.redDisks, 1, 'still holding: nothing down yet');
  go(g, '!');
  eq(g.redDisks, 0, 'down after the hold');
  ok(g.liveDisk && g.liveDisk.i === idx(g, 3, 1), 'under Murphy');
  go(g, 'RR');
  eq(at(g, 3, 1), T.RED, 'shows once he has stepped off it');
  idle(g, 5);
  ok(at(g, 3, 1) !== T.RED, 'gone off on its 38-frame fuse');
  eq(g.state, 'play', 'two cells away is clear of it');
});

test('letting go of fire early plants nothing', () => {
  const g = mk([' Mr   E', '       ']);
  go(g, 'R.!!!!.!!!!');
  eq(g.redDisks, 1, 'disk kept');
  ok(!g.liveDisk, 'nothing burning');
});

test('planting says so when there is no disk to plant', () => {
  const empty = mk(['M:::::::E', ':']);
  empty.step({ dir: -1, grab: false, plant: true });
  ok(empty.events.includes('nodisk'), 'reported carrying none');
});

test('only one red disk burns at a time, and the burning one is no pickup', () => {
  const g = mk([' Mrr   E', '        ']);
  go(g, 'RR');
  eq(g.redDisks, 2, 'two pocketed');
  go(g, '.!!!!!!!!!');
  eq(g.redDisks, 1, 'one down');
  go(g, '!!!!!!!!!');
  eq(g.redDisks, 1, 'the second will not go down while the first burns');
});

// --- monsters ---------------------------------------------------------------

test('walking into a snik snak is fatal', () => {
  const g = mk([' MS E']);
  go(g, 'R');
  eq(g.state, 'dead', 'murphy is dead');
});

test('a monster takes its patrol route rather than lunging sideways', () => {
  // The snak starts facing up; its left-hand rule sends it left into open
  // space. Murphy standing on its right must survive that pass -- monsters
  // kill by walking into you, not by being next to you.
  const g = mk(['  SM E']);
  idle(g, 4);
  eq(g.state, 'play', 'murphy survived the pass');
  const snak = g.tiles.indexOf(T.SNIKSNAK);
  ok(snak >= 0 && snak % g.w < 3, 'the snak followed its wall away from Murphy');
  eq(at(g, 4, 1), T.MURPHY, 'murphy is untouched where he stood');
});

test('a snik snak that reaches Murphy kills him', () => {
  const g = mk([' M  S E']);
  for (let i = 0; i < 24 && g.state === 'play'; i++) g.step(IDLE);
  eq(g.state, 'dead', 'the patrol found him');
});

test('a zonk dropped on an electron yields infotrons', () => {
  // boxed in by base, so it waits for the zonk rather than wandering off
  const g = mk([':O:  E', ': :   ', ':e:  M']);
  idle(g, 14);
  ok(count(g, T.INFOTRON) >= 4, `expected an infotron burst, saw ${count(g, T.INFOTRON)}`);
  eq(g.state, 'play', 'murphy stood clear');
});

test('enemies move at Murphy\'s pace, a tile a step', () => {
  const g = mk(['######', 'S     ', '######', '    ME']);
  const sx = () => g.tiles.indexOf(T.SNIKSNAK) % g.w;
  idle(g, 1);                      // turns to face along the corridor, then sets off
  const start = sx();
  idle(g, 3);
  eq(sx() - start, 3, 'three tiles in three steps');
});

test('bugs all spark at the start, then go dark for a while', () => {
  const g = mk([' B  M', '    E']);
  const b = g.tiles.indexOf(T.BUG);
  ok(g.bugActive(b), 'sparking from the first frame');
  idle(g, 7);
  ok(!g.bugActive(b), 'dark after its 56 frames');
  idle(g, 15);
  ok(!g.bugActive(b), 'and dark for at least 128 frames more');
});

test('a blast takes everything but hardware, the exit included', () => {
  const g = mk(['     M', ':#E:  ', '      ']);
  g.explode(idx(g, 3, 2));
  eq(at(g, 2, 2), T.HARDWARE, 'hardware stands');
  eq(at(g, 3, 2), T.BOOM, 'the exit goes, as it does in the original');
  eq(at(g, 4, 2), T.BOOM, 'and the base beside it');
});

test('the dying half of a blast can be walked into; the first half kills', () => {
  const early = mk(['M  :E', '     ']);
  early.explode(idx(early, 3, 1));
  go(early, 'R');
  go(early, 'R');
  eq(early.state, 'dead', 'walking into a fresh blast');
  const late = mk(['M  :E', '     ']);
  late.explode(idx(late, 3, 1));
  idle(late, 1);
  go(late, 'R');
  eq(late.state, 'play', 'walking into a dying one');
  eq(late.mi, idx(late, 2, 1), 'and through it');
});

test('terminals set off the yellow disks once, and only once', () => {
  const g = mk(['MT y   y E', '          ']);
  go(g, 'R');
  eq(count(g, T.YELLOW), 0, 'every yellow disk went at once');
  ok(g.yellowDone, 'and the terminals are spent');
});

test('a bug you can see is dark stays dark for the move you make next', () => {
  // The phase shown on screen has to be the phase the next step judges, or a
  // bug can look safe as you commit and kill you anyway.
  const g = mk([' MB E']);
  const bug = idx(g, 3, 1);
  while (g.bugActive(bug)) g.step(IDLE);
  const seenDark = !g.bugActive(bug);
  ok(seenDark, 'observed dark');
  go(g, 'R');
  eq(g.state, 'play', 'the move honoured what was on screen');
});

test('bugs are safe while dark and lethal while flashing', () => {
  const safe = mk([' MB E']);
  while (safe.bugActive(idx(safe, 3, 1))) safe.step(IDLE);
  go(safe, 'R');
  eq(safe.state, 'play', 'eating a dark bug is fine');
  eq(safe.collected, 0, 'a bug is not an infotron');

  const deadly = mk([' MB E']);
  while (!deadly.bugActive(idx(deadly, 3, 1))) deadly.step(IDLE);
  go(deadly, 'R');
  eq(deadly.state, 'dead', 'touching a live bug kills');
});

// --- ports ------------------------------------------------------------------

test('a port passes you through in its own direction', () => {
  const g = mk([' M>  E']);
  go(g, 'R');
  eq(at(g, 4, 1), T.MURPHY, 'stepped clean through the port');
  eq(at(g, 3, 1), T.PORT_R, 'port stayed put');
});

test('a port refuses the wrong direction', () => {
  const g = mk([' E >M ']);
  go(g, 'L');
  eq(at(g, 5, 1), T.MURPHY, 'murphy bounced off the back of the port');
});

test('a port will not deliver you into a blocked cell', () => {
  const g = mk([' M>#E']);
  go(g, 'R');
  eq(at(g, 2, 1), T.MURPHY, 'no room on the far side, so no trip');
});

test('gravity ports flip gravity, and gravity pulls Murphy down', () => {
  const g = mk([' M  E', ' 2   ', '     ', '     ']);
  eq(g.gravity, false, 'starts off');
  go(g, 'D');
  eq(g.gravity, true, 'gravity port flipped it');
  eq(at(g, 2, 3), T.MURPHY, 'delivered below the port');
  go(g, '.');
  eq(at(g, 2, 4), T.MURPHY, 'and then fell under gravity');
});

// --- integrity --------------------------------------------------------------

test('restart restores the level exactly', () => {
  const g = mk([' M::I E'], { need: 1 });
  const before = Array.from(g.tiles);
  go(g, 'RRR');
  eq(g.collected, 1, 'picked something up');
  g.restart();
  eq(g.collected, 0, 'counter reset');
  eq(g.tiles.join(','), before.join(','), 'grid identical to the start');
});

test('the simulation is deterministic', () => {
  const script = 'RRDDgRLL..R';
  const a = mk([' M:::I E', ' :O::: :', ' ::::y :']);
  const b = mk([' M:::I E', ' :O::: :', ' ::::y :']);
  go(a, script);
  go(b, script);
  eq(a.tiles.join(','), b.tiles.join(','), 'same inputs, same world');
  eq(a.steps, b.steps, 'same move count');
});


// --- hybrid systems ---------------------------------------------------------

test('a keycard opens its own door and nothing else', () => {
  const g = mk(['MaA::E']);
  go(g, 'R');
  eq(g.keys[0], 1, 'amber card pocketed');
  go(g, 'R');
  eq(at(g, 3, 1), T.MURPHY, 'the amber door opened');
  eq(g.keys[0], 0, 'and the card was spent');

  const wrong = mk(['MaC::E']);
  go(wrong, 'RR');
  eq(at(wrong, 2, 1), T.MURPHY, 'an amber card will not open a cyan door');
  ok(wrong.events.includes('locked'), 'and it says so');
});

test('ice carries you until something stops you', () => {
  const g = mk(['M~~~~:E']);
  go(g, 'R');
  eq(at(g, 2, 1), T.MURPHY, 'stepped onto the ice');
  idle(g, 6);
  eq(at(g, 5, 1), T.MURPHY, 'slid to the far end and stopped against the base');
  eq(g.slide, -1, 'no longer sliding');
});

test('fire needs boots', () => {
  const bare = mk(['M:X:E']);
  go(bare, 'RR');
  eq(bare.state, 'dead', 'walking into fire unshod is fatal');

  const shod = mk(['MwX:E']);
  go(shod, 'R');
  ok(shod.boots, 'boots picked up');
  go(shod, 'R');
  eq(shod.state, 'play', 'and the fire is survivable');
  eq(at(shod, 3, 1), T.MURPHY, 'standing in it');
});

test('a rack on every pad drops the force fields', () => {
  const g = mk(['MH @', 'F::::', '::::E']);
  ok(!g.forceOpen, 'fields are live while the pad is bare');
  ok(!g.canEnter(idx(g, 1, 2)), 'and the field cell is sealed');
  go(g, 'RRRR');
  idle(g, 1);
  eq(at(g, 4, 1), T.RACK, 'rack parked on the pad');
  ok(g.forceOpen, 'fields drop');
  ok(g.canEnter(idx(g, 1, 2)), 'and the cell opens up');
});

test('a walkway seals itself once used', () => {
  const g = mk(['M;;:::E']);
  go(g, 'R');
  ok(g.phaseT[idx(g, 2, 1)] > 0, 'stepping on it starts the countdown');
  go(g, 'RR');
  idle(g, 60);
  eq(at(g, 2, 1), T.HARDWARE, 'the walkway sealed behind him');
  eq(g.state, 'play', 'and he was clear of it');
});

test('slime creeps, and crystallises when it is boxed in', () => {
  const creeping = mk(['M   E', ' *   ', '     ']);
  const before = count(creeping, T.SLIME);
  idle(creeping, 40);
  ok(count(creeping, T.SLIME) > before, 'slime spread');

  const boxed = mk(['M   E', '#####', '#*###', '#####']);
  idle(boxed, 20);
  eq(count(boxed, T.SLIME), 0, 'boxed-in slime is gone');
  eq(at(boxed, 2, 3), T.INFOTRON, 'it turned into an infotron');
});

test('slime that runs wild hardens into zonks rather than drowning the level', () => {
  const g = mk(['M   E', ' *   ', '     '], { slimeCap: 3 });
  idle(g, 120);
  eq(count(g, T.SLIME), 0, 'no slime left');
  ok(count(g, T.ZONK) > 0, 'it set into zonks');
});


test('slime cannot creep off the end of a row and reappear on the next', () => {
  // A cell in column 0 looking left used to land on the last column of the row
  // above, because the pass added -1 to the index instead of stepping in x.
  const g = mk(['*    ', '    M', '    E']);
  const w = g.w;
  const rowOf = (i) => (i / w) | 0;

  const seeded = [];
  for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i] === T.SLIME) seeded.push(i);
  eq(seeded.length, 1, 'one seed');

  idle(g, 200);
  // The tell-tale of a wrap is a patch with nothing joining it to the mass.
  for (let i = 0; i < g.tiles.length; i++) {
    if (g.tiles[i] !== T.SLIME) continue;
    let touching = i === seeded[0];
    for (let d = 0; d < 4 && !touching; d++) {
      const j = g.neighbour(i, d);
      if (j >= 0 && (g.tiles[j] === T.SLIME || g.tiles[j] === T.INFOTRON)) touching = true;
    }
    ok(touching, `slime at ${i % w},${rowOf(i)} is joined to the mass`);
  }
});

test('neighbour refuses to step off the grid', () => {
  const g = mk(['M   E']);
  const topLeft = idx(g, 0, 0);
  eq(g.neighbour(topLeft, 3), -1, 'left of column 0 is nothing');
  eq(g.neighbour(topLeft, 0), -1, 'above row 0 is nothing');
  const bottomRight = idx(g, g.w - 1, g.h - 1);
  eq(g.neighbour(bottomRight, 1), -1, 'right of the last column is nothing');
  eq(g.neighbour(bottomRight, 2), -1, 'below the last row is nothing');
});

test('a walkway sealing under Murphy kills him instead of erasing him', () => {
  // It used to overwrite his cell with chassis, which left `mi` pointing at a
  // wall: the HUD kept reading a tile that was not him.
  const g = mk(['M;E']);
  go(g, 'R');
  ok(g.phaseT[idx(g, 2, 1)] > 0, 'the countdown is running');
  idle(g, 60);
  eq(g.state, 'dead', 'standing on it when it goes is fatal');
  ok(g.tiles[g.mi] !== T.HARDWARE, 'and he was not replaced by a wall');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
