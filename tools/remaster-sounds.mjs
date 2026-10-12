// Remasters the original Supaplex sound effects into assets/sfx/, then packs
// them into public/packs/sfx.pak (tools/pack-assets.mjs).
// Run with `npm run sounds:remaster` (no arguments, no dependencies).
//
// The original's seven Sound Blaster effects (extracted from BLASTER.SND into
// assets/original/sounds/ by tools/extract-sounds.mjs) are 8-bit mono at
// 8333 Hz: nothing above 4 kHz, a constant hiss, and -- for the explosion --
// a level so crushed it is a wall of mid-band noise. This rebuilds each one as
// the sound it was reaching for, at 44.1 kHz/16-bit stereo, deterministically
// (every random number comes from a PRNG seeded by the effect's name, so a
// rebuild is byte-identical).
//
// What the originals are, by analysis (envelope, autocorrelation and spectral
// peak tracking, spectral centroid, band energy):
//
//   infotron   0.47 s square-ish chime (odd partials): a quick C5-D5-Eb5 step
//              arpeggio (525/576/627 Hz) twice in 180 ms, then C5 held and
//              decaying ~30 dB, its top partials fading first
//   explosion  1.33 s of clipped mid-band noise (300 Hz-2 kHz, centroid
//              ~1.3 kHz) held flat-out for 0.6 s, then decaying; almost no low
//              end -- a "kshhh" standing in for a boom
//   push       0.22 s noisy scrape that starts muffled (centroid 1.2 kHz) and
//              brightens to 2.3 kHz as it swells, then stops in 60 ms
//   fall       0.25 s impact: a bright click, a mid "clack" body (330/505 Hz)
//              at 40-80 ms, then a bright rattle that dies by 0.2 s
//   bug        0.23 s aperiodic broadband crackle, bright (>2 kHz rising from
//              44% to 59% of the energy), flat for 150 ms then a fast fade
//   base       11 ms: one damped ~580 Hz blip, 30 dB down in 6 ms -- a tick
//   exit       1.8 s jingle in Ab major with a shuffle (triplet) rhythm:
//              Ab4 Eb5 F5 Eb5 C5 Ab4 (long) then an Ab/C close, every note a
//              pluck with a bright, noisy attack
//
// What they become:
//
//   infotron   THE ORIGINAL SAMPLE, untouched in pitch and timing: cleanly
//              upsampled (the same windowed sinc and zero-phase DC removal as
//              extract-sounds.mjs, applied here to the exact 8-bit file so this
//              tool needs nothing but the committed originals), the hiss
//              expanded away under its tail, a little air added by exciting the
//              partials it already has above the 4 kHz it was cut off at, a
//              natural fade where the sample was truncated, and a short,
//              bright-damped room with the air band spread in stereo
//   explosion  a crack (wide, band-limited noise, 6 ms), a sub thump whose
//              pitch drops 136 -> 34 Hz, saturated so it still reads on laptop
//              speakers, a crunchy mid body (gritty, saturated pink noise whose
//              band sweeps down from 1.7 kHz), a decorrelated stereo rumble
//              that rolls off as it dies, debris crackle thinning out over a
//              second, all through a dark room reverb (sub kept dry) and a
//              soft-clip glue stage
//   push       a low thump as the weight starts moving, then a stick-slip
//              scrape: jittered friction impulses through a few soft, low-Q
//              resonances, over gritty noise that brightens as it swells
//   fall       a heavy, dull thunk -- a ball with weight landing on board, not
//              a bell: a pitched low thud, a body of low noise, a short damped
//              knock in the low mids that dies before it can ring, a soft
//              contact, and a little grit settling; nothing rings above 600 Hz
//   bug        an electric arc: a jittering, gated, saturated buzz with sizzle
//              and crackle scattered in stereo, every edge eased so it fizzes
//              rather than clicks
//   base       a tiny soft chomp: a short falling "thock" and a muffled crunch,
//              its onset eased -- dry, the quietest of all, because it fires on
//              nearly every step
//   exit       the same tune and rhythm, played on a modern pluck (two
//              detuned saws through an enveloped low-pass, a glassy FM bell on
//              the attack, a noise tick for the original's bright attacks), a
//              soft Ab bass, a final strummed Ab major chord, stereo echo and
//              a lush room
//
// Loudness: each file is normalised to a target momentary loudness (a rough
// K-weighted, 100 ms-window RMS), explosion loudest and base quietest, with
// every peak held at or under -1 dBFS. public/js/audio.js plays them as they
// are, with a per-sound trim. Every file is DC-free, trimmed of silence, faded
// in and out so it never clicks, and TPDF-dithered to 16 bits.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { packGroup } from './pack-assets.mjs';

const RATE = 44100;
const ORIGINALS = 'assets/original/sounds';
const OUT = 'assets/sfx';

// --- basics --------------------------------------------------------------------

const secs = s => Math.max(0, Math.round(s * RATE));
const db = d => 10 ** (d / 20);
const toDb = v => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** mulberry32: small, fast, seedable; every recipe gets its own stream. */
function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (lo, hi) => lo + (hi - lo) * next(), bi: () => next() * 2 - 1 };
}
const seedOf = name => [...name].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

/** A stereo buffer. */
const St = n => ({ L: new Float64Array(n), R: new Float64Array(n) });

/** Multiply a signal in place by an envelope, a function of time in seconds. */
function shape(x, fn) {
  for (let i = 0; i < x.length; i++) x[i] *= fn(i / RATE);
  return x;
}

