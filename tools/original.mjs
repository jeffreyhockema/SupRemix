// Reads the original Supaplex level set out of levels/LEVELS.DAT.
//
// 111 levels of 1536 bytes: 60x24 tile bytes at offset 0, then a short header
// carrying the title, the infotron quota, the starting gravity and a table of
// special ports. Every tile byte has an exact glyph in our vocabulary, and the
// outer ring of all 111 is hardware -- which is what the loader frames a board
// with anyway, so a level comes across at its true 60x24 with no cell invented
// or dropped.
//
// Both tools/import-original.mjs and tools/compare-original.mjs read the set
// through here, so the pack we ship and the yardstick we measure it against are
// decoded by the same code.

import { readFileSync } from 'node:fs';

export const SRC = 'levels/LEVELS.DAT';
export const LEVEL_BYTES = 1536;
export const W = 60;
export const H = 24;

// The original tile table, in its own byte order. Bytes 28-37 are the ten
// decorative hardware variants: all of them are plain wall to walk into, and
// they exist so a board reads as circuitry rather than masonry. We have five
// such variants, so they cycle -- the pattern is not the original's, but the
// distinction it was drawing (this cell is scenery, and it is not all the same
// scenery) is kept.
export const GLYPH = [
  ' ', 'O', ':', 'M', 'I', '=', '#', 'E', 'o', '>',      //  0-9
  'v', '<', '^', '1', '2', '3', '4', 'S', 'y', 'T',      // 10-19
  'r', '|', '-', '+', 'e', 'B', '[', ']', '%', '&',      // 20-29
  'L', 'J', 'K', '%', '&', 'L', 'J', 'K', '"', '_',      // 30-39
  '#',                                                    // 40: invisible wall
];

// A special port sets gravity rather than toggling it, and it can also freeze
// zonks or enemies. Ours only toggles gravity, so a special port that does not
// touch gravity is imported as the plain port it behaves as, and one that turns
// gravity on becomes a gravity port. The difference that remains shows only on
// a board where the same gravity port is entered twice: the original leaves
// gravity on, ours turns it back off. Nothing in the 111 does that.
const PLAIN_FOR_SPECIAL = { 13: '>', 14: 'v', 15: '<', 16: '^' };

/** `------- WARM UP -------` is a centred title, not a name with dashes. */
function tidyTitle(raw) {
  return raw.replace(/\0/g, ' ').replace(/^[-\s]+|[-\s]+$/g, '').trim() || 'Untitled';
}

function readLevel(buf, n) {
  const at = n * LEVEL_BYTES;
  const tiles = buf.subarray(at, at + W * H);

  const gravity = buf[at + 1444] === 1;
  const name = tidyTitle(buf.toString('latin1', at + 1446, at + 1469));
  const need = buf[at + 1470];
  const portCount = buf[at + 1471];

  // Which of the special ports actually change gravity. The position is a byte
  // offset into the tile field, doubled, which is how the original addressed a
  // word-aligned table.
  const gravityPorts = new Set();
  for (let k = 0; k < portCount && k < 10; k++) {
    const o = at + 1472 + k * 6;
    if (buf[o + 2] === 1) gravityPorts.add(((buf[o] << 8) | buf[o + 1]) >> 1);
  }

  const rows = [];
  for (let y = 1; y < H - 1; y++) {
    let row = '';
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const b = tiles[i];
      const glyph = GLYPH[b];
      if (glyph === undefined) {
        throw new Error(`level ${n + 1}: unknown tile byte ${b} at ${x},${y}`);
      }
      row += (b >= 13 && b <= 16 && !gravityPorts.has(i)) ? PLAIN_FOR_SPECIAL[b] : glyph;
    }
    rows.push(row);
  }

  // Nought infotrons needed means every infotron on the board, which is what
  // the loader does when `need` is left off.
  const def = { n: n + 1, name, w: W, h: H, rows, gate: 'original' };
  if (need) def.need = need;
  if (gravity) def.gravity = true;
  return def;
}

/** Every level in the set, as pack entries. */
export function readOriginal(path = SRC) {
  const buf = readFileSync(path);
  if (buf.length % LEVEL_BYTES) {
    throw new Error(`${path} is ${buf.length} bytes, not a whole number of levels`);
  }
  const out = [];
  for (let n = 0; n < buf.length / LEVEL_BYTES; n++) out.push(readLevel(buf, n));
  return out;
}
