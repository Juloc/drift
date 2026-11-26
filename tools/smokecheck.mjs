// How often does only ONE rear wheel smoke? Per situation: share of the time with smoke at both rear wheels, at one only, at none; and each wheel's mean smoke and sliding power.
import { step, makeCar, AE86_DRIFT as CAR, ASSISTS, FLAT, DT, smokeOf } from '../game/sim/sim2.js';
const rolling = (v, gear) => { const s = makeCar(); s.vz = v; for (let i = 0; i < 4; i++) s.wheel[i] = v / CAR.wheelR; s.gear = gear; s.engage = 1; s.we = (v / CAR.wheelR) * CAR.gears[gear - 1] * CAR.final; return s; };
function sit(name, A, s, seconds, from, drive) { const i = { throttle: 0, brake: 0, steer: 0, handbrake: 0, clutch: 0, manual: true }; let both = 0, one = 0, none = 0, n = 0, smIn = 0, smOut = 0, pIn = 0, pOut = 0, fzIn = 0, fzOut = 0;
  for (let k = 0; k < seconds / DT; k++) { const t = k * DT; drive(i, s, t); step(s, i, CAR, A, FLAT); if (t >= from) { const a = smokeOf(s, CAR, 2), b = smokeOf(s, CAR, 3), lo = Math.min(a, b), hi = Math.max(a, b); if (lo > 0.05) both++; else if (hi > 0.05) one++; else none++; n++; const inner = s.fz[2] < s.fz[3] ? 2 : 3, outer = 5 - inner; smIn += smokeOf(s, CAR, inner); smOut += smokeOf(s, CAR, outer); pIn += s.heat[inner]; pOut += s.heat[outer]; fzIn += s.fz[inner]; fzOut += s.fz[outer]; } }
  const pc = (v) => `${Math.round((v / n) * 100)} %`.padStart(5);
  console.log(name.padEnd(40), 'both', pc(both), ' one only', pc(one), ' none', pc(none), '| inner wheel: load', (fzIn / n).toFixed(0).padStart(4), 'N', (pIn / n / 1000).toFixed(0).padStart(3), 'kW smoke', (smIn / n).toFixed(2), '| outer:', (fzOut / n).toFixed(0).padStart(4), 'N', (pOut / n / 1000).toFixed(0).padStart(3), 'kW smoke', (smOut / n).toFixed(2)); }
const drift = (A, T, bias) => { let pb = 0; return (i, s, t) => { const b = Math.abs(s.beta), db = (b - pb) / DT; pb = b; if (t < 0.4) { i.steer = 1; i.throttle = 0.5; } else if (t < 0.9 && b < 0.25) { i.steer = 1; i.handbrake = 1; i.clutch = 1; i.throttle = 0.7; } else { i.handbrake = 0; i.clutch = 0; i.throttle = Math.min(1, Math.max(0.3, 0.72 + (T - b) * 1.0 - db * 0.25)); i.steer = Math.min(1, Math.max(-1, bias + (T - b) * 1.6 - db * 0.45)); } }; };
for (const name of ['arcade', 'sim']) { const A = ASSISTS[name], bias = name === 'sim' ? -0.15 : 0.2; console.log(name);
  sit('  held drift, 30 deg', A, rolling(16, 2), 14, 3, drift(A, 0.55, bias));
  sit('  held drift, 20 deg (gentle)', A, rolling(16, 2), 14, 3, drift(A, 0.35, bias));
  sit('  drift entry, first 3 s', A, rolling(16, 2), 3, 0.5, drift(A, 0.55, bias));
  sit('  donut from a stand', A, makeCar(), 8, 2, (i) => { i.throttle = 1; i.steer = 1; });
  sit('  power slide out of a slow bend', A, rolling(9, 2), 5, 1, (i, s, t) => { i.steer = 0.7; i.throttle = 1; }); }
