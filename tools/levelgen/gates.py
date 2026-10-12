"""Gates as islands.

In a dig-field the only thing that seals anything is chassis, so every gate is a
chassis box sitting in the field with one way in that cannot be walked through.
Each of these draws its own walls, so it clears whatever field it lands on.

They all return the cell you approach from, in the field.

Every one of them clears its own approach back to plain board. The field is laid
first and does not know a gate is coming, so without this a shove starts with a
capacitor overhead and a chip where you meant to stand.
"""


FIELD = set(':OI=[]"_')


# The moves that open each gate, in the order the gates were stamped.
#
# Solutions used to be written by hand against coordinates read off a dump, and
# they rotted the moment a widget moved a cell -- eleven of twenty levels failed
# on coordinates that no longer pointed at anything. A gate knows where its own
# plug is, so it is the only thing that should be saying how to shift it.
PLAN = []


def plan(*ops):
    # A sweep of whatever is loose before each gate is worked, because a gate
    # is often what a card or a pair of boots was behind. Gathering once at the
    # start reaches only what is already in the open, and the boots for a
    # controller are usually inside the bay before it.
    PLAN.append(('gather',))
    PLAN.extend(ops)


def take_plan():
    out = list(PLAN)
    del PLAN[:]
    return out


def _wayout(c, x, y, dx=1):
    """A one-way service port out of the far end of a bay.

    Every gate here is a dead end with one mouth, and on a dig-field the walk
    back out of one is a corridor the field has had its way with: a capacitor
    drops into the mouth behind you and that is the level over. A port pointing
    outward fixes it without opening anything -- it cannot be entered from the
    field, so the bay is still sealed, and it guarantees the bay can be left.

    The landing has to be empty, not board, because that is what the engine
    asks of a port; and the column over it is cleared so nothing can fall in.
    """
    glyph = '>' if dx > 0 else '<'
    land = x + dx * 2
    if not (0 <= land < c.w) or not (0 <= y < c.h):
        return
    if c.get(land, y) in SOLID:
        return
    c.put(x + dx, y, glyph)
    c.put(land, y, ' ')
    # Held, all of it. The landing has to stay empty -- that is what the engine
    # asks of a port -- and a service tunnel run past the outside of the bay
    # will otherwise fill it in on its way by, which leaves a port that cannot
    # be stepped through and a bay with no way out after all.
    c.hold(x + dx, y)
    c.hold(land, y)
    for yy in range(y - 1, -1, -1):
        if c.get(land, yy) in SOLID:
            break
        c.put(land, yy, ':')
        c.hold(land, yy)
        # And the capacitors either side of it. The column is board, so it is
        # something to dig rather than a shaft to climb -- but a capacitor
        # standing beside it rolls in the moment the board under it goes, and
        # the way back down closes behind whoever dug their way up.
        for dx in (-1, 1):
            nx = land + dx
            if 0 <= nx < c.w and c.get(nx, yy) == 'O' and (nx, yy) not in c.keep:
                c.put(nx, yy, ':')


SOLID = set('#%&LJK')


def _approach(c, x, y, w=3, h=3):
    """Plain board in front of a gate, with nothing left standing over it.

    A capacitor buried above the way in is the nastiest thing the field does:
    you stand under it to shove the plug, it rests on you while you are there,
    and the moment you step into the bay it drops into the mouth behind you and
    seals you in. So the whole column over every approach is cleared, up to
    whatever chassis is above it.
    """
    for xx in range(x - w + 1, x + 1):
        if not 0 <= xx < c.w:
            continue
        for yy in range(y, -1, -1):
            if c.get(xx, yy) in SOLID or c.get(xx, yy) in 'ME':
                break
            c.put(xx, yy, ':')
    for yy in range(y - h + 2, y + 2):
        for xx in range(x - w + 1, x + 1):
            # Field content only. Clearing chassis here would breach whatever
            # gate happens to be standing next door.
            if not (0 <= xx < c.w and 0 <= yy < c.h):
                continue
            if c.get(xx, yy) in FIELD:
                c.put(xx, yy, ':')


