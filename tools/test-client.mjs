// Runs the browser-side drawing code in Node and checks it draws something
// legal. Run with `npm run test:client`.
//
// The sprites are canvas code, so nothing in Node was exercising them: a
// palette key that did not exist shipped as a blank game and a blank tile
// viewer, with the only symptom a browser console saying that 'undefined' could
// not be parsed as a colour. That is a silly way to find out.
//
// So this stands in a canvas that draws nothing and checks everything. It is
// installed as `OffscreenCanvas`, which is what `makeCanvas` reaches for first,
// and it fails on any colour that is not a colour and any coordinate that is not
// a number -- which is the whole class of mistake that gets made here.

const COLOUR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([^)]*\)|transparent)$/i;
const NAMED = new Set(['white', 'black', 'none']);

let passed = 0, failed = 0;
const problems = [];

function note(what) {
  problems.push(what);
}

function checkColour(where, v) {
  if (v && typeof v === 'object' && v.__gradient) return;      // a gradient is fine
  if (typeof v !== 'string') { note(`${where}: ${v} is not a colour`); return; }
  if (COLOUR.test(v.trim()) || NAMED.has(v.trim().toLowerCase())) return;
  note(`${where}: "${v}" is not a colour`);
}

function checkNums(where, args) {
  for (const a of args) {
    if (typeof a === 'number' && !Number.isFinite(a)) {
      note(`${where}: got ${a}`);
      return;
    }
  }
}

class StubGradient {
  constructor(where) { this.__gradient = true; this.where = where; }
  addColorStop(offset, colour) {
    checkNums(`${this.where} addColorStop offset`, [offset]);
    checkColour(`${this.where} addColorStop`, colour);
  }
}

const GEOMETRY = [
  'arc', 'arcTo', 'ellipse', 'fillRect', 'strokeRect', 'clearRect', 'rect',
  'lineTo', 'moveTo', 'quadraticCurveTo', 'bezierCurveTo', 'translate',
  'rotate', 'scale', 'setTransform', 'fillText', 'strokeText', 'drawImage',
];
const NOOPS = ['beginPath', 'closePath', 'fill', 'stroke', 'clip', 'save', 'restore',
  'setLineDash', 'measureText'];

class StubContext {
  constructor(label) {
    this.label = label;
    for (const m of GEOMETRY) {
      this[m] = (...args) => checkNums(`${label} ${m}`, args);
    }
    for (const m of NOOPS) this[m] = () => ({ width: 0 });
    for (const prop of ['fillStyle', 'strokeStyle', 'shadowColor']) {
      let v = '#000';
      Object.defineProperty(this, prop, {
        get: () => v,
        set: (nv) => { checkColour(`${label} ${prop}`, nv); v = nv; },
      });
    }
    for (const prop of ['lineWidth', 'globalAlpha', 'shadowBlur', 'miterLimit']) {
      let v = 1;
      Object.defineProperty(this, prop, {
        get: () => v,
        set: (nv) => { checkNums(`${label} ${prop}`, [nv]); v = nv; },
      });
    }
    this.globalCompositeOperation = 'source-over';
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.font = '10px sans-serif';
    this.textAlign = 'left';
    this.textBaseline = 'alphabetic';
    this.imageSmoothingEnabled = true;
  }

  createLinearGradient(...args) {
    checkNums(`${this.label} createLinearGradient`, args);
    return new StubGradient(this.label);
  }

  createRadialGradient(...args) {
    checkNums(`${this.label} createRadialGradient`, args);
    return new StubGradient(this.label);
  }

  createPattern() { return new StubGradient(this.label); }
}

class StubCanvas {
  constructor(w, h) {
    this.width = w; this.height = h; this.label = 'sprite';
    this.style = {};
  }
  getContext() { return (this.ctx ??= new StubContext(this.label)); }
  getBoundingClientRect() { return { width: 960, height: 600, left: 0, top: 0 }; }
}

globalThis.OffscreenCanvas = StubCanvas;
globalThis.window = { devicePixelRatio: 2 };
globalThis.document = { createElement: () => new StubCanvas(1, 1) };

const { buildSprites, PAL, SPX } = await import('../public/js/sprites.js');
const { readFileSync } = await import('node:fs');

