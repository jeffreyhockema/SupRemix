"""Level generator framework.

Levels are drawn on a Canvas in INTERIOR coordinates (0-based); the loader adds
the chassis border, so a game coordinate is interior + 1. The finished rows are
written into levels/remix.js as plain ASCII so the file still reads as art.
"""
import io
import json
import os
import textwrap

# Cells the recorded solutions actually walk through, from tools/trace-solutions.
# A Supaplex board is mostly hazard, but a capacitor dropped on the one route
# through is not difficulty -- it is a broken level. See densify().
try:
    PATHS = json.load(io.open(os.path.join(os.path.dirname(__file__), 'paths.json'),
                              encoding='utf-8'))
except (OSError, ValueError):
    PATHS = {}

# What each level actually yields when its solution is played, from
# tools/fit-quota. A hand-written quota is a guess, and several of them asked
# for more infotrons than the board could ever produce. A measured one cannot.
try:
    QUOTA = json.load(io.open(os.path.join(os.path.dirname(__file__), 'quota.json'),
                              encoding='utf-8'))
except (OSError, ValueError):
    QUOTA = {}

HEADER = '''/*
 * SupRemix level pack -- twenty rooms inside a 1990s PC.
 *
 * AUTHORING
 * Levels are written as INTERIOR rows only; the loader adds the chassis border.
 * A short row continues with whatever material it ends in -- a row ending in '#'
 * runs to the edge as wall, one ending in ':' stays board, anything else pads
 * with empty space. Surfaces live in a parallel `floors:` array.
 *
 * Legend -- objects
 *   (space) .  empty            #  chassis        %  chassis (green LED)
 *   &  chassis (red LED)        :  board          =  DIP chip
 *   [  ]  two-cell DIP, laid across    "  _  two-cell DIP, laid upright
 *   L  expansion slot           J  heatsink fin   K  socket slab
 *   M  Murphy                   O  capacitor      I  infotron      E  drive bay
 *   S  case fan                 e  short          B  bug           T  DIP switch
 *   o  orange floppy            y  yellow floppy  r  red floppy
 *   >  <  ^  v  ports           1 2 3 4  gravity ports (R D L U)
 *   |  -  +  vertical / horizontal / cross ports
 *   a c g p  jumper caps        A C G P  matching headers
 *   w  thermal boots            H  disk drive     *  electrolyte
 * Legend -- floors
 *   ~  data bus (ice)           @  pressure plate  ;  failing trace
 *   X  hot component            F  force field
 *
 * SHAPE OF THE PACK
 * Levels 1-4 teach, and they teach everything: digging and reaching, shoving
 * and rolling, ports and patrols, then the whole hybrid kit in one board. From
 * 5 on nothing is explained again, the boards get bigger, and the number of
 * things that have to happen in the right order goes up until the last few are
 * genuinely long. Every level from 4 on carries a `gate` tag naming what the
 * quota cannot be met without doing; `npm run audit` turns a naive collector
 * loose and fails the build if walking about is enough.
 *
 * SHAPE
 * Levels are authored sparse, then a pass fills the board out the way an
 * original Supaplex board is filled: chassis that is not holding a gate shut
 * becomes board, chips are threaded through it in runs of two-cell packages,
 * and capacitors are buried in it. Nothing is placed without checking that the
 * board still joins up, no infotron is sealed in and no passage is plugged, and
 * nothing at all is placed on the route a recorded solution walks. See
 * `npm run compare`.
 *
 * Every level has a worked solution in solutions.mjs which `npm run solve`
 * replays from spawn to exit.
 */

'''


