// Changes made to the original level designs.
//
// levels/pack.js is generated from levels/LEVELS.DAT, so it is not the place to
// edit a level -- the next `npm run import` would throw the edit away. This is.
//
// UPGRADES maps a level number to a function that rewrites it. The function is
// handed a copy of the imported level and may change it in place:
//
//   { n, name, hint, w, h, need, gravity, rows, floors }
//
// `rows` is the interior only, 58 wide by 22 tall, because the loader adds the
// chassis border -- but nothing here asks you to think about that. The helpers
// in tools/upgrade-kit.mjs all take GAME coordinates, the ones
// `npm run peek <level>` prints.
//
// ---------------------------------------------------------------------------
// NOTHING IS CHANGED. The pack is the original 111 designs as they shipped.
//
// Ten of them were rebuilt once, each keeping its 1991 layout and gaining one
// structure the original set had no vocabulary for -- a data bus, a jumper cap,
// a pressure plate, thermal boots, a tank of electrolyte. It was reverted, and
// the reason is worth writing down so it is not repeated.
//
// The widgets were placed by algorithm, into whatever the clearest patch of
// filler on the board happened to be. That is the wrong instinct twice over. A
// rectangular box of chassis with a grid of infotrons inside it announces
// itself as foreign on a board that was drawn by hand -- the original has
// almost no right angles of that kind, and nothing on it is laid out on a grid
// within a grid. And a placement chosen for being empty is by definition a
// placement chosen without reference to how the level plays: it lands where the
// designer left space, which is usually space they left on purpose.
//
// If this is tried again, the lesson is that an addition has to be drawn into a
// specific board by someone reading that board -- worked into its existing
// structures, following its lines, at a point in its route where it means
// something. The helpers in tools/upgrade-kit.mjs are still the safe way to
// make such an edit (see `place`, which refuses anything that seals a region
// off or leaves its own door behind a chip). The widgets in it are not.

export const UPGRADES = {};
