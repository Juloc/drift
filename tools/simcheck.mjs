// Checks of sim2 against the real car and against what a drift needs. Usage: node simcheck.mjs [--drift] (the drift set-up instead of the stock car)
import { step, makeCar, AE86, AE86_DRIFT, ASSISTS, FLAT, DT, G } from '../game/sim/sim2.js';
const drift = process.argv.includes('--drift'), CAR = drift ? AE86_DRIFT : AE86;
const kmh = (v) => v * 3.6, deg = (r) => (r * 180) / Math.PI;
const rows = [];
const row = (name, value, unit, lo, hi) => rows.push({ name, value, unit, ok: lo === undefined ? null : value >= lo && value <= hi, want: lo === undefined ? '' : `${lo}..${hi}` });
const run = (s, A, seconds, drive, each, car = CAR, env = FLAT) => { const inp = { throttle: 0, brake: 0, steer: 0, handbrake: 0, clutch: 0 }; for (let t = 0, n = Math.round(seconds / DT); t < n; t++) { drive(inp, s, t * DT); step(s, inp, car, A, env); if (each && each(s, t * DT) === false) return t * DT; } return seconds; };
const rolling = (v, gear) => { const s = makeCar(); s.vz = v; for (let i = 0; i < 4; i++) s.wheel[i] = v / CAR.wheelR; s.gear = gear; s.engage = 1; s.we = (v / CAR.wheelR) * CAR.gears[gear - 1] * CAR.final; return s; };

// 1 acceleration, quarter mile, top speed
{ const s = makeCar(); let t100 = 0, t400 = 0, vmax = 0, back = 0;
  run(s, ASSISTS.sim, 70, (i) => { i.throttle = 1; }, (s, t) => { if (!t100 && s.speed >= 100 / 3.6) t100 = t; if (!t400 && s.z >= 402) t400 = t; vmax = Math.max(vmax, s.speed); if (s.vz < -0.01) back = 1; });
  row('0-100 km/h', t100, 's', drift ? 6.2 : 8.2, drift ? 8.2 : 9.8); row('400 m', t400, 's', drift ? 14.6 : 15.9, drift ? 16 : 17.2); row('top speed', kmh(vmax), 'km/h', drift ? 185 : 180, drift ? 220 : 200); row('rolled backwards', back, '', 0, 0); }
// 2 braking 100-0 with and without ABS
for (const [name, A, lo, hi] of [['brake 100-0, ABS', ASSISTS.arcade, 34, 44], ['brake 100-0, locked', ASSISTS.sim, 40, 58]]) { const s = rolling(100 / 3.6, 3); const z0 = s.z; let peak = 0;
  run(s, A, 8, (i) => { i.brake = 1; }, (s) => { peak = Math.max(peak, -s.alon / G); return s.speed > 0.2; }); row(name, s.z - z0, 'm', lo, hi); if (A === ASSISTS.arcade) row('  peak deceleration', peak, 'g', 0.85, 1.15); }
// 3 steady cornering in second gear, the wheel held still (no caster), the speed rising slowly: the most sideways g, and which end gives up first
{ const s = rolling(8, 2), A = { ...ASSISTS.sim, caster: 0 }; let best = 0, acc = 0, cnt = 0, front = 0, spin = 0;
  run(s, A, 60, (i, s, t) => { i.manual = true; i.steer = 0.2; i.throttle = Math.min(1, Math.max(0, (8 + t * 0.3 - s.speed) * 0.5 + 0.25)); },
    (s) => { acc += Math.abs(s.alat) / G; cnt++; if (cnt === 60) { if (acc / cnt > best) { best = acc / cnt; front = Math.max(s.sn[0], s.sn[1]) > Math.max(s.sn[2], s.sn[3]) ? 1 : 0; } acc = 0; cnt = 0; } if (Math.abs(s.beta) > 0.5) { spin = 1; return false; } return s.speed < 24; });
  row('steady cornering: most sideways g', best, 'g', 0.8, drift ? 1.02 : 0.95); row('  the front gives up first (understeer)', front, '', drift ? 0 : 1, 1); row('  ends in a spin', spin, '', 0, drift ? 1 : 0); }