class Canvas:
    def __init__(self, w, h, fill=':'):
        self.w, self.h = w, h
        self.g = [[fill] * w for _ in range(h)]
        # Cells the densify pass must leave exactly as they are: push lanes,
        # hollows, drains, bus lanes, tank interiors, anything under gravity.
        self.keep = set()

    def hold(self, x, y):
        self.keep.add((x, y))

    def hold_rect(self, x, y, w, h):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.keep.add((xx, yy))

    def put(self, x, y, ch):
        assert 0 <= x < self.w and 0 <= y < self.h, f'({x},{y}) off canvas {self.w}x{self.h}'
        self.g[y][x] = ch

    def get(self, x, y):
        return self.g[y][x]

    def text(self, x, y, s):
        for k, ch in enumerate(s):
            self.put(x + k, y, ch)

    def rect(self, x, y, w, h, ch):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.put(xx, yy, ch)

    def hline(self, x, y, n, ch):
        self.rect(x, y, n, 1, ch)

    def vline(self, x, y, n, ch):
        self.rect(x, y, 1, n, ch)

    def box(self, x, y, w, h, ch='#'):
        self.hline(x, y, w, ch)
        self.hline(x, y + h - 1, w, ch)
        self.vline(x, y, h, ch)
        self.vline(x + w - 1, y, h, ch)

    def room(self, x, y, w, h, wall='#', inner=' '):
        """A walled box with a hollow inside."""
        self.box(x, y, w, h, wall)
        self.rect(x + 1, y + 1, w - 2, h - 2, inner)

    def scatter(self, cells, ch='I'):
        for x, y in cells:
            self.put(x, y, ch)

    def rows(self):
        return [''.join(r) for r in self.g]


def floor_rows(canvas):
    """Floor rows, each ended with a space so a surface never bleeds to the edge."""
    out = []
    for r in canvas.rows():
        out.append(r.rstrip() + ' ' if r.strip() else '')
    return out


# Every glyph a bot cannot walk through. The two-cell DIP halves belong here:
# leaving them out let the build-time flood walk straight through chips and
# call a severed board connected.
WALLS = set('#%&=[]"_LJK')


def connectivity(canvas):
    """Flood from Murphy through everything that is not scenery.

    The loader's own lint says only "a region is sealed off"; catching it here
    says which level, while the coordinates that built it are still in hand.
    Returns (reached_exit, unreached_open_cells).
    """
    start = None
    exits = []
    for y in range(canvas.h):
        for x in range(canvas.w):
            ch = canvas.get(x, y)
            if ch == 'M':
                start = (x, y)
            elif ch == 'E':
                exits.append((x, y))
    assert start, 'no Murphy'
    assert exits, 'no exit'

    seen = {start}
    stack = [start]
    while stack:
        x, y = stack.pop()
        for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < canvas.w and 0 <= ny < canvas.h):
                continue
            if (nx, ny) in seen or canvas.get(nx, ny) in WALLS:
                continue
            seen.add((nx, ny))
            stack.append((nx, ny))

    orphans = []
    for y in range(canvas.h):
        for x in range(canvas.w):
            if canvas.get(x, y) not in WALLS and (x, y) not in seen:
                orphans.append((x, y))
    return any(e in seen for e in exits), orphans, seen


def dump(canvas, seen):
    """The board with everything the flood could not get to marked with a dot."""
    out = ['    ' + ''.join(str(x % 10) for x in range(canvas.w))]
    for y in range(canvas.h):
        line = ''
        for x in range(canvas.w):
            ch = canvas.get(x, y)
            line += ch if (x, y) in seen or ch in WALLS else '·'
        out.append(f'{y:3} {line}')
    return chr(10).join(out)


def _hash(x, y, seed):
    """Deterministic scatter. A plain modular test like (x*7+y*13)%100 < p
    stops scattering and starts filling once p goes up, which is how a tutorial
    ended up a solid wall of capacitors."""
    h = (x * 0x1F1F1F1F ^ y * 0x2545F491 ^ seed * 0x9E3779B1) & 0xFFFFFFFF
    h ^= h >> 15
    h = (h * 0x2C1B3C6D) & 0xFFFFFFFF
    h ^= h >> 12
    return (h % 10000) / 10000.0


ROUND = set(':OI=[]"_')          # things a capacitor will roll off
SOLID = set('#%&=[]"_LJK')
# What a player cannot walk through, as opposed to what is scenery. The drive
# bay counts: it stays shut until the quota is met, so a capacitor that isolates
# its doorstep strands you just as surely as one in a corridor.
WALK = SOLID | set('OEHT*Se')
# What actually stops someone who will not shove anything: scenery, plugs,
# drives and locked headers. Softening chassis into board has to be measured
# against THIS, or it quietly digs a way into every bay the pack gates.
GATED = WALK | set('HACGP')


def _open_field(c, x, y, want=3):
    """True where the cell has room around it -- not in a one-wide corridor.

    Threading a chip or burying a capacitor in a corridor either walls it off or
    plugs it. In open board both are harmless, and open board is where the
    original puts them.
    """
    free = 0
    for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < c.w and 0 <= ny < c.h and c.get(nx, ny) not in SOLID:
            free += 1
    return free >= want


