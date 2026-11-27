// Renders what to listen to from the tyre model alone and from engine and tyres together (a drift pass): node tools/drivewav.mjs <out-folder>
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EngineModel } from '../game/sim/enginemodel.js';
import { TyreModel } from '../game/sim/tyremodel.js';
const RATE = 48000, out = process.argv[2] ?? '.'; mkdirSync(out, { recursive: true });
function wav(name, data) { const n = data.length, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[i])) * 32767), 44 + i * 2); writeFileSync(join(out, name), b); }
const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t)), rms = (d) => { let s = 0; for (const v of d) s += v * v; return Math.sqrt(s / d.length); };
/** `plan(t)` gives { rpm, thr, speed, wheels: [[squeal, slide, load] x 4] }; returns the two voices and their mix. */
function run(seconds, plan) { const e = new EngineModel(RATE), ty = new TyreModel(RATE), n = Math.round(seconds * RATE), a = new Float32Array(n), b = new Float32Array(n), mix = new Float32Array(n); let pops = 0;
  for (let i = 0; i < n; i += 128) { const p = plan(i / RATE), m = Math.min(n, i + 128); e.set(p.rpm, p.thr); ty.setSpeed(p.speed); p.wheels.forEach((w, k) => ty.setWheel(k, ...w)); pops += e.process(a.subarray(i, m)); ty.process(b.subarray(i, m)); }
  for (let i = 0; i < n; i++) mix[i] = Math.tanh(a[i] * 0.75 + b[i] * 0.6); return { engine: a, tyres: b, mix, pops }; }
const still = [0, 0, 1];
// tyres alone: a slide that builds, holds with the sliding speed going up and down, and ends; then short chirps
const slide = run(12, (t) => { const k = t < 1 ? 0 : t < 2.5 ? (t - 1) / 1.5 : t < 8 ? 0.75 + 0.25 * Math.sin(t * 1.3) : t < 9 ? 1 - (t - 8) : t > 10 && (t * 2) % 1 < 0.25 ? 0.8 : 0, sp = 6 + 6 * Math.sin(t * 0.9) + (t > 5 ? 4 : 0);
  return { rpm: 900, thr: 0, speed: 22, wheels: [[k * 0.35, sp * 0.5, 1.1], [k * 0.2, sp * 0.4, 0.8], [k, sp, 1.2], [k * 0.9, sp * 1.1, 0.8]] }; });
wav('tyres-slide.wav', slide.tyres);
// a drift pass: up through third, a lift and a flick in, the slide held on the throttle near the limiter, out and an upshift
const pass = run(16, (t) => {
  if (t < 3.5) return { rpm: lerp(4200, 7100, t / 3.5), thr: 1, speed: lerp(20, 30, t / 3.5), wheels: [still, still, [t < 0.6 ? 0.5 : 0, 3, 1], [t < 0.6 ? 0.5 : 0, 3, 1]] };
  if (t < 4.0) return { rpm: lerp(7100, 6300, (t - 3.5) / 0.5), thr: 0, speed: 30, wheels: [[0.3, 3, 1.3], [0.1, 2, 0.9], [lerp(0, 0.8, (t - 3.5) / 0.5), 6, 0.9], [lerp(0, 0.7, (t - 3.5) / 0.5), 6, 0.7]] };
  if (t < 11) { const u = t - 4, wob = Math.sin(u * 2.1) * 0.5 + Math.sin(u * 5.3) * 0.2; return { rpm: 6500 + 600 * wob + 300 * Math.sin(u * 0.7), thr: Math.min(1, Math.max(0.35, 0.8 + 0.3 * wob)), speed: 27, wheels: [[0.25 + 0.15 * wob, 3, 1.2], [0.1, 2, 0.8], [0.92 + 0.08 * wob, 11 + 3 * wob, 1.25], [0.85, 12 + 3 * wob, 0.75]] }; }
  if (t < 12) return { rpm: lerp(6300, 6900, t - 11), thr: 1, speed: 28, wheels: [still, still, [lerp(0.8, 0, t - 11), 6, 1.1], [lerp(0.7, 0, t - 11), 6, 0.9]] };
  if (t < 12.25) return { rpm: 5200, thr: 0, speed: 30, wheels: [still, still, still, still] };
  return { rpm: lerp(5000, 6800, (t - 12.25) / 3.75), thr: 1, speed: lerp(30, 38, (t - 12.25) / 3.75), wheels: [still, still, still, still] }; });
wav('drift-pass.wav', pass.mix);
console.log(`tyres-slide: level ${rms(slide.tyres).toFixed(3)}; drift-pass: engine ${rms(pass.engine).toFixed(3)}, tyres ${rms(pass.tyres).toFixed(3)}, mix ${rms(pass.mix).toFixed(3)}, pops ${pass.pops}`);
