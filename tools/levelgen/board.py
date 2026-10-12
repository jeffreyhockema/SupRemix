"""The dig-field: the substrate every level in the pack is now cut from.

An original Supaplex board is not a set of rooms joined by corridors. It is a
solid field of board with chips threaded through it and capacitors buried in it,
and the route is whatever you dig. Everything that is not field is a small
island of chassis sitting in it.

So a level here is built the other way round from before: lay the field, then
stamp the gates into it. Each gate widget draws its own walls, so it clears the
field where it lands and seals itself; the field flows round it.
"""

SOLID = set('#%&=[]"_LJK')
# A capacitor is not scenery, but you cannot walk through one either. Burying
# them without checking this is how a field ends up with the spawn in a pocket
# of its own: they are not a wall to look at, and they are a wall to a bot.
WALK = SOLID | set('O')


def _hash(x, y, seed):
    h = (x * 0x1F1F1F1F ^ y * 0x2545F491 ^ seed * 0x9E3779B1) & 0xFFFFFFFF
    h ^= h >> 15
    h = (h * 0x2C1B3C6D) & 0xFFFFFFFF
    h ^= h >> 12
    return (h % 10000) / 10000.0


def _joined(c, block=None):
    """Cells reachable from Murphy, blocked by `block` (scenery by default)."""
    block = SOLID if block is None else block
    start = next(((x, y) for y in range(c.h) for x in range(c.w)
                  if c.get(x, y) == 'M'), None)
    if start is None:
        return 0
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
    return len(seen)


def field(c, seed, zonk=0.24, chip=0.26, info=0.048, clear=()):
    """Fill the board with a Supaplex dig-field.

    Called before any gate is stamped, so it needs Murphy already placed -- the
    chip runs are laid one package at a time and kept only if the board still
    joins up, and that check starts from him.

    `clear` is a list of (x, y, w, h) the field leaves as plain board: spawn
    pockets, and anywhere a structure is about to land that needs its approach
    free.
    """
    held = set()
    for x, y, w, h in clear:
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                held.add((xx, yy))
    for y in range(c.h):
        for x in range(c.w):
            if c.get(x, y) in 'ME':
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        held.add((x + dx, y + dy))

    free = lambda x, y: c.get(x, y) == ':' and (x, y) not in held

    # Chips, in runs of two-cell packages. Nine tenths of the solid in an
    # original board belongs to a straight line of four or more, and almost
    # none of it is a lone block.
    reach = _joined(c)
    for y in range(c.h):
        for x in range(c.w):
            if not free(x, y) or _hash(x, y, seed) >= chip:
                continue
            horiz = _hash(x, y, seed + 77) < 0.55
            length = 2 * (1 + int(_hash(x, y, seed + 31) * 3))
            laid = []
            for k in range(length):
                cx, cy = (x + k, y) if horiz else (x, y + k)
                if not (0 <= cx < c.w and 0 <= cy < c.h) or not free(cx, cy):
                    break
                glyph = ('[' if k % 2 == 0 else ']') if horiz else ('"' if k % 2 == 0 else '_')
                c.put(cx, cy, glyph)
                after = _joined(c)
                # A few cells may be shut away, but not a region. Insisting on
                # exactly one lost cell per chip forbids every pocket, and an
                # original board is full of them -- it is most of what makes
                # one look like masonry rather than a maze. `open_up` reopens
                # anything that actually matters later.
                if after < reach - 4:
                    c.put(cx, cy, ':')
                    break
                reach = after
                laid.append((cx, cy))
            if len(laid) % 2:                 # never leave half a package
                x0, y0 = laid.pop()
                c.put(x0, y0, ':')
                reach += 1

    # Infotrons, in twos: the original clumps them rather than spacing them out.
    for y in range(c.h):
        for x in range(c.w):
            if not free(x, y) or _hash(x, y, seed + 401) >= info:
                continue
            c.put(x, y, 'I')
            if x + 1 < c.w and free(x + 1, y) and _hash(x, y, seed + 402) < 0.55:
                c.put(x + 1, y, 'I')

    # Capacitors, buried in the field. Nothing standing over an infotron or the
    # way out, and nothing without something under it to stand on.
    walk = _joined(c, WALK)
    for y in range(c.h - 1):
        for x in range(c.w):
            if not free(x, y) or _hash(x, y, seed + 911) >= zonk:
                continue
            if c.get(x, y + 1) == ' ':
                continue
            if any(c.get(x, y + dy) in 'MEI' for dy in (1, 2) if y + dy < c.h):
                continue
            c.put(x, y, 'O')
            after = _joined(c, WALK)
            if after == walk - 1:
                walk = after
            else:
                c.put(x, y, ':')      # that one closed the last way through


