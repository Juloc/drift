// Numbers of the driving model for every car (what a person would call "how it drives"). Run: node tools/measure.mjs
import { readFileSync } from 'node:fs';
import { step, makeCar, bodySlip, speedOf, DT } from '../game/sim/physics.js';
import { orbitBot } from '../game/sim/bot.js';
const cars = JSON.parse(readFileSync(new URL('../game/data/cars.json', import.meta.url), 'utf8')).cars;
const NONE = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
const rows = [];
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
  // handbrake turn at 80 km/h: handbrake 0.8 s, steering right 1.2 s, then hands off
  s = { ...makeCar(), vz: 80 / 3.6 }; let maxSlip = 0, back = null;
  for (let k = 0; k < 6 / DT; k++) { const t = k * DT; s = step(s, { steer: t < 1.2 ? 1 : 0, throttle: 0.3, brake: 0, handbrake: t < 0.8 ? 1 : 0 }, car); const b = Math.abs(bodySlip(s)); maxSlip = Math.max(maxSlip, b); if (t > 1 && back === null && b < 0.1) back = t; }
  // a held drift circle (the bot), slip angle and speed after 8 s on asphalt and on snow
  const hold = (mu) => { let q = makeCar(), sum = 0, n = 0, v = 0; for (let k = 0; k < 12 / DT; k++) { const t = k * DT; q = step(q, orbitBot(t, q), car, mu); if (t > 7) { sum += Math.abs(bodySlip(q)); v += speedOf(q); n++; } } return `${((sum / n) * 57.3).toFixed(0)} deg at ${((v / n) * 3.6).toFixed(0)} km/h`; };
  rows.push({ car: car.name, '0-100 km/h (s)': t100 === null ? 'never' : +t100.toFixed(1), 'speed after 20 s (km/h)': +top.toFixed(0), 'braking 100-0 (m)': +d.toFixed(0), 'circle at 50 km/h (m)': +radius.toFixed(0), 'handbrake turn at 80: max slip (deg)': +(maxSlip * 57.3).toFixed(0), 'back under 6 deg after (s)': back === null ? 'no' : +back.toFixed(1), 'held drift, asphalt': hold(1), 'held drift, snow (mu 0.6)': hold(0.6) });
}
console.table(rows);
