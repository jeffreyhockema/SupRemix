// Helpers for rewriting an imported level in levels/upgrades.mjs.
//
// Everything here takes GAME coordinates -- the ones `npm run peek <level>`
// prints and `npm run inspect` reports. A level's `rows` are the interior only,
// because the loader adds the chassis border, so cell (x, y) lives at
// rows[y - 1][x - 1]; getting that off by one by hand is the single easiest
// mistake to make here, so nothing below asks you to.
//
// Writing outside the interior throws rather than silently doing nothing: a
// keycard placed into the border is a change you would never see and would
// spend a while looking for.

const BORDER = 'the chassis border';

function check(l, x, y) {
  if (x < 1 || y < 1 || x > l.w - 2 || y > l.h - 2) {
    throw new Error(`level ${l.n}: ${x},${y} is outside the interior `
      + `(1..${l.w - 2}, 1..${l.h - 2}) -- that cell is ${BORDER}`);
  }
}

/** What is at (x, y). */
export function at(l, x, y) {
  check(l, x, y);
  return l.rows[y - 1][x - 1];
}

/** Put a glyph at (x, y). */
export function put(l, x, y, ch) {
  check(l, x, y);
  if (ch.length !== 1) throw new Error(`level ${l.n}: "${ch}" is not one glyph`);
  const r = l.rows[y - 1];
  l.rows[y - 1] = r.slice(0, x - 1) + ch + r.slice(x);
  return l;
}

/** Fill a rectangle, top-left at (x, y). */
export function rect(l, x, y, w, h, ch) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(l, xx, yy, ch);
  return l;
}

/** Draw a string starting at (x, y), left to right. */
export function text(l, x, y, s) {
  for (let k = 0; k < s.length; k++) put(l, x + k, y, s[k]);
  return l;
}

/**
 * Put a floor under (x, y): ice, a plate, a failing trace, heat, a force field.
 *
 * Floors are a parallel map, so the object standing on the cell is untouched --
 * a plate can have a drive already parked on it, ice can have an infotron out
 * on it. The array is created the first time it is asked for, and rows are kept
 * full width so a surface can never bleed to the edge.
 */
export function floor(l, x, y, ch) {
  check(l, x, y);
  const inner = l.w - 2;
  if (!l.floors) l.floors = l.rows.map(() => ' '.repeat(inner));
  const r = l.floors[y - 1];
  l.floors[y - 1] = r.slice(0, x - 1) + ch + r.slice(x);
  return l;
}

/** Find every cell holding `ch`, as [x, y] pairs in game coordinates. */
export function find(l, ch) {
  const out = [];
  for (let y = 1; y <= l.h - 2; y++) {
    const row = l.rows[y - 1];
    for (let x = 1; x <= l.w - 2; x++) if (row[x - 1] === ch) out.push([x, y]);
  }
  return out;
}

/** Rename the level, and optionally give it a new hint. */
export function rename(l, name, hint) {
  l.name = name;
  if (hint !== undefined) l.hint = hint;
  return l;
}

/** Set how many infotrons the drive bay wants. */
export function quota(l, n) {
  l.need = n;
  return l;
}

// --- widgets ----------------------------------------------------------------
//
// Each of these drops a self-contained structure into a level and hands back
// how many infotrons it added, so the quota can be raised to match and the new
// mechanic becomes compulsory rather than optional scenery. They draw their own
// walls, so they can go anywhere `pocket()` finds room and cannot open a route
// the original board did not have.

/** How many of a glyph the level holds. */
export function count(l, ch) {
  return l.rows.reduce((n, r) => n + [...r].filter((c) => c === ch).length, 0);
}

// What a widget may be built over, in order of preference. Plain filler first;
// a capacitor is furniture but replaceable; an infotron is the level's quota
// and paving one over is a last resort -- on level 3 an earlier version put a
// vault straight through the infotron block and took the board to thirteen
// fewer than it started with.
const TIERS = [
  new Set([':', ' ']),
  new Set([':', ' ', 'O']),
  new Set([':', ' ', 'O', 'I']),
  // Last of all, scattered chips. On a board like level 8 they are texture
  // rather than structure -- single packages strewn through a field -- and
  // there is no clear six-row patch on it otherwise. Paving one over can only
  // open a way through, never seal one, and the reachability checks in
  // `npm run validate` are what confirm that.
  new Set([':', ' ', 'O', 'I', '=', '[', ']', '"', '_']),
];

