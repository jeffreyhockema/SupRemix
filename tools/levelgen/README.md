# The level generator

This builds the **remix pack**: `levels/remix.js` and `levels/remix-solutions.mjs`.
Both are generated — **do not edit them by hand**, the next build overwrites
them.

Run it with `sh tools/levelgen/rebuild.sh`. The remix pack is what the game plays
when the original Supaplex set (`levels/pack.js`) is not there, and it is kept green either way, and it is
held to rules the originals are excused from: every level past the tutorials
gated, and a recorded solution that replays from spawn to exit. Check it with
`SUPREMIX_PACK=remix node tools/check.mjs`.

## Why the pack is generated

An original Supaplex board is not a set of rooms joined by corridors. It is a
solid field of board with chips threaded through it and capacitors buried in it,
and the route is whatever you dig. Everything that is not field is a small
island of chassis sitting in it.

The pack used to be hand-written ASCII built the other way round — decks of
chassis with gated bays hanging off them — and it did not read as Supaplex. So
the construction is inverted here: lay the field, then stamp the gates into it.

- `board.py` — `field()` lays the dig-field: chips in runs of two-cell DIP
  packages, infotrons in clumps, capacitors buried. Every chip and capacitor is
  laid one at a time and kept only if the board still joins up. `link()` carves
  a service tunnel between the places a level has to be played in, path-finding
  around chassis rather than drawing a blind L, and never through a gate.
- `gates.py` — fourteen gates, each a self-contained chassis island: bank,
  drain, packed bay, vent, bomb row, plate run, plate bay, field bay, socket,
  bus lane, crush pocket, tank, heat band, rail. Each draws its own walls,
  clears its own approach, holds its footprint so the repair passes never open
  it, and — see below — records the moves that open it.
- `gen.py` — `soften()` turns bulk chassis back into board without opening
  anything; `repair()`, `unbury()` and `open_up()` clear whatever is actually in
  the way until the board is walkable; `emit()` writes one level and its
  solution.
- `pack1.py`, `pack2.py`, `pack3.py` — the twenty levels.

## Gates write their own solutions

Solutions used to be written by hand against coordinates read off a dump, and
they rotted the moment a widget moved a cell — eleven of twenty levels failed on
coordinates that no longer pointed at anything.

A gate knows where its own plug is, so it is the only thing that should be
saying how to shift it. Each gate calls `plan()` with the moves that open it as
it is stamped, `emit()` collects them in the order the gates were stamped, and
`gen.write()` renders `levels/remix-solutions.mjs`. The interior-to-game coordinate
offset is applied once, in one place, instead of by eye per level.

Gates first, sweeping last. Digging a dig-field is destructive: a sweep sent out
early wanders the whole board and drops the field into the tunnels behind it, so
the walk back to the next gate is gone.

## Quotas are measured, not guessed

A hand-written quota is a guess, and several of them asked for more infotrons
than the board could ever produce — one wanted 38 from a board holding 27.

So the build runs twice. `node tools/fit-quota.mjs` plays each generated solution and
records two ceilings: what a naive walker can reach without shoving anything,
and what the solution yields once every gate is open. The quota is fitted into
the gap between them, which makes it both provably reachable and provably out of
reach of walking about. `sh tools/levelgen/rebuild.sh` does the whole loop.

`quota.json` is that measurement, read back by `gen.py`. If a level yields less
than about a third of the infotrons on its board, the build fails rather than
lowering the bar — that is a gate not opening, not a quota that was too high.
`LEVELGEN_LOOSE=1` downgrades it to a warning, which is the only way to get the
board out to look at while the gate is still shut.

## Debugging a level that will not solve

`node tools/dbg.mjs <level> --trace` replays the solution one move at a time and
prints how many drive bays are still reachable after each. The move where that
drops to nought is the one that stranded the router, and that is nearly always
the whole story. `node tools/peek.mjs <level>` prints the board as authored.

## Where it stands

All twenty parse, validate, solve and gate, and `SUPREMIX_PACK=remix node tools/check.mjs` is green. Against the original 111
(`SUPREMIX_PACK=remix node tools/compare-original.mjs`) the pack sits close on open space
(13.3% against 12.7%), infotron density and every shape measure except capacitor
clustering. It is still under on chips and capacitors — 7% and 1.5% against 12%
and 8% — because the passes that guarantee a route stays open clear a lot of
both.

Threading the board that `soften()` produces was tried and brings the
composition almost exactly on to the original (chip 15%, capacitor 6%). It also
takes the pack from twenty solvable to nine: a chip laid across the one dug
route between two gates shuts one of them, and the board is still walkable the
long way round, so none of the build-time checks notice. Getting that pass to
respect the routes without also blocking the tunnels is the open problem, and
`densify()` in `gen.py` is where it would go.
