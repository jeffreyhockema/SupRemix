// Copies the playable game -- public/, as it is -- to a folder ready for any
// static webserver.
//
//   node tools/build-site.mjs                       # -> dist/
//   node tools/build-site.mjs --out <folder>
//
// The game needs nothing from a server but its files, and every URL in it is
// relative, so the copy works from a sub-folder as well as a site's root. It
// leaves out what only development uses (public/package.json, the module
// marker Node's tools need, and tiles.html, the sprite viewer), and adds
// .nojekyll so GitHub Pages serves the files as they are.
//
// What it plays is whatever public/packs/ holds: the original levels,
// graphics, sounds and music if you have built them from your own copy of the
// game, and SupRemix's own levels, look and sound where you have not.
//
// The output folder is emptied first, but only if it is empty already or holds
// a previous copy (it has a .supremix-site marker): pointing --out at the
// wrong folder will not delete anyone's work.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, cpSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const MARKER = '.supremix-site';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const OUT = resolve(outAt >= 0 && args[outAt + 1] ? args[outAt + 1] : join(ROOT, 'dist'));

function fail(msg) {
  console.error(`build-site: ${msg}`);
  process.exit(1);
}

const version = /data-version="([^"]+)"/.exec(readFileSync(join(PUBLIC, 'index.html'), 'utf8'))?.[1] ?? '?';
const packs = ['levels', 'remix', 'gfx', 'sfx', 'music'].filter((p) => existsSync(join(PUBLIC, 'packs', `${p}.pak`)));
if (!packs.includes('levels') && !packs.includes('remix')) fail('public/packs/ has no level pack; run `node tools/pack-assets.mjs`');

if (existsSync(OUT)) {
  if (!statSync(OUT).isDirectory()) fail(`${OUT} is a file`);
  const inside = readdirSync(OUT);
  if (inside.length && !inside.includes(MARKER)) {
    fail(`${OUT} is not empty and is not a previous copy; refusing to clear it.`);
  }
  rmSync(OUT, { recursive: true, force: true });
}
mkdirSync(OUT, { recursive: true });

const SKIP = new Set(['package.json', 'tiles.html']);
cpSync(PUBLIC, OUT, { recursive: true, filter: (src) => !SKIP.has(relative(PUBLIC, src)) });
writeFileSync(join(OUT, '.nojekyll'), '');
writeFileSync(join(OUT, MARKER), `SupRemix v${version}. tools/build-site.mjs empties this folder on the next copy.\n`);

const size = (dir) => readdirSync(dir, { withFileTypes: true })
  .reduce((n, e) => n + (e.isDirectory() ? size(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0);
console.log(`SupRemix v${version} -> ${OUT}`);
console.log(`  packs: ${packs.join(', ')}  (${(size(OUT) / 1048576).toFixed(1)} MB)`);
if (!packs.includes('levels')) console.log('  no original levels: it plays the remix set');