function clearAt(l, x, y, w, h, allow) {
  // The interior runs 1..w-2 and 1..h-2, and a box may sit right against it --
  // its own wall is then one cell in from the chassis border, which is fine.
  if (x < 1 || y < 1 || x + w - 1 > l.w - 2 || y + h - 1 > l.h - 2) return false;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) if (!allow.has(at(l, xx, yy))) return false;
  }
  return true;
}

/**
 * The biggest of a set of widths that will fit, at a fixed height.
 *
 * A widget is drawn to a size, but a board is not obliged to have room for the
 * size you had in mind -- level 3's only clear patch is twelve wide. Rather
 * than pick a size small enough for the worst board and use it everywhere, ask
 * for a list, largest first, and take what fits.
 */
export function room(l, h, widths, opts = {}) {
  // Tier outside width, not the other way round. Asking pocket() for each width
  // in turn let a wide box that paved over the level's own infotrons win over a
  // narrow one on plain filler -- which is how level 3 ended up thirteen
  // infotrons down. Clean ground first; only then take what width is going.
  for (let tier = 0; tier < TIERS.length; tier++) {
    for (const w of widths) {
      const at = pocketAt(l, w, h, TIERS[tier], opts);
      if (at) return [...at, w, h];
    }
  }
  throw new Error(`level ${l.n}: nowhere clear for a ${h}-row widget of any width `
    + `(tried ${widths.join(', ')})`);
}

/**
 * Somewhere to build: a clear w-by-h rectangle, as near `prefer` as there is
 * one. Boxes touching Murphy or a drive bay are skipped -- burying either is
 * how a level stops being finishable in a way nothing else notices.
 */
export function pocket(l, w, h, opts = {}) {
  for (const allow of TIERS) {
    const at = pocketAt(l, w, h, allow, opts);
    if (at) return at;
  }
  throw new Error(`level ${l.n}: nowhere clear to put a ${w}x${h} widget`);
}

function pocketAt(l, w, h, allow, opts) {
  const keepAway = [...find(l, 'M'), ...find(l, 'E'), ...(opts.clear || [])];
  const margin = opts.margin ?? 2;
  const [px, py] = opts.prefer || [l.w >> 1, l.h >> 1];
  let best = null, bestCost = Infinity;
  for (let y = 1; y + h - 1 <= l.h - 2; y++) {
    for (let x = 1; x + w - 1 <= l.w - 2; x++) {
      if (!clearAt(l, x, y, w, h, allow)) continue;
      if (keepAway.some(([kx, ky]) => kx >= x - margin && kx < x + w + margin
        && ky >= y - margin && ky < y + h + margin)) continue;
      const cost = Math.abs(x - px) + Math.abs(y - py);
      if (cost < bestCost) { bestCost = cost; best = [x, y]; }
    }
  }
  return best;
}

// --- placing without breaking the board -------------------------------------

const CHASSIS = new Set('#%&LJK');
// Things that have to stay reachable: the way out, and anything a level might
// need to pick up. A chip is not here -- a blast clears one, which is how the
// original set opens several of its bays.
const MUST_REACH = new Set('Eacgpw');

// A chip is a wall to walk into. A blast clears one, and the original set leans
// on that -- but a widget we add should be somewhere a player can simply walk,
// not somewhere they have to bring a bomb. So placement asks two questions with
// two different notions of a wall.
const CHIPS = new Set('=[]"_');

function flood(l, blockChips = false) {
  const [[mx, my]] = find(l, 'M');
  const seen = new Set([`${mx},${my}`]);
  const stack = [[mx, my]];
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx > l.w - 2 || ny > l.h - 2) continue;
      const k = `${nx},${ny}`;
      const ch = at(l, nx, ny);
      if (seen.has(k) || CHASSIS.has(ch) || (blockChips && CHIPS.has(ch))) continue;
      seen.add(k);
      stack.push([nx, ny]);
    }
  }
  return seen;
}

/** Is everything that matters still reachable? */
export function intact(l) {
  const seen = flood(l);
  for (let y = 1; y <= l.h - 2; y++) {
    for (let x = 1; x <= l.w - 2; x++) {
      if (MUST_REACH.has(at(l, x, y)) && !seen.has(`${x},${y}`)) return false;
    }
  }
  return true;
}