def bank(c, x, y, n, items=None, gap=2):
    """A slot with its mouth plugged, and a hollow row under it.

    Rows y-1..y+2, columns x..x+n+1. The plug at (x, y) stands on chassis;
    shoved right it steps into the slot and drops into the hollow, and the mouth
    is open for good. Approach from (x-1, y).
    """
    c.rect(x, y - 1, n + 2, 1, '#')
    c.rect(x, y, n + 2, 1, ' ')
    c.rect(x, y + 1, n + 2, 1, ' ')
    c.rect(x, y + 2, n + 2, 1, '#')
    c.put(x, y + 1, '#')
    c.put(x + n + 1, y, '#')
    c.put(x + n + 1, y + 1, '#')
    _approach(c, x - 1, y)
    c.put(x, y, 'O')
    _wayout(c, x + n, y + 1)
    if items is None:
        items = (n - 1) // gap
    for k in range(items):
        cx = x + 2 + k * gap
        if cx >= x + n + 1:
            break
        c.put(cx, y + 1, 'I')
    c.hold_rect(x, y - 1, n + 2, 4)
    plan(('go', x - 1, y), ('press', 'R', 2), ('wait', 4))
    return (x - 1, y)


def drainbox(c, x, y, w, items=3):
    """A capacitor standing in a corridor with a gap in the floor past it.

    One shove and it is gone. Rows y-1..y+2, columns x..x+w-1.
    """
    c.rect(x, y - 1, w, 4, '#')
    c.rect(x + 1, y, w - 2, 1, ' ')
    c.put(x, y, ' ')                          # the way in
    c.put(x + 1, y, 'O')
    c.put(x + 2, y + 1, ' ')                  # the drain, under the cell beyond
    _approach(c, x - 1, y)
    _wayout(c, x + w - 2, y)
    for k in range(items):
        cx = x + 4 + k * 2
        if cx < x + w - 1:
            c.put(cx, y, 'I')
    c.hold_rect(x, y - 1, w, 4)
    # On the doorstep, not outside it. Unlike a bank, this box has an empty
    # cell between the approach and the plug, so two presses from out there
    # only walk you as far as the plug and never lean on it.
    plan(('go', x, y), ('press', 'R', 2), ('wait', 4))
    return (x - 1, y)


def packedbay(c, x, y, w, plug='O'):
    """A bay filled right up to its own plug, so nothing will shove it.

    One row, x..x+w-1, walled above and below. The plug sits in the mouth with
    an infotron hard against it; only a blast shifts that.
    """
    c.rect(x, y - 1, w, 3, '#')
    c.rect(x + 1, y, w - 2, 1, ' ')
    c.put(x, y, ' ')
    c.put(x + 1, y, plug)
    _approach(c, x - 1, y)
    _wayout(c, x + w - 2, y)
    c.put(x + 2, y, 'I')
    for k in range(3, w - 1, 2):
        c.put(x + k, y, 'I')
    c.hold_rect(x, y - 1, w, 3)
    # A vault packed to its own plug will not shove, and the only thing that
    # shifts it is a charge at the mouth. Where a level has no charge to give
    # this does nothing, and something dropped from above opens it instead.
    # The retreat stops at the far edge of the approach, which is the last cell
    # cleared for it -- and never off the board, which a bay near the left wall
    # would otherwise ask for.
    plan(('go', x - 1, y), ('plant', 'R'), ('go', max(x - 3, 1), y), ('wait', 40))
    return (x - 1, y)


