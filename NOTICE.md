# Notices and credits

## SupRemix

Copyright (c) 2026 Jeff Hockema

SupRemix is released under the MIT License; see [`LICENSE`](LICENSE).

SPDX-License-Identifier: MIT

### What the licence covers

The MIT License covers this project's own work:

- all source code: `server.js`, everything in `public/` other than the asset
  packs, everything in `tools/` other than `tools/remaster/frames.mjs` (below),
  and `levels/upgrades.mjs`
- the twenty remix levels and their solutions (`levels/remix.js`,
  `levels/remix-solutions.mjs`) and the generator that builds them
  (`tools/levelgen/`)
- the procedural sprites and synthesised sound effects the game draws and plays
  in code (`public/js/sprites.js`, `public/js/audio.js`)
- the documentation

It does not cover the original game's material listed under *Supaplex* below,
including where this project's tools have redrawn, remastered or repacked it.

### Portions from OpenSupaplex

`tools/remaster/frames.mjs` transcribes the animation frame tables from
**OpenSupaplex** by Sergio Padrino (<https://github.com/sergiou87/open-supaplex>),
a reverse engineering of the original game. OpenSupaplex is distributed under
the GNU General Public License, version 3, so that file is too:

> Copyright (c) 2020 Sergio Padrino. This program is free software: you can
> redistribute it and/or modify it under the terms of the GNU General Public
> License as published by the Free Software Foundation, version 3. This program
> is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
> without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
> PARTICULAR PURPOSE. See the GNU General Public License for more details.

The full licence text is at <https://www.gnu.org/licenses/gpl-3.0.html>. The
file is used only by the build tools that redraw the original's animation
sheet; the game itself does not load it.

OpenSupaplex was also the reference for how the original behaves -- its timing
(35 frames a second, 8 frames a tile), the order it moves things in, its
explosion, fuse and bug timers and its random number generator -- which
`public/js/engine.js` reimplements in its own code.

## Supaplex

**Supaplex** was created by Philip Jespersen and Michael Stopp and published by
Digital Integration in 1991. SupRemix is a reimagining of it.

The original game's material is not part of this repository, and none of it is
covered by this project's licence. It remains the property of its respective
owners:

| What | Where it goes in a working copy | Made from |
|------|------------|-----------|
| The 111 original levels | `levels/LEVELS.DAT`, and `levels/pack.js` imported from it | the game's `LEVELS.DAT` |
| The remastered graphics | `public/packs/gfx.pak` (and `assets/`) | redrawn from the game's `FIXED.DAT` and `MOVING.DAT` |
| The sound effects | `public/packs/sfx.pak` (and `assets/sfx/`) | remastered from the game's Sound Blaster samples, `BLASTER.SND` |
| The music | `public/packs/music.pak` (and `assets/music/`) | the game's own score, rendered from its Roland MT-32 driver, `ROLAND.SND` |

These are listed in `.gitignore`. The tools in `tools/` build them from a copy
of the original game you supply; see the README. Without them, SupRemix plays
its own twenty remix levels with its procedural graphics and synthesised sound.

The online demo includes this material so that it can be played as the
original was. If you hold rights in Supaplex and would like any of it removed
from the demo, please open an issue on this repository and it will be taken
down.

## Used to make the assets, not included

- **Munt**, the Roland MT-32 emulator (<https://github.com/munt/munt>), rendered
  the music from the MIDI stream the original's driver sends. Munt and the
  MT-32 control and PCM ROMs it needs are not part of this project.
- **Google Chrome** (or Microsoft Edge), driven over the DevTools protocol,
  rasterises the remastered SVG masters (`tools/remaster/chrome.mjs`). It is
  launched from wherever it is installed, not bundled.

## Loaded at run time

Nothing. The page uses the system's own monospace font, and every script and
stylesheet is in `public/`.

## Trademarks

The Supaplex name belongs to its respective owners. Roland is a trademark of
Roland Corporation, and the MT-32 is one of its products. SupRemix is an unofficial fan project and is
not affiliated with, endorsed by or sponsored by Digital Integration, the
original authors or Roland.