/**
 * Draw a widget somewhere it does not cut the board in half.
 *
 * A box of chassis dropped into open filler is safe nine times out of ten and
 * catastrophic the tenth: on level 10 a vault landed across the one way down
 * into the right-hand half and took the drive bay and a third of the board with
 * it. Nothing else notices, because the board still looks like a board.
 *
 * So placement is try-and-check rather than pick-and-hope. Candidates come in
 * order -- cleanest ground first, then widest, then nearest where it was
 * wanted -- and each is drawn, tested and undone until one holds.
 */
export function place(l, h, widths, draw, opts = {}) {
  const rows = [...l.rows];
  const floors = l.floors ? [...l.floors] : null;
  const need = l.need;
  for (const allow of TIERS) {
    for (const w of widths) {
      for (const [x, y] of candidates(l, w, h, allow, opts)) {
        const out = draw(l, x, y, w, h);
        // Two things have to hold. Nothing the level needed may have been
        // walled off -- and the widget's own doorstep has to be somewhere a
        // player can walk to without bringing a bomb, which is how level 3's
        // first vault ended up with its only door behind a chip.
        const [ax, ay] = out.approach;
        if (intact(l) && flood(l, true).has(`${ax},${ay}`)) return out.added;
        l.rows = [...rows];
        if (floors) l.floors = [...floors]; else delete l.floors;
        l.need = need;
      }
    }
  }
  throw new Error(`level ${l.n}: nowhere to put a ${h}-row widget without `
    + `sealing something off (tried widths ${widths.join(', ')})`);
}

function candidates(l, w, h, allow, opts) {
  const keepAway = [...find(l, 'M'), ...find(l, 'E'), ...(opts.clear || [])];
  const margin = opts.margin ?? 2;
  const [px, py] = opts.prefer || [l.w >> 1, l.h >> 1];
  const out = [];
  for (let y = 1; y + h - 1 <= l.h - 2; y++) {
    for (let x = 1; x + w - 1 <= l.w - 2; x++) {
      if (!clearAt(l, x, y, w, h, allow)) continue;
      if (keepAway.some(([kx, ky]) => kx >= x - margin && kx < x + w + margin
        && ky >= y - margin && ky < y + h + margin)) continue;
      out.push([x, y, Math.abs(x - px) + Math.abs(y - py)]);
    }
  }
  return out.sort((a, b) => a[2] - b[2]).map(([x, y]) => [x, y]);
}

/** A single item dropped on the clearest cell going. */
export function stash(l, ch, opts = {}) {
  // Somewhere the player can actually get to. A cap dropped into a pocket of
  // the board that happens to be sealed is a level that cannot be finished, and
  // it looks exactly like one that can.
  const seen = flood(l, true);
  for (const allow of TIERS) {
    for (const [x, y] of candidates(l, 1, 1, allow, opts)) {
      if (!seen.has(`${x},${y}`)) continue;
      put(l, x, y, ch);
      return [x, y];
    }
  }
  throw new Error(`level ${l.n}: nowhere reachable to leave a "${ch}"`);
}

/**
 * A run with a drive at one end and a pressure plate at the other, over a vault
 * held shut by a force field. Park the drive on the plate and the field drops.
 *
 * Rows y-1 (ceiling) to y+4 (floor); the run is row y and the vault y+2..y+3.
 */
export function plateVault(l, x, y, w) {
  rect(l, x, y - 1, w, 6, '#');
  rect(l, x + 1, y, w - 2, 1, ' ');
  put(l, x, y, ' ');                       // the way on to the run
  put(l, x + 1, y, 'H');                   // the drive
  floor(l, x + w - 2, y, '@');             // and the plate it has to reach
  const mouth = x + (w >> 1);
  put(l, mouth, y + 1, ' ');
  floor(l, mouth, y + 1, 'F');             // the field over the mouth
  rect(l, x + 1, y + 2, w - 2, 2, 'I');
  return { added: (w - 2) * 2, approach: [x - 1, y] };
}

/** A room of infotrons behind a coloured header. The cap goes elsewhere. */
export function lockedVault(l, x, y, w, h, colour) {
  rect(l, x, y, w, h, '#');
  rect(l, x + 1, y + 1, w - 2, h - 2, 'I');
  put(l, x + (w >> 1), y, colour.toUpperCase());
  return { added: (w - 2) * (h - 2), approach: [x + (w >> 1), y - 1] };
}

/**
 * A vault whose doorway runs across a hot component. Nothing crosses it without
 * the thermal boots, which are left somewhere else on the board.
 */