def ventbox(c, x, y, w):
    """A shelf with a floppy on it, a vent through the shelf, and a packed bay
    underneath. Rows y-1..y+4.

    Orange floppies only shove sideways and they go off the moment they land, so
    the shelf is a run and the vent is the only hole in it.
    """
    c.rect(x, y - 1, w, 6, '#')
    c.rect(x + 1, y, w - 2, 1, ' ')            # the shelf run
    c.put(x, y, ' ')                           # the way on to it
    c.put(x + 1, y, 'o')
    _approach(c, x - 1, y)
    _wayout(c, x + w - 2, y + 2)
    vent = x + w - 4
    c.put(vent, y + 1, ' ')                    # the vent
    c.rect(x + 1, y + 2, w - 2, 1, ' ')        # the bay
    c.put(vent + 1, y + 2, 'O')
    c.put(vent + 2, y + 2, 'I')
    for k in range(1, w - 2, 2):
        if x + k < vent:
            c.put(x + k, y + 2, 'I')
    c.hold_rect(x, y - 1, w, 6)
    plan(('go', x - 1, y), ('press', 'R', 2 * w), ('wait', 14))
    return (x - 1, y)


def bombbox(c, x, y, w, n=10):
    """A row of tantalums across a corridor.

    Each is boxed in by the next so not one of them will shove, but they are
    bombs and a bomb sets off its neighbours: one charge at the near end takes
    the row and everything behind it.
    """
    c.rect(x, y - 1, w, 3, '#')
    c.rect(x + 1, y, w - 2, 1, ' ')
    c.put(x, y, ' ')
    _approach(c, x - 1, y)
    _wayout(c, x + w - 2, y)
    for k in range(n):
        if x + 3 + k < x + w - 1:
            c.put(x + 3 + k, y, 'o')
    for k in range(n + 4, w - 1, 2):
        c.put(x + k, y, 'I')
    c.hold_rect(x, y - 1, w, 3)
    plan(('go', x + 1, y), ('plant', 'R'), ('go', x - 3, y),
         ('wait', 60), ('wait', 120))
    return (x - 1, y)


def platebay(c, fl, x, y, w, h):
    """A run with a drive on it, a plate at the far end, and a bay under the run
    that the field over its mouth is holding shut.

    Rows y-1..y+h, columns x..x+w-1.
    """
    c.rect(x, y - 1, w, h + 2, '#')
    c.rect(x + 1, y, w - 2, 1, ' ')            # the run
    c.put(x, y, ' ')
    c.put(x + 1, y, 'H')
    _approach(c, x - 1, y)
    fl.put(x + w - 2, y, '@')
    mouth = x + w // 2
    c.put(mouth, y + 1, ' ')
    fl.put(mouth, y + 1, 'F')
    c.hold(mouth, y + 1)
    c.rect(x + 1, y + 2, w - 2, h - 2, ' ')
    for yy in range(y + 2, y + h):
        for k in range(1, w - 2, 2):
            c.put(x + k, yy, 'I')
    c.hold_rect(x, y - 1, w, h + 2)
    plan(('go', x, y), ('press', 'R', 2 * (w - 3)), ('wait', 4))
    return (x - 1, y)