/** Attack, then exponential decay with time constant tau. */
const ar = (t, attack, tau) => (t < attack ? t / attack : Math.exp(-(t - attack) / tau));
const smoothstep = (a, b, t) => { const u = clamp((t - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };

const peakOf = x => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rmsOf = x => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / Math.max(1, x.length));

/** Scale to a peak of 1 (so layers are mixed by dB, not by accident). */
function norm(x) {
  const p = peakOf(x);
  if (p > 0) for (let i = 0; i < x.length; i++) x[i] /= p;
  return x;
}

/** Soft clip: tanh saturation, normalised so a full-scale input stays full scale. */
function sat(x, drive) {
  const k = Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / k;
  return x;
}

const add = (a, b, g = 1) => { for (let i = 0; i < Math.min(a.length, b.length); i++) a[i] += b[i] * g; return a; };

/** Mix a mono signal into a stereo buffer: equal-power pan (-1..1), start time, gain. */
function place(st, x, { at = 0, gain = 1, pan = 0 } = {}) {
  const a = (clamp(pan, -1, 1) + 1) * Math.PI / 4;
  const gl = Math.cos(a) * Math.SQRT2 * gain, gr = Math.sin(a) * Math.SQRT2 * gain;
  const o = secs(at);
  for (let i = 0; i < x.length && o + i < st.L.length; i++) { st.L[o + i] += x[i] * gl; st.R[o + i] += x[i] * gr; }
  return st;
}

/** Mid/side width: 0 = mono, 1 = as is, >1 = wider. */
function widen(st, amount) {
  for (let i = 0; i < st.L.length; i++) {
    const m = (st.L[i] + st.R[i]) / 2, s = (st.L[i] - st.R[i]) / 2 * amount;
    st.L[i] = m + s; st.R[i] = m - s;
  }
  return st;
}

/** Delay a signal by some seconds (fractional, linearly interpolated), same length. */
function delay(x, sec) {
  const d = sec * RATE, out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const p = i - d, k = Math.floor(p), f = p - k;
    if (k >= 0 && k + 1 < x.length) out[i] = x[k] * (1 - f) + x[k + 1] * f;
    else if (k >= 0 && k < x.length) out[i] = x[k] * (1 - f);
  }
  return out;
}

// --- sources -------------------------------------------------------------------

/** PolyBLEP: removes the aliasing from a saw or square's hard edges. */
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

/** An oscillator; freq is Hz or a function of time in seconds. */
function osc(n, freq, type = 'sine', phase = 0) {
  const f = typeof freq === 'function' ? freq : () => freq;
  const out = new Float64Array(n);
  let p = phase;
  for (let i = 0; i < n; i++) {
    const dt = f(i / RATE) / RATE;
    if (type === 'sine') out[i] = Math.sin(2 * Math.PI * p);
    else if (type === 'saw') out[i] = 2 * p - 1 - blep(p, dt);
    else if (type === 'square') out[i] = (p < 0.5 ? 1 : -1) + blep(p, dt) - blep((p + 0.5) % 1, dt);
    else if (type === 'tri') out[i] = 1 - 4 * Math.abs(p - 0.5);
    p += dt; p -= Math.floor(p);
  }
  return out;
}

const white = (n, r) => Float64Array.from({ length: n }, () => r.bi());

/** Pink noise, Paul Kellet's refined filter: -3 dB/octave, softer than white. */
function pink(n, r) {
  const out = new Float64Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r.bi();
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
}

/** Brown noise: leaky-integrated white, -6 dB/octave -- rumble. */
function brown(n, r) {
  const out = new Float64Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) { y = (y + 0.02 * r.bi()) / 1.02; out[i] = y * 3.5; }
  return out;
}

/** Random steps at about `hz`, smoothed over `glide` seconds: 0..1, for grit and wobble. */
function steps(n, r, hz, glide) {
  const out = new Float64Array(n), a = Math.exp(-1 / (glide * RATE));
  let v = r.next(), y = v, next = 0;
  for (let i = 0; i < n; i++) {
    if (i >= next) { v = r.next(); next = i + secs(r.range(0.5, 1.5) / hz); }
    y = a * y + (1 - a) * v; out[i] = y;
  }
  return out;
}

/** Call cb(t) at random (Poisson) times between from and to, at rate(t) per second. */
function scatter(r, from, to, rate, cb) {
  for (let t = from; ;) {
    t += -Math.log(1 - r.next()) / rate(t);
    if (t >= to) return;
    cb(t);
  }
}

/** A grain: a few ms of band-passed noise with a sharp attack. */
function grain(r, dur, fc, q) {
  const g = biquad(white(secs(dur), r), 'bandpass', fc, q);
  // an onset under ~0.5 ms is heard as a click, whatever is in the grain
  return shape(g, t => ar(t, Math.max(0.0006, dur / 8), dur / 3));
}

// --- filters -------------------------------------------------------------------

/**
 * RBJ cookbook biquad. freq may be a function of time in seconds (a sweep);
 * its coefficients are then recomputed every 16 samples.
 */