// 4 roll and pitch
{ const s = rolling(15, 2); let roll = 0, lat = 0; run(s, ASSISTS.sim, 4, (i, s) => { i.steer = 0.16; i.throttle = 0.25; }, (s, t) => { if (t > 3) { roll = s.roll; lat = s.alat / G; } });
  row('roll per g', Math.abs(deg(roll) / lat), 'deg/g', drift ? 0.8 : 2.2, drift ? 2.6 : 5.5); row('  leans out of the bend', Math.sign(roll) === -Math.sign(lat) ? 1 : 0, '', 1, 1);
  const b = rolling(25, 3); let pitch = 0; run(b, ASSISTS.arcade, 1.2, (i) => { i.brake = 0.7; }, (s, t) => { if (t > 0.8) pitch = s.pitch; }); row('dive under braking', -deg(pitch), 'deg', drift ? 0.3 : 0.8, drift ? 1.6 : 3.2); }
// 5 power oversteer in second gear, clutch kick, handbrake
{ const s = rolling(14, 2); let beta = 0; run(s, ASSISTS.sim, 3.5, (i, s, t) => { i.steer = 0.55; i.throttle = t > 0.6 ? 1 : 0.3; }, (s) => { beta = Math.max(beta, Math.abs(s.beta)); }); row('power-over, 2nd, 50 km/h: angle reached', deg(beta), 'deg', drift ? 20 : 8, 180); }
{ const s = rolling(17, 2); let kap = 0; run(s, ASSISTS.sim, 2.2, (i, s, t) => { i.steer = 0.3; i.throttle = 1; i.clutch = t > 0.8 && t < 1.05 ? 1 : 0; }, (s, t) => { if (t > 1.05 && t < 1.6) kap = Math.max(kap, s.kappa[2], s.kappa[3]); }); row('clutch kick: rear slip ratio', kap, '', 0.2, 9); }
{ const s = rolling(17, 2); let lock = 1, beta = 0; run(s, ASSISTS.sim, 1.6, (i, s, t) => { i.steer = 0.35; i.handbrake = t > 0.5 && t < 1.1 ? 1 : 0; i.clutch = i.handbrake; }, (s, t) => { if (t > 0.7 && t < 1.1) lock = Math.min(lock, (s.wheel[2] * CAR.wheelR) / Math.max(1, s.speed)); beta = Math.max(beta, Math.abs(s.beta)); }); row('handbrake: rear wheel speed / road', lock, '', 0, 0.15); row('  angle reached', deg(beta), 'deg', 10, 180); }
// 6 holding a drift on a circle with a simple driver (second gear held), under each helper set
for (const name of ['arcade', 'sport', 'sim']) { const A = ASSISTS[name], s = rolling(16, 2); let held = 0, spun = 0, sum = 0, n = 0, vsum = 0, pb = 0; const T = 0.55;
  run(s, A, 16, (i, s, t) => { const b = Math.abs(s.beta), db = (b - pb) / DT; pb = b; i.manual = true;
    if (t < 0.4) { i.steer = 1; i.throttle = 0.5; } else if (t < 0.9 && b < 0.25) { i.steer = 1; i.handbrake = 1; i.clutch = 1; i.throttle = 0.7; }
    else { i.handbrake = 0; i.clutch = 0; i.throttle = Math.min(1, Math.max(0.3, 0.72 + (T - b) * 1.0 - db * 0.25)); i.steer = Math.min(1, Math.max(-1, (name === 'sim' ? -0.15 : name === 'sport' ? 0.1 : 0.2) + (T - b) * 1.6 - db * 0.45)); } },
    (s, t) => { const b = Math.abs(s.beta); if (t > 2.5) { if (b > 0.3 && b < 1.0 && s.speed > 6) held += DT; sum += b; vsum += s.speed; n++; } if (b > 1.5 || s.speed < 2) { spun = 1; return false; } });
  row(`drift held (${name})`, held, 's of 13.5', name === 'sim' || (!drift && name === 'sport') ? 0 : 9, 13.6); row('  mean angle / speed', deg(sum / Math.max(1, n)), `deg at ${kmh(vsum / Math.max(1, n)).toFixed(0)} km/h`); row('  spun', spun, '', 0, name === 'sim' || (!drift && name === 'sport') ? 1 : 0); }
