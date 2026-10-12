"""Levels 14-20, cut from the dig-field. Four gates, then five, then eight."""

import board as B
import gates as G


def lockbox(c, x, y, w, h, key='G'):
    """A box whose door is a coloured header. Rows y-1..y+h."""
    c.rect(x, y - 1, w, h + 2, '#')
    c.rect(x + 1, y, w - 2, h, ' ')
    c.put(x, y, key)
    return (x - 1, y)


def shafts(c, x0, w0, x1, w1, top, bot, near_items, far_items):
    """Two shafts under a ledge with nothing between them.

    Under gravity the first gap you walk over is the one you go down, so this is
    a decision made once. The near one is always the short walk.
    """
    c.hline(0, top, c.w, '#')
    c.rect(x0, top, w0, 1, ' ')
    c.rect(x1, top, w1, 1, ' ')
    c.rect(0, top + 1, c.w, bot - top, '#')
    c.rect(x0, top + 1, w0, bot - top - 1, ' ')
    c.rect(x1, top + 1, w1, bot - top - 1, ' ')
    for k, xx in enumerate(range(x0, x0 + w0, 2)):
        if k < near_items:
            c.put(xx, bot - 2, 'I')
    for yy in (bot - 2, bot - 4):
        for xx in range(x1, x1 + w1, 2):
            if far_items > 0:
                c.put(xx, yy, 'I')
                far_items -= 1
    c.put(x0 + 1, bot - 1, 'E')
    c.put(x1 + 2, bot - 1, 'E')