function biquad(x, type, freq, q = Math.SQRT1_2, gainDb = 0) {
  const out = new Float64Array(x.length);
  let b0, b1, b2, a1, a2;
  const set = f => {
    const w = 2 * Math.PI * clamp(f, 10, RATE * 0.45) / RATE, cw = Math.cos(w), sw = Math.sin(w);
    const al = sw / (2 * q), A = 10 ** (gainDb / 40);
    let c;
    switch (type) {
      case 'lowpass': c = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + al, -2 * cw, 1 - al]; break;
      case 'highpass': c = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + al, -2 * cw, 1 - al]; break;
      case 'bandpass': c = [al, 0, -al, 1 + al, -2 * cw, 1 - al]; break; // 0 dB peak
      case 'peaking': c = [1 + al * A, -2 * cw, 1 - al * A, 1 + al / A, -2 * cw, 1 - al / A]; break;
      case 'lowshelf': case 'highshelf': {
        const rA = 2 * Math.sqrt(A) * al;
        if (type === 'lowshelf') c = [A * ((A + 1) - (A - 1) * cw + rA), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - rA),
          (A + 1) + (A - 1) * cw + rA, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - rA];
        else c = [A * ((A + 1) + (A - 1) * cw + rA), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - rA),
          (A + 1) - (A - 1) * cw + rA, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - rA];
        break;
      }
      default: throw new Error(`unknown filter ${type}`);
    }
    b0 = c[0] / c[3]; b1 = c[1] / c[3]; b2 = c[2] / c[3]; a1 = c[4] / c[3]; a2 = c[5] / c[3];
  };
  const sweep = typeof freq === 'function';
  if (!sweep) set(freq);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (sweep && (i & 15) === 0) set(freq(i / RATE));
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; out[i] = y;
  }
  return out;
}

/** One-pole high-pass run forwards then backwards: removes DC without phase smear. */
function dcBlock(x, rate = RATE, hz = 15) {
  const pass = arr => {
    const a = Math.exp(-2 * Math.PI * hz / rate), out = new Float64Array(arr.length);
    let px = arr[0] || 0, py = 0;
    for (let i = 0; i < arr.length; i++) { py = a * (py + arr[i] - px); px = arr[i]; out[i] = py; }
    return out;
  };
  return pass(pass(x).reverse()).reverse();
}

// --- space ---------------------------------------------------------------------

// Freeverb's tunings (Jezar, public domain): eight damped combs into four
// allpasses per side, the right side's delays spread a few samples longer so
// the two sides decorrelate. Each comb's feedback is set from the decay time
// asked for (RT60) instead of a "room size", so a recipe says what it means.
const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASSES = [556, 441, 341, 225];
const SPREAD = 23;

/**
 * The reverb of a stereo signal, wet only, extended by `tail` seconds. Its
 * level is set relative to the dry signal: wet RMS = dry RMS * db(level).
 */
function reverb(st, { decay = 1, damp = 0.5, level = -12, predelay = 0.01, hp = 200, lp = 9000, width = 1, tail = decay }) {
  const n = st.L.length + secs(tail);
  let inp = new Float64Array(n);
  for (let i = 0; i < st.L.length; i++) inp[i] = (st.L[i] + st.R[i]) / 2;
  inp = delay(biquad(biquad(inp, 'highpass', hp), 'lowpass', lp), predelay);
  const side = off => ({
    combs: COMBS.map(len => ({ buf: new Float64Array(len + off), i: 0, store: 0, fb: 10 ** (-3 * (len + off) / RATE / decay) })),
    aps: ALLPASSES.map(len => ({ buf: new Float64Array(len + off), i: 0 })),
  });
  const d = damp * 0.4;
  const run = s => {
    const out = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const x = inp[k] * 0.015;
      let acc = 0;
      for (const c of s.combs) {
        const y = c.buf[c.i];
        c.store = y * (1 - d) + c.store * d;
        c.buf[c.i] = x + c.store * c.fb;
        if (++c.i >= c.buf.length) c.i = 0;
        acc += y;
      }
      for (const a of s.aps) {
        const b = a.buf[a.i];
        a.buf[a.i] = acc + b * 0.5;
        acc = b - acc;
        if (++a.i >= a.buf.length) a.i = 0;
      }
      out[k] = acc;
    }
    return out;
  };
  const wl = run(side(0)), wr = run(side(SPREAD));
  const w1 = width / 2 + 0.5, w2 = (1 - width) / 2;
  const wet = St(n);
  for (let i = 0; i < n; i++) { wet.L[i] = wl[i] * w1 + wr[i] * w2; wet.R[i] = wr[i] * w1 + wl[i] * w2; }
  const dry = Math.hypot(rmsOf(st.L), rmsOf(st.R)), got = Math.hypot(rmsOf(wet.L), rmsOf(wet.R));
  const g = got > 0 ? dry * db(level) / got : 0;
  for (let i = 0; i < n; i++) { wet.L[i] *= g; wet.R[i] *= g; }
  return wet;
}

/** Dry plus its reverb, the result as long as the reverb. */
function withReverb(st, opts) {
  const wet = reverb(st, opts);
  add(wet.L, st.L); add(wet.R, st.R);
  return wet;
}

/** Stereo echo: left and right taps at their own times, damped feedback. */
function echo(st, { left, right, feedback = 0.3, level = 0.2, lp = 3500, tail = 0.6 }) {
  const n = st.L.length + secs(tail), out = St(n);
  const dl = secs(left), dr = secs(right);
  const bl = new Float64Array(n), br = new Float64Array(n);
  const a = Math.exp(-2 * Math.PI * lp / RATE);
  let zl = 0, zr = 0;
  for (let i = 0; i < n; i++) {
    const inL = i < st.L.length ? st.L[i] : 0, inR = i < st.R.length ? st.R[i] : 0;
    const el = i >= dl ? bl[i - dl] : 0, er = i >= dr ? br[i - dr] : 0;
    zl = a * zl + (1 - a) * el; zr = a * zr + (1 - a) * er;
    // cross-fed, so the echo walks from side to side
    bl[i] = inL * 0.7 + inR * 0.3 + zr * feedback;
    br[i] = inR * 0.7 + inL * 0.3 + zl * feedback;
    out.L[i] = inL + zl * level; out.R[i] = inR + zr * level;
  }
  return out;
}

