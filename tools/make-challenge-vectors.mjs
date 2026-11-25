// Writes tests/vectors/challenge.json: runs of every challenge type through game/sim/challenge.js with the numbers it gives.
// The browser's test and the server's C# test (ChallengeRun in src/Drift/Race/Challenges.cs) both read this file.
// Run: node tools/make-challenge-vectors.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { newRun, runStep, resultOf } from '../game/sim/challenge.js';

const defs = JSON.parse(readFileSync(new URL('../game/data/challenges.json', import.meta.url), 'utf8')).challenges.filter((c) => c.type !== 'lap');
const dt = 1 / 15;
const rep = (n, o) => Array.from({ length: n }, () => o);
const D = (slip, speed, hit = 0, tandem = 0) => ({ slip, speed, hit, turned: Math.abs(slip), tandem });
const runs = {
  'a clean slide of ten seconds': [...rep(30, D(0.02, 20)), ...rep(150, D(0.6, 25)), ...rep(40, D(0.02, 20))],
  'a slide of five, a break, a slide of three': [...rep(75, D(0.5, 15)), ...rep(15, D(0.05, 15)), ...rep(45, D(0.5, 15)), ...rep(30, D(0, 15))],
  'fast then slow': [...rep(150, D(0.5, 12)), ...rep(135, D(0.5, 22))],
  'a long chain': rep(150, D(0.6, 25)),
  'a wall hit in the middle': [...rep(90, D(0.6, 25)), ...rep(30, D(0.02, 25)), D(0.1, 25, 8), ...rep(60, D(0.6, 25))],
  'tandem total grows': Array.from({ length: 200 }, (_, i) => D(0.5, 20, 0, Math.min(500, i * 3))),
  'nothing': rep(1000, D(0, 0)),
};
const out = {};
for (const def of defs) for (const [name, steps] of Object.entries(runs)) {
  let run = newRun(def);
  for (const o of steps) run = runStep(run, o, dt);
  const r = resultOf(run);
  out[`${def.id}: ${name}`] = { id: def.id, dt, steps, value: +r.value.toFixed(4), stars: r.stars, done: r.done, failed: r.failed };
}
writeFileSync(new URL('../tests/vectors/challenge.json', import.meta.url), JSON.stringify(out) + '\n');
console.log('wrote', Object.keys(out).length, 'runs');
