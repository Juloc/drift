// Numbers of the driving model for every car (what a person would call "how it drives"). Run: node tools/measure.mjs
import { readFileSync } from 'node:fs';
import { step as rawStep, makeCar, bodySlip, speedOf, DT, K } from '../game/sim/physics.js';
// OLD_LOCK=1 measures with the steering angles of before 2026-11-26 (0.55 / 0.75 / 40) for a before-and-after table
if (process.env.OLD_LOCK) Object.assign(K, { lockMax: 0.55, lockHard: 0.75, lockSpeed: 40 });
import { orbitBot } from '../game/sim/bot.js';
const cars = JSON.parse(readFileSync(new URL('../game/data/cars.json', import.meta.url), 'utf8')).cars;
const NONE = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
// PHYS=1 measures the model on a surface (the 2.5D physics with the new tyre, here on level ground) for the before-and-after table
const level = (x, z, o = {}) => { o.y = 0; o.gx = 0; o.gz = 0; return o; }, SURF = process.env.PHYS === '1' ? level : null;
const step = (s, input, car, mu = 1) => rawStep(s, input, car, mu, DT, SURF);
const rows = [], extra = [];
for (const car of cars) {
  // 0-100 km/h and the speed reached after 20 s
  let s = makeCar(), t100 = null, i = 0;
  for (; i < 20 / DT; i++) { s = step(s, { ...NONE, throttle: 1 }, car); if (t100 === null && speedOf(s) * 3.6 >= 100) t100 = i * DT; }
  const top = speedOf(s) * 3.6;
  // braking from 100 km/h
  s = { ...makeCar(), vz: 100 / 3.6 }; let d = 0;
  while (speedOf(s) > 0.5) { const z0 = s.z; s = step(s, { ...NONE, brake: 1 }, car); d += s.z - z0; }
  // the smallest steady circle at 50 km/h on asphalt, throttle to hold speed, full steering
  s = { ...makeCar(), vz: 50 / 3.6 };
  for (let k = 0; k < 8 / DT; k++) s = step(s, { steer: 1, throttle: speedOf(s) < 50 / 3.6 ? 1 : 0.2, brake: 0, handbrake: 0 }, car);
  const radius = speedOf(s) / Math.abs(s.w);
  // the smallest steady circle at 20 km/h (low speed: where the wheel angle itself is the limit) and the wheel angle at 80 km/h with full steering
  s = { ...makeCar(), vz: 20 / 3.6 };
  for (let k = 0; k < 8 / DT; k++) s = step(s, { steer: 1, throttle: speedOf(s) < 20 / 3.6 ? 0.6 : 0.1, brake: 0, handbrake: 0 }, car);
  const radius20 = speedOf(s) / Math.abs(s.w);
  s = { ...makeCar(), vz: 80 / 3.6 };
  for (let k = 0; k < 1 / DT; k++) s = step(s, { steer: 1, throttle: 0.3, brake: 0, handbrake: 0 }, car);
  const wheel80 = s.steer;
  // handbrake turn at 80 km/h: handbrake 0.8 s, steering right 1.2 s, then hands off
  s = { ...makeCar(), vz: 80 / 3.6 }; let maxSlip = 0, back = null;
  for (let k = 0; k < 6 / DT; k++) { const t = k * DT; s = step(s, { steer: t < 1.2 ? 1 : 0, throttle: 0.3, brake: 0, handbrake: t < 0.8 ? 1 : 0 }, car); const b = Math.abs(bodySlip(s)); maxSlip = Math.max(maxSlip, b); if (t > 1 && back === null && b < 0.1) back = t; }
  // a held drift circle (the bot), slip angle and speed after 8 s on asphalt and on snow
  const hold = (mu) => { let q = makeCar(), sum = 0, n = 0, v = 0; for (let k = 0; k < 12 / DT; k++) { const t = k * DT; q = step(q, orbitBot(t, q), car, mu); if (t > 7) { sum += Math.abs(bodySlip(q)); v += speedOf(q); n++; } } return `${((sum / n) * 57.3).toFixed(0)} deg at ${((v / n) * 3.6).toFixed(0)} km/h`; };
  // --- the columns of the design (DESIGN-PHYSIK-STRECKE.md 2.9): downhill (only the model on a surface feels a hill), the angle the pedal holds, a change of direction
  const hill = (g) => (x, z, o = {}) => { o.y = g * z; o.gx = 0; o.gz = g; return o; };
  const onHill = (st, input, g) => rawStep(st, input, car, 1, DT, SURF ? hill(g) : null);
  let q = makeCar(0, 0, Math.PI), fastest = 0; for (let k = 0; k < 90 / DT; k++) { q = onHill(q, { ...NONE, throttle: 1 }, 0.1); fastest = Math.max(fastest, speedOf(q)); }
  q = { ...makeCar(0, 0, Math.PI), vz: -100 / 3.6 }; while (speedOf(q) > 0.5) q = onHill(q, { ...NONE, brake: 1 }, 0.1);
  const brakeDown = Math.abs(q.z);
  const held = (th) => { let c = { ...makeCar(), vz: 20 }, sum = 0, n = 0, spun = false; for (let k = 0; k < 14 / DT; k++) { const t = k * DT; c = step(c, { steer: 0.6, throttle: t < 0.5 ? 1 : th, brake: 0, handbrake: t < 0.35 ? 1 : 0 }, car); if (Math.abs(bodySlip(c)) > 1.9 || (speedOf(c) > 3 && Math.abs(Math.atan2(c.vx * Math.cos(c.h) - c.vz * Math.sin(c.h), c.vx * Math.sin(c.h) + c.vz * Math.cos(c.h))) > 1.9)) spun = true; if (t > 8) { sum += Math.abs(bodySlip(c)); n++; } } return spun ? 'spin' : `${((sum / n) * 57.3).toFixed(0)} deg`; };
  let c = { ...makeCar(), vz: 22 }, flip = null, spunT = false;
  for (let k = 0; k < 9 / DT; k++) { const t = k * DT; c = step(c, t < 3 ? { steer: 0.7, throttle: t < 0.4 ? 0.6 : 0.9, brake: 0, handbrake: t < 0.35 ? 1 : 0 } : { steer: -0.7, throttle: t < 3.45 ? 0.2 : 0.9, brake: 0, handbrake: 0 }, car); const bq = bodySlip(c); if (speedOf(c) > 3 && Math.abs(Math.atan2(c.vx * Math.cos(c.h) - c.vz * Math.sin(c.h), c.vx * Math.sin(c.h) + c.vz * Math.cos(c.h))) > 1.9) spunT = true; if (t > 3 && flip === null && bq > 0.26) flip = t - 3; }
  extra.push({ car: car.name, 'flat out down 10 % (km/h)': +(fastest * 3.6).toFixed(0), 'braking 100-0 down 10 % (m)': +brakeDown.toFixed(0), 'held angle at 50 % gas': held(0.5), 'at 75 % gas': held(0.75), 'at 100 % gas': held(1), 'right to left (s)': spunT ? 'spin' : flip === null ? 'grips again' : +flip.toFixed(2) });
  rows.push({ car: car.name, '0-100 km/h (s)': t100 === null ? 'never' : +t100.toFixed(1), 'speed after 20 s (km/h)': +top.toFixed(0), 'braking 100-0 (m)': +d.toFixed(0), 'circle at 50 km/h (m)': +radius.toFixed(0), 'circle at 20 km/h (m)': +radius20.toFixed(0), 'wheel angle at 80, full steer (deg)': +(wheel80 * 57.3).toFixed(0), 'handbrake turn at 80: max slip (deg)': +(maxSlip * 57.3).toFixed(0), 'back under 6 deg after (s)': back === null ? 'no' : +back.toFixed(1), 'held drift, asphalt': hold(1), 'held drift, snow (mu 0.6)': hold(0.6) });
}
console.table(rows);
console.table(extra);