// --- the original samples ------------------------------------------------------

/** Read a PCM WAV (8- or 16-bit) as mono floats. */
function readWav(file) {
  const b = readFileSync(file);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('latin1', p, p + 4), len = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') data = b.subarray(p + 8, p + 8 + len);
    p += 8 + len + (len & 1);
  }
  const n = data.length / (fmt.bits / 8) / fmt.ch, x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < fmt.ch; c++) {
      const k = i * fmt.ch + c;
      s += fmt.bits === 8 ? (data[k] - 128) / 128 : data.readInt16LE(k * 2) / 32768;
    }
    x[i] = s / fmt.ch;
  }
  return { rate: fmt.rate, x };
}

/** Resample with a Blackman-windowed sinc, cut off just under the source's Nyquist (as extract-sounds.mjs). */
function resample(x, from, to) {
  const ratio = to / from, n = Math.ceil(x.length * ratio), half = 24, cutoff = 0.92;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / ratio, c = Math.floor(t);
    let s = 0, ws = 0;
    for (let k = c - half + 1; k <= c + half; k++) {
      if (k < 0 || k >= x.length) continue;
      const d = t - k;
      const sinc = d === 0 ? 1 : Math.sin(Math.PI * d * cutoff) / (Math.PI * d * cutoff);
      const w = 0.42 + 0.5 * Math.cos(Math.PI * d / half) + 0.08 * Math.cos(2 * Math.PI * d / half);
      s += x[k] * sinc * w; ws += sinc * w;
    }
    out[i] = ws ? s / ws : 0;
  }
  return out;
}

/** An original effect at 44.1 kHz: DC removed at its own rate, then upsampled. */
function original(name) {
  const { rate, x } = readWav(join(ORIGINALS, `${name}.wav`));
  return resample(dcBlock(x, rate), rate, RATE);
}

/** Downward expander: below the threshold, quiet gets quieter (the 8-bit hiss goes). */
function expand(x, { threshold, ratio = 2, attack = 0.001, release = 0.04 }) {
  const out = new Float64Array(x.length);
  const aa = Math.exp(-1 / (attack * RATE)), ra = Math.exp(-1 / (release * RATE)), ga = Math.exp(-1 / (0.004 * RATE));
  let env = 0, g = 1;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]);
    env = v > env ? aa * env + (1 - aa) * v : ra * env + (1 - ra) * v;
    const want = env >= threshold ? 1 : (env / threshold) ** (ratio - 1);
    g = ga * g + (1 - ga) * want;
    out[i] = x[i] * g;
  }
  return out;
}

// --- recipes -------------------------------------------------------------------

// The infotron is the one everybody remembers, so it is the original: same
// sample, same pitch, same timing. Only the 8 kHz limits are lifted.
function infotron(r) {
  let core = original('infotron');
  const len = core.length / RATE;
  // the hiss under the tail: an expander well below the tone (which starts
  // ~40 dB above the 8-bit noise floor) only acts as the tone dies
  core = expand(core, { threshold: peakOf(core) * db(-40), ratio: 2.5 });
  // the sample was cut off while still ringing; let it finish ringing instead
  shape(core, t => 1 - smoothstep(len - 0.09, len, t) * 0.97);
  core = biquad(core, 'highpass', 220, 0.7);
  core = biquad(core, 'highshelf', 2600, 0.7, 2); // open the top it does have
  // air: saturate the partials above 1.8 kHz (the square's 5th and 7th) to grow
  // the 9th, 11th... the 8 kHz original could not store, and keep only those
  let air = biquad(biquad(core, 'highpass', 1800, 0.7), 'highpass', 1800, 0.7);
  air = sat(norm(air), 3);
  air = biquad(biquad(air, 'highpass', 4300, 0.7), 'highpass', 4300, 0.7);
  air = biquad(air, 'lowpass', 13000, 0.7);
  const airGain = rmsOf(core) * db(-17) / rmsOf(air);
  const n = core.length, out = St(n);
  place(out, core);
  // the air band spread a little: a few tenths of a millisecond apart
  place(out, air, { gain: airGain * 0.8, pan: -0.6 });
  place(out, delay(air, 0.00045), { gain: airGain * 0.8, pan: 0.6 });
  return withReverb(out, { decay: 0.55, damp: 0.55, level: -15, predelay: 0.014, hp: 450, lp: 9000, tail: 0.4 });
}