def build(Canvas, emit):
    # ================================================================== 14
    W, H = 52, 24
    c = Canvas(W, H, ':')
    f = Canvas(W, H, ' ')
    c.put(1, 1, 'M')
    c.put(W - 2, H - 2, 'E')
    B.field(c, 141, clear=[(0, 0, 5, 3), (W - 5, H - 4, 5, 4),
                           (1, 4, 50, 4), (1, 10, 50, 4), (1, 17, 50, 4)])
    G.platerun(c, f, 2, 5, 26)
    G.fieldbay(c, f, 30, 5, 20, 2)
    G.tankbox(c, 4, 11, 26, seeds=3)
    c.put(32, 11, 'r')
    G.packedbay(c, 6, 18, 42)
    B.link(c, [(1, 1), (1, 5), (40, 3), (3, 11), (5, 18), (W - 2, H - 2)], f)
    emit('Sound Card',
         'A plate, a tank of set electrolyte, and a vault that will not shove. The charge is behind the field.',
         38, 'plates+slime+charge', """
         the field comes down when the drive reaches its plate. behind it is a
         tank that has already set and the only charge on the board, and the
         only thing that charge is for is the vault below, which is packed right
         up to its own plug.
         """, c, floors=f)

    # ================================================================== 15
    W, H = 52, 26
    c = Canvas(W, H, ':')
    c.put(1, 1, 'M')
    c.put(W - 2, 12, 'E')
    B.field(c, 151, clear=[(0, 0, 5, 3), (1, 4, 50, 8), (0, 13, W, 12)])
    # Two head crashes, both of them before the rail.
    G.crushpocket(c, 12, 8)
    G.crushpocket(c, 34, 8)
    G.rail(c, 26, 13, W)
    c.rect(1, 14, 50, 4, ' ')
    for x in range(4, 48, 6):
        c.put(x, 17, 'I')
    shafts(c, 6, 6, 34, 10, 18, 25, 2, 10)
    B.link(c, [(1, 1), (7, 7), (29, 7), (26, 12)])
    emit('Hard Drive',
         'Two head crashes, then a rail you cannot climb back through, then two shafts that do not meet.',
         34, 'crush x2+gravity+fork', """
         each short is walled in on four sides and cannot move, and the
         capacitor over it stands on a single cell of board. dig that out, step
         back one, and the three-by-three comes down as infotrons. both have to
         be done before the rail, because nothing comes back up it.
         """, c)

    # ================================================================== 16
    W, H = 56, 24
    c = Canvas(W, H, ':')
    f = Canvas(W, H, ' ')
    c.put(1, 1, 'M')
    c.put(W - 2, H - 2, 'E')
    B.field(c, 161, clear=[(0, 0, 5, 3), (W - 5, H - 4, 5, 4),
                           (1, 4, 54, 3), (1, 8, 54, 3), (1, 12, 54, 3),
                           (1, 17, 54, 5)])
    # Three runs, three plates, one circuit. Two loaded is the same as none.
    G.platerun(c, f, 2, 5, 22)
    G.platerun(c, f, 28, 5, 24)
    G.platerun(c, f, 2, 9, 30)
    G.fieldbay(c, f, 8, 13, 40, 2)
    G.ventbox(c, 6, 18, 40)
    B.link(c, [(1, 1), (1, 5), (27, 5), (1, 9), (28, 11), (5, 18), (W - 2, H - 2)], f)
    emit('Chipset',
         'Three runs, three drives, three plates and one field circuit. Nothing opens until all three are loaded.',
         38, 'plates x3+vent', """
         the runs do not join, so no drive can help with another one is plate,
         and the field is a single circuit. past it the bay is packed to its own
         plug and the only thing left that moves is a floppy on a shelf.
         """, c, floors=f)

    # ================================================================== 17
    W, H = 54, 28
    c = Canvas(W, H, ':')
    f = Canvas(W, H, ' ')
    c.put(1, 1, 'M')
    c.put(W - 2, 12, 'E')
    B.field(c, 171, clear=[(0, 0, 5, 3), (1, 4, 52, 3), (1, 9, 52, 7),
                           (0, 17, W, 10)])
    G.bank(c, 2, 5, 48, items=16)
    G.buslane(c, f, 2, 12, 50, bx=8)
    G.rail(c, 30, 17, W)
    c.rect(1, 18, 52, 3, ' ')
    for x in range(4, 50, 6):
        c.put(x, 20, 'I')
    shafts(c, 8, 6, 36, 12, 21, 27, 2, 12)
    B.link(c, [(1, 1), (1, 5), (1, 10), (49, 10), (30, 16)], f)
    emit('Backplane',
         'A bank, a bus, a rail with no way back, and then two shafts that do not meet.',
         36, 'chamber+brake+gravity+fork', """
         four gates and the last one is a decision. the rail drops you between
         the shafts; under gravity the first gap you walk over is the one you go
         down, so the only choice is which way you turn, and the near one is the
         short walk and nearly empty.
         """, c, floors=f)

    # ================================================================== 18
    W, H = 58, 26
    c = Canvas(W, H, ':')
    f = Canvas(W, H, ' ')
    c.put(1, 1, 'M')
    c.put(W - 2, H - 2, 'E')
    B.field(c, 181, clear=[(0, 0, 5, 3), (W - 5, H - 4, 5, 4),
                           (1, 4, 56, 3), (1, 8, 56, 4), (1, 14, 56, 3),
                           (1, 19, 56, 3)])
    G.platerun(c, f, 2, 5, 30)
    G.fieldbay(c, f, 36, 5, 20, 2)
    G.bank(c, 2, 9, 50, items=17)
    c.put(4, 10, 'r')
    G.bombbox(c, 4, 15, 48, n=11)
    G.tankbox(c, 6, 20, 44, seeds=4)
    B.link(c, [(1, 1), (1, 5), (46, 3), (1, 9), (3, 15), (5, 20), (W - 2, H - 2)], f)
    emit('Riser Card',
         'A plate, a bank, a row of tantalums and a tank. The only charge on the card is in the bank.',
         44, 'plates+chamber+chain+slime', """
         the field comes down when the drive reaches its plate. the bank under
         it holds the only charge, and the only thing that charge is for is the
         row of tantalums below -- each boxed in by the next, all of them bombs.
         """, c, floors=f)

    # ================================================================== 19
    W, H = 56, 26
    c = Canvas(W, H, ':')
    f = Canvas(W, H, ' ')
    c.put(1, 1, 'M')
    c.put(W - 2, H - 2, 'E')
    B.field(c, 191, clear=[(0, 0, 5, 3), (W - 5, H - 4, 5, 4),
                           (1, 4, 54, 3), (1, 8, 54, 3), (1, 13, 54, 7),
                           (1, 21, 54, 3)])
    G.platerun(c, f, 2, 5, 28)
    G.fieldbay(c, f, 32, 5, 22, 2)
    G.bank(c, 2, 9, 50, items=16)
    c.put(4, 10, 'r')
    G.crushpocket(c, 14, 17)
    G.packedbay(c, 26, 22, 28, plug='y')
    c.put(6, 22, 'T')
    for cx in (12, 18):
        c.put(cx, 22, 'y')
        c.put(cx - 1, 21, 'I')
        c.put(cx + 1, 21, 'I')
    B.link(c, [(1, 1), (1, 5), (43, 3), (1, 9), (9, 16), (25, 22), (5, 22), (W - 2, H - 2)], f)
    emit('Cooling Fans',
         'A plate, a bank, a head crash, and a cutoff that fires every floppy on the board at once.',
         42, 'plates+chamber+crush+terminal', """
         five gates, and the last is the awkward one: the cutoff is the only
         thing that shifts the floppy in the fan bay mouth, and it fires the two
         out on the deck at the same time. both are sitting in clusters, so they
         have to be shoved clear first.
         """, c, floors=f)

    # ================================================================== 20
    W, H = 60, 30
    c = Canvas(W, H, ':')
    f = Canvas(W, H, ' ')
    c.put(1, 1, 'M')
    c.put(W - 2, 14, 'E')
    B.field(c, 201, clear=[(0, 0, 5, 3), (1, 4, 58, 3), (1, 8, 58, 3),
                           (1, 12, 58, 3), (1, 16, 58, 5), (0, 22, W, 8)])
    # Three plates, a cap, a header, a charge, a vault, the boots, a head crash
    # and a rail. In that order.
    G.platerun(c, f, 2, 5, 20)
    G.platerun(c, f, 24, 5, 18)
    G.platerun(c, f, 44, 5, 14)
    G.fieldbay(c, f, 4, 9, 16, 2)
    c.put(10, 9, 'g')
    lockbox(c, 24, 9, 32, 2, 'G')
    c.put(30, 9, 'r')
    for k in range(34, 54, 2):
        c.put(k, 10, 'I')
    G.packedbay(c, 4, 13, 40)
    c.put(12, 13, 'w')
    G.heatband(c, f, 17, W, (8, 30, 52))
    G.crushpocket(c, 20, 21)
    G.rail(c, 40, 22, W)
    c.rect(1, 23, 58, 3, ' ')
    for x in range(4, 56, 6):
        c.put(x, 25, 'I')
    shafts(c, 10, 6, 40, 14, 26, 29, 2, 14)
    B.link(c, [(1, 1), (1, 5), (23, 5), (43, 5), (12, 7), (23, 9), (3, 13), (8, 16), (8, 19), (15, 20), (40, 21)], f)
    emit('Cold Boot Sequence',
         'Three plates, a cap, a header, a charge, a vault, the boots, a head crash and a rail. In that order.',
         56, 'sequence', """
         eight stages and one order they go in. three drives on three runs drop
         the field; the field was over the cap; the cap opens the header; behind
         the header is the charge; the charge is the only way into the vault;
         the boots are in the vault; nothing crosses the controller without
         them; and past the controller there is one head crash and one rail.
         """, c, floors=f)
