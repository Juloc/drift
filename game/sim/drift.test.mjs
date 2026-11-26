// The feel of drifting on the surface model (design: DESIGN-PHYSIK-STRECKE.md 2.5 and 2.9, tests 7 and 8, and "no energy from nowhere" with steering): the pedal is a dial
// for the angle, a held drift stays between 30 and 45 degrees, a change of direction carries through without a spin, the handbrake throws the tail out, and no tyre ever
// puts energy in. All on level ground through the same `step` the game uses with ?phys=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { step, makeCar, speedOf, bodySlip, turnedAngle, DT, G, K, K2 } from './physics.js';
import { applyFeel, PRO } from './feel.js';

const CARS = JSON.parse(readFileSync(new URL('../data/cars.json', import.meta.url), 'utf8')).cars;
const DRIFTERS = CARS.filter((c) => c.name !== 'Ox');   // the Ox is the heavy one with little power: it slides on the handbrake, it does not hold a drift on the pedal
const level = (x, z, o = {}) => { o.y = 0; o.gx = 0; o.gz = 0; return o; };
const deg = (r) => (r * 180) / Math.PI;
/** a drift to the right: a pull of the handbrake at 72 km/h, the wheel held into the bend, then the pedal as `gas(t, s)` says; returns the mean angle and speed from 7 s on */
function hold(car, gas, { steer = 0.6, seconds = 15 } = {}) {
  let s = { ...makeCar(), vz: 20 }, sum = 0, v = 0, n = 0, lo = 9, hi = 0, spun = false;
  for (let i = 0; i < seconds / DT; i++) {
    const t = i * DT;
    s = step(s, { steer, throttle: t < 0.5 ? 1 : gas(t, s), brake: 0, handbrake: t < 0.35 ? 1 : 0 }, car, 1, DT, level);
    if (turnedAngle(s) > 1.9) spun = true;
    if (t > 7) { const b = Math.abs(bodySlip(s)); sum += b; v += speedOf(s); n++; lo = Math.min(lo, b); hi = Math.max(hi, b); }
  }
  return { angle: deg(sum / n), lo: deg(lo), hi: deg(hi), kmh: (v / n) * 3.6, spun };
}

test('drift 7a: a driver who works the pedal holds a drift between 30 and 45 degrees for 8 seconds', () => {
  for (const car of DRIFTERS) {
    // more gas when the angle is under 37 degrees, less when over: the pedal alone steers the angle
    const r = hold(car, (t, s) => Math.max(0.3, Math.min(1, 0.9 + (0.65 - Math.abs(bodySlip(s))) * 2.5)));
    assert.ok(!r.spun && r.lo > 30 && r.hi < 45, `${car.name}: ${r.lo.toFixed(0)} to ${r.hi.toFixed(0)} degrees at ${r.kmh.toFixed(0)} km/h${r.spun ? ', spun' : ''}`);
    assert.ok(r.kmh > 35, `${car.name}: the drift keeps its speed (${r.kmh.toFixed(0)} km/h)`);
  }
});

test('drift 7b: the pedal is a dial for the angle: more gas, more angle, step by step and never a jump once the car slides', () => {
  for (const car of DRIFTERS) {
    const rows = []; for (let th = 0.5; th <= 1.001; th += 0.05) rows.push({ th, ...hold(car, () => th) });
    const sliding = rows.filter((r) => r.angle > 12);
    assert.ok(rows.every((r) => !r.spun), `${car.name}: no spin at any pedal`);
    assert.ok(sliding.length >= 4, `${car.name}: the car holds a slide over a range of the pedal (${sliding.length} of ${rows.length} steps)`);
    for (let i = 1; i < sliding.length; i++) {
      const d = sliding[i].angle - sliding[i - 1].angle;
      assert.ok(d > -0.5 && d < 9, `${car.name}: from ${(sliding[i - 1].th * 100).toFixed(0)} to ${(sliding[i].th * 100).toFixed(0)} % gas the angle goes from ${sliding[i - 1].angle.toFixed(0)} to ${sliding[i].angle.toFixed(0)} degrees`);
    }
    assert.ok(sliding.at(-1).angle - sliding[0].angle > 10, `${car.name}: the pedal moves the angle by more than 10 degrees (${sliding[0].angle.toFixed(0)} to ${sliding.at(-1).angle.toFixed(0)})`);
    // and lifting off lets the rear catch: a little gas ends the slide
    assert.ok(hold(car, () => 0.3).angle < 10, `${car.name}: at 30 % gas the car grips again`);
  }
});

test('drift 8: a change of direction: drift to the right, then the wheel the other way and a lift of the pedal, and the car slides to the left without a spin (Arcade and Pro)', () => {
  for (const base of DRIFTERS) for (const feel of [0, 1]) {
    const car = feel ? applyFeel(base, PRO) : base;
    let s = { ...makeCar(), vz: 22 }, right = 0, left = 0, worst = 0, flip = null;
    for (let i = 0; i < 9 / DT; i++) {
      const t = i * DT;
      const input = t < 3 ? { steer: 0.7, throttle: t < 0.4 ? 0.6 : 0.9, brake: 0, handbrake: t < 0.35 ? 1 : 0 } : { steer: -0.7, throttle: t < 3.45 ? 0.2 : 0.9, brake: 0, handbrake: 0 };
      s = step(s, input, car, 1, DT, level);
      const b = deg(bodySlip(s)); worst = Math.max(worst, deg(turnedAngle(s)));
      if (t > 1.5 && t < 3) right += (b * DT) / 1.5; if (t > 6) left += (b * DT) / 3;
      if (t > 3 && flip === null && b > 15) flip = t - 3;
    }
    const name = `${base.name} ${feel ? 'Pro' : 'Arcade'}`;
    assert.ok(worst < 100, `${name}: no spin (the nose was at most ${worst.toFixed(0)} degrees off the way)`);
    assert.ok(right < -30, `${name}: slides to the right first (${right.toFixed(0)} degrees)`);
    if (!feel) { assert.ok(left > 20, `${name}: then holds the slide to the left (${left.toFixed(0)} degrees)`); assert.ok(flip !== null && flip < 2, `${name}: the change takes ${flip?.toFixed(2)} s`); }
  }
});