def buslane(c, fl, x, y, w, bx=None):
    """A bus with an alcove under it and one capacitor to stop you level with it.

    Rows y-2..y+3, columns x..x+w-1. The capacitor stands on one cell of board
    over a shaft to the lane; dig it out and it drops in. Enter at the far end,
    and the slide runs back to the near wall past everything unless it stops.
    """
    bx = bx or x + 3
    # Seven rows, not six: the alcove needs a floor of its own or the field
    # underneath it is the floor, and then it was never sealed at all.
    c.rect(x, y - 2, w, 7, '#')
    # The deck the capacitor stands on has to be walkable, or there is no way
    # to the support at all and the brake can never be dropped.
    c.rect(x + 1, y - 2, w - 2, 1, ':')
    c.put(x, y - 2, ' ')                       # the way on to the deck
    c.put(bx, y - 2, 'O')
    c.put(bx, y - 1, ':')                      # the support
    c.put(bx - 1, y - 1, ':')                  # somewhere to stand while digging
    c.put(bx, y, ' ')                          # the shaft
    ex = x + w - 3
    c.put(ex, y - 2, ' ')
    c.put(ex, y - 1, ' ')
    c.put(ex, y, ' ')
    c.rect(x + 1, y + 1, w - 2, 1, ' ')        # the lane
    fl.rect(x + 1, y + 1, w - 3, 1, '~')
    # One bare cell under the shaft, or the brake is not a brake: a capacitor
    # dropped onto bus goes wherever the bus goes, and it went to the near wall
    # with the rider right behind it. On bare floor it stays where it lands, and
    # the rider stops against it -- level with the alcove mouth, which is the
    # cell after it. Without the capacitor the slide runs on to this cell
    # instead, one past the mouth, so the alcove is still shut.
    fl.put(bx, y + 1, ' ')
    _approach(c, bx - 1, y - 1)
    _approach(c, ex + 1, y - 2)
    c.put(bx + 1, y + 2, ' ')                  # the alcove mouth
    # Out to the wall, like every other bay. Inset by two, the alcove had a
    # spare cell of chassis on its right, and a service port needs its landing
    # outside the box -- with two walls to clear there was nowhere to put one,
    # so the alcove had no way out and the ride into it was one-way.
    c.rect(x + 1, y + 3, w - 2, 1, ' ')
    _wayout(c, x + w - 2, y + 3)
    for k in range(2, w - 3, 2):
        c.put(x + k, y + 3, 'I')
    c.hold_rect(x, y - 2, w, 7)
    # Drop the brake first, then ride. Pressing left before the lane is
    # underfoot is a press into a wall: the slide never starts and the alcove
    # goes by unopened.
    plan(('go', bx - 1, y - 1), ('grab', 'R'), ('wait', 8),
         ('go', ex, y - 2), ('press', 'D', 4), ('wait', 2),
         ('press', 'L', 1), ('wait', 60),
         # Down into the alcove before collecting, or `collect` goes hunting
         # the nearest infotron on the whole board and the ride is wasted --
         # the mouth only opens from a stopped bus, so there is no coming back.
         ('press', 'D', 2), ('collect', 8, 14))
    return (bx - 2, y - 1), ex


def crushpocket(c, x, y):
    """A short walled in by board with a capacitor over it on one cell of board.

    Dig the support from beside it, step out of the three-by-three, and the lot
    comes down as infotrons. Nine of them, which is most of a quota.
    """
    c.rect(x - 4, y - 3, 9, 6, '#')
    c.rect(x - 3, y - 2, 7, 4, ':')
    c.put(x, y - 2, 'O')
    c.put(x, y - 1, ':')
    c.put(x, y, 'e')
    _approach(c, x - 5, y - 1)
    c.put(x - 4, y - 1, ' ')                   # the way in
    _wayout(c, x + 3, y - 1)
    c.hold_rect(x - 4, y - 3, 9, 6)
    # Two cells back, not one. The short is walled in until the board beside
    # it is dug, and the dig is the first thing that happens here -- after that
    # it is loose, and one cell is inside its reach.
    # All the way back out, not two cells. Digging the support opens the only
    # ceiling the short has, and the corridor dug on the way in is its runway:
    # it gets one step to bolt before the capacitor fills the gap, and if it
    # takes that step it comes straight down the corridor after you.
    plan(('go', x - 1, y - 1), ('grab', 'R'), ('press', 'L', 4),
         # Six cells is the blast and nothing else. Fourteen was enough to
         # reach an infotron on the far side of a gravity rail, and the
         # walk to it was a one-way trip down a shaft.
         ('wait', 6), ('collect', 9, 6))
    return (x - 5, y - 1)