def _reachable(c, block=None, walls=()):
    """How many cells the board still joins up into.

    `block` defaults to scenery. Pass the capacitors in as well to ask the other
    question: is everything still walkable, or has one been buried in the only
    way through?
    """
    block = SOLID if block is None else block
    start = next(((x, y) for y in range(c.h) for x in range(c.w)
                  if c.get(x, y) == 'M'), None)
    if start is None:
        return 0
    seen = {start}
    stack = [start]
    while stack:
        x, y = stack.pop()
        for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < c.w and 0 <= ny < c.h):
                continue
            if (nx, ny) in seen or c.get(nx, ny) in block or (nx, ny) in walls:
                continue
            seen.add((nx, ny))
            stack.append((nx, ny))
    return len(seen)


def soften(c, keep, fields=()):
    """Turn bulk chassis into board, without opening a single new way through.

    Our boards came out 45% chassis against the original's 21%, because a deck
    with gated bays hanging off it needs walls and Supaplex mostly does not. But
    most of that chassis is not holding anything shut -- it is just fill.

    A wall cell is converted only if the board still joins up into exactly one
    more cell than before. Merge two regions and the count jumps by more than
    one, so the conversion is refused: the last cell of any breach always fails,
    and every gate keeps a wall at least one cell thick. What is left is a field
    of board with thin chassis through it, which is what the original looks like.
    """
    reach = _reachable(c, GATED, fields)
    softened = 0
    for y in range(c.h):
        for x in range(c.w):
            if c.get(x, y) not in '#%&' or (x, y) in keep:
                continue
            if not any(0 <= x + dx < c.w and 0 <= y + dy < c.h
                       and c.get(x + dx, y + dy) not in SOLID
                       for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0))):
                continue
            was = c.get(x, y)
            c.put(x, y, ':')
            after = _reachable(c, GATED, fields)
            if after == reach + 1:
                reach = after
                softened += 1
            else:
                c.put(x, y, was)
    return softened


