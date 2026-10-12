# SupRemix

**Version 0.51**

A web remake of **Supaplex** (1991) crossed with the puzzle games either side of
it, set inside a 1990s PC. It is a static site: put `public/` on any webserver
and it plays.

> This repository is SupRemix's own code and levels. The original game's levels,
> graphics, sounds and music are not in it -- they are not ours to publish --
> but the tools here rebuild them from your own copy of Supaplex. Without them
> the game plays its twenty remix levels with its own procedural look and
> synthesised sound. See [The original game files](#the-original-game-files)
> and [NOTICE.md](NOTICE.md).

You are a service bot on a motherboard. Dig through green solder mask, collect
the infotron quota and reach the drive bay — without letting a capacitor land on
your head. The zonks are electrolytic cans, the disks are 3.5" floppies, the
monsters are case fans and arcing shorts, and the walls are beige steel.

- **Zero dependencies, no build step.** Plain HTML, CSS and ES modules that need
  nothing from a webserver but the files. The tools that build its assets and
  check its levels are plain Node scripts.
- **The original's own graphics and sound, remastered.** Every tile and every
  animation frame of the DOS game is redrawn in HD from its own pixels, and
  the seven sound effects are its own Sound Blaster samples, pulled out of the
  driver they shipped in. The music is its own theme as a Roland MT-32 played
  it, note for note from its MT-32 driver. Press **G** to switch to SupRemix's procedural look,
  which also covers the hybrid elements the original never had.
- **All 111 original levels**, imported tile for tile from the original
  `LEVELS.DAT` and played as they shipped. The import is checked against the
  same file on every run: `node tools/compare-original.mjs` decodes it and measures both sides
  with the same code, and every figure comes back `exact`.
- **Twenty levels of our own** as a second pack, generated from a dig-field with
  gates stamped into it, each a recognisable piece of a 1990s PC. Every one is
  gated -- a naive collector is turned loose by `node tools/design-audit.mjs` and the build
  fails if walking to the nearest infotron is enough -- and every one ships a
  recorded solution that replays from spawn to exit.
- **Five puzzle lineages in one board**: Supaplex digging and gravity, Chip's
  Challenge keycards and ice, Sokoban pressure plates, Lode Runner collapsing
  walkways, and Boulder Dash's growth that crystallises when you box it in.
- **The original ruleset**, not a Boulder Dash reskin: zonks that roll off round
  things, one-way ports, gravity ports, Snik Snaks and electrons, orange /
  yellow / red disks, terminals, bugs, and chain-reacting explosions.

## Run it

Serve `public/` with any webserver and open it in a browser, for example:

```bash
python -m http.server 8000 --directory public    # http://localhost:8000
```

Opening `index.html` straight from disk does not work: browsers will not load
ES modules or fetch files from a `file://` page. To put it online, copy
`public/` to any static host -- `node tools/build-site.mjs --out <folder>` makes
a clean copy without the development files (and with `.nojekyll`, for GitHub
Pages). Every URL in the game is relative, so it works from a sub-folder.

A fresh clone plays the twenty remix levels, drawn and voiced by SupRemix
itself. The original levels, the remastered graphics and sound and the music
appear once you have built them from your own copy of the game. Best runs and
progress are kept in the browser.

## The original game files

None of the original Supaplex's material is in this repository. Each piece is
rebuilt from a copy of the DOS game you supply, and git-ignored:

| You get | From the game's | How |
|---|---|---|
| the 111 original levels | `LEVELS.DAT` | copy it to `levels/LEVELS.DAT`, then `node tools/import-original.mjs` (writes `levels/pack.js` and `public/packs/levels.pak`) |
| the remastered graphics | `FIXED.DAT`, `MOVING.DAT`, `PALETTES.DAT` | `node tools/extract-sprites.mjs <Supaplex folder>`, then `node tools/remaster/render.mjs`, `node tools/remaster/render-moving.mjs`, `node tools/remaster/game-atlas.mjs` (needs Chrome or Edge) |
| the remastered sound effects | `BLASTER.SND` | `node tools/extract-sounds.mjs <Supaplex folder>`, then `node tools/remaster-sounds.mjs` |
| the music | `ROLAND.SND` | rendered outside this repository (see [Music](#music)); put the MP3s in `assets/music/` and run `node tools/pack-assets.mjs` |

The levels, graphics, sounds and music end up in `public/packs/` as scrambled
packs (see [Asset packs](#asset-packs)). The game plays the original levels
when `levels.pak` is there and the remix levels (`remix.pak`, the one pack
that is committed) when it is not, and falls back to its procedural sprites,
synthesised sounds and silence for any other pack that is missing, so every
step is optional.

## Controls

| Key | Action |
| --- | --- |
| Arrows / WASD | move, dig, push |
| Space + direction | reach out without moving (grab through a wall of base) |
| Space (hold alone) | plant a red disk where you stand — hold still about two seconds, then get clear |
| B (hold) | plant a red disk, if you prefer a dedicated key |
| R | restart the level |
| Esc / P | pause and menu |
| Space / Enter | on the level-clear screen, straight on to the next level |
| M | mute |
| N | music on / off |
| G | remastered original graphics / SupRemix's procedural graphics |
| Z | close view (about 24 x 13 tiles, scrolling with Murphy, like the original) / the whole level |

**Options** (on the title screen and the pause menu):

- **Game speed** -- 0.5x, 1x, 1.5x or 2x. 1x, the default, is the original's
  pace; the HUD shows a badge whenever it is anything else. A run's time is
  counted in game time, so it means the same at any speed.
- **Reset progress** -- press twice. Locks every level but the first and
  forgets your best runs on this device (the shared score board is untouched).

On a touch screen the controls appear over the board while you play: a
thumbstick wherever your left thumb lands (it follows the thumb, and snaps to
the four directions), and two hold buttons on the right -- **GRAB** (hold, with
the stick, to reach) and **DISK** (hold, standing still, to plant). Held
upright, the view frames about 12 tiles across.

Game controllers work too -- Xbox, PlayStation, Switch Pro, 8BitDo, over
Bluetooth or USB. Press any button with the page open and it is picked up:

| Controller | Action |
|---|---|
| D-pad / left stick | move (the stick snaps to the four directions) |
| A + direction | reach without moving, as Space |
| A or B (hold, still) | plant a red disk |
| Y | close view / whole level |
| Back / Select | restart level |
| Start | pause / resume |

In the menus the D-pad or stick moves between buttons, A presses, B goes back.
A controller that disconnects mid-level pauses the game. Browsers only offer
controllers to secure pages, so from another device use https:// or the
machine itself (localhost), not a bare LAN address.

## The rules

Collect `quota` infotrons, then step into the exit. It stays sealed until you do.

The timing is the original's: 35 frames a second, 8 frames -- 229 ms -- for
Murphy, a zonk or an enemy to cross a tile. Everything below is measured in
those tiles, taken from OpenSupaplex's reverse engineering of the original.

- **Zonks and infotrons fall** when nothing supports them, and **roll off**
  anything round: other zonks, infotrons, and a single RAM chip (the two-cell
  chips are flat). Anything that lands on Murphy kills him -- unless he is
  shoving something sideways, when it just comes to rest on him.
- **A cell is taken until whatever is leaving it has gone.** So a zonk can only
  start into the cell Murphy has just left once he has left it: run from under
  one and it follows a tile behind you; stop, and you have one step to get out
  from under it. A falling column comes apart a tile at a time the same way.
- **Zonks push sideways only**, and only when the cell beyond is empty. Pushing
  takes a moment of lean-in, so a single tap won't shift one.
- **Yellow disks** push in all four directions. **Every terminal is wired to
  every yellow disk** — touch one and they all go up.
- **Orange disks** fall but never roll, and detonate the instant they land.
- **Red disks** go in your pocket. Hold space, standing still, for about two
  seconds and one goes down where you stand; you then have just over a second
  to be two cells away -- the blast is 3×3 and it does not care whose side
  you're on. One burns at a time, and picking up the burning one does not put
  it out.
- **Electrons** burst into infotrons when crushed, which is worth going out of
  your way for even though no quota depends on it.
- **Snik Snaks** and electrons follow walls with a left hand rule, as fast as
  Murphy moves, pausing a moment to turn. Learn the loop before you step into it.
- **Bugs** are harmless while dark and fatal while sparking. Every bug sparks
  at the start of a level; after that each sparks for a moment at random.
- **Ports** are one-way; the arrow is the whole puzzle. Numbered ports flip
  gravity, and with gravity on Murphy falls too.
- **Explosions** destroy everything except hardware -- the exit and ports
  included, so mind where you set one off -- and set off the orange and yellow
  disks and the enemies they catch, a moment later. A red disk lying about is
  simply destroyed. The dying half of a blast can be walked into. SupRemix's
  own puzzle furniture -- cards, doors, drives -- is blast-proof, so a stray
  bang can never strand you.

### The hybrid half

- **Jumper caps and headers** come in four colours. A cap opens one matching
  header and is spent doing it, so the order you open things in is the puzzle.
- **The data bus** carries you in the direction you stepped on until something
  stops you. Infotrons make good brakes.
- **Hot components** are lethal barefoot. Thermal boots make them walkable.
- **Disk drives** shove in all four directions and never fall. Park one on every
  **pressure plate** and the **force fields** drop.
- **Failing traces** start a countdown the moment you stand on one, then seal
  solid. They are a one-way door, and standing on one when it goes is fatal.
- **Electrolyte** creeps into one free cell at a time. Box a patch in completely
  and it crystallises into infotrons; let it run past its cap and the whole mass
  hardens into capacitors instead, so it can never drown a level.

## The levels

With the original files in place, the pack is the **original Supaplex level
set, all 111 boards**, imported tile for tile from `levels/LEVELS.DAT` by
`node tools/import-original.mjs`. (Without them it is the remix pack, below.) WARM UP is level 1 and
BRAINMAN! is level 111, in their original order, under their original titles and
infotron quotas.

The import is checked rather than trusted. `node tools/compare-original.mjs` decodes the same
LEVELS.DAT and measures both sides with the same code, so every row reading
`exact` says the board being served is the board that shipped in 1991:

| element | ours | original | | shape | ours | original |
| --- | --- | --- | --- | --- | --- | --- |
| board (diggable) | 36.71% | 36.71% | | solid in runs of 4+ | 89% | 89% |
| chassis | 21.53% | 21.53% | | isolated solid cells | 3% | 3% |
| chips | 12.31% | 12.31% | | tight (corridor) cells | 25% | 25% |
| capacitors | 7.83% | 7.83% | | infotron clustering | 0.53 | 0.53 |
| infotrons | 4.54% | 4.54% | | capacitor clustering | 0.82 | 0.82 |
| open space | 12.66% | 12.66% | | left-right symmetry | 0.52 | 0.52 |

`node tools/validate-levels.mjs` passes on all 111: no sealed region, no quota that the board
cannot yield, no force field buried under something. What it does **not** do is
prove they can be finished -- nothing here has played all 111, and the automatic
player finishes four of them unaided. That is a statement about a greedy bot,
not about the level set.

Two things in those numbers are worth knowing, because they are what people get
wrong when they build Supaplex-looking levels. **Symmetry is not a Supaplex
trait**: only nine of the 111 are better than 85% mirror-symmetric, and the mean
is chance. And **solid is laid in lines**: 89% of every wall and chip belongs to
a straight run of four or more, with almost nothing scattered as single blocks.
Its chips are mostly two-cell DIP packages, which is why the vocabulary has
`[ ]` and `" _` as well as `=`.

### Changing a level

`levels/pack.js` is generated and the next import overwrites it, so a level is
never edited there. `levels/upgrades.mjs` is the seam: it maps a level number to
a function that rewrites the board on the way through, using helpers that take
the same coordinates `node tools/peek.mjs` prints. It is currently empty, and the pack
is the original designs untouched.

Ten of them were rebuilt once -- each keeping its 1991 layout and gaining one
structure the original set had no vocabulary for -- and it was reverted, because
the additions read as bolted on. The reason is recorded in `upgrades.mjs` and
worth repeating here: the structures were placed by algorithm, into whatever the
clearest patch of filler happened to be. A rectangular box of chassis with a
grid of infotrons in it announces itself as foreign on a board drawn by hand,
and a placement chosen for being empty is a placement chosen without reference
to how the level plays -- it lands where the designer left space, which is
usually space they left on purpose.

Anything added to one of these boards has to be drawn into it by someone reading
it: worked into the structures already there, following its lines, at a point in
its route where it means something. What the helpers are good for is making that
edit safely. `place` refuses any position that seals a region off or leaves its
own doorstep behind a chip -- a vault once landed across the one way into the
right-hand half of level 10 and took the drive bay with it, and nothing noticed,
because the board still looked like a board.

`node tools/test-upgrades.mjs` plays whatever an edit adds, rather than reading it, and
`node tools/validate-levels.mjs` re-checks the finished board. Both are quiet while nothing is
changed.

### The remix pack

Twenty levels of our own live in `levels/remix.js`, built by `tools/levelgen`
from a dig-field with gates stamped into it. They are what a fresh clone
serves, and with the originals in place they are still kept green: every tool takes `SUPREMIX_PACK`, so `SUPREMIX_PACK=remix node tools/check.mjs` holds them to the stricter rules the originals are excused from -- every
level past the tutorials gated, and a recorded solution that replays from spawn
to exit. `sh tools/levelgen/rebuild.sh` rebuilds and re-verifies them.

### The sealed chamber

The remix pack's workhorse gate, and worth knowing when reading one of its
boards. Four rows: a
chassis ceiling, a mouth with a capacitor plugging it, a hollow row underneath,
and a chassis floor. Shove the plug inwards and it drops into the hollow row,
clearing the mouth for good. It cannot fall on its own, cannot be pulled, and
cannot be walked past.

## Layout

```
levels/
  LEVELS.DAT           the original game's level data (yours; git-ignored)
  pack.js              the 111 original levels, as ASCII art (generated; git-ignored)
  upgrades.mjs         changes made to those designs; the only place to edit one
  remix.js             20 levels of our own (generated)
  remix-solutions.mjs  a worked solution for each of them (generated)
public/
  index.html           shell, HUD, menu screens
  css/style.css
  js/tiles.js          tile + floor vocabulary and level parsing (shared with tools)
  js/engine.js         the simulation: gravity, pushing, monsters, explosions
  js/render.js         canvas renderer, camera, interpolation
  js/sprites.js        every sprite, drawn procedurally at the current tile size
  js/fx.js             particles, light and screen effects; the visual vocabulary
  tiles.html           every sprite, drawn large -- open /tiles.html while running
  js/audio.js          sound effects and music (WebAudio)
  js/asset-pack.js     reads (and writes) the scrambled asset packs
  packs/               the scrambled packs: remix.pak (our levels, committed);
                       levels.pak, gfx.pak, sfx.pak, music.pak (the original
                       levels, graphics, sounds and music; built, git-ignored)
  js/input.js          keyboard, with tap buffering
  js/touch.js          on-screen thumbstick and hold buttons
  js/gamepad.js        game controllers (Gamepad API)
  js/main.js           app shell and the fixed-timestep loop
tools/
  test-engine.mjs      59 engine rule tests
  test-client.mjs      builds every sprite and runs the renderer, headlessly
  check.mjs            runs the suites: `test` for the two above, or everything
  pack-assets.mjs      builds the scrambled packs in public/packs/
  build-site.mjs       copies public/ to a folder for any static webserver
  validate-levels.mjs  structural + physics validation of the level pack
  verify-solutions.mjs replays every level's recorded solution
  router.mjs           the automatic player those replays walk with
  design-audit.mjs     turns a naive collector loose and fails walkable levels
  peek.mjs             prints the coordinates of everything in a level
  test-upgrades.mjs    plays the machinery levels/upgrades.mjs added
  compare-original.mjs mix and shape, both sides measured from LEVELS.DAT
  original.mjs         decodes LEVELS.DAT; shared by the import and the compare
  import-original.mjs  writes levels/pack.js, applying levels/upgrades.mjs
  upgrade-kit.mjs      widgets and helpers for an upgrade, in game coordinates
  pack.mjs             which pack the tools work on (SUPREMIX_PACK)
  trace-solutions.mjs  records the route each recorded solution walks
  fit-quota.mjs        measures each level's two ceilings and fits its quota
  dbg.mjs              replays one solution move by move and says where it broke
  levelgen/            builds the remix pack and its solutions; see its README
LICENSE                MIT, for SupRemix's own work
NOTICE.md              credits, and what the licence does not cover
```

The simulation is a fixed step of the original's 229 ms (8 frames at 35 a
second) and is fully deterministic — the same
inputs produce the same world, which is what the tests and the level validator
rely on. Rendering interpolates between steps and never mutates game state.

### The tileset

The sprites follow the original's iconography, in the original's own colours:
Murphy is a red sphere with a yellow brow and a grey jaw that swings round to
face the way he is going; an infotron is a silver ball with a red-and-yellow
band across it; a capacitor is a grey rounded block; the board you dig is green
with a darker trace and a white via.

An electron is a four-pointed blue star -- a spark of light, not a creature --
and a Snik Snak is two dark-red pods on a grey spindle that turns as it patrols.
The drive bay is a grey slab cut into four rounded panels, dead metal while it
is shut and lit from behind once the quota is met. The chassis variants are the
original's: lamp grids, hazard stripes, brushed plate, panels with big round
buttons.

Those sixteen colours are not from memory. They are read out of the game's own
`PALETTES.DAT`, whose components are 4-bit -- each channel is the stored value
times seventeen -- and they live in `SPX` at the top of `sprites.js`. What is
new is everything between them: the original had sixteen colours and could not
afford a gradient, so its sphere is a disc with a highlight pixel. Here a sphere
gets a body gradient, a specular and a rim light, the board gets a bevel and an
inner shadow, and the infotron's band turns and foreshortens as it goes round
the back.

`/tiles.html` draws every sprite the game builds, at whatever size you like,
animating. They are the same canvases the board blits, so what is on that page
is exactly what is played.

### The remastered set

With the remastered atlas loaded (`public/packs/gfx.pak`, built from the original by
`tools/remaster/`), the board draws the original game: its 40 tiles redrawn as
vector art, and its animations played the way it played them. A step Murphy
takes is the original's own window over both cells -- walking, or chomping
through the base in front of him, or shoving a zonk out of the far side --
chosen by what that step did. Zonks and infotrons roll through the original's
frames, snik snaks turn to their real heading, bugs spark, Murphy yawns when
left alone and shrinks into the exit. Keys, doors, boots, racks, slime and the
floors keep their procedural sprites: the original never drew them.

The sounds are the original's seven Sound Blaster effects -- explosion,
infotron, push, fall, bug, base, exit -- extracted from `BLASTER.SND` and
remastered by `tools/remaster-sounds.mjs` into 44.1 kHz stereo. The originals
are 8-bit at 8 kHz -- nothing above 4 kHz, and an explosion that is little but
clipped noise -- so each was analysed for what it was reaching for and rebuilt
as that, offline and deterministically, from layered synthesis, filtering,
saturation and reverb: the explosion a crack, a falling sub thump, a
crunchy body and a rumbling tail with debris; push a thump and a metal scrape;
fall a heavy thud with a brief clank; bug an electric arc; base a tiny soft chomp
(varied a little in pitch each step, so digging never machine-guns); exit the
original's own jingle, note for note, on a modern synth. The infotron is the
original sample itself -- cleaned, with a little air and a short room around it
-- because it is the one everybody remembers. They play through one channel by
the original's priorities, so a chain of explosions is one roar and an infotron
is heard over the base you dug to reach it; the bug buzzes only when Murphy is
next to one that is sparking. Everything the original had no sound for is
synthesised.

Rebuilding them needs the original game's folder, and Chrome or Edge to
rasterise the SVG masters:

```bash
node tools/extract-sprites.mjs <Supaplex folder>   # decode the DOS graphics -> assets/original/
node tools/remaster/render.mjs                       # HD tiles -> assets/remaster/fixed*
node tools/remaster/render-moving.mjs                # HD animation sheet -> assets/remaster/moving*
node tools/remaster/game-atlas.mjs                  # the game's atlas -> assets/game/, packed into gfx.pak
node tools/extract-sounds.mjs <Supaplex folder>    # extract the samples -> assets/original/sounds*
node tools/remaster-sounds.mjs                # remaster them (from assets/original/sounds/) -> assets/sfx/, packed into sfx.pak
```

### Music

The music is the original's: its in-game theme and its level-exit jingle, as
they sound on a Roland MT-32. The DOS game plays them note by note through a
small driver, `ROLAND.SND`, so there was nothing to cut out. The driver was run
in an 8086 emulator, called the way `SUPAPLEX.EXE` calls it (50 times a
second), and every MIDI byte it sent was logged. That stream was then played
through Munt, the MT-32 emulator, with the MT-32 v1.07 ROMs. The driver uses only
the MT-32's built-in sounds, so this is what the game sounds like on the real
module.

The theme is a 15-second intro followed by a 5 min 12 s loop. `theme.mp3` (in `music.pak`) is the
intro, one pass of the loop and a second of overrun. `js/audio.js` loops
between the two points, and the last quarter-second before the loop end
is crossfaded into the bars before the loop start, so the jump is
seamless. As in the original's Roland mode, the theme plays through the
menus and the levels, and reaching the exit stops it for the jingle. The next level starts the theme again. **N** turns the music off; the
exit then plays the remastered Sound Blaster jingle instead. The music
decodes to roughly 120 MB of samples in the browser.

The tools that make these files need Python, the original `ROLAND.SND` and
MT-32 ROMs, so they live outside this repository with the rest of the audio
extraction (`extract_roland.py`, `make_game_music.py`). Their MP3s go in
`assets/music/`; `node tools/pack-assets.mjs` then rebuilds `music.pak`.

### Asset packs

The levels, graphics, sounds and music are the original game's (see the licence
below), so a webserver never hands them out as readable level data or loose
PNGs, WAVs and MP3s that anyone can browse to, preview and right-click-save.
They go in packs in `public/packs/` -- `levels.pak`, `gfx.pak`, `sfx.pak`,
`music.pak`, and `remix.pak` for SupRemix's own levels -- each a small index and
the files back to back, every byte XORed with a keystream seeded per file, with
CRC-32s so a damaged pack is refused rather than fed to a decoder.
`public/js/asset-pack.js` reads them in the browser and hands the game
ordinary Images and AudioBuffers.

This is obfuscation, not security: the key is in `asset-pack.js` for anyone who
looks. The point is only that lifting the art takes deliberate effort.

The raw files the build tools write live under `assets/` (never served) and are
git-ignored, like the original-game files they come from; only the packs are
meant to be committed. The remaster tools repack their own group when they
finish, and `node tools/pack-assets.mjs` (or `node tools/pack-assets.mjs sfx`) rebuilds by hand. Packing is
deterministic, so an unchanged rebuild leaves the packs byte-identical, and
`test-client.mjs` fails if a pack has fallen behind its raw files or anything
loose has crept back into `public/`.

### Effects

`public/js/fx.js` holds the whole visual vocabulary: what a dig throws about,
what an explosion looks like, how bright the exit burns. Two passes run over the
board every frame. Particles are drawn on top of the sprites; light is drawn
into a half-resolution buffer and composited back additively, which is how you
get bloom in canvas 2D with no shader, no dependency and no per-frame blur --
the browser's own upscale is the blur.

There are two styles, and the graphics choose which. SupRemix's procedural
sprites are built to be lit, so they get the full show: bursts, rings, screen
flashes, a glow on everything that matters, CRT scanlines. The remastered
original art already animates what is happening -- the base being eaten, the
infotron going into Murphy's mouth, the fire of a blast -- so its effects only
add what a sprite cannot: a few crumbs with weight, a dust puff where a zonk
lands, smoke that drifts off an explosion, light that rises and falls with it,
a glint on an infotron's bead. Light comes only from what is lit in the art --
the hardware lamps, the terminal screen, electrons, a bug while it sparks, a
burning fuse, the exit once it is open -- and the board is the original's black
space, with no grid and no scanlines.

Everything works in **tile space**. A particle at (12.5, 7.25) is in the middle
of column 12, row 7, and velocities are in tiles per second; the renderer
converts at draw time. That is what lets effects survive a resize or a camera
move, which they do not if you store screen pixels.

The engine reports where things happen as well as what happened. `game.events`
is the old channel of bare strings that sound and the HUD read; `game.fx` is the
same events again with a cell attached, because sound does not care where a dig
was and particles care about nothing else. Neither knows about the other.

Three numbers control how loud it all is, in `TUNING` at the top of `fx.js`:

| dial | what it scales |
| --- | --- |
| `intensity` | particle counts and screen flash |
| `bloom` | how far light bleeds past what emits it |
| `ambient` | drifting dust, and the twinkle on infotrons |

On top of those, `pace()` watches the frame time and quietly drops particle
counts after ten long frames in a row, restoring them when the machine catches
up -- an effects layer that turns a weak machine into a slideshow is not worth
having, and nobody reads a settings screen.

## Development

The tools are plain Node scripts (Node 18 or later), run from the repository root:

```bash
node tools/check.mjs test             # engine rule tests + client tests
node tools/test-client.mjs            # sprites, renderer and packs, on a stub canvas
node tools/test-upgrades.mjs          # play the machinery levels/upgrades.mjs added
node tools/validate-levels.mjs        # level pack checks
node tools/verify-solutions.mjs       # replay every level's recorded solution
node tools/design-audit.mjs           # is each level actually a puzzle?
node tools/peek.mjs 7                 # print where everything in a level is
node tools/compare-original.mjs       # composition, both sides measured from LEVELS.DAT
node tools/import-original.mjs        # rebuild levels/pack.js from LEVELS.DAT + upgrades.mjs
node tools/dbg.mjs 7 --trace          # replay one solution move by move
sh tools/levelgen/rebuild.sh          # rebuild the remix pack and its solutions
node tools/pack-assets.mjs            # rebuild the packs in public/packs/
node tools/build-site.mjs --out <dir> # a clean copy of the site for a webserver
node tools/check.mjs                  # all of the above checks
```

The remastered graphics and sounds are rebuilt from the original game with the
commands under [The remastered set](#the-remastered-set).

Every tool reads `SUPREMIX_PACK`, which picks `levels/<name>.js` and its
solutions beside it. It defaults to the original set when `levels/pack.js` is
there and to the remix set when it is not; `SUPREMIX_PACK=remix node tools/check.mjs`
runs the whole suite against our own twenty either way.

`node tools/check.mjs test` runs both suites. The engine tests build tiny
hand-made grids and drive them with scripted input, so a rule change that breaks
pushing or bug timing fails immediately. The client tests build every sprite at
several sizes, run the renderer over real levels against a canvas that draws
nothing, and check the packs: that each reads back exactly, that each is
current with what it is built from, and that nothing of the original game is
readable in a copy of the site.

`validate` confirms each level parses, that the exit and enough infotrons are
reachable, and — by running the level headless for 400 steps with no input —
that nothing collapses on the spawn point before the player can move. Two of
those rules are relaxed for an imported original, because the original set
breaks them on purpose: boards called QUICKY! and READY-STEADY-GO!! have
something already falling when you arrive, and level 85 is balanced so exactly
that its quota needs every one of its three shorts crushed, one of which goes
off by itself if you stand about.

`solve` hands each level that has a recorded solution to an automatic player
(`tools/router.mjs`) which walks it from spawn to exit: routing around hazards, riding the bus,
waiting out flashing bugs and monster passes, fetching keycards, reaching
sideways for anything pinned under a can, and -- only once walking has failed --
shoving a capacitor out of a corridor. That last one is off for `audit`: almost
every gate in the pack is a shove of some kind, so a player that shoves by
reflex would measure nothing. A level that looks fine and validates
cleanly can still be impossible to finish; this is the test that catches it.

The 111 originals have no recorded solutions and are skipped: nobody here has
played all 111, and a level a greedy bot cannot finish is not evidence of a
broken level. They are held to `validate` instead. The remix pack is where
`solve` earns its keep -- `SUPREMIX_PACK=remix node tools/verify-solutions.mjs` replays all
twenty.

`audit` asks the opposite question. It turns the same player loose with no plan
at all -- walk to the nearest infotron, repeat, then leave -- and fails the build
if that is enough to finish any level past the third. A level a naive walk can
beat has no puzzle in it, only ground to cover. This is our design rule and it
is not applied to the originals: whether a thirty-year-old board can be strolled
through by a bot that never shoves anything says something about the bot.

`test:client` runs the drawing code in Node against a canvas that draws nothing
and checks everything. There was no test over any of it, and the cost of that
was a palette key that did not exist shipping as a blank game and a blank tile
viewer, the only symptom being a browser console saying `'undefined'` could not
be parsed as a colour. The stub is installed as `OffscreenCanvas` -- the first
thing `makeCanvas` reaches for -- and fails on any colour that is not a colour
and any coordinate that is not a number, which is the whole class of mistake
that gets made in sprite code. It builds every sprite at five sizes, checks that
every key the shell names by hand (`exit-on`, `base-0`, `murphy-1`) is really
built, and drives the renderer through a real level and a board carrying every
tile and floor in the vocabulary.

`test:upgrades` plays whatever `levels/upgrades.mjs` adds to a board, rather
than reading it: it shoves the drive onto the plate and checks the field
actually drops, rides the bus and checks it carries, seals a tank and checks it
sets. Nothing in it names a level or a coordinate -- any level with a drive and
a plate on one row is found and driven as a plate puzzle -- so it cannot rot.
It is silent while the pack is the original designs. Written against the ten
that were later reverted, it still turned up two things worth knowing: a force
field is not erased when it drops (the floor stays a force field and
`forceOpen` goes true), and a hot component kills rather than blocks.

`peek` prints the coordinates of everything notable in a level, which is how the
solutions get written. Counting characters in an ASCII row by eye is how
coordinate bugs get made.

### The level vocabulary

Both packs are generated, so nothing below is edited by hand -- an original is
changed through `levels/upgrades.mjs` and a remix level is added to
`tools/levelgen/pack3.py`. This is what the glyphs in the generated files mean.

Levels are written as **interior rows only**; the loader adds the hardware
border and pads short rows with empty space, so a row can never be one character
short and silently break a design.

```
' '  empty      '#' chassis    ':' board      '=' RAM chip
'M'  Murphy     'O' capacitor  'I' infotron   'E' drive bay
'S'  case fan   'e' short      'B' bug        'T' DIP switches
'o'  orange floppy   'y' yellow floppy   'r' red floppy
'>' '<' '^' 'v'  ports          '1'..'4'  gravity ports (R D L U)
'|' '-' '+'      vertical / horizontal / cross ports
'a' 'c' 'g' 'p'  jumper caps    'A' 'C' 'G' 'P'  matching headers
'w'  thermal boots  'H' disk drive   '*' electrolyte
'['  ']' two-cell DIP across    '"' '_' two-cell DIP upright
'L'  expansion slot 'J' heatsink fin  'K' socket pins   (scenery: solid, inert)
'%'  green chassis  '&' red chassis   (the same wall, different livery)
```

Surfaces live in their own layer. Written inline they claim the cell and leave
it empty; for anything standing on a surface, give the level an optional
`floors:` array of rows alongside `rows:`.

```
'~' data bus (ice)   '@' pressure plate   ';' failing trace
'X' hot component    'F' force field
```

A short row continues with whatever material it ends in: a row ending in `#`,
`%` or `&` runs to the edge as wall, one ending in `:` stays base, `=` stays
chip, and anything else pads with empty space. So rows only need to be drawn as wide as they are interesting, and
a short wall row can never leave an accidental shaft at the edge.

A remix level's solution is not written at all -- the gates it uses supply that,
recording the moves that open them as they are stamped. `sh tools/levelgen/rebuild.sh`
rebuilds the pack and its solutions and sets each quota by measurement;
`SUPREMIX_PACK=remix node tools/check.mjs` then has to be green.

## Licence

SupRemix's own work -- the code, the remix levels and the documentation -- is
released under the MIT License ([LICENSE](LICENSE)), copyright 2026 Jeff
Hockema. One file is the exception: `tools/remaster/frames.mjs` transcribes
OpenSupaplex's animation tables and so is under OpenSupaplex's licence, the GNU
GPL version 3.

**The original game's material is not ours, and is not in this repository.**
Supaplex was created by Philip Jespersen and Michael Stopp and published by
Digital Integration in 1991. Its levels (`LEVELS.DAT`), its graphics
(`FIXED.DAT`, `MOVING.DAT`), its sounds (`BLASTER.SND`) and its music
(`ROLAND.SND`), and everything this project's tools make from them -- the
imported `levels/pack.js`, the remastered graphics, sounds and music in
`assets/` and `public/packs/` -- remain their owners' and are git-ignored.

OpenSupaplex (Sergio Padrino) was the reference for the original's frame
positions and its rules and timing. [NOTICE.md](NOTICE.md) has the full
credits.
