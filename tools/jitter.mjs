// Does the car shake? Per situation: how much the body's pose and the forces jump from one step to the next (a smooth car has tiny numbers).
import { step, makeCar, AE86_DRIFT as CAR, ASSISTS, FLAT, DT, G } from '../game/sim/sim2.js';
const rolling = (v, gear) => { const s = makeCar(); s.vz = v; for (let i = 0; i < 4; i++) s.wheel[i] = v / CAR.wheelR; s.gear = gear; s.engage = 1; s.we = (v / CAR.wheelR) * CAR.gears[gear - 1] * CAR.final; return s; };
function sit(name, A, s, seconds, from, drive) { const i = { throttle: 0, brake: 0, steer: 0, handbrake: 0, clutch: 0 }; let p = null; const d = { pitch: 0, roll: 0, y: 0, alon: 0, alat: 0, w: 0, steer: 0, rpm: 0 }; let n = 0;
  for (let k = 0; k < seconds / DT; k++) { const t = k * DT; drive(i, s, t); step(s, i, CAR, A, FLAT); if (t >= from) { if (p) { for (const key in d) d[key] = Math.max(d[key], Math.abs(s[key] - p[key])); n++; } p = { pitch: s.pitch, roll: s.roll, y: s.y, alon: s.alon, alat: s.alat, w: s.w, steer: s.steer, rpm: s.rpm }; } }
  console.log(name.padEnd(34), 'largest jump per step: pitch', (d.pitch * 57.3).toFixed(3), 'deg  roll', (d.roll * 57.3).toFixed(3), 'deg  height', (d.y * 1000).toFixed(2), 'mm  alon', (d.alon / G).toFixed(3), 'g  alat', (d.alat / G).toFixed(3), 'g  yaw', (d.w * 57.3).toFixed(2), 'deg/s  steer', (d.steer * 57.3).toFixed(2), 'deg  rpm', d.rpm.toFixed(0)); }
const A = ASSISTS.arcade;
sit('standing, no pedal', A, makeCar(), 5, 1, () => {});
sit('creeping, 10 % throttle', A, makeCar(), 6, 2, (i) => { i.throttle = 0.1; });
sit('steady 50 km/h', A, rolling(14, 2), 6, 2, (i, s) => { i.throttle = Math.min(1, Math.max(0, (14 - s.speed) * 0.5 + 0.15)); });
sit('steady 50 km/h, key right held', A, rolling(14, 2), 6, 2, (i, s) => { i.steer = 1; i.throttle = 0.3; });
sit('full throttle from a stand', A, makeCar(), 6, 0.5, (i) => { i.throttle = 1; });
sit('braking to a stop and standing', A, rolling(14, 2), 6, 0.2, (i) => { i.brake = 0.6; });
sit('lift off at 60, coasting', A, rolling(17, 2), 5, 0.5, () => {});
