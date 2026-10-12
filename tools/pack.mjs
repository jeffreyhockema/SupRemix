// Which level pack the tools are working on.
//
// There are two. `pack` is the original Supaplex set, imported by
// tools/import-original.mjs from your own LEVELS.DAT; it is not in the public
// repository. `remix` is the twenty levels tools/levelgen builds. The game
// serves `pack` when it is there and `remix` otherwise, and so do the tools.
//
// Set SUPREMIX_PACK to switch, e.g. `SUPREMIX_PACK=remix npm run solve`.
// A pack's solutions, if it has any, live beside it as <name>-solutions.mjs;
// the original set has none, because nothing has walked all 111.

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);

export const PACK = process.env.SUPREMIX_PACK || (existsSync('levels/pack.js') ? 'pack' : 'remix');
export const PACK_PATH = `levels/${PACK}.js`;
export const SOLUTIONS_PATH = `levels/${PACK}-solutions.mjs`;

export function loadLevels() {
  return require(`../${PACK_PATH}`).LEVELS;
}

/** The recorded solutions for this pack, or an empty list if it has none. */
export async function loadSolutions() {
  if (!existsSync(SOLUTIONS_PATH)) return [];
  return (await import(`../${SOLUTIONS_PATH}`)).SOLUTIONS;
}
