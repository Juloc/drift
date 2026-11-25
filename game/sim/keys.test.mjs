import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyboardControls, ThrottleLever, PRESETS } from './keys.js';

const dt = 1 / 60;
const idle = { gas: false, brake: false, left: false, right: false };
/** Runs a pattern of key states (one per frame); returns the controls after each frame. */
const run = (kc, frames, keys) => frames.map((f) => kc.update({ ...idle, ...keys(f) }, dt));
const gasFor = (n) => Array.from({ length: n }, () => ({ gas: true }));

test('gas builds up while the key is held: 0 to 100 % in about 0.6 s, never past 1', () => {
  const kc = new KeyboardControls('soft');
  const out = run(kc, gasFor(120), (f) => f);
  assert.ok(out[Math.round(0.3 / dt) - 1].throttle > 0.45 && out[Math.round(0.3 / dt) - 1].throttle < 0.55, 'half after 0.3 s');
  assert.ok(Math.abs(out[Math.round(0.6 / dt)].throttle - 1) < 0.03, 'full after 0.6 s');
  assert.equal(Math.max(...out.map((o) => o.throttle)), 1);
});

test('gas dies away softly when the key is let go (about a second), not at once', () => {
  const kc = new KeyboardControls('soft');
  run(kc, gasFor(60), (f) => f);
  const out = run(kc, Array(90).fill({}), (f) => f);
  assert.ok(out[2].throttle > 0.9, 'still there after 3 frames');
  assert.ok(out[29].throttle > 0.45 && out[29].throttle < 0.55, 'half after 0.5 s');
  assert.equal(out[89].throttle, 0);
});

test('a short tap is a little gas', () => {
  const kc = new KeyboardControls('soft');
  const out = run(kc, [...gasFor(6), ...Array(30).fill({})], (f) => f);   // 0.1 s
  const peak = Math.max(...out.map((o) => o.throttle));
  assert.ok(peak > 0.1 && peak < 0.25, `peak ${peak}`);
});

test('tapping again and again holds a middle gas: at the right rhythm the level stays, a bit more and it climbs, a bit less and it falls', () => {
  const tapping = (onFrames, offFrames, cycles, from = 0) => {
    const kc = new KeyboardControls('soft'); kc.throttle = from;
    const levels = [];
    for (let c = 0; c < cycles; c++) { for (let i = 0; i < onFrames; i++) kc.update({ ...idle, gas: true }, dt); for (let i = 0; i < offFrames; i++) kc.update(idle, dt); levels.push(kc.throttle); }
    return levels;
  };
  // 12 frames on, 20 off = a duty of 0.375: the build-up (1.67/s) and the decay (1/s) cancel
  const hold = tapping(12, 20, 10, 0.5);
  assert.ok(hold.every((l) => l > 0.4 && l < 0.6), `holds near the middle: ${hold.map((l) => l.toFixed(2))}`);
  assert.ok(tapping(18, 20, 10, 0.5).at(-1) > hold.at(-1) + 0.1, 'a longer press each time climbs (it stops climbing where the gas is full during the press)');
  assert.ok(tapping(8, 30, 10, 0.5).at(-1) < 0.1, 'a shorter one falls');
});

test('the brake ramps faster than the gas, in and out', () => {
  const kc = new KeyboardControls('soft');
  const up = run(kc, Array(30).fill({ brake: true }), (f) => f);
  assert.ok(up[19].throttle === 0 && up[19].brake > 0.9, 'a brake is nearly full after 1/3 s');
  const down = run(kc, Array(30).fill({}), (f) => f);
  assert.equal(down[19].brake, 0);
});

test('steering builds up in about half a second and returns slowly; repeated taps hold an angle', () => {
  const kc = new KeyboardControls('soft');
  const out = run(kc, Array(60).fill({ right: true }), (f) => f);
  assert.ok(out[Math.round(0.25 / dt) - 1].steer > 0.4 && out[Math.round(0.25 / dt) - 1].steer < 0.6, 'half after a quarter second');
  assert.equal(out.at(-1).steer, 1);
  const back = run(kc, Array(90).fill({}), (f) => f);
  assert.ok(back[19].steer > 0.45 && back[19].steer < 0.55, 'the wheel comes back slowly (half after a third of a second)');
  assert.equal(back.at(-1).steer, 0);
  // repeated taps: 12 frames on, 22 off holds a level (2.0 x 0.2 = 0.4 up, 1.5 x 0.37 = 0.55 down: it slowly settles), 18 on / 22 off climbs
  const k2 = new KeyboardControls('soft'); k2.steer = 0.4;
  const levels = []; for (let c = 0; c < 8; c++) { for (let i = 0; i < 17; i++) k2.update({ ...idle, right: true }, dt); for (let i = 0; i < 23; i++) k2.update(idle, dt); levels.push(k2.steer); }
  assert.ok(levels.every((l) => l > 0.2 && l < 0.8), `a held angle: ${levels.map((l) => l.toFixed(2))}`);
  // the other side crosses quickly
  const k3 = new KeyboardControls('soft'); k3.steer = 1;
  const cross = run(k3, Array(30).fill({ left: true }), (f) => f);
  assert.ok(Math.abs(cross[14].steer) < 0.05 && cross[29].steer < -0.4, `across the middle in a quarter second, then on at the normal rate: ${cross[14].steer} ${cross[29].steer}`);
});

test('direct mode is the old behaviour: a key is all or nothing', () => {
  const kc = new KeyboardControls('direct');
  assert.deepEqual(kc.update({ gas: true, brake: false, left: false, right: true }, dt), { throttle: 1, brake: 0, steer: 1 });
  assert.deepEqual(kc.update(idle, dt), { throttle: 0, brake: 0, steer: 0 });
  assert.equal(new KeyboardControls('nonsense').mode, 'soft', 'an unknown mode is soft (the default)');
});

test('the rates can be changed: a slower gas takes longer', () => {
  const kc = new KeyboardControls('soft', { gasUp: 0.5 });
  const out = run(kc, gasFor(120), (f) => f);
  assert.ok(out[59].throttle < 0.55 && out[119].throttle > 0.95, 'full after 2 s');
  assert.ok(PRESETS.soft.gasUp > 1.5);
});

test('the throttle lever: the wheel moves it a notch at a time, a drag moves it with the pointer, it stays, the brake releases it, it stays inside 0 to 1', () => {
  const l = new ThrottleLever();
  l.wheel(-100); l.wheel(-100); l.wheel(-100);
  assert.equal(l.value, 0.3);
  l.wheel(100); assert.equal(l.value, 0.2);
  l.drag(-110); assert.ok(Math.abs(l.value - 0.7) < 1e-9, 'half a drag (110 px up) is half a lever');
  l.drag(-1000); assert.equal(l.value, 1);
  l.drag(5000); assert.equal(l.value, 0);
  l.set(0.6); l.release(); assert.equal(l.value, 0);
});
