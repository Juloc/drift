// Renders the engine model (game/sim/enginemodel.js) to WAV files and prints what can be measured without ears: level, the strongest pitch against the
// firing rate, where the sound's weight lies, pops. Usage: node tools/enginewav.mjs <out-folder>
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EngineModel } from '../game/sim/enginemodel.js';

const RATE = 48000, out = process.argv[2] ?? '.'; mkdirSync(out, { recursive: true });
function wav(name, data) { const n = data.length, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[i] * 0.8)) * 32767), 44 + i * 2); writeFileSync(join(out, name), b); }
/** A run: `plan(t)` gives [rpm, throttle] at each moment. */
function run(seconds, plan, options) { const e = new EngineModel(RATE, options), data = new Float32Array(Math.round(seconds * RATE)), block = 128; let pops = 0; for (let i = 0; i < data.length; i += block) { const [rpm, thr] = plan(i / RATE); e.set(rpm, thr); pops += e.process(data.subarray(i, Math.min(data.length, i + block))); } return { data, pops, cut: e.cut }; }
const rms = (d, a = 0, b = d.length) => { let s = 0; for (let i = a; i < b; i++) s += d[i] * d[i]; return Math.sqrt(s / (b - a)); };
/** The level at one pitch (Goertzel) over a stretch. */
function at(d, f, a, b) { const w = 2 * Math.PI * f / RATE, c = 2 * Math.cos(w); let s0 = 0, s1 = 0, s2 = 0; for (let i = a; i < b; i++) { s0 = d[i] + c * s1 - s2; s2 = s1; s1 = s0; } return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / (b - a) * 2; }
/** Where the weight lies: the share of the level below 250 Hz, 250 to 1000, 1000 to 4000, above (by simple band filters). */
function bands(d, a, b) { const edges = [250, 1000, 4000], lows = edges.map(() => 0), sums = [0, 0, 0, 0]; for (let i = a; i < b; i++) { let prev = 0; edges.forEach((f, k) => { const kf = 1 - Math.exp(-2 * Math.PI * f / RATE); lows[k] += kf * (d[i] - lows[k]); const band = lows[k] - prev; sums[k] += band * band; prev = lows[k]; }); const hi = d[i] - prev; sums[3] += hi * hi; } const t = sums.reduce((x, y) => x + y, 0) || 1; return sums.map((x) => Math.round(100 * x / t)); }

const steady = [[900, 0.0], [2000, 0.3], [3500, 0.2], [3500, 1], [5500, 1], [7200, 1], [5500, 0]];
console.log('rpm   thr   level  firing-Hz  f/2    f      2f     3f     4f    <250 <1k <4k >4k %  pops/s');
for (const [rpm, thr] of steady) { const r = run(3, () => [rpm, thr]), a = RATE, b = 3 * RATE, f = rpm / 60 * 2;
  console.log(`${String(rpm).padEnd(5)} ${thr.toFixed(1).padEnd(5)} ${rms(r.data, a, b).toFixed(3).padEnd(6)} ${f.toFixed(0).padEnd(10)} ${[0.5, 1, 2, 3, 4].map((k) => at(r.data, f * k, a, b).toFixed(3)).join('  ')}   ${bands(r.data, a, b).join('  ')}    ${(r.pops / 3).toFixed(1)}`);
  if (!Number.isFinite(rms(r.data))) throw new Error('not finite'); }
// what to listen to
const sweep = run(12, (t) => (t < 1.5 ? [900, 0] : t < 8 ? [900 + (7400 - 900) * ((t - 1.5) / 6.5) ** 1.2, 1] : t < 11 ? [7400 - (7400 - 1500) * ((t - 8) / 3), 0] : [900, 0]));
wav('engine-sweep.wav', sweep.data);
// through the gears: full throttle, a short lift at each shift, then off the throttle from high revs (pops), then blips at idle
const gears = [[0, 3.2, 1800, 7300], [3.5, 3.4, 4300, 7300], [7.2, 4.2, 5000, 7300], [11.7, 5, 5500, 7000]];
const drive = run(26, (t) => { for (const [t0, len, lo, hi] of gears) { if (t >= t0 && t < t0 + len) return [lo + (hi - lo) * ((t - t0) / len) ** 0.85, 1]; if (t >= t0 + len && t < t0 + len + 0.3) return [hi - 800, 0]; }
  if (t < 21) return [7000 - (7000 - 2200) * Math.min(1, (t - 16.7) / 4), 0];
  const b = (t - 21) % 1.6; return b < 0.35 ? [1000 + 4500 * (b / 0.35), 1] : [Math.max(950, 5500 - 4500 * ((b - 0.35) / 0.9)), 0]; });
wav('engine-drive.wav', drive.data);
const limiter = run(5, (t) => [t < 1 ? 5000 + 2700 * t : 7700 + 60 * Math.sin(t * 40), 1]); wav('engine-limiter.wav', limiter.data);
console.log(`sweep: level ${rms(sweep.data).toFixed(3)}, pops ${sweep.pops}; drive: level ${rms(drive.data).toFixed(3)}, pops ${drive.pops}; limiter: cut firings ${limiter.cut}, pops ${limiter.pops}`);
let peak = 0; for (const v of drive.data) peak = Math.max(peak, Math.abs(v)); console.log('peak', peak.toFixed(3));