function explosion(r) {
  const n = secs(1.6), out = St(n), wetIn = St(n);

  // crack: the instant of the blast, a few ms of band-limited noise, wide
  for (const pan of [-0.5, 0.5]) {
    let c = white(secs(0.04), r);
    c = biquad(c, 'highpass', 650, 0.7);
    c = biquad(c, 'peaking', 2400, 0.9, 5);
    c = biquad(c, 'lowpass', 8000, 0.7);
    shape(c, t => ar(t, 0.0004, 0.006));
    place(wetIn, sat(norm(c), 2.5), { gain: db(-3), pan });
  }

  // thump: a sine falling from 136 Hz to 34 Hz, saturated so its harmonics
  // carry the weight on speakers that cannot play 40 Hz
  let sub = osc(secs(1.1), t => 34 + 88 * Math.exp(-t / 0.08) + 14 * Math.exp(-t / 0.4));
  shape(sub, t => ar(t, 0.0015, 0.28));
  sub = biquad(sat(norm(sub), 2.4), 'lowpass', 420, 0.7);
  place(out, norm(sub), { gain: db(-3) });

  // body: gritty pink noise, its band sweeping down from 1.7 kHz to 230 Hz,
  // driven hard and low-passed again so the crunch never turns to fizz
  for (const pan of [-0.3, 0.3]) {
    const m = secs(1.0);
    let b = pink(m, r);
    const grit = steps(m, r, 70, 0.0015);
    for (let i = 0; i < m; i++) b[i] *= 0.35 + 0.65 * grit[i];
    b = biquad(b, 'bandpass', t => 230 + 1500 * Math.exp(-t / 0.06), 0.8);
    shape(b, t => ar(t, 0.003, 0.14) + 0.22 * ar(t, 0.003, 0.45));
    b = sat(norm(b), 4);
    b = biquad(biquad(b, 'lowpass', 3000, 0.7), 'lowpass', 3000, 0.7);
    b = biquad(b, 'highpass', 90, 0.7);
    place(wetIn, norm(b), { gain: db(3), pan });
  }

  // rumble: brown noise per side (so it fills the stereo field), darkening
  // and wobbling as it rolls away
  for (const pan of [-0.8, 0.8]) {
    let u = brown(n, r);
    u = biquad(u, 'lowpass', t => 100 + 420 * Math.exp(-t / 0.35), 0.9);
    const wob = steps(n, r, 7, 0.03);
    for (let i = 0; i < n; i++) u[i] *= 0.7 + 0.3 * wob[i];
    shape(u, t => (1 - Math.exp(-t / 0.04)) * Math.exp(-t / 0.42));
    place(wetIn, norm(u), { gain: db(1), pan });
  }

  // debris: crackle that starts dense and thins out over a second
  scatter(r, 0.02, 1.25, t => 80 * Math.exp(-t / 0.28) + 6, t => {
    const g = grain(r, r.range(0.0015, 0.006), r.range(1200, 4200), r.range(1.5, 4));
    place(wetIn, norm(g), { at: t, gain: db(-13) * Math.exp(-t / 0.4) * (0.3 + 0.7 * r.next() ** 2), pan: r.bi() * 0.85 });
  });

  // a dark room around everything but the sub, which stays dry and tight
  const room = withReverb(wetIn, { decay: 1.2, damp: 0.65, level: -8, predelay: 0.012, hp: 180, lp: 5500, tail: 0.1 });
  add(room.L, out.L); add(room.R, out.R);
  // glue: a gentle soft clip over the whole blast
  const p = Math.max(peakOf(room.L), peakOf(room.R));
  for (const ch of [room.L, room.R]) { for (let i = 0; i < ch.length; i++) ch[i] /= p; sat(ch, 1.6); }
  return room;
}

function push(r) {
  const n = secs(0.3), out = St(n);
  // the weight starting to move
  let th = osc(secs(0.2), t => 62 + 70 * Math.exp(-t / 0.02));
  shape(th, t => ar(t, 0.002, 0.055));
  place(out, sat(norm(th), 2), { gain: db(-2) });
  let knock = biquad(pink(secs(0.06), r), 'lowpass', 700, 0.8);
  shape(knock, t => ar(t, 0.0008, 0.012));
  place(out, norm(knock), { gain: db(-9) });

  // the scrape: stick-slip friction, impulses at a jittered ~90 Hz ringing the
  // shell's resonances, over grit that brightens as the push swells (as the
  // original's does), then stops
  const env = t => (0.3 + 0.7 * smoothstep(0, 0.12, t)) * (t < 0.16 ? 1 : Math.exp(-(t - 0.16) / 0.028));
  for (const pan of [-0.35, 0.35]) {
    const imp = new Float64Array(n);
    for (let t = 0.008; t < 0.26; t += r.range(0.6, 1.4) / 90) imp[secs(t)] += (0.5 + 0.5 * r.next()) * (r.next() < 0.5 ? -1 : 1);
    const metal = new Float64Array(n);
    [[1180, 1], [1750, 0.6], [2450, 0.35]].forEach(([f, a]) => add(metal, biquad(imp, 'bandpass', f * r.range(0.98, 1.02), 5), a));
    let grit = white(n, r);
    const rough = steps(n, r, 90, 0.001);
    for (let i = 0; i < n; i++) grit[i] *= 0.3 + 0.7 * rough[i];
    grit = biquad(grit, 'bandpass', t => 850 + 950 * smoothstep(0, 0.14, t), 0.8);
    const sc = add(norm(grit), norm(metal), db(-13));
    shape(sc, env);
    place(out, biquad(sat(norm(sc), 2.2), 'lowpass', 3800, 0.7), { gain: db(-3), pan });
    // and the weight rolling under it, low and rough
    let roll = brown(n, r);
    for (let i = 0; i < n; i++) roll[i] *= 0.5 + 0.5 * rough[i];
    roll = biquad(roll, 'bandpass', 260, 1.2);
    shape(roll, env);
    place(out, norm(roll), { gain: db(-8), pan: pan * 0.5 });
  }
  return withReverb(out, { decay: 0.35, damp: 0.5, level: -15, predelay: 0.006, hp: 250, tail: 0.15 });
}