def densify(c, fl=None, chip=0.16, zonk=0.45, seed=1, name=None):
    """Give the board the two things a Supaplex board is mostly made of.

    The original is not corridors cut through chassis. It is a field of board
    threaded with chips and with capacitors buried in it, and the route is
    whatever you dig; twelve per cent of every original board is chip and eight
    per cent is capacitor. Ours had almost none of either -- two capacitors a
    level against the original's hundred and thirteen -- which is most of why it
    did not read as Supaplex.

    Only board is touched, and only board with room around it: corridors, push
    lanes, hollows, bus lanes, tank interiors and anything a gate depends on are
    all left exactly as drawn.
    """
    # Two sets. `structure` is what may not be reshaped at all -- gates, lanes,
    # hollows, surfaces. `keep` adds the route the recorded solution walks,
    # which chips and capacitors must stay off but which softening chassis into
    # board can only help.
    structure = set(c.keep)
    keep = set(structure)
    # The route, and only the route. Everything overhead used to be held too,
    # which shielded so much of the board that there was nowhere left to put
    # anything; the reachability checks below are what actually keep the level
    # solvable.
    for x, y in PATHS.get(name, ()):
        keep.add((x, y))

    fl_hold = structure if fl is None else keep
    if fl is not None:
        for y in range(c.h):
            for x in range(c.w):
                if fl.get(x, y) != ' ':
                    for st in (structure, keep):
                        st.add((x, y))
                        if y:
                            st.add((x, y - 1))

    # Anything loose keeps its footing and its landing: hold the column around
    # every mobile thing, every door and every card.
    for y in range(c.h):
        for x in range(c.w):
            if c.get(x, y) in 'OoyrHMSeB*wacgpACGPTE<>^v1234|-+':
                for st in (structure, keep):
                    for dy in (-2, -1, 0, 1):
                        if 0 <= y + dy < c.h:
                            st.add((x, y + dy))
                    st.add((x - 1, y) if x else (x, y))
                    st.add((x + 1, y) if x + 1 < c.w else (x, y))

    # Chips are walls, and two of them a knight's move apart will sever a board
    # two rows deep. Rather than try to reason about that, lay each one and keep
    # it only if everything is still reachable afterwards.
    fields = set()
    if fl is not None:
        fields = {(x, y) for y in range(c.h) for x in range(c.w) if fl.get(x, y) == 'F'}
    soften(c, structure, fields)

    chips = zonks = 0
    reach = _reachable(c)
    for y in range(c.h):
        for x in range(c.w):
            if c.get(x, y) != ':' or (x, y) in keep or not _open_field(c, x, y, 2):
                continue
            if _hash(x, y, seed) >= chip:
                continue
            # A run, not a speck: nine tenths of the solid in an original level
            # belongs to a straight line of four or more.
            horiz = _hash(x, y, seed + 77) < 0.5
            length = 2 * (1 + int(_hash(x, y, seed + 31) * 3))   # 2, 4 or 6
            laid = []
            for k in range(length):
                cx = x + k if horiz else x
                cy = y if horiz else y + k
                if not (0 <= cx < c.w and 0 <= cy < c.h):
                    break
                if c.get(cx, cy) != ':' or (cx, cy) in keep:
                    break
                if any(c.get(cx + dx, cy + dy) == 'I'
                       for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0))
                       if 0 <= cx + dx < c.w and 0 <= cy + dy < c.h):
                    break
                # Two-cell DIP packages, the way the original draws them: a
                # run of single blocks reads as masonry, a run of pairs reads
                # as a row of chips.
                glyph = ('[' if k % 2 == 0 else ']') if horiz else ('"' if k % 2 == 0 else '_')
                c.put(cx, cy, glyph)
                after = _reachable(c)
                if after != reach - 1:
                    c.put(cx, cy, ':')
                    break
                reach = after
                laid.append((cx, cy))
            if len(laid) % 2:                 # never leave half a package
                x0, y0 = laid.pop()
                c.put(x0, y0, ':')
                reach += 1
            chips += len(laid)

    walk = _reachable(c, WALK)
    for y in range(c.h - 1):
        for x in range(c.w):
            if c.get(x, y) != ':' or (x, y) in keep or not _open_field(c, x, y, 2):
                continue
            if c.get(x, y + 1) not in ROUND and c.get(x, y + 1) not in '#%&LJK':
                continue                          # it has to be standing on something
            if _hash(x, y, seed + 911) >= zonk:
                continue
            if any(c.get(x, y + dy) in 'MEI' for dy in (1, 2, 3)
                   if y + dy < c.h):
                continue                          # nothing standing over the quota
            if any(c.get(x + dx, y + dy) == 'M'
                   for dx in (-2, -1, 0, 1, 2) for dy in (-1, 0, 1)
                   if 0 <= x + dx < c.w and 0 <= y + dy < c.h):
                continue                          # and nothing over the spawn
            c.put(x, y, 'O')
            after = _reachable(c, WALK)
            if after == walk - 1:
                zonks += 1
                walk = after
            else:
                c.put(x, y, ':')              # that one was in the only way through
    return chips, zonks


CHIPS = set('=[]"_')
# What a repair pass is allowed to remove: field content, never chassis.
CLEARABLE = CHIPS | set('O')


def repair(c, limit=600):
    """Clear field chips until the board joins up again.

    The field is laid before the gates are stamped, so a gate can land in a way
    that turns a chip run into a partition. Only chips are cleared -- gates are
    chassis and chassis is never touched -- so nothing here can open a gate.
    """
    cleared = 0
    for _ in range(limit):
        ok, orphans, seen = connectivity(c)
        if ok and not orphans:
            return cleared
        lost = set(orphans)
        pick = None
        for y in range(c.h):
            for x in range(c.w):
                if c.get(x, y) not in CHIPS:
                    continue
                nb = [(x + dx, y + dy) for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0))
                      if 0 <= x + dx < c.w and 0 <= y + dy < c.h]
                # Any chip touching the stranded region will do: a barrier two
                # packages thick has no single cell touching both sides, so it
                # gets eroded one at a time instead.
                if any(p in lost for p in nb):
                    pick = (x, y)
                    break
            if pick:
                break
        if not pick:
            return cleared
        c.put(pick[0], pick[1], ':')
        cleared += 1
    return cleared


# Everything a bot cannot walk into, which is more than scenery: capacitors,
# drives, switches, monsters, electrolyte, and the drive bay itself while it is
# still shut.
WALKABLE = WALLS | set('OHT*SeyE')


