// The tyre model: silent while nothing slides or rolls, finite and bounded, the howl's weight lies where a squeal lies (500 to 2500 Hz), a faster slide howls higher.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TyreModel } from './tyremodel.js';
const RATE = 48000;
function run(set, seconds = 1.5) { const t = new TyreModel(RATE), d = new Float32Array(Math.round(seconds * RATE)); set(t); for (let i = 0; i < d.length; i += 128) t.process(d.subarray(i, Math.min(d.length, i + 128))); return d; }
const rms = (d, a = RATE / 2) => { let s = 0; for (let i = a; i < d.length; i++) s += d[i] * d[i]; return Math.sqrt(s / (d.length - a)); };
const at = (d, f) => { const w = 2 * Math.PI * f / RATE, c = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = RATE / 2; i < d.length; i++) { const s0 = d[i] + c * s1 - s2; s2 = s1; s1 = s0; } return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)); };
const centre = (d) => { let a = 0, b = 0; for (let f = 200; f <= 6000; f += 40) { const v = at(d, f) ** 2; a += v * f; b += v; } return a / b; };
test('silent when nothing slides or rolls', () => { assert.ok(rms(run(() => {})) < 1e-6); });
test('finite and inside -1..1 at a full slide of all four', () => { const d = run((t) => { for (let i = 0; i < 4; i++) t.setWheel(i, 1, 14, 1.3); t.setSpeed(40); }); for (const v of d) assert.ok(Number.isFinite(v) && Math.abs(v) <= 1); assert.ok(rms(d) > 0.05); });
test('the howl lies where a squeal lies, and a faster slide howls higher', () => {
  const slow = centre(run((t) => t.setWheel(2, 1, 3, 1))), fast = centre(run((t) => t.setWheel(2, 1, 16, 1)));
  assert.ok(slow > 500 && slow < 2500, `slow ${slow}`); assert.ok(fast > slow + 60, `fast ${fast} against slow ${slow}`);
});
test('a little slide is quieter than a hard one', () => { assert.ok(rms(run((t) => t.setWheel(2, 0.2, 6, 1))) < 0.6 * rms(run((t) => t.setWheel(2, 1, 6, 1)))); });