// 7 letting go in a slide: the helpers bring it back
for (const name of ['arcade', 'sim']) { const A = ASSISTS[name], s = rolling(18, 2); let end = 9, maxb = 0;
  run(s, A, 7, (i, s, t) => { if (t < 0.5) { i.steer = 1; i.throttle = 0.4; } else if (t < 1.0) { i.steer = 1; i.handbrake = 1; i.clutch = 1; } else { i.steer = 0; i.handbrake = 0; i.clutch = 0; i.throttle = 0.25; } }, (s, t) => { if (t > 1) maxb = Math.max(maxb, Math.abs(s.beta)); if (t > 6) end = Math.abs(s.beta); });
  row(`hands off after a handbrake turn (${name}): angle at the end`, deg(end), 'deg', 0, name === 'arcade' ? 4 : 180); row('  largest angle', deg(maxb), 'deg'); }
// 8 a parked car on a 10 % hill, a crest, coasting
{ const s = makeCar(); run(s, ASSISTS.arcade, 5, () => {}, null, CAR, { ...FLAT, az: -G * 0.0995 }); row('parked on a 10 % hill: moved', Math.abs(s.z), 'm', 0, 0.02); }
{ const s = rolling(27.8, 4); s.gear = 0; let up = 0; run(s, ASSISTS.sim, 10, () => {}, (s) => { if (s.speed > 27.81) up = 1; }); row('coasting in neutral for 10 s: speed left', kmh(s.speed), 'km/h', 70, 96); row('  ever faster', up, '', 0, 0); }
{ const s = rolling(25, 3); let minLoad = 9; const yW = new Float64Array(4), yWv = new Float64Array(4), env = { ...FLAT, yW, yWv }; const road = (z) => (z > 20 && z < 60 ? 0.6 * Math.sin(((z - 20) / 40) * Math.PI) ** 2 : 0);
  const inp = { throttle: 0.3, brake: 0, steer: 0, handbrake: 0, clutch: 0 };
  for (let t = 0; t < 4 / DT; t++) { for (let i = 0; i < 4; i++) { const z = s.z + (i < 2 ? CAR.a : -CAR.b), y = road(z); yWv[i] = (y - yW[i]) / DT; yW[i] = y; } step(s, inp, CAR, ASSISTS.sim, env); if (s.z > 35 && s.z < 50) minLoad = Math.min(minLoad, (s.fz[0] + s.fz[1] + s.fz[2] + s.fz[3]) / (CAR.mass * G)); }
  row('over a crest (0.6 m in 40 m) at 90 km/h: least wheel load', minLoad, 'g', 0.2, 0.85); }
// 9 the same run twice is the same
{ const a = rolling(16, 2), b = rolling(16, 2); const d = (i, s, t) => { i.steer = Math.sin(t * 2); i.throttle = 0.8; }; run(a, ASSISTS.arcade, 6, d); run(b, ASSISTS.arcade, 6, d); row('repeatable', a.x === b.x && a.z === b.z && a.we === b.we ? 1 : 0, '', 1, 1); }

let bad = 0;
console.log(CAR.name);
for (const r of rows) { if (r.ok === false) bad++; console.log(`${r.ok === null ? '      ' : r.ok ? 'ok    ' : 'BROKEN'} ${r.name.padEnd(58)} ${(typeof r.value === 'number' ? r.value.toFixed(2) : r.value).toString().padStart(8)} ${r.unit}${r.want ? `   (want ${r.want})` : ''}`); }
console.log(bad ? `${bad} BROKEN` : 'all inside');
process.exit(bad ? 1 : 0);