def unbury(c, limit=800):
    """Clear buried capacitors until the open field is walkable end to end.

    The field is laid before the gates, so its guarantee that everything joins
    up is void the moment a gate drops a wall across the board. A capacitor is
    not scenery to look at but it is a wall to walk into, so a field that looks
    open can still have the spawn in a pocket of its own. Cells a gate has
    claimed are never touched, which is what keeps a plug a plug.
    """
    cleared = 0
    for _ in range(limit):
        seen = _flood(c, WALKABLE)
        lost = [(x, y) for y in range(c.h) for x in range(c.w)
                if c.get(x, y) not in WALKABLE and (x, y) not in seen
                and (x, y) not in c.keep]
        if not lost:
            return cleared
        stranded = set(lost)
        pick = None
        for y in range(c.h):
            for x in range(c.w):
                if c.get(x, y) != 'O' or (x, y) in c.keep:
                    continue
                nb = [(x + dx, y + dy) for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0))
                      if 0 <= x + dx < c.w and 0 <= y + dy < c.h]
                if any(p in stranded for p in nb) and any(p in seen for p in nb):
                    pick = (x, y)
                    break
            if pick:
                break
        if not pick:
            return cleared
        c.put(pick[0], pick[1], ':')
        cleared += 1
    return cleared


def open_up(c, limit=1200):
    """Clear whatever is actually in the way until the board is walkable.

    There were two passes here and each measured with a different notion of a
    wall: `repair` clears chips but floods as though capacitors were not there,
    `unbury` clears capacitors but will not touch a chip. A barrier made of both
    -- which is most of what a dig-field lays -- defeats the pair of them, and
    each returns quietly, so a level shipped with a third of its board sealed
    off. This asks the only question that matters: can a player get there? Then
    it clears whichever chip or capacitor is standing in the way.

    Cells a gate has claimed are never touched, which is what keeps a plug a
    plug and a sealed bay sealed.
    """
    cleared = 0
    for _ in range(limit):
        seen = _flood(c, WALKABLE)
        # A gate interior is sealed on purpose -- that is what a gate is -- so
        # only the open field counts as stranded.
        stranded = {(x, y) for y in range(c.h) for x in range(c.w)
                    if c.get(x, y) not in WALKABLE and (x, y) not in seen
                    and (x, y) not in c.keep}
        if not stranded:
            return cleared
        # Prefer a cell touching both sides -- that is a one-cell barrier and
        # clearing it joins the two regions outright. Failing that, erode
        # anything on the stranded side: a barrier two packages thick has no
        # single cell touching both, so it comes down a layer at a time.
        best = None
        for y in range(c.h):
            for x in range(c.w):
                if c.get(x, y) not in CLEARABLE or (x, y) in c.keep:
                    continue
                nb = [(x + dx, y + dy) for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0))
                      if 0 <= x + dx < c.w and 0 <= y + dy < c.h]
                touches_lost = any(p in stranded for p in nb)
                if not touches_lost:
                    continue
                if any(p in seen for p in nb):
                    best = (x, y)
                    break
                if best is None:
                    best = (x, y)
            if best and any(p in seen for p in
                            [(best[0] + dx, best[1] + dy)
                             for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0))]):
                break
        if best is None:
            return cleared
        c.put(best[0], best[1], ':')
        cleared += 1
    return cleared


def walkable(c):
    """Cells the board joins up on paper but a player cannot actually stand in.

    `connectivity` only asks about scenery, and a capacitor is not scenery to
    look at. It is still a wall to walk into, so a board that floods clean can
    have its exit behind one -- and `unbury` returns quietly when it cannot find
    a capacitor to clear, so nothing used to say so.
    """
    seen = _flood(c, WALKABLE)
    return [(x, y) for y in range(c.h) for x in range(c.w)
            if c.get(x, y) not in WALKABLE and (x, y) not in seen
            and (x, y) not in c.keep]


def _flood(c, block):
    start = next(((x, y) for y in range(c.h) for x in range(c.w)
                  if c.get(x, y) == 'M'), None)
    if start is None:
        return set()
    seen, stack = {start}, [start]
    while stack:
        x, y = stack.pop()
        for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < c.w and 0 <= ny < c.h):
                continue
            if (nx, ny) in seen or c.get(nx, ny) in block:
                continue
            seen.add((nx, ny))
            stack.append((nx, ny))
    return seen