function test(name, fn) {
  problems.length = 0;
  try {
    fn();
    if (problems.length) throw new Error(`${problems.length} problem(s):\n         `
      + problems.slice(0, 6).join('\n         '));
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n         ${err.message}`);
  }
}

console.log('SupRemix sprite tests\n');

test('every colour a sprite names actually exists', () => {
  // The cheap half of the same question, and the one that says which key.
  const src = readFileSync('public/js/sprites.js', 'utf8');
  for (const [, key] of src.matchAll(/\bPAL\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (!(key in PAL)) note(`PAL.${key} is used but not defined`);
  }
  for (const [, key] of src.matchAll(/\bSPX\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (!(key in SPX)) note(`SPX.${key} is used but not defined`);
  }
});

test('the palette is made of colours', () => {
  for (const [name, table] of [['PAL', PAL], ['SPX', SPX]]) {
    for (const [k, v] of Object.entries(table)) checkColour(`${name}.${k}`, v);
  }
});

// 16 to 44 is the board's range; 52 is what the legend asks for on a 2x
// display, and 23 is there because an odd number rounds differently.
for (const size of [16, 23, 32, 44, 52]) {
  test(`every sprite builds at ${size}px`, () => {
    const sprites = buildSprites(size);
    const keys = sprites.keys();
    if (keys.length < 40) note(`only ${keys.length} sprites were built`);
    for (const { key, frames } of keys) {
      if (frames < 1) note(`${key} has no frames`);
      for (let f = 0; f < frames; f++) {
        if (!sprites.get(key, f)) note(`${key} frame ${f} is missing`);
      }
    }
  });
}

test('the sprite set covers every tile the packs use', async () => {
  const { parseLevel, T } = await import('../public/js/tiles.js');
  const { loadLevels } = await import('./pack.mjs');
  const sprites = buildSprites(32);
  const seen = new Set();
  for (const [i, def] of loadLevels().entries()) {
    for (const t of parseLevel(def, i).tiles) seen.add(t);
  }
  for (const t of seen) {
    if (t === T.EMPTY || t === T.MURPHY || t === T.EXIT) continue;   // drawn by key
    if (!sprites.has(t)) note(`tile ${t} is on a board with no sprite`);
  }
});

test('every sprite the shell names by hand actually exists', () => {
  // The legend and the renderer ask for a dozen sprites by string key rather
  // than by tile -- 'exit-on', 'base-0', 'murphy-1'. A typo in one of those is
  // a blank square at best and, in the legend, a fatal at boot: it runs before
  // the board does. This is the same idea as the server test that checks every
  // id main.js looks up exists in index.html.
  const sprites = buildSprites(32);
  const src = readFileSync('public/js/main.js', 'utf8')
    + readFileSync('public/js/render.js', 'utf8');
  const named = new Set();
  for (const [, k] of src.matchAll(/\.get\(\s*'([a-z0-9-]+)'/g)) named.add(k);
  for (const [, k] of src.matchAll(/\[T\.\w+,\s*'[^']*',\s*'([a-z0-9-]+)'\]/g)) named.add(k);
  for (const [, k] of src.matchAll(/key\s*=\s*'([a-z0-9-]+)'/g)) named.add(k);
  for (const [, k] of src.matchAll(/return\s*\{\s*key:\s*'([a-z0-9-]+)'/g)) named.add(k);
  if (named.size < 4) note(`only found ${named.size} named keys; the scan is broken`);
  for (const k of named) if (!sprites.has(k)) note(`the shell asks for "${k}", which is not built`);
});

// --- the renderer -----------------------------------------------------------
// The draw path is the other half of the client that nothing was exercising. A
// stub canvas cannot tell you whether it looks right, but it will tell you the
// moment it throws, divides by zero or asks for a colour that is not one --
// which, with no browser to hand, is most of what there is to know.

const { Renderer } = await import('../public/js/render.js');
const { Game } = await import('../public/js/engine.js');
const { parseLevel: parse, T: TILE } = await import('../public/js/tiles.js');
const { loadLevels: levels } = await import('./pack.mjs');
const { playFx } = await import('../public/js/fx.js');

test('the renderer draws a real level without complaint', () => {
  const g = new Game(parse(levels()[0], 0));
  const r = new Renderer(new StubCanvas(1920, 1200));
  r.resize(g);
  r.centreOn(g);
  let now = 0;
  for (let frame = 0; frame < 120; frame++) {
    now += 16.7;
    if (frame % 8 === 0) g.step({ dir: frame % 4, grab: false, plant: false });
    for (const e of g.fx) r.event(e.k, e.i, g);
    r.draw(g, (frame % 7) / 7, now);
  }
});

test('the renderer survives every kind of event the engine reports', () => {
  const g = new Game(parse(levels()[0], 0));
  const r = new Renderer(new StubCanvas(1280, 800));
  r.resize(g);
  for (const k of ['dig', 'infotron', 'boom', 'crystal', 'land', 'port', 'exit',
    'burn', 'creep', 'key', 'unlock', 'boots', 'pickup', 'seal', 'harden',
    'slide', 'die', 'gravity', 'blocked']) {
    playFx(r.fx, k, 4.5, 3.5);
  }
  for (let frame = 0; frame < 40; frame++) r.draw(g, 0.5, frame * 16.7);
});

test('a board carrying every floor and every gadget still draws', () => {
  // The first level of the original set is green field and not much else, so it
  // exercises about a third of the sprite table. This is the rest of it.
  const rows = [
    ':O I=[]"_#%&LJK', 'ScBTeoyr>v<^1234', '|-+acgpACGPwH*E ',
  ];
  const g = new Game(parse({
    name: 'everything', w: 20, h: 8, need: 0,
    rows: ['M'.padEnd(1), ...rows],
    floors: ['', '~@;XF', '~@;XF', '~@;XF'],
  }, 0));
  const r = new Renderer(new StubCanvas(900, 600));
  r.resize(g);
  for (let frame = 0; frame < 24; frame++) r.draw(g, 0.5, frame * 40);
});

// The remastered set is a second way of drawing every original tile, and its
// own path through the renderer: windows laid over two cells, rolling frames,
// snaps and the exit. The atlas image itself is a browser thing, so this hands
// the renderer the real atlas description with a stand-in image, and checks
// every sprite it reaches for is one the atlas has.
const { HD } = await import('../public/js/hd.js');
const packs = await import('../public/js/asset-pack.js');
// The packs hold the original game's material and are not in the public
// repository, so a fresh clone has none: these tests then say so and skip.
const { existsSync } = await import('node:fs');
const havePack = (group) => existsSync('public/' + packs.PACKS[group]);
const skip = (name, why) => console.log(`  skip ${name} (${why})`);
const atlasMeta = havePack('gfx')
  ? JSON.parse(new TextDecoder().decode(packs.readEntry(packs.parsePack(readFileSync('public/' + packs.PACKS.gfx)), 'remaster.json')))
  : null;
const hdTest = atlasMeta ? test : (name) => skip(name, 'no gfx.pak in this copy');

function stubHD() {
  const hd = new HD({ width: 2048, height: 4096 }, atlasMeta);
  const frame = hd.frame.bind(hd);
  hd.asked = new Set();
  hd.frame = (key, i) => {
    if (!hd.has(key)) note(`renderer asked the atlas for "${key}", which it does not have`);
    hd.asked.add(key);
    return frame(key, i);
  };
  return hd;
}

hdTest('the renderer draws a real level with the remastered atlas', () => {
  const g = new Game(parse(levels()[0], 0));
  const r = new Renderer(new StubCanvas(1920, 1200));
  const hd = stubHD();
  r.resize(g);
  r.setHD(hd);
  r.centreOn(g);
  let now = 0;
  for (let frame = 0; frame < 200; frame++) {
    now += 16.7;
    if (frame % 8 === 0) g.step({ dir: [3, 3, 0, 1, 2, 1][(frame / 8) % 6 | 0], grab: frame % 48 === 24, plant: false });
    for (const e of g.fx) r.event(e.k, e.i, g);
    r.draw(g, (frame % 8) / 8, now);
  }
  // and standing still long enough to yawn
  for (let frame = 0; frame < 60; frame++) r.draw(g, 1, now += 200);
  for (const want of ['tile-2', 'tile-3']) if (!hd.asked.has(want)) note(`never drew ${want}`);
});

hdTest('every Murphy move has its remastered animation', () => {
  // A corridor with one of everything in it, walked end to end: dig a base,
  // eat an infotron, take a red disk, shove a zonk and an orange disk, pass a
  // port, then back the other way, and up and down past a yellow disk.
  const g = new Game(parse({
    name: 'moves', w: 26, h: 9, need: 0,
    rows: [
      '                        ',
      '         y            O ',
      'M:Ir  O   o  >        O ',
      '####### ### ############',
      '         y              ',
      '                        ',
      '                       E',
    ],
  }, 0));
  const r = new Renderer(new StubCanvas(1280, 800));
  const hd = stubHD();
  r.resize(g);
  r.setHD(hd);
  let now = 0;
  const run = (dir, steps) => {
    for (let s = 0; s < steps; s++) {
      g.step({ dir, grab: false, plant: false });
      for (const e of g.fx) r.event(e.k, e.i, g);
      for (let f = 0; f <= 8; f++) r.draw(g, f / 8, now += 14);
    }
  };
  run(1, 18);   // right along the corridor, through everything in it
  run(3, 6);    // and back
  for (const want of ['murphy-eat-base-right', 'murphy-eat-infotron-right', 'murphy-eat-red-disk-right',
    'murphy-push-zonk-right', 'murphy-push-orange-disk-right', 'murphy-shove-right', 'murphy-right',
    'murphy-port-right-in', 'murphy-port-right-out', 'murphy-left', 'zonk-roll']) {
    if (!hd.asked.has(want)) note(`a move never drew ${want}`);
  }
});

// The thumbstick's maths, which decides what a thumb on a phone means.
const stick = await import('../public/js/touch.js');

test('the thumbstick snaps to four directions, and only past its dead zone', () => {
  const R = stick.STICK_RADIUS;
  const read = (dx, dy, held = -1) => stick.stickDirection(dx, dy, stick.readStick(dx, dy, R).deflection, held);
  if (read(3, 2) !== -1) note('a resting thumb is not a direction');
  if (read(0, -R) !== 0 || read(R, 0) !== 1 || read(0, R) !== 2 || read(-R, 0) !== 3) note('the four cardinal pushes');
  // near the diagonal, the direction already held stays until the other axis clearly leads
  if (read(R * 0.7, -R * 0.75, 1) !== 1) note('rolling round a corner kept the held direction');
  if (read(R * 0.5, -R * 0.9, 1) !== 0) note('a clear lead switches it');
});

test('the thumbstick base follows a thumb that over-travels', () => {
  const o = stick.dragOrigin(0, 0, 200, 0, stick.STICK_RADIUS);
  if (Math.abs(o.x - (200 - stick.STICK_RADIUS)) > 1e-9 || o.y !== 0) note(`origin dragged to ${o.x},${o.y}`);
  const still = stick.dragOrigin(0, 0, 10, 10, stick.STICK_RADIUS);
  if (still.x !== 0 || still.y !== 0) note('inside the rim the base stays put');
});

// Game controllers: the readings and choices js/gamepad.js makes, without a pad.
const gpad = await import('../public/js/gamepad.js');
const fakePad = ({ buttons = [], axes = [0, 0] } = {}) => ({
  buttons: Array.from({ length: 17 }, (_, i) => (buttons.includes(i) ? { pressed: true, value: 1 } : { pressed: false, value: 0 })),
  axes,
});

test('a controller reads through its dead zone and trigger threshold', () => {
  const B = gpad.BUTTON;
  if (gpad.readPad(fakePad({ axes: [0.12, -0.1] })).stick.magnitude !== 0) note('stick drift read as a push');
  if (gpad.isPadBusy(gpad.readPad(fakePad({ axes: [0.12, -0.1] })))) note('a pad at rest counted as in use');
  const half = fakePad();
  half.buttons[B.RT] = { pressed: false, value: 0.6 };
  if (!gpad.readPad(half).pressed[B.RT]) note('an analog trigger past its threshold');
  if (!gpad.readPad(fakePad({ axes: [0, -0.8] })).menuPressed[B.UP]) note('the stick stands in for the D-pad in menus');
});

test('a controller steers four ways, the D-pad over the stick', () => {
  const B = gpad.BUTTON;
  const dir = (o, held) => gpad.padDirection(gpad.readPad(fakePad(o)), held);
  if (dir({ buttons: [B.LEFT] }) !== 3 || dir({ buttons: [B.DOWN] }) !== 2) note('D-pad directions');
  if (dir({ buttons: [B.UP], axes: [1, 0] }) !== 0) note('the D-pad wins over the stick');
  if (dir({ axes: [0.9, 0.2] }) !== 1) note('the stick snaps to the nearer axis');
  if (dir({ axes: [0.7, -0.75] }, 1) !== 1) note('round a corner the held direction stays');
  if (dir({ buttons: [B.UP, B.RIGHT] }, 0) !== 1) note('a second arrow pressed takes over from the first');
  if (dir({}) !== -1) note('nothing pressed, nowhere to go');
});

test('controller buttons fire once, and menu directions repeat when held', () => {
  const e = new gpad.ButtonEdges();
  const B = gpad.BUTTON;
  const down = (...ids) => Array.from({ length: 16 }, (_, i) => ids.includes(i));
  if (!e.update(down(B.A, B.DOWN), 0).has(B.A)) note('A fires as it goes down');
  if (e.update(down(B.A, B.DOWN), 100).size) note('nothing fires again at once');
  const later = e.update(down(B.A, B.DOWN), gpad.PAD.REPEAT_DELAY_MS + 10);
  if (!later.has(B.DOWN) || later.has(B.A)) note('a held direction repeats; a held A does not');
});

test('menus are walked by where the buttons are, so a grid works as a grid', () => {
  // a 3 x 2 grid of level buttons, and a BACK button under it
  const c = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 60 }, { x: 100, y: 60 }, { x: 200, y: 60 }, { x: 40, y: 140 }];
  const go = (from, d) => gpad.nearestButton(c, from, d);
  if (go(0, 1) !== 1 || go(1, 2) !== 4 || go(4, 3) !== 3 || go(4, 0) !== 1) note('steps along rows and columns');
  if (go(5, 2) !== 6) note('down from the last row reaches BACK');
  if (go(0, 0) !== -1) note('nothing above the top row');
});

const { createRequire: makeRequire } = await import('node:module');
const createRequireFor = (p) => { const req = makeRequire(import.meta.url); delete req.cache[req.resolve(p)]; return req(p); };

// Asset packs (js/asset-pack.js): the graphics, sounds and music ship only as
// scrambled packs, and each pack reads back to exactly what went in.
{
  const fs = await import('node:fs');
  const P = packs;
  const has = (hay, needle) => Buffer.from(hay).includes(Buffer.from(needle));

  test('a pack reads back byte for byte, and is the same every time it is built', () => {
    const files = [
      { name: 'b.png', type: 'image/png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]) },
      { name: 'a.json', type: 'application/json', bytes: new TextEncoder().encode('{"cell":128}') },
      { name: 'empty.wav', type: 'audio/wav', bytes: new Uint8Array(0) },
    ];
    const pack = P.encodePack(files);
    const back = P.parsePack(pack);
    for (const f of files) {
      if (!Buffer.from(P.readEntry(back, f.name)).equals(Buffer.from(f.bytes))) note(f.name + ' did not read back');
    }
    if (!Buffer.from(P.encodePack([...files].reverse())).equals(Buffer.from(pack))) note('the same files made a different pack');
  });

  test('a damaged or foreign pack is refused, not handed to a decoder', () => {
    const pack = P.encodePack([{ name: 'x.png', type: 'image/png', bytes: new Uint8Array(64).fill(7) }]);
    const code = (bytes) => { try { P.readEntry(P.parsePack(bytes), 'x.png'); return 'read'; } catch (e) { return e.code; } };
    const hurt = pack.slice(); hurt[hurt.length - 3] ^= 0xff;
    if (code(hurt) !== 'corrupt') note('a flipped data byte got through');
    if (code(pack.slice(0, pack.length - 1)) !== 'truncated') note('a short pack got through');
    if (code(new TextEncoder().encode('<html>not found</html>')) !== 'format') note('an HTML error page read as a pack');
  });

  (['gfx', 'sfx', 'music'].every(havePack) ? test : (name) => skip(name, 'no asset packs in this copy'))('the shipped packs hold every file the game asks for, unrecognisably', () => {
    const want = {
      gfx: ['remaster.png', 'remaster.json'],
      sfx: ['explosion', 'infotron', 'push', 'fall', 'bug', 'base', 'exit'].map((n) => n + '.wav'),
      music: ['theme.mp3', 'exit.mp3'],
    };
    const magic = { png: [0x89, 0x50, 0x4e, 0x47], wav: [0x52, 0x49, 0x46, 0x46], mp3: null, json: [0x7b] };
    for (const [group, names] of Object.entries(want)) {
      const raw = fs.readFileSync('public/' + P.PACKS[group]);
      const pack = P.parsePack(raw);
      for (const name of names) {
        if (!pack.entries.has(name)) { note(group + ' pack has no ' + name); continue; }
        const bytes = P.readEntry(pack, name);
        const m = magic[name.split('.').pop()];
        if (m && !m.every((b, i) => bytes[i] === b)) note(name + ' does not unpack to its own format');
        if (has(raw, name)) note(group + ' pack names ' + name + ' in plain text');
        if (has(raw, bytes.subarray(0, 12))) note(name + ' starts the same in the pack as in the clear');
      }

    }
  });

  test('no graphics, sound or music is served loose', () => {
    const loose = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = dir + '/' + e.name;
        if (e.isDirectory()) walk(p);
        else if (/\.(png|jpe?g|gif|webp|wav|mp3|ogg|flac)$/i.test(e.name)) loose.push(p);
      }
    };
    walk('public');
    if (loose.length) note('loose in public/: ' + loose.join(', '));
  });

  const { GROUPS } = await import('./pack-assets.mjs');
  test('the packs are up to date with what they are built from', () => {
    for (const [group, g] of Object.entries(GROUPS)) {
      const files = g.files();
      if (!files) continue;                          // a clone without that group's sources
      const file = 'public/' + P.PACKS[group];
      if (!fs.existsSync(file)) { note(group + ': ' + file + ' not built -- node tools/pack-assets.mjs'); continue; }
      const pack = P.parsePack(fs.readFileSync(file));
      if ([...pack.entries.keys()].sort().join() !== files.map((f) => f.name).sort().join()) {
        note(group + ': pack and sources list different files -- node tools/pack-assets.mjs ' + group);
        continue;
      }
      for (const f of files) {
        if (!Buffer.from(P.readEntry(pack, f.name)).equals(Buffer.from(f.bytes))) note(group + ': ' + f.name + ' changed since packing -- node tools/pack-assets.mjs ' + group);
      }
    }
  });

  test('a fresh clone has levels to play: the remix pack is committed and complete', () => {
    const LEVELS = createRequireFor('../levels/remix.js').LEVELS;
    const pack = P.parsePack(fs.readFileSync('public/' + P.PACKS.remix));
    const back = JSON.parse(new TextDecoder().decode(P.readEntry(pack, 'levels.json'))).levels;
    if (back.length !== LEVELS.length) note('remix.pak holds ' + back.length + ' levels, not ' + LEVELS.length);
  });
}

test('the title screen and the README agree on the version', () => {
  const html = readFileSync('public/index.html', 'utf8');
  const shown = /class="credit" data-version="([^"]+)"/.exec(html)?.[1];
  const readme = /\*\*Version ([0-9.]+)\*\*/.exec(readFileSync('README.md', 'utf8'))?.[1];
  if (!shown || shown !== readme) note('index.html says v' + shown + ', the README says ' + readme);
});

// The copy for a webserver (tools/build-site.mjs) is where the original game's
// material goes out, so check what it actually writes: the levels only in a
// pack that reads back whole, nothing of them in the clear, and nothing that
// only development uses.
{
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const name = 'the site copy carries the original levels only in a scrambled pack';
  if (!fs.existsSync('levels/pack.js') || !fs.existsSync('public/' + packs.PACKS.levels)) {
    skip(name, 'no original levels in this copy');
  } else {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'supremix-site-'));
    try {
      execFileSync(process.execPath, ['tools/build-site.mjs', '--out', out], { stdio: 'pipe' });
      const LEVELS = createRequireFor('../levels/pack.js').LEVELS;
      test(name, () => {
        const pack = packs.parsePack(fs.readFileSync(path.join(out, packs.PACKS.levels)));
        const back = JSON.parse(new TextDecoder().decode(packs.readEntry(pack, 'levels.json'))).levels;
        if (back.length !== LEVELS.length) note('the pack holds ' + back.length + ' levels, not ' + LEVELS.length);
        // the longest level names, and a board row, are what would give it away
        const tells = [...LEVELS.map((l) => l.name).filter((n) => n.length >= 8).slice(0, 12), LEVELS[0].rows[3]];
        const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
        for (const f of walk(out)) {
          const bytes = fs.readFileSync(f);
          for (const t of tells) if (bytes.includes(t)) note(path.relative(out, f) + ' shows "' + t.slice(0, 20) + '" in the clear');
        }
        for (const dev of ['package.json', 'tiles.html']) if (fs.existsSync(path.join(out, dev))) note(dev + ' copied');
        if (!fs.existsSync(path.join(out, '.nojekyll'))) note('no .nojekyll');
      });
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
