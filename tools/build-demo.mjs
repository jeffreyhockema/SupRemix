// Builds the online demo: a static copy of the game for GitHub Pages, or any
// host that only serves files.
//
//   npm run build:demo                         # -> dist/
//   npm run build:demo -- --out <folder>       # e.g. a folder in your Pages site
//   npm run build:demo -- --remix              # the remix levels, not the originals
//
// A static host has no server, so the build bakes the level pack into
// packs/levels.pak -- scrambled like the graphics and sound, so the original
// levels are not lying in the demo as readable JSON -- and marks index.html as
// static (a <meta name="supremix-host">): the client then reads the levels from
// that pack and keeps the BEST RUNS
// board in the browser instead of posting to /api/scores. Everything else is
// public/ as it is, packs included -- the URLs inside are relative, so the demo
// works from a sub-folder (exception386.github.io/SupRemix/) as well as a root.
//
// The demo is the one place the original game's material goes out: the
// original levels (levels/pack.js, imported from your LEVELS.DAT) and the
// scrambled packs (public/packs/). Neither is in the public repository, so
// this has to run in a working copy that has them; see the README.
//
// The output folder is emptied first, but only if it is empty already or holds
// a previous build (it has a .supremix-demo marker): pointing --out at the wrong
// folder will not delete anyone's work.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, cpSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { encodePack } from '../public/js/asset-pack.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const MARKER = '.supremix-demo';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const OUT = resolve(outAt >= 0 && args[outAt + 1] ? args[outAt + 1] : join(ROOT, 'dist'));
const REMIX = args.includes('--remix');

function fail(msg) {
  console.error(`build-demo: ${msg}`);
  process.exit(1);
}

// --- what goes in ---

const packFile = join(ROOT, 'levels', REMIX ? 'remix.js' : 'pack.js');
if (!existsSync(packFile)) {
  fail('levels/pack.js is missing -- the original levels are not in the public repository.\n'
    + '  Put your LEVELS.DAT in levels/ and run `npm run import`, or build with --remix.');
}
const { LEVELS } = require(packFile);
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

const PACKS = ['gfx.pak', 'sfx.pak', 'music.pak'];
const missing = PACKS.filter((p) => !existsSync(join(ROOT, 'public', 'packs', p)));
if (missing.length) {
  console.warn(`build-demo: no ${missing.join(', ')} -- the demo will use the procedural graphics, `
    + 'synthesised sounds and no music for those. `npm run pack` builds them from assets/.');
}

// --- clear the output, carefully ---

if (existsSync(OUT)) {
  if (!statSync(OUT).isDirectory()) fail(`${OUT} is a file`);
  const inside = readdirSync(OUT);
  if (inside.length && !inside.includes(MARKER)) {
    fail(`${OUT} is not empty and is not a previous demo build; refusing to clear it.`);
  }
  rmSync(OUT, { recursive: true, force: true });
}
mkdirSync(OUT, { recursive: true });

// --- copy and bake ---

const SKIP = new Set(['package.json', 'tiles.html']);   // Node's module marker; the sprite viewer
cpSync(join(ROOT, 'public'), OUT, {
  recursive: true,
  filter: (src) => !SKIP.has(relative(join(ROOT, 'public'), src)),
});

mkdirSync(join(OUT, 'packs'), { recursive: true });
writeFileSync(join(OUT, 'packs', 'levels.pak'), encodePack([{
  name: 'levels.json', type: 'application/json',
  bytes: new TextEncoder().encode(JSON.stringify({ levels: LEVELS })),
}]));

const indexFile = join(OUT, 'index.html');
const html = readFileSync(indexFile, 'utf8');
const meta = '<meta name="supremix-host" content="static">';
if (!/<meta charset[^>]*>/i.test(html)) fail('index.html has no <meta charset> to put the static marker after');
writeFileSync(indexFile, html.replace(/(<meta charset[^>]*>)/i, `$1\n${meta}`));

writeFileSync(join(OUT, '.nojekyll'), '');   // GitHub Pages: serve the files as they are
writeFileSync(join(OUT, MARKER), `SupRemix ${version} demo build. tools/build-demo.mjs empties this folder on the next build.\n`);

const size = (dir) => readdirSync(dir, { withFileTypes: true })
  .reduce((n, e) => n + (e.isDirectory() ? size(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0);
console.log(`SupRemix ${version} demo -> ${OUT}`);
console.log(`  ${LEVELS.length} levels (${REMIX ? 'remix set' : 'original set'}), `
  + `${PACKS.length - missing.length}/${PACKS.length} asset packs, ${(size(OUT) / 1048576).toFixed(1)} MB`);