function fall(r) {
  const n = secs(0.45), out = St(n);
  // The weight. A zonk is heavy, so the landing is felt more than heard: a
  // pitched thud that drops fast, warmed rather than distorted.
  let th = osc(secs(0.32), t => 52 + 110 * Math.exp(-t / 0.018));
  shape(th, t => ar(t, 0.002, 0.075));
  place(out, sat(norm(th), 1.8), { gain: db(-2) });
  // its body: low noise, centred where the original's "clack" was (~300 Hz)
  // but dull, gone in a few tens of milliseconds
  let mass = biquad(biquad(pink(secs(0.2), r), 'lowpass', 520, 0.8), 'peaking', 190, 1, 6);
  shape(mass, t => ar(t, 0.0018, 0.045));
  place(out, norm(mass), { gain: db(-2) });
  // the knock: two low, heavily damped modes -- a hollow, woody "tok" that is
  // over before it could ring, which is all that separates a knock from a bell
  for (const [f, tau, g, pan] of [[230, 0.02, 0, -0.2], [395, 0.013, -4, 0.2]]) {
    const m = osc(secs(0.12), t => f * (1 + 0.04 * Math.exp(-t / 0.006)), 'sine', r.next());
    shape(m, t => ar(t, 0.0015, tau));
    place(out, m, { at: 0.001, gain: db(-7 + g), pan });
  }
  // the contact: soft, low-passed, only the first instant of the impact
  let contact = biquad(biquad(white(secs(0.012), r), 'highpass', 900, 0.7), 'lowpass', 3200, 0.7);
  shape(contact, t => ar(t, 0.0012, 0.003));
  place(out, norm(contact), { gain: db(-20) });
  // grit settling round it: a few muffled grains, not a rattle
  scatter(r, 0.012, 0.11, t => 45 * Math.exp(-t / 0.04) + 3, t => {
    place(out, norm(grain(r, r.range(0.003, 0.007), r.range(700, 1600), 1.5)), { at: t, gain: db(-27) * Math.exp(-t / 0.05), pan: r.bi() * 0.5 });
  });
  const dull = { L: biquad(out.L, 'lowpass', 4500, 0.7), R: biquad(out.R, 'lowpass', 4500, 0.7) };
  return withReverb(dull, { decay: 0.35, damp: 0.65, level: -18, predelay: 0.006, hp: 200, lp: 3500, tail: 0.15 });
}

function bug(r) {
  const n = secs(0.26), out = St(n);
  const env = t => ar(t, 0.002, 0.6) * (t < 0.15 ? 1 : Math.exp(-(t - 0.15) / 0.025));
  // the arc: a jittering buzz, switched hard on and off as the spark strikes
  const gate = new Float64Array(n);
  for (let i = 0, on = true; i < n;) {
    const len = secs(r.range(0.003, 0.022));
    for (let k = 0; k < len && i < n; k++, i++) gate[i] = on ? 1 : 0.08;
    on = r.next() < 0.75;
  }
  const g = biquad(biquad(gate, 'lowpass', 500, 0.7), 'lowpass', 500, 0.7);
  const jit = steps(n, r, 60, 0.002);
  let buzz = osc(n, t => 110 * (1 + 0.1 * (jit[Math.min(n - 1, secs(t))] - 0.5)), 'saw');
  add(buzz, osc(n, t => 163 * (1 + 0.1 * (jit[Math.min(n - 1, secs(t))] - 0.5)), 'saw'), 0.6);
  for (let i = 0; i < n; i++) buzz[i] *= g[i];
  buzz = sat(norm(biquad(buzz, 'highpass', 400, 0.7)), 6);
  buzz = biquad(buzz, 'bandpass', 2200, 0.7);
  norm(shape(buzz, env));
  place(out, buzz, { gain: db(-4), pan: -0.15 });
  place(out, delay(buzz, 0.0006), { gain: db(-4), pan: 0.15 });
  // sizzle riding the gate
  let sz = biquad(white(n, r), 'bandpass', 5200, 1);
  for (let i = 0; i < n; i++) sz[i] *= g[i];
  shape(sz, env);
  place(out, norm(sz), { gain: db(-15), pan: 0 });
  // crackle: sharp impulses scattered across the field, a few of them big
  scatter(r, 0.002, 0.2, () => 260, t => {
    let c = biquad(white(secs(r.range(0.0003, 0.0015)), r), 'highpass', 2500, 0.7);
    c = biquad(shape(c, u => ar(u, 0.0004, 0.0006)), 'lowpass', 6500, 0.7);
    place(out, norm(c), { at: t, gain: db(-12) * r.next() ** 3 * env(t), pan: r.bi() * 0.8 });
  });
  const lp = { L: biquad(out.L, 'lowpass', 9500, 0.7), R: biquad(out.R, 'lowpass', 9500, 0.7) };
  return withReverb(lp, { decay: 0.3, damp: 0.4, level: -16, predelay: 0.004, hp: 500, tail: 0.1 });
}

