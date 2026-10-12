// Extracts the original Supaplex sound effects from BLASTER.SND.
// Run with `npm run sounds -- <path to the Supaplex folder>`.
//
// BLASTER.SND is the game's Sound Blaster driver: a DOS code module with the
// effects stored after the code as seven Creative Voice Files (.VOC), one per
// effect, each a single block of 8-bit unsigned mono PCM at 8333 Hz. The driver
// keeps a table of their offsets at 0x8FA8, in the order the game asks for
// them: explosion, infotron, push, fall, bug, base, exit. They are found here
// by their own signature and checked against that table.
//
// Each is written twice:
//   assets/original/sounds/NAME.wav       exactly as stored: 8-bit, 8333 Hz
//   assets/original/sounds-44k/NAME.wav   a clean reference copy: 16-bit, 44.1 kHz
//
// Neither is what the game plays: public/sfx/ belongs to
// tools/remaster-sounds.mjs (`npm run sounds:remaster`), which rebuilds the
// effects from the exact originals above.
//
// The reference copy is the same sound, made to survive modern playback: upsampled
// with a windowed-sinc filter (so the 8 kHz stair-steps do not alias into
// whine), its DC offset removed, its edges faded over a couple of milliseconds
// so it starts and stops without a click, and the 8-bit hiss in its silent tail
// gated out. All seven share one gain, so their loudness against each other is
// what the original had.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.argv[2];
if (!SRC || !existsSync(join(SRC, 'BLASTER.SND'))) {
  console.error('usage: node tools/extract-sounds.mjs <Supaplex folder>');
  process.exit(1);
}

export const NAMES = ['explosion', 'infotron', 'push', 'fall', 'bug', 'base', 'exit'];
const RAW_OUT = 'assets/original/sounds';
const CLEAN_OUT = 'assets/original/sounds-44k';
const RATE_OUT = 44100;

// --- reading -------------------------------------------------------------------

const snd = readFileSync(join(SRC, 'BLASTER.SND'));
const SIG = Buffer.from('Creative Voice File\x1a', 'latin1');

function readVoc(at) {
  let p = at + snd.readUInt16LE(at + 20);
  const parts = [];
  let rate = 0;
  while (p < snd.length && snd[p] !== 0) {
    const type = snd[p], len = snd[p + 1] | (snd[p + 2] << 8) | (snd[p + 3] << 16);
    if (type === 1) {
      if (snd[p + 5] !== 0) throw new Error(`VOC at ${at}: packed data is not supported`);
      rate = Math.round(1e6 / (256 - snd[p + 4]));
      parts.push(snd.subarray(p + 6, p + 4 + len));
    } else if (type === 3) {
      // a run of silence
      parts.push(Buffer.alloc(snd.readUInt16LE(p + 4) + 1, 128));
    }
    p += 4 + len;
  }
  return { rate, pcm: Buffer.concat(parts) };
}

const found = [];
for (let at = snd.indexOf(SIG); at >= 0; at = snd.indexOf(SIG, at + 1)) found.push(at);
const table = NAMES.map((_, i) => snd.readUInt16LE(0x8fa8 + i * 2));
if (found.length !== NAMES.length || found.some((at, i) => at !== table[i])) {
  throw new Error(`expected ${NAMES.length} voice files matching the driver's table; found ${found.join(',')}`);
}
const sounds = found.map((at, i) => ({ name: NAMES[i], ...readVoc(at) }));

// --- writing -------------------------------------------------------------------

function wav(rate, bits, samples) {
  const bytes = bits / 8, data = Buffer.alloc(samples.length * bytes);
  samples.forEach((v, i) => (bits === 8 ? data.writeUInt8(v, i) : data.writeInt16LE(v, i * 2)));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * bytes, 28); h.writeUInt16LE(bytes, 32); h.writeUInt16LE(bits, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** Resample with a Blackman-windowed sinc, cut off just under the source's Nyquist. */
function resample(x, from, to) {
  const ratio = to / from, n = Math.ceil(x.length * ratio), half = 24;
  const cutoff = 0.92; // of the source Nyquist
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

function enhance({ rate, pcm }) {
  let x = Float64Array.from(pcm, v => (v - 128) / 128);
  // DC: a one-pole high-pass at ~15 Hz, run forwards then backwards so it adds no phase smear
  const hp = arr => {
    const a = Math.exp(-2 * Math.PI * 15 / rate);
    const out = new Float64Array(arr.length);
    let px = arr[0], py = 0;
    for (let i = 0; i < arr.length; i++) { py = a * (py + arr[i] - px); px = arr[i]; out[i] = py; }
    return out;
  };
  x = hp(x); x = hp(x.reverse()).reverse();
  let y = resample(x, rate, RATE_OUT);
  // gate the 8-bit hiss where the sound has finished: a slow envelope under
  // roughly one 8-bit step lets the tail fall to true silence
  const floor = 1.6 / 128, win = Math.round(RATE_OUT * 0.012);
  const env = new Float64Array(y.length);
  for (let i = 0, s = 0; i < y.length; i++) {
    s += Math.abs(y[i]); if (i >= win) s -= Math.abs(y[i - win]);
    env[i] = s / Math.min(i + 1, win);
  }
  let g = 1;
  for (let i = 0; i < y.length; i++) {
    const want = env[Math.min(y.length - 1, i + (win >> 1))] < floor ? 0 : 1;
    g += (want - g) * (want > g ? 0.05 : 0.002);
    y[i] *= g;
  }
  // 2 ms fades at both ends
  const fade = Math.round(RATE_OUT * 0.002);
  for (let i = 0; i < fade && i < y.length; i++) { y[i] *= i / fade; y[y.length - 1 - i] *= i / fade; }
  // trim trailing silence
  let end = y.length;
  while (end > 1 && Math.abs(y[end - 1]) < 1e-5) end--;
  return y.subarray(0, end);
}

mkdirSync(RAW_OUT, { recursive: true });
mkdirSync(CLEAN_OUT, { recursive: true });
const enhanced = sounds.map(s => ({ ...s, out: enhance(s) }));
const peak = Math.max(...enhanced.map(s => s.out.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
const gain = 0.89 / peak; // -1 dBFS for the loudest of the seven
for (const s of enhanced) {
  writeFileSync(join(RAW_OUT, `${s.name}.wav`), wav(s.rate, 8, [...s.pcm]));
  writeFileSync(join(CLEAN_OUT, `${s.name}.wav`), wav(RATE_OUT, 16, Array.from(s.out, v => Math.round(Math.max(-1, Math.min(1, v * gain)) * 32767))));
  console.log(`${s.name.padEnd(10)} ${s.pcm.length} samples @ ${s.rate} Hz = ${(s.pcm.length / s.rate).toFixed(2)} s`);
}