# How hard the second threading pass goes at the board softening leaves behind.
# Chips are safe at any density -- they never move, so one can only ever wall
# something off at build time, where the repair passes will find it and where
# a pocket is authentic anyway. Capacitors are not: they fall during play, and
# a level only fails then. A second helping of them took the pack from twenty
# solvable to nine, so this pass lays chips and nothing else; the capacitors
# are all from `field`, where they are placed before any gate exists to block.
SECOND_CHIP = 0.26
SECOND_ZONK = 0.0    # none: see above

LEVELS = []
SOLUTIONS = []

SOL_HEADER = """// A worked solution for every level, replayed by tools/verify-solutions.mjs.
//
// GENERATED by tools/levelgen -- do not edit by hand, the next build overwrites
// it. Each gate widget records the moves that open it as it is stamped, so the
// coordinates here cannot drift from the geometry the way hand-written ones
// did: a widget that moves a cell moves its own solution with it.
//
// Gates first, sweeping last. That order is not a style: digging a dig-field is
// destructive, and a sweep sent out early wanders the whole board and drops the
// field into the tunnels behind it, so the walk back to the next gate is gone.
// Open everything while the board is still whole, then hoover up.

export const SOLUTIONS = [
"""

# Interior coordinates are 0-based and the loader adds the chassis border, so
# every coordinate a solution names is interior + 1. Doing it here, once, is the
# whole point: it used to be done by eye, per level, and it was wrong.
BORDER = 1


def _verbs(ops):
    return sorted({'gather'} | {{'go': 'goTo', 'press': 'press', 'grab': 'grab', 'plant': 'plant',
                    'wait': 'wait', 'collect': 'collect', 'gather': 'gather'}[op[0]] for op in ops}
                  | {'sweep', 'toExit'})


def _statements(ops, need):
    # Whatever is lying about, first. Cards and boots are not behind gates --
    # they are on the floor where a player would pick them up on the way past --
    # but nothing in a plan says to fetch them, and a controller is not
    # crossable without the boots, so the gate on the far side was unreachable.
    out = ['gather();']
    for op in ops:
        if op[0] == 'go':
            out.append(f'goTo({op[1] + BORDER}, {op[2] + BORDER});')
        elif op[0] == 'press':
            out.append(f'press({op[1]!r}, {op[2]});'.replace("'", "'"))
        elif op[0] in ('grab', 'plant'):
            out.append(f"{op[0]}('{op[1]}');")
        else:
            out.append(f"{op[0]}({', '.join(str(a) for a in op[1:])});")
    # Sweep to the quota, not to exhaustion. Digging a dig-field is
    # destructive: a sweep told to take everything wanders the whole board and
    # drops the field into the tunnel it came in by, and then the drive bay is
    # behind a wall it made itself. Taking what the bay asks for and no more is
    # both less destructive and how the game is actually played.
    out.append(f'sweep({need});')
    out.append('toExit();')
    return out