function base(r) {
  const n = secs(0.11), out = St(n);
  // a soft "thock": the original's ~580 Hz blip, lower and rounder, eased in
  let th = osc(n, t => 260 + 200 * Math.exp(-t / 0.007));
  shape(th, t => ar(t, 0.0025, 0.014));
  place(out, norm(th), { gain: db(-3) });
  // a muffled crunch: a few grains, low-passed so a thousand of them never grate
  [[0.001, 1], [r.range(0.008, 0.012), 0.6], [r.range(0.018, 0.024), 0.4], [r.range(0.03, 0.038), 0.22]].forEach(([at, a], k) => {
    const gr = biquad(grain(r, r.range(0.004, 0.007), r.range(900, 1700), 1), 'lowpass', 2800, 0.7);
    place(out, norm(gr), { at, gain: db(-5) * a, pan: k % 2 ? 0.2 : -0.2 });
  });
  let body = biquad(pink(n, r), 'lowpass', 900, 0.7);
  shape(body, t => ar(t, 0.001, 0.015));
  place(out, norm(body), { gain: db(-12) });
  return out;
}

// The original exit jingle, note for note: [onset s, MIDI note]. Its onsets
// (0, .25, .37, .61, .73, .965, 1.405 s) are a triplet shuffle; played here
// 7% brisker so the final chord can ring out inside two seconds.
const EXIT_TUNE = [[0, 68], [0.25, 75], [0.37, 77], [0.61, 75], [0.73, 72], [0.965, 68]];
const EXIT_CHORD = { at: 1.405, notes: [56, 68, 72, 75, 80] }; // Ab3 Ab4 C5 Eb5 Ab5
const EXIT_TEMPO = 0.93;
const hz = m => 440 * 2 ** ((m - 69) / 12);

function exitTune(r) {
  const n = secs(2.0), out = St(n);
  // a modern pluck: two detuned saws through an enveloped low-pass, a glassy
  // FM bell on the attack, and a tick of noise where the original's attacks were
  const pluck = (at, midi, dur, vel, pan) => {
    const f = hz(midi), m = secs(dur);
    const env = t => (0.62 * Math.exp(-t / 0.12) + 0.38 * Math.exp(-t / 0.7)) * Math.min(1, t / 0.003) * (1 - smoothstep(dur - 0.06, dur, t));
    for (const [cents, side] of [[-7, -1], [7, 1]]) {
      let v = osc(m, f * 2 ** (cents / 1200), 'saw', r.next());
      add(v, osc(m, f / 2, 'square', 0), 0.18);
      v = biquad(v, 'lowpass', t => f * 2 + 5200 * Math.exp(-t / 0.07), 1.1);
      shape(v, env);
      place(out, v, { at, gain: vel * 0.5, pan: clamp(pan + side * 0.35, -1, 1) });
    }
    // FM bell: carrier an octave up, modulator at twice that, index decaying
    const bell = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      const t = i / RATE, idx = 2.2 * Math.exp(-t / 0.05);
      bell[i] = Math.sin(2 * Math.PI * 2 * f * t + idx * Math.sin(2 * Math.PI * 4 * f * t)) * Math.exp(-t / 0.22) * Math.min(1, t / 0.002);
    }
    place(out, shape(bell, t => 1 - smoothstep(dur - 0.06, dur, t)), { at, gain: vel * 0.22, pan: -pan });
    let tick = biquad(white(secs(0.02), r), 'highpass', 3000, 0.7);
    shape(tick, t => ar(t, 0.0002, 0.004));
    place(out, tick, { at, gain: vel * 0.12, pan });
  };
  const bass = (at, midi, dur, vel) => {
    let b = osc(secs(dur), hz(midi), 'tri');
    add(b, osc(secs(dur), hz(midi)), 0.5);
    shape(b, t => Math.min(1, t / 0.006) * Math.exp(-t / 0.45) * (1 - smoothstep(dur - 0.08, dur, t)));
    place(out, b, { at, gain: vel });
  };

  const tune = EXIT_TUNE.map(([t, m]) => [t * EXIT_TEMPO, m]);
  const chordAt = EXIT_CHORD.at * EXIT_TEMPO;
  tune.forEach(([at, midi], k) => {
    const next = k + 1 < tune.length ? tune[k + 1][0] : chordAt;
    pluck(at, midi, next - at + 0.08, k === 0 || k === tune.length - 1 ? 1 : 0.85, (k % 2 ? 0.2 : -0.2));
  });
  bass(0, 44, chordAt, 0.35); // Ab2 under the run
  // the close: an Ab major chord, strummed upwards
  EXIT_CHORD.notes.forEach((midi, k) => pluck(chordAt + k * 0.012, midi, 2.0 - chordAt - k * 0.012, k === 0 ? 0.55 : 0.75, (k - 2) * 0.25));
  bass(chordAt, 44, 2.0 - chordAt, 0.4);

  const fx = echo(out, { left: 0.112 * EXIT_TEMPO * 2, right: 0.112 * EXIT_TEMPO * 3, feedback: 0.3, level: 0.18, tail: 0.1 });
  return withReverb(fx, { decay: 1.3, damp: 0.45, level: -10, predelay: 0.02, hp: 300, lp: 8000, tail: 0.1 });
}

// name, recipe, target momentary loudness (dB, rough K-weighting), fade-out,
// longest it may run
const RECIPES = [
  { name: 'explosion', render: explosion, loud: -9, fadeOut: 0.3, max: 1.6 },
  { name: 'infotron', render: infotron, loud: -13, fadeOut: 0.12, max: 0.9 },
  { name: 'push', render: push, loud: -16, fadeOut: 0.06, max: 0.5 },
  { name: 'fall', render: fall, loud: -15, fadeOut: 0.08, max: 0.6 },
  { name: 'bug', render: bug, loud: -17, fadeOut: 0.05, max: 0.45 },
  { name: 'base', render: base, loud: -26, fadeOut: 0.03, max: 0.15 },
  { name: 'exit', render: exitTune, loud: -12, fadeOut: 0.35, max: 2.0 },
];
const CEILING = -1.1; // dBFS, leaving the dither room under -1