test('drift: the handbrake throws the tail out (locked rear wheels), on every car, and the car comes back by itself when the wheel is let go (Arcade)', () => {
  for (const car of CARS) {
    let s = { ...makeCar(), vz: 80 / 3.6 }, most = 0, back = null;
    for (let i = 0; i < 7 / DT; i++) { const t = i * DT; s = step(s, { steer: t < 1 ? 1 : 0, throttle: 0.3, brake: 0, handbrake: t < 0.6 ? 1 : 0 }, car, 1, DT, level); const b = Math.abs(bodySlip(s)); most = Math.max(most, b); if (t > 1 && back === null && b < 0.1) back = t; }
    assert.ok(deg(most) > 35, `${car.name}: the tail steps out to ${deg(most).toFixed(0)} degrees`);
    assert.ok(back !== null && back < 5, `${car.name}: straight again after ${back?.toFixed(1)} s`);
    // without the handbrake the same turn of the wheel at the same gas is a clean bend
    let q = { ...makeCar(), vz: 80 / 3.6 }, clean = 0;
    for (let i = 0; i < 3 / DT; i++) { q = step(q, { steer: 1, throttle: 0.3, brake: 0, handbrake: 0 }, car, 1, DT, level); clean = Math.max(clean, Math.abs(bodySlip(q))); }
    assert.ok(deg(clean) < 14, `${car.name}: without the handbrake the car grips (${deg(clean).toFixed(0)} degrees)`);
  }
});

test('drift: braking moves the weight forward with a little delay, lifting off in a bend turns the car in, and a locked wheel stops the car without ever pushing it back', () => {
  const dart = CARS[0];
  let s = { ...makeCar(), vz: 30 }; const tl = [];
  for (let i = 0; i < 0.5 / DT; i++) { s = step(s, { steer: 0, throttle: 0, brake: 1, handbrake: 0 }, dart, 1, DT, level); tl.push(s.tl); }
  assert.ok(tl[2] > -0.05 && tl.at(-1) < -0.12, `the weight goes forward over time: ${tl[2].toFixed(3)} after three steps, ${tl.at(-1).toFixed(3)} after half a second`);
  // the handbrake from 20 m/s in a straight line: the car stops and stays (no pedal), never rolls backwards
  s = { ...makeCar(), vz: 20 }; let minV = 0;
  for (let i = 0; i < 12 / DT; i++) { s = step(s, { steer: 0, throttle: 0, brake: 0, handbrake: 1 }, dart, 1, DT, level); minV = Math.min(minV, s.vz); }
  assert.ok(speedOf(s) === 0 && minV > -0.02 && s.z > 30 && s.z < 90, `stopped after ${s.z.toFixed(0)} m, slowest ${minV.toFixed(3)} m/s`);
  // steady in a bend at part gas; lifting off tightens the line (the tail gets light, the front bites)
  const bend = (lift) => { let c = { ...makeCar(), vz: 18 }; for (let i = 0; i < 5 / DT; i++) { const t = i * DT; c = step(c, { steer: 0.5, throttle: lift && t > 2.5 ? 0 : 0.45, brake: 0, handbrake: 0 }, dart, 1, DT, level); } return c.h; };
  assert.ok(bend(true) > bend(false) + 0.15, `lifting off turns the car in: heading ${bend(true).toFixed(2)} rad against ${bend(false).toFixed(2)} with the gas held`);
});

test('drift: no energy from nowhere: without gas the energy never rises, whatever the wheel and the handbrake do (a million steps, all cars)', () => {
  // (a rise of under a thousandth of a J/kg in a step is the arithmetic of the fixed time step, not a force: the old tyre gave up to 0.3 in a step and 4 over ten seconds)
  let seed = 3; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  let worst = 0, steps = 0;
  for (let run = 0; run < 840; run++) {
    const car = CARS[run % 5], I = (K2.inertia * K.a * K.b) / car.agility, h = rnd() * 6.28, v = 4 + rnd() * 30;
    let s = { ...makeCar(0, 0, h), vx: Math.sin(h) * v, vz: Math.cos(h) * v, w: (rnd() - 0.5) * 2 }, last = 0.5 * v * v + 0.5 * I * s.w ** 2, steer = 0, hb = 0;
    for (let i = 0; i < 1200; i++) {
      if (i % 25 === 0) { steer = rnd() * 2 - 1; hb = rnd() < 0.25 ? 1 : 0; }
      s = step(s, { steer, throttle: 0, brake: 0, handbrake: hb }, car, 1, DT, level); steps++;
      const e = 0.5 * (s.vx ** 2 + s.vz ** 2) + 0.5 * I * s.w ** 2; worst = Math.max(worst, e - last); last = e;
    }
  }
  assert.ok(steps > 1e6 && worst <= 1e-3, `the energy rose by ${worst.toExponential(2)} J/kg in one step (${steps} steps)`);
  void G;
});
