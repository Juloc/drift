// Writes tests/vectors/drift-score.json: sequences of steps through game/sim/score.js with the numbers it gives.
// The browser's test and the server's C# test (DriftScore) both read this file, so the two cannot drift apart.
// Run: node tools/make-score-vectors.mjs
import { writeFileSync } from 'node:fs';
import { newScore, scoreStep } from '../game/sim/score.js';

const dt = 1 / 15; // the server sees a pose 15 times a second
const rep = (n, s) => Array.from({ length: n }, () => s);
const D = (slip, speed, hit = 0, turned = slip) => ({ slip, speed, hit, turned });
const cases = {
  'a clean slide of 4 seconds': [...rep(15, D(0.02, 25)), ...rep(60, D(0.6, 25)), ...rep(40, D(0.02, 25))],
  'two slides linked within the grace time': [...rep(30, D(0.5, 20)), ...rep(15, D(0, 20)), ...rep(45, D(0.5, 20)), ...rep(40, D(0, 20))],
  'two slides too far apart are two chains': [...rep(30, D(0.5, 20)), ...rep(40, D(0, 20)), ...rep(30, D(0.5, 20)), ...rep(40, D(0, 20))],
  'a wall hit loses the pending points': [...rep(45, D(0.5, 22)), D(0.5, 22, 8), ...rep(30, D(0.5, 22)), ...rep(40, D(0, 22))],
  'a spin loses them too': [...rep(45, D(0.5, 22)), D(1, 22, 0, 2.5), ...rep(40, D(0, 22))],
  'too slow or too small an angle is no drift': [...rep(60, D(0.6, 5)), ...rep(60, D(0.2, 25)), ...rep(30, D(0, 25))],
  'a long chain reaches the top multiplier': [...rep(200, D(0.7, 28)), ...rep(40, D(0, 28))],
};
const out = {};
for (const [name, steps] of Object.entries(cases)) {
  let sc = newScore();
  const events = [];
  const trace = [];
  steps.forEach((st, i) => {
    sc = scoreStep(sc, st, dt);
    if (sc.event) events.push({ step: i, type: sc.event.type });
    if (i % 10 === 9 || i === steps.length - 1) trace.push({ step: i, pending: +sc.pending.toFixed(6), banked: +sc.banked.toFixed(6), mult: sc.mult });
  });
  out[name] = { dt, steps, events, trace, banked: +sc.banked.toFixed(6) };
}
writeFileSync(new URL('../tests/vectors/drift-score.json', import.meta.url), JSON.stringify(out) + '\n');
console.log('wrote', Object.keys(out).length, 'cases');