export function heatVault(l, x, y, w) {
  rect(l, x, y, w, 5, '#');
  put(l, x, y + 2, ' ');                   // the doorway
  for (let k = 1; k <= 3; k++) {
    put(l, x + k, y + 2, ' ');
    floor(l, x + k, y + 2, 'X');           // the hot stretch
  }
  rect(l, x + 4, y + 1, w - 5, 3, 'I');
  return { added: (w - 5) * 3, approach: [x - 1, y + 2] };
}

/**
 * A data bus: step on and you do not stop until something stops you. The only
 * way to the infotrons at the far end, because you cannot turn round on it.
 */
export function iceRun(l, x, y, w) {
  rect(l, x, y - 1, w, 4, '#');
  rect(l, x + 1, y, w - 2, 1, ' ');
  for (let k = 1; k < w - 1; k++) floor(l, x + k, y, '~');
  put(l, x, y, ' ');                       // step on here
  rect(l, x + 1, y + 1, w - 2, 1, 'I');    // and the haul is under the bus
  put(l, x + w - 2, y, 'I');               // one on the bus itself, as a stop
  return { added: w - 2 + 1, approach: [x - 1, y] };
}

/**
 * Sealed electrolyte. Boxed in with nowhere to creep it sets into infotrons on
 * its own; the board plug holds it in while it does, and board can be dug.
 */
export function slimeTank(l, x, y, w, h, seeds = 2) {
  rect(l, x, y, w, h, '#');
  rect(l, x + 1, y + 1, w - 2, h - 2, ' ');
  for (let k = 0; k < seeds; k++) put(l, x + 1 + k * 2, y + 1, '*');
  put(l, x, y + 1, ':');                   // the plug: board, so it can be dug
  l.slimeCap = Math.max(l.slimeCap ?? 0, (w - 2) * (h - 2) + 8);
  // What it will yield once it sets, and the plug you dig to get at it.
  return { added: (w - 2) * (h - 2), approach: [x - 1, y + 1] };
}

/**
 * Wall the drive bay in and leave one door, which is the glyph you pass.
 *
 * For a level with no infotrons to hold back -- or one where raising the quota
 * would change its character -- this is how a new mechanic is made compulsory:
 * it stops being about what you collect and starts being about getting in.
 * Neighbours that are already wall are left as they are.
 */
export function exitDoor(l, ch, floorCh) {
  const [[ex, ey]] = find(l, 'E');
  const sides = [[0, -1], [-1, 0], [1, 0], [0, 1]]
    .map(([dx, dy]) => [ex + dx, ey + dy])
    .filter(([x, y]) => x >= 1 && y >= 1 && x <= l.w - 2 && y <= l.h - 2)
    .filter(([x, y]) => !'#%&LJK=[]"_'.includes(at(l, x, y)));
  if (!sides.length) throw new Error(`level ${l.n}: the drive bay is already walled in`);
  // The door goes on the way the player is most likely to arrive: the side
  // facing Murphy. The rest is bricked up.
  const [[mx, my]] = find(l, 'M');
  sides.sort((a, b) => (Math.abs(a[0] - mx) + Math.abs(a[1] - my))
    - (Math.abs(b[0] - mx) + Math.abs(b[1] - my)));
  const [dx, dy] = sides.shift();
  put(l, dx, dy, ch);
  if (floorCh) floor(l, dx, dy, floorCh);
  for (const [x, y] of sides) put(l, x, y, '#');
  return [dx, dy];
}

/**
 * Keep a level's original generosity while making new content compulsory.
 *
 * Most of the original boards ask for every infotron on them; a few leave a
 * little spare. Passing that original slack through means a level plays as
 * loosely as it always did, and anything a widget added has to be collected --
 * so long as the widget put down more than the slack, which is checked.
 */
export function reslack(l, slack, added, opts = {}) {
  // The slack cannot be wider than what was added, or the new vault is optional
  // -- you could leave it shut and still make the quota. Where the mechanic is
  // gated somewhere else (a locked bay, a hot doorway) that does not matter and
  // the level keeps as much of its original generosity as there is room for.
  const kept = Math.min(slack, Math.max(0, added - 2));
  if (opts.mustUse && added < 3) {
    throw new Error(`level ${l.n}: added only ${added} infotrons, which is not `
      + 'enough to make the new work compulsory');
  }
  l.need = count(l, 'I') + (opts.plus || 0) - kept;
  return l;
}