def emit(name, hint, need, gate, art, canvas, floors=None, gravity=False,
         slime_cap=None, allow_orphans=0, chip=0.16, zonk=0.45):
    """Append one pack entry, and the solution its gates just described."""
    import gates
    ops = gates.take_plan()

    # A measured quota beats an authored one, but only downwards and only if
    # the level still yields most of its board. A yield far under what is
    # authored does not mean the quota was wrong -- it means a gate never
    # opened, and quietly lowering the bar to match would hide that.
    rows_now = canvas.rows()
    # A short crushed under a capacitor comes down as a three-by-three of
    # infotrons, so a board can yield nine more than it was authored holding.
    on_board = (sum(r.count('I') for r in rows_now)
                + 9 * sum(r.count('e') for r in rows_now))
    fitted = QUOTA.get(name)
    if fitted is not None and on_board and fitted < on_board * 0.35:
        why = (f'{name}: yields only {fitted} of {on_board} infotrons on the board -- '
               'a gate is not opening. Fix the gate, do not lower the quota.')
        # LEVELGEN_LOOSE=1 builds it anyway, which is the only way to get a
        # board out of the generator to look at while the gate is still shut.
        if os.environ.get('LEVELGEN_LOOSE') != '1':
            raise AssertionError(why)
        print('  warn:', why)
    if fitted is not None:
        # The measured quota outright, not the smaller of the two. It is fitted
        # into the gap between what a walker can reach and what the solution
        # yields, so it is the only one of the pair that is known to be both
        # reachable and out of reach -- taking the lower left level 4 asking
        # for thirty when walking about got thirty-two.
        need = fitted
    elif need > on_board and os.environ.get('LEVELGEN_LOOSE') != '1':
        raise AssertionError(
            f'{name}: quota {need} but only {on_board} infotrons on the board -- '
            'and no measured quota to replace it, so the level was never solved')

    verbs = ', '.join(_verbs(ops))
    body = [f'  // {len(LEVELS) + 1}. {name} -- {gate}.', '  {',
            f'    name: {name!r},', f'    play({{ {verbs} }}) {{']
    body += [f'      {line}' for line in _statements(ops, need)]
    body += ['    },', '  },']
    SOLUTIONS.append(chr(10).join(body))


    # Bulk chassis back to board. A gate widget draws a box, and most of a box
    # is not holding anything shut -- it is fill, and it is why the field-cut
    # pack came out a third chassis against the original's fifth. Every cell is
    # converted only if the board still joins up into exactly one more cell
    # than before, so the last cell of any breach always fails and every gate
    # keeps a wall a cell thick.
    fields = set()
    if floors is not None:
        fields = {(x, y) for y in range(floors.h) for x in range(floors.w)
                  if floors.get(x, y) == 'F'}
    soften(canvas, canvas.keep, fields)
    # Threading the board that softening produces was tried here and is not
    # worth it. It brings the composition almost exactly on to the original --
    # chip 15% against 12%, capacitor 6% against 8% -- and it takes the pack
    # from twenty solvable to nine, because a chip laid across the one dug
    # route between two gates shuts one of them without breaking anything the
    # build-time checks look at. The field pass before the gates is where
    # threading belongs, since nothing is gated yet for it to shut.

    repair(canvas)
    unbury(canvas)
    open_up(canvas)
    stuck = walkable(canvas)
    if stuck:
        raise AssertionError(
            f'{name}: {len(stuck)} cells are walled off by capacitors, first at '
            f'{stuck[0]} -- unbury could not clear a way through' + chr(10)
            + dump(canvas, _flood(canvas, WALKABLE)))
    ok, orphans, seen = connectivity(canvas)
    if not ok or len(orphans) > allow_orphans:
        why = ('the exit is walled off from spawn' if not ok
               else f'{len(orphans)} open cells are sealed off, first at {orphans[0]}')
        raise AssertionError(f'{name}: {why}' + chr(10) + dump(canvas, seen))
    w, h = canvas.w + 2, canvas.h + 2
    lines = [f"  // {'=' * 20} {len(LEVELS) + 1}. {name}",
             '  {',
             f"    name: {name!r},",
             f"    hint: {hint!r},",
             f"    w: {w}, h: {h}, need: {need}, gate: {gate!r},"]
    if gravity:
        lines.append('    gravity: true,')
    if slime_cap is not None:
        lines.append(f'    slimeCap: {slime_cap},')
    for line in textwrap.dedent(art).strip().split(chr(10)):
        lines.append((f'    // {line}').rstrip())
    lines.append('    rows: [')
    for r in canvas.rows():
        lines.append(f"      {r!r},")
    lines.append('    ],')
    if floors is not None:
        lines.append('    floors: [')
        for r in floor_rows(floors):
            lines.append(f"      {r!r},")
        lines.append('    ],')
    lines.append('  },')
    LEVELS.append(chr(10).join(lines))


def write_solutions(path='levels/remix-solutions.mjs'):
    src = SOL_HEADER + (chr(10) * 2).join(SOLUTIONS) + chr(10) + '];' + chr(10)
    io.open(path, 'w', encoding='utf-8').write(src)
    print(f'{len(SOLUTIONS)} solutions written to {path}')


def write(path='levels/remix.js'):
    body = (chr(10) * 2).join(LEVELS)
    src = HEADER + 'const LEVELS = [' + chr(10) + body + chr(10) + '];' + chr(10) * 2 \
        + 'module.exports = { LEVELS };' + chr(10)
    io.open(path, 'w', encoding='utf-8').write(src)
    print(f'{len(LEVELS)} levels written to {path}')
    write_solutions()
