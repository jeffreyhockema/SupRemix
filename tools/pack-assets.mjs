// Bundles the remastered graphics, the sounds and the music into the scrambled
// asset packs the game ships (see public/js/asset-pack.js for why, and the
// format).
//
//   node tools/pack-assets.mjs              # rebuild every pack
//   node tools/pack-assets.mjs sfx music    # just these groups
//
// The build tools write their raw files under assets/, which the server never
// serves; this reads them and writes the packs into public/packs/:
//
//   assets/game/remaster.{png,json}  ->  public/packs/gfx.pak
//   assets/sfx/*.wav                 ->  public/packs/sfx.pak
//   assets/music/*.mp3               ->  public/packs/music.pak
//
// tools/remaster/game-atlas.mjs and tools/remaster-sounds.mjs repack their own
// group when they finish, so a rebuild leaves the packs current. The music is
// rendered outside this repository (see the README); drop new MP3s into
// assets/music/ and run this.
//
// Every pack is read back and compared with its files before it is written,
// and an unchanged rebuild writes nothing.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePack, parsePack, readEntry, PACKS } from '../public/js/asset-pack.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MIME = { '.png': 'image/png', '.json': 'application/json', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

/** Each pack: the folder its raw files are in, and which of them it takes. */
export const GROUPS = {
  gfx: { from: 'assets/game', take: (f) => f === 'remaster.png' || f === 'remaster.json' },
  sfx: { from: 'assets/sfx', take: (f) => f.endsWith('.wav') },
  music: { from: 'assets/music', take: (f) => f.endsWith('.mp3') },
};

/** Builds one group's pack; returns false if its raw files are not there. */
export function packGroup(group, { quiet = false } = {}) {
  const g = GROUPS[group];
  const dir = join(ROOT, g.from);
  const names = existsSync(dir) ? readdirSync(dir).filter(g.take).sort() : [];
  const out = join(ROOT, 'public', PACKS[group]);
  if (!names.length) {
    console.log(`  ${PACKS[group].padEnd(18)} no files in ${g.from}/ -- ${existsSync(out) ? 'kept as it was' : 'not built'}`);
    return false;
  }
  const files = names.map((name) => ({ name, type: MIME[extname(name)], bytes: new Uint8Array(readFileSync(join(dir, name))) }));
  const pack = encodePack(files);

  const back = parsePack(pack);
  for (const f of files) {
    if (!Buffer.from(readEntry(back, f.name)).equals(Buffer.from(f.bytes))) throw new Error(`${PACKS[group]}: ${f.name} did not read back`);
  }

  mkdirSync(dirname(out), { recursive: true });
  const changed = !existsSync(out) || !readFileSync(out).equals(Buffer.from(pack));
  if (changed) writeFileSync(out, pack);
  if (!quiet) {
    const raw = files.reduce((n, f) => n + f.bytes.length, 0);
    console.log(`  ${PACKS[group].padEnd(18)} ${String(files.length).padStart(2)} files  ${(raw / 1024).toFixed(0).padStart(6)} KB  ${changed ? 'written' : 'unchanged'}`);
  }
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  const asked = process.argv.slice(2);
  const unknown = asked.filter((g) => !GROUPS[g]);
  if (unknown.length) {
    console.error(`unknown group(s): ${unknown.join(', ')}; choose from ${Object.keys(GROUPS).join(', ')}`);
    process.exit(1);
  }
  console.log('Asset packs:');
  for (const g of asked.length ? asked : Object.keys(GROUPS)) packGroup(g);
}