def pocket(c, x, y, w, h, ch=':'):
    """Clear a rectangle back to plain board -- a landing, an approach, a run."""
    c.rect(x, y, w, h, ch)


def frame(c, x, y, w, h, ch='#'):
    """A chassis island: the only thing that seals anything in a dig-field."""
    c.box(x, y, w, h, ch)


CHASSIS = set('#%&LJK')


def link(c, points, fl=None):
    """Carve a service tunnel between the places a level has to be played in.

    The original boards are not uniform field: they have tunnels already dug
    through them, and everything hangs off those. Without one, the route from
    one gate to the next runs through however much buried hazard the field
    happened to lay, and a capacitor dropping into a one-wide gap behind you is
    the end of the level rather than a complication.

    Only field is cleared -- chassis is never cut, so no gate is opened -- and
    the column over every cell of the tunnel is cleared too, so nothing can fall
    into it behind you.
    """
    def clear(x, y):
        if not (0 <= x < c.w and 0 <= y < c.h):
            return
        if (x, y) in c.keep:
            return   # a gate claimed this cell; a tunnel through it is a breach
        if c.get(x, y) in CHASSIS or c.get(x, y) in 'ME ':
            return   # ' ' is a landing a gate carved on purpose
        if fl is not None and fl.get(x, y) != ' ':
            return                      # a surface: leave the cell as the gate left it
        c.put(x, y, ':')
        for yy in range(y - 1, -1, -1):
            if c.get(x, yy) in CHASSIS or c.get(x, yy) in 'ME ':
                break                       # ' ' as below: carved on purpose
            if fl is not None and fl.get(x, yy) != ' ':
                break
            if (x, yy) in c.keep:
                break
            c.put(x, yy, ':')
        # And the capacitors alongside. Clearing the column overhead stops one
        # dropping straight in, but a capacitor rolls off anything round under
        # it, so one standing a cell to either side arrives in the tunnel the
        # moment the board beneath it is dug -- which is the last thing that
        # happens on the way to the drive bay, and then the bay is behind it.
        for dx in (-1, 0, 1):
            nx = x + dx
            if not 0 <= nx < c.w:
                continue
            for ny in range(min(y + 1, c.h - 1), -1, -1):
                if c.get(nx, ny) in CHASSIS or c.get(nx, ny) in 'ME':
                    break
                if (nx, ny) in c.keep:
                    break
                if c.get(nx, ny) == 'O':
                    c.put(nx, ny, ':')

    def route(a, b):
        """The shortest way from a to b that never asks to cut chassis.

        This used to draw a blind L: across, then down. A leg that happened to
        run along the top of a bank carved nothing at all -- clear() skips
        chassis, quite rightly -- and the two ends were left unjoined with
        nothing saying so. On level 5 that put the drive bay behind a wall of
        chips the moment anything was dug.
        """
        if a == b:
            return [a]
        prev = {a: None}
        queue = [a]
        head = 0
        while head < len(queue):
            x, y = queue[head]
            head += 1
            if (x, y) == b:
                break
            for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
                n = (x + dx, y + dy)
                if not (0 <= n[0] < c.w and 0 <= n[1] < c.h) or n in prev:
                    continue
                # Never route through a gate. Since every bay now has a
                # one-way service port out of its far end, a bay is a shortcut
                # on paper -- and a tunnel taken through one clears the bay it
                # passes through, plug and all. That is how a crusher lost the
                # capacitor it was built around.
                if n != b and (n in c.keep or c.get(n[0], n[1]) in CHASSIS):
                    continue
                prev[n] = (x, y)
                queue.append(n)
        if b not in prev:
            return None
        path, at = [], b
        while at is not None:
            path.append(at)
            at = prev[at]
        return path

    for a, b in zip(points, points[1:]):
        path = route(a, b)
        if path is None:
            # Nowhere to go but through: fall back to the old L and let the
            # build-time walkability check say so if it did not join up.
            path = ([(x, a[1]) for x in range(min(a[0], b[0]), max(a[0], b[0]) + 1)]
                    + [(b[0], y) for y in range(min(a[1], b[1]), max(a[1], b[1]) + 1)])
        for x, y in path:
            clear(x, y)
