// The engine model: it stays finite and bounded at every point, its strongest pitch is the firing rate, a wide-open throttle is louder than idle,
// lifting off at high revs pops, the limiter cuts firings, and the same seed gives the same sound.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineModel } from './enginemodel.js';

const RATE = 48000;
function run(rpm, thr, seconds = 1.5, options) { const e = new EngineModel(RATE, options), d = new Float32Array(Math.round(seconds * RATE)); e.set(rpm, thr); let pops = 0; for (let i = 0; i < d.length; i += 128) pops += e.process(d.subarray(i, Math.min(d.length, i + 128))); return { d, pops, e }; }
const rms = (d, a = 0) => { let s = 0; for (let i = a; i < d.length; i++) s += d[i] * d[i]; return Math.sqrt(s / (d.length - a)); };
const at = (d, f, a) => { const w = 2 * Math.PI * f / RATE, c = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = a; i < d.length; i++) { const s0 = d[i] + c * s1 - s2; s2 = s1; s1 = s0; } return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)); };

test('finite and inside -1..1 from idle to the limiter, open and shut', () => {
  for (const rpm of [600, 900, 2500, 5000, 7600, 9000]) for (const thr of [0, 0.5, 1]) { const { d } = run(rpm, thr, 1); for (const v of d) assert.ok(Number.isFinite(v) && Math.abs(v) <= 1, `${rpm} ${thr}`); }
});
test('the firing rate is the strongest of the low pitches, and its overtones are there', () => {
  const rpm = 4000, { d } = run(rpm, 1, 2), f = rpm / 60 * 2, a = RATE, base = at(d, f, a);
  for (const k of [0.25, 0.5, 0.75, 1.5]) assert.ok(at(d, f * k, a) < base, `pitch ${k} is below the firing rate's level`);
  assert.ok(at(d, f * 2, a) > base * 0.05 && at(d, f * 3, a) > base * 0.05, 'not a pure tone');
});
test('open throttle is louder than idle; lifting off high up pops, low down it does not', () => {
  assert.ok(rms(run(5000, 1).d, RATE / 2) > 4 * rms(run(900, 0).d, RATE / 2));
  assert.ok(run(6000, 0, 3).pops > 3); assert.equal(run(2500, 0, 3).pops, 0); assert.equal(run(6000, 1, 3).pops, 0);
});
test('the limiter cuts firings', () => { assert.ok(run(7900, 1, 2).e.cut > 20); assert.equal(run(7000, 1, 2).e.cut, 0); });
test('the same seed, the same sound', () => { const a = run(5000, 0.7, 0.5).d, b = run(5000, 0.7, 0.5).d; assert.deepEqual(a.slice(1000, 1200), b.slice(1000, 1200)); });