// --- finishing -----------------------------------------------------------------

/** Momentary loudness: the loudest 100 ms of a rough K-weighted mono sum. */
function loudness({ L, R }) {
  const k = x => biquad(biquad(x, 'highpass', 80, 0.5), 'highshelf', 1500, 0.707, 4);
  const a = k(L), b = k(R), w = secs(0.1), hop = secs(0.01);
  let best = 0;
  for (let s = 0; s < a.length; s += hop) {
    let e = 0;
    const end = Math.min(a.length, s + w);
    for (let i = s; i < end; i++) e += (a[i] * a[i] + b[i] * b[i]) / 2;
    best = Math.max(best, e / w);
  }
  return 10 * Math.log10(best || 1e-20);
}

/** DC out, silence trimmed, faded, set to its loudness under the ceiling. */
function finish(st, { loud, fadeOut, max }) {
  let { L, R } = st;
  L = dcBlock(L); R = dcBlock(R);
  const pk = Math.max(peakOf(L), peakOf(R)), floor = pk * db(-60);
  const loudAt = i => Math.max(Math.abs(L[i]), Math.abs(R[i])) > floor;
  let start = 0, end = L.length;
  while (start < end && !loudAt(start)) start++;
  while (end > start && !loudAt(end - 1)) end--;
  // Let it ring out. The end is where its level -- a 5 ms average, so one
  // quiet sample does not count -- has fallen 54 dB under the peak, and the
  // fade-out finishes there: a sound is never cut while it is still audible,
  // which is what made the old short endings tick. `max` is only a backstop.
  const w = secs(0.005), quiet = pk * db(-54);
  const level = i => { let s = 0; for (let k = Math.max(start, i - w); k < i; k++) s += L[k] * L[k] + R[k] * R[k]; return Math.sqrt(s / (2 * w)); };
  let natural = end;
  while (natural > start + w && level(natural) < quiet) natural -= secs(0.001);
  end = Math.min(end, Math.max(natural, start + w), start + secs(max));
  L = L.slice(start, end); R = R.slice(start, end);
  // an onset of a few milliseconds still reads as instant, but never clicks
  const fi = secs(0.003), fo = Math.min(secs(Math.max(fadeOut, 0.04)), Math.floor(L.length * 0.6));
  for (let i = 0; i < L.length; i++) {
    let g = 1;
    if (i < fi) g *= 0.5 - 0.5 * Math.cos(Math.PI * i / fi);
    const j = L.length - 1 - i;
    if (j < fo) g *= 0.5 - 0.5 * Math.cos(Math.PI * j / fo);
    L[i] *= g; R[i] *= g;
  }
  // a transient this short keeps a residual offset the high-pass cannot reach;
  // take out its exact mean under a Hann window, so the ends stay at zero
  for (const ch of [L, R]) {
    const w = i => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (ch.length - 1));
    const mean = ch.reduce((s, v) => s + v, 0) / ch.length;
    for (let i = 0; i < ch.length; i++) ch[i] -= mean * 2 * w(i);
  }
  const lu = loudness({ L, R }), p = Math.max(peakOf(L), peakOf(R));
  const gain = Math.min(db(loud - lu), db(CEILING) / p);
  for (let i = 0; i < L.length; i++) { L[i] *= gain; R[i] *= gain; }
  return { L, R, limited: gain < db(loud - lu) - 1e-9 };
}

/** 16-bit stereo WAV, TPDF-dithered. */
function wav({ L, R }, r) {
  const n = L.length, data = Buffer.alloc(n * 4), q = [];
  for (let i = 0; i < n; i++) {
    for (const [c, ch] of [[0, L], [1, R]]) {
      const v = clamp(Math.round(ch[i] * 32767 + (r.next() - r.next())), -32767, 32767);
      data.writeInt16LE(v, i * 4 + c * 2); q.push(v);
    }
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return { bytes: Buffer.concat([h, data]), samples: q };
}

mkdirSync(OUT, { recursive: true });
console.log('name        length   peak dBFS  RMS dBFS  loudness  DC        clipped  ends');
for (const rec of RECIPES) {
  const r = rng(seedOf(rec.name));
  const st = finish(rec.render(r), rec);
  const { bytes, samples } = wav(st, r);
  writeFileSync(join(OUT, `${rec.name}.wav`), bytes);
  // report from the 16-bit samples actually written
  const f = samples.map(v => v / 32768);
  const pk = f.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const dc = f.reduce((s, v) => s + v, 0) / f.length;
  const clipped = samples.filter(v => Math.abs(v) >= 32767).length;
  const ends = Math.max(...[0, 1, f.length - 2, f.length - 1].map(i => Math.abs(samples[i])));
  console.log(`${rec.name.padEnd(10)}  ${(st.L.length / RATE).toFixed(3)} s  ${toDb(pk).toFixed(2).padStart(8)}  ${toDb(rmsOf(f)).toFixed(2).padStart(8)}  ${loudness(st).toFixed(1).padStart(8)}${st.limited ? '*' : ' '} ${dc.toExponential(1).padStart(8)}  ${String(clipped).padStart(7)}  ${ends} LSB`);
}
console.log('* held down by the peak ceiling rather than reaching its loudness target');
packGroup('sfx');
