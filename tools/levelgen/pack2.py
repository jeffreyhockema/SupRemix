"""Levels 7-13, cut from the dig-field."""

import board as B
import gates as G


def build(Canvas, emit):
    # ================================================================== 7
    W, H = 46, 21
    c = Canvas(W, H, ':')
    c.put(1, 1, 'M')
    c.put(W - 2, H - 2, 'E')
    B.field(c, 77, clear=[(0, 0, 5, 3), (W - 5, H - 4, 5, 4),
                          (1, 5, 44, 4), (1, 12, 44, 7)])
    # A one-way port down through the shield: past it, the deck above is done
    # with. Below it a bank, and under that a bay packed to its own plug with a
    # vent in the shelf over it.
    G.rail(c, 8, 5, W, 'v')
    c.rect(1, 6, 44, 2, ' ')
    G.bank(c, 12, 9, 26, items=9)
    G.ventbox(c, 4, 14, 34)
    B.link(c, [(1, 1), (8, 4), (8, 6), (11, 9), (3, 14), (W - 2, H - 2)])
    emit('ISA Bus',
         'A one-way port, a bank under it and a bay packed to its own plug under that. Strip each deck before you drop off it.',
         30, 'ports+chamber+vent', """
         the port sets the order for you. the bank needs a shove; the bay below
         it is packed right up to the plug, and the only thing left on the board
         that moves is a floppy on the shelf with a vent under it.
         """, c)

    # ================================================================== 8
    W, H = 44, 20
    c = Canvas(W, H, ':')
    f = Canvas(W, H, ' ')
    c.put(1, 1, 'M')
    c.put(W - 2, H - 2, 'E')
    B.field(c, 88, clear=[(0, 0, 5, 3), (W - 5, H - 4, 5, 4),
                          (1, 4, 42, 7), (1, 13, 42, 5)])
    # The socket is sealed from above, so its plug is a drive. The plate that
    # drops the field over the bay below is at the far end of its own run.
    G.socket(c, 8, 6, 28, 4)
    G.platerun(c, f, 2, 14, 24)
    G.fieldbay(c, f, 28, 15, 14, 3)
    B.link(c, [(1, 1), (22, 4), (1, 14), (35, 13), (W - 2, H - 2)], f)
    emit('CPU Socket',
         'A capacitor will not shove downwards. A drive will -- and a second drive has a run of its own to cross.',
         26, 'drive-plug+plates', """
         the socket is sealed from above, so its plug is a drive: drives shove
         in all four directions and stay where they are put. the field over the
         bay below is a separate problem with a separate drive.
         """, c, floors=f)

    # ================================================================== 9
    W, H = 50, 22
    c = Canvas(W, H, ':')
    f = Canvas(W, H, ' ')
    c.put(1, 1, 'M')
    c.put(W - 2, H - 2, 'E')
    B.field(c, 99, clear=[(0, 0, 5, 3), (W - 5, H - 4, 5, 4),
                          (1, 4, 48, 4), (1, 10, 48, 4), (1, 16, 48, 4)])
    # Two plates, one circuit. Two loaded is the same as none, and each drive
    # has its own run with no way from one to the other.
    G.platerun(c, f, 2, 5, 22)
    G.platerun(c, f, 26, 5, 22)
    G.fieldbay(c, f, 6, 11, 38, 2)
    G.bank(c, 4, 18, 40, items=12)
    B.link(c, [(1, 1), (1, 5), (25, 5), (25, 10), (3, 18), (W - 2, H - 2)], f)
    emit('Drive Cage',
         'Two runs, two drives, two plates and one field circuit. One loaded is the same as none.',
         34, 'plates x2+chamber', """
         the field over the bay is a single circuit and it needs both plates
         carrying a drive. the runs do not join, so neither drive can help with
         the other one is plate.
         """, c, floors=f)

    # ================================================================== 10
    W, H = 46, 26
    c = Canvas(W, H, ':')
    c.put(1, 1, 'M')
    c.put(W - 2, H - 2, 'E')
    B.field(c, 101, clear=[(0, 0, 5, 3), (W - 5, H - 4, 5, 4),
                           (1, 5, 44, 4), (0, 12, W, 13)])
    # The filter bay is above the rail because a bay under gravity is somewhere
    # you fall into and stay.
    G.bank(c, 2, 6, 40, items=13)
    G.rail(c, 24, 12, W)
    c.rect(1, 13, 44, 4, ' ')
    for x in range(4, 42, 5):
        c.put(x, 16, 'I')
    # The block has to reach the floor. Stopping a row short leaves a strip of
    # field under it that nothing on the board can ever get to.
    deep = H - 18
    c.hline(0, 17, W, '#')
    c.rect(6, 17, 4, 1, ' ')
    c.rect(34, 17, 5, 1, ' ')
    c.rect(0, 18, W, deep, '#')
    c.rect(6, 18, 4, deep - 1, ' ')
    c.rect(34, 18, 5, deep - 1, ' ')
    c.scatter([(7, H - 3), (9, H - 3)])
    for x in range(34, 39, 2):
        c.put(x, H - 5, 'I')
        c.put(x, H - 3, 'I')
    c.put(8, H - 2, 'E')
    c.put(36, H - 2, 'E')
    # Across the top as well as down the side. The bank is above the rail and
    # everything else below it, so the sweep does all its work in the top field
    # -- and with no tunnel through it, it dug its own way in and a capacitor
    # closed it behind.
    B.link(c, [(W - 4, 2), (1, 1), (1, 6), (24, 11)])
    emit('The PSU',
         'The rail flips gravity and there is no climbing back. Below it two shafts that do not meet.',
         34, 'chamber+gravity+fork', """
         the filter bay is above the rail because a bay under gravity is a trap.
         the rail drops you between the two shafts; under gravity the first gap
         you walk over is the one you go down, so the only choice is which way
         you turn, and the near one is nearly empty.
         """, c)

    # ================================================================== 11
    W, H = 50, 22
    c = Canvas(W, H, ':')
    f = Canvas(W, H, ' ')
    c.put(1, 1, 'M')
    c.put(W - 2, H - 2, 'E')
    B.field(c, 111, clear=[(0, 0, 5, 3), (W - 5, H - 4, 5, 4),
                           (1, 4, 48, 6), (1, 13, 48, 7)])
    # Two gates with nothing to do with each other.
    G.ventbox(c, 3, 5, 40)
    G.buslane(c, f, 4, 16, 42, bx=9)
    B.link(c, [(1, 1), (2, 5), (3, 14), (43, 14), (W - 2, H - 2)], f)
    emit('VGA Card',
         'The bay is packed to its own plug and the bus carries you straight past the alcove. Neither problem helps with the other.',
         30, 'vent+brake', """
         the packed bay only opens if something comes down on it, and the only
         thing on the card that moves is a floppy on the shield with a vent
         under it. the alcove under the bus only opens if you can stop level
         with its mouth, and only a capacitor dropped onto the bus does that.
         """, c, floors=f)

    # ================================================================== 12
    W, H = 46, 24
    c = Canvas(W, H, ':')
    f = Canvas(W, H, ' ')
    c.put(1, 1, 'M')
    c.put(W - 2, H - 2, 'E')
    B.field(c, 121, clear=[(0, 0, 5, 3), (W - 5, H - 4, 5, 4),
                           (1, 4, 44, 7), (1, 13, 44, 7)])
    # The same gate twice, and the second is not where the first one was.
    G.buslane(c, f, 2, 7, 42, bx=7)
    G.buslane(c, f, 2, 17, 42, bx=14)
    B.link(c, [(1, 1), (1, 5), (41, 5), (1, 15), (41, 15), (W - 2, H - 2)], f)
    emit('CMOS Battery',
         'Two buses, two alcoves, and one capacitor over each. Ride either unprepared and you go straight past.',
         30, 'brake x2', """
         each bus carries you to the near wall; the alcove under it opens only
         if you are stopped level with its mouth, and only the capacitor dug
         loose from the board above will do that.
         """, c, floors=f)

    # ================================================================== 13
    W, H = 52, 22
    c = Canvas(W, H, ':')
    f = Canvas(W, H, ' ')
    c.put(1, 1, 'M')
    c.put(W - 2, H - 2, 'E')
    B.field(c, 131, clear=[(0, 0, 5, 3), (W - 5, H - 4, 5, 4),
                           (1, 4, 50, 4), (1, 13, 50, 6)])
    # The plug, then the boots, then the controller, then the bank past it.
    G.drainbox(c, 3, 5, 18, items=0)
    c.put(9, 5, 'w')
    G.heatband(c, f, 10, W, (6, 26, 46))
    G.bank(c, 4, 15, 42, items=14)
    B.link(c, [(1, 1), (2, 5), (6, 9), (6, 12), (3, 15), (W - 2, H - 2)], f)
    emit('IDE Channel',
         'A capacitor in the way of the boots, a controller nothing crosses without them, and a bank on the far side.',
         34, 'drain+boots+heat+chamber', """
         four things in one order. the plug drops through the gap in the card;
         the boots are behind it; the controller is not crossable without them;
         and the bank past the controller is where the rest of the quota is.
         """, c, floors=f)
