"""Levels 1-6, cut from the dig-field."""

import board as B
import gates as G


def build(Canvas, emit):
    # ================================================================== 1
    W, H = 24, 12
    c = Canvas(W, H, ':')
    c.put(1, 1, 'M')
    c.put(W - 2, H - 2, 'E')
    B.field(c, 11, zonk=0.09, chip=0.035, info=0.055,
            clear=[(0, 0, 5, 3), (W - 5, H - 4, 5, 4)])
    # Two infotrons with a capacitor standing on them: step in and the can comes
    # down with you, so they have to come out sideways.
    for x in (7, 16):
        c.put(x, 5, 'O')
        c.put(x, 6, 'I')
        c.put(x, 7, ':')
    B.link(c, [(1, 1), (7, 6), (16, 6), (W - 2, H - 2)])
    emit('Power On',
         'Walk into board to dig it. Collect the infotrons, then find the drive bay. SPACE and a direction reaches without stepping.',
         10, 'none', """
         digging, collecting, and the one move that is not a step: reaching
         sideways for something a capacitor is sitting on.
         """, c)

    # ================================================================== 2
    W, H = 30, 15
    c = Canvas(W, H, ':')
    c.put(1, 1, 'M')
    c.put(W - 2, H - 2, 'E')
    B.field(c, 22, zonk=0.10, chip=0.04, info=0.05,
            clear=[(0, 0, 5, 3), (W - 5, H - 4, 5, 4), (2, 5, 26, 6)])
    # A can with room beside it, a can standing on a chip with none, and a bay
    # with its mouth plugged: three ways past, one of them per capacitor.
    c.put(4, 6, 'O')
    c.put(9, 6, 'O')
    c.put(9, 7, '=')
    c.put(8, 7, ':')
    G.bank(c, 14, 9, 12, items=5)
    B.link(c, [(1, 1), (4, 6), (9, 6), (13, 9), (W - 2, H - 2)])
    emit('Shunting Yard',
         'Capacitors shove sideways only, and only into empty space. One of these has nowhere to go -- but things roll off chips.',
         11, 'chamber', """
         three ways past a capacitor: shove it, roll it off the chip it stands
         on by digging out the cell beside it, or shove it into the bay it is
         plugging and let the hollow row take it.
         """, c)

    # ================================================================== 3
    W, H = 38, 17
    c = Canvas(W, H, ':')
    c.put(1, 1, 'M')
    c.put(W - 2, H - 2, 'E')
    B.field(c, 33, zonk=0.09, chip=0.05, info=0.05,
            clear=[(0, 0, 5, 3), (W - 5, H - 4, 5, 4),
                   (0, 8, W, 4)])
    # A one-way port down through the shield, a patrol to time, a bug that only
    # bites while it is lit, and a rail that turns gravity on with a second one
    # further along to take it off again.
    # A port is no use with a chip sitting on top of it, and the field does not
    # know the port is coming: clear the way in and the landing by hand.
    c.hline(0, 7, W, '#')
    c.vline(6, 4, 3, ':')
    c.put(6, 7, 'v')
    c.rect(1, 8, W - 2, 3, ' ')
    c.rect(12, 8, 2, 2, '#')
    c.rect(22, 8, 2, 2, '#')
    c.put(3, 9, 'S')
    c.put(27, 9, 'B')
    for x in (9, 17, 31):
        c.put(x, 9, 'I')
    c.hline(0, 11, W, '#')
    c.put(9, 11, '2')
    c.put(9, 10, ' ')
    c.rect(1, 12, W - 2, 2, ' ')
    for x in (4, 14, 22):
        c.put(x, 13, 'I')
    c.put(28, 13, '1')
    c.hline(0, 14, W, '#')
    c.vline(33, 12, 3, ' ')
    B.link(c, [(1, 1), (6, 4), (6, 8), (9, 10), (9, 12), (33, 13), (W - 2, H - 2)])
    emit('Bus Lines',
         'Ribbon ports run one way. Numbered ones flip gravity -- and with gravity on, Murphy falls too and cannot climb.',
         14, 'none', """
         a one-way port, a patrol to time, a bug that is only dangerous while
         it is lit, and a pair of rails: the first turns gravity on, the second
         is sideways because by then nothing can move upward.
         """, c)

    # ================================================================== 4
    W, H = 48, 22
    c = Canvas(W, H, ':')
    f = Canvas(W, H, ' ')
    c.put(1, 1, 'M')
    c.put(W - 2, H - 2, 'E')
    B.field(c, 44, zonk=0.09, chip=0.05, info=0.045,
            clear=[(0, 0, 5, 3), (W - 5, H - 4, 5, 4),
                   (1, 4, 12, 4), (14, 4, 14, 4), (30, 4, 16, 4),
                   (1, 11, 20, 7), (23, 11, 10, 5), (35, 11, 11, 5)])
    # One bay per idea. Only the plate bay is compulsory.
    c.put(3, 5, 'a')
    c.rect(6, 4, 6, 4, '#')
    c.put(6, 6, 'A')
    c.rect(7, 5, 4, 2, ' ')
    c.scatter([(8, 5), (10, 6), (8, 6)])

    c.rect(15, 4, 12, 4, '#')
    c.rect(16, 5, 10, 2, ' ')
    f.rect(17, 6, 8, 1, '~')
    c.scatter([(17, 5), (18, 5), (24, 5)])
    c.put(15, 6, ' ')

    c.rect(31, 4, 14, 4, '#')
    c.rect(32, 5, 12, 2, ' ')
    c.put(31, 5, ' ')
    c.put(33, 5, 'w')
    f.rect(35, 6, 8, 1, 'X')
    c.scatter([(36, 5), (38, 5), (42, 5)])

    G.platebay(c, f, 2, 12, 18, 5)
    c.rect(24, 11, 9, 5, '#')
    c.rect(25, 12, 7, 3, ' ')
    c.put(24, 13, ' ')
    f.rect(26, 13, 5, 1, ';')
    c.put(26, 12, 'r')
    c.scatter([(29, 12), (30, 14)])
    G.tankbox(c, 36, 13, 10, seeds=3)
    c.put(40, 11, 'T')
    c.put(38, 11, 'y')
    B.link(c, [(1, 1), (3, 5), (15, 6), (31, 5), (1, 12), (24, 13), (36, 13), (W - 2, H - 2)], f)
    emit('The Toolkit',
         'One bay per idea: cards, the bus, heat, plates, a failing trace, a charge, the cutoff, and a tank of electrolyte.',
         30, 'plates', """
         everything the pack uses, one bay at a time. only the plate bay is
         compulsory -- the field over its mouth stays live until the drive is
         parked at the far end of the run -- and most of the quota is behind it.
         """, c, floors=f)

    # ================================================================== 5
    W, H = 42, 19
    c = Canvas(W, H, ':')
    c.put(1, 1, 'M')
    c.put(W - 2, H - 2, 'E')
    B.field(c, 55, clear=[(0, 0, 5, 3), (W - 5, H - 4, 5, 4),
                          (1, 5, 40, 3), (1, 12, 40, 3)])
    # Two banks, and the near end of the second is only reachable out through
    # the far end of the first.
    G.bank(c, 2, 6, 16, items=6)
    c.put(19, 7, ' ')                          # out of A into the crossover
    c.rect(20, 5, 2, 4, ' ')
    G.bank(c, 22, 6, 17, items=6)
    G.bank(c, 4, 13, 34, items=10)
    B.link(c, [(1, 1), (1, 6), (21, 6), (3, 13), (W - 2, H - 2)])
    emit('SIMM Bank',
         'Two banks in a row. The near end of the second one is only reachable through the first.',
         26, 'chamber x3', """
         all three mouths are plugged and all three plugs drop into the hollow
         under their own slot. the catch is the order: the crossover to the
         second bank runs out through the far end of the first.
         """, c)

    # ================================================================== 6
    W, H = 42, 20
    c = Canvas(W, H, ':')
    c.put(1, 1, 'M')
    c.put(W - 2, H - 2, 'E')
    B.field(c, 66, clear=[(0, 0, 5, 3), (W - 5, H - 4, 5, 4),
                          (1, 5, 40, 3), (1, 13, 40, 3)])
    # The charge is inside a bank; the vault below is packed right up to its own
    # plug, so nothing shoves it and the charge is the only answer.
    G.bank(c, 2, 6, 20, items=7)
    c.put(4, 7, 'r')
    G.packedbay(c, 3, 14, 36)
    B.link(c, [(1, 1), (1, 6), (2, 14), (W - 2, H - 2)])
    emit('Cache Array',
         'The vault is packed to its own mouth, so the plug has nowhere to go. The charge is behind the bank above it.',
         20, 'chamber+charge', """
         two gates and only one order they work in: the charge is inside the
         bank, the bank needs a shove, and the vault will not shove at all
         because it is full right up to the plug.
         """, c)