def tankbox(c, x, y, w, seeds=3):
    """Sealed electrolyte behind a plug of board.

    Boxed in with nowhere to creep it sets into infotrons on its own; the board
    plug keeps it in while it does, and a bot can dig board.
    """
    c.rect(x, y - 1, w, 3, '#')
    c.rect(x + 2, y, w - 3, 1, ' ')
    for k in range(seeds):
        c.put(x + 2 + k, y, '*')
    _approach(c, x - 1, y)
    _wayout(c, x + w - 2, y)
    c.put(x + 1, y, ':')                       # board: electrolyte will not cross it
    c.put(x, y, ' ')
    c.hold_rect(x, y - 1, w, 3)
    plan(('go', x - 1, y), ('grab', 'R'), ('wait', 180))
    return (x - 1, y)


def platerun(c, fl, x, y, w):
    """A run with a drive at one end and a plate at the other.

    On its own it opens nothing. Every plate on a board is one circuit, so a
    level with three of these needs all three loaded before anything moves.
    """
    c.rect(x, y - 1, w, 3, '#')
    c.rect(x + 1, y, w - 2, 1, ' ')
    c.put(x, y, ' ')
    c.put(x + 1, y, 'H')
    _approach(c, x - 1, y)
    fl.put(x + w - 2, y, '@')
    # A beat after the drive parks. The field over whatever this plate holds
    # comes down on the step after the last plate is loaded, and a gather run
    # in the same instant still sees it up.
    plan(('go', x, y), ('press', 'R', 2 * (w - 3)), ('wait', 4))
    c.hold_rect(x, y - 1, w, 3)
    return (x - 1, y)


def fieldbay(c, fl, x, y, w, h):
    """A bay whose mouth is held by a force field. Rows y-1..y+h."""
    c.rect(x, y - 1, w, h + 2, '#')
    c.rect(x + 1, y, w - 2, h, ' ')
    mouth = x + w // 2
    _approach(c, mouth + 1, y - 2)
    c.put(mouth, y - 1, ' ')     # after the clearing: a field under board is invisible
    fl.put(mouth, y - 1, 'F')
    _wayout(c, x + w - 2, y + h - 1)
    for yy in range(y, y + h):
        for k in range(1, w - 2, 2):
            c.put(x + k, yy, 'I')
    c.hold_rect(x, y - 1, w, h + 2)
    return (mouth, y - 2)


def socket(c, x, y, w, h):
    """A socket sealed from above, its mouth plugged by a drive.

    A capacitor will not shove downwards. A drive will, and it stays put.
    """
    c.rect(x, y - 1, w, h + 2, 'K')
    c.rect(x + 1, y, w - 2, h, ' ')
    mouth = x + w // 2
    c.put(mouth, y - 1, 'H')
    c.put(mouth, y - 2, ':')
    _wayout(c, x + w - 2, y + h - 1)
    _approach(c, mouth + 1, y - 2)
    for yy in range(y + 1, y + h):
        for k in range(1, w - 2, 2):
            c.put(x + k, yy, 'I')
    c.hold_rect(x, y - 1, w, h + 2)
    plan(('go', mouth, y - 2), ('press', 'D', 4), ('wait', 3))
    return (mouth, y - 2)


def heatband(c, fl, y, w, gaps):
    """A controller running hot across the board. Rows y-1..y+1."""
    c.rect(0, y - 1, w, 1, 'J')
    c.rect(0, y, w, 1, ' ')
    fl.rect(0, y, w - 1, 1, 'X')
    c.rect(0, y + 1, w, 1, 'J')
    for x in gaps:
        c.put(x, y - 1, ' ')
        c.put(x, y + 1, ' ')


def rail(c, x, y, w, glyph='2'):
    """A shield with one gravity rail through it, and its approach cleared."""
    c.rect(0, y, w, 1, '#')
    c.put(x, y, glyph)
    c.put(x, y - 1, ':')
    c.put(x, y - 2, ':')
