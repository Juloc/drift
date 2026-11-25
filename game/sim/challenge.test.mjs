import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { check, newRun, runStep, valueOf, starsFor, resultOf, TYPES } from './challenge.js';

const file = JSON.parse(readFileSync(new URL('../data/challenges.json', import.meta.url), 'utf8'));
const maps = JSON.parse(readFileSync(new URL('../data/maps.json', import.meta.url), 'utf8')).maps.map((m) => m.id);
const dt = 1 / 15;
const byId = (id) => file.challenges.find((c) => c.id === id);
const ALIAS = { 'tandem-with-the-bot': 'tandem-duo' };
/** Feeds the same observation for `seconds`. */
const feed = (run, obs, seconds) => { for (let i = 0; i < Math.round(seconds / dt); i++) run = runStep(run, obs, dt); return run; };
const D = (slip, speed, extra = {}) => ({ slip, speed, hit: 0, turned: Math.abs(slip), ...extra });

test('the data: six well-formed challenges with unique ids, ascending stars, both languages, an existing map and every type used', () => {
  assert.equal(file.challenges.length, 8);
  assert.equal(new Set(file.challenges.map((c) => c.id)).size, 8);
  for (const c of file.challenges) assert.deepEqual(check(c, maps), [], c.id);
  assert.deepEqual([...new Set(file.challenges.map((c) => c.type))].sort(), [...TYPES].sort());
  assert.ok(check({ id: 'X', type: 'nope', time: 0, stars: [3, 2, 1], title: {}, text: {} }, maps).length >= 5, 'a bad definition is told what is wrong');
});

test('lap challenges: less is better, the stars go down, and a zero time is nothing', () => {
  const def = byId('lap-sprint');
  assert.deepEqual([0, 100000, 85000, 84000, 70000, 59000].map((v) => starsFor(def, v)), [0, 0, 1, 1, 2, 3]);
  assert.ok(check({ ...def, stars: [60000, 70000, 85000] }, maps).includes('stars'), 'ascending stars are wrong for a lap');
});

test('stars: thresholds count, nothing below the first, three at the top', () => {
  const def = byId('first-slide');
  assert.deepEqual([0, 799, 800, 1799, 1800, 2999, 3000, 99999].map((v) => starsFor(def, v)), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test('drift-points: a long clean slide earns stars, a short one does not, and the run ends at the time limit', () => {
  const def = byId('first-slide');
  let run = feed(newRun(def), D(0.02, 20), 2);
  run = feed(run, D(0.6, 25), 10);                   // about 10 seconds of slide
  const r = resultOf(run);
  assert.ok(r.value > 800 && r.stars >= 1, JSON.stringify(r));
  assert.equal(r.done, false);
  run = feed(run, D(0.02, 20), 60);                  // time runs out
  assert.equal(resultOf(run).done, true);
  const frozen = runStep(run, D(0.6, 25), dt);
  assert.equal(frozen, run, 'a finished run no longer changes');
  assert.equal(resultOf(feed(newRun(def), D(0.6, 25), 1.5)).stars, 0);
});

test('drift-hold: the longest unbroken slide counts, a break starts the count again', () => {
  const def = byId('hold-it');
  let run = feed(newRun(def), D(0.5, 15), 5);
  run = feed(run, D(0.05, 15), 1);
  run = feed(run, D(0.5, 15), 3);
  assert.ok(Math.abs(valueOf(run) - 5) < 0.2, `${valueOf(run)}`);
  assert.equal(starsFor(def, valueOf(run)), 1);
  assert.equal(starsFor(def, valueOf(feed(newRun(def), D(0.5, 15), 14.2))), 3);
});

test('drift-fast counts only the seconds above 18 m/s', () => {
  const def = byId('fast-and-sideways');
  let run = feed(newRun(def), D(0.5, 12), 10);
  assert.equal(valueOf(run), 0);
  run = feed(run, D(0.5, 22), 9);
  assert.ok(Math.abs(valueOf(run) - 9) < 0.2);
  assert.equal(starsFor(def, valueOf(run)), 2);
});

test('chain-mult: a long chain reaches the multipliers of the stars', () => {
  const def = byId('chain-reaction');
  const run = feed(newRun(def), D(0.6, 25), 9);
  assert.equal(valueOf(run), 5);
  assert.equal(resultOf(run).stars, 3);
  assert.equal(resultOf(feed(newRun(def), D(0.6, 25), 2.5)).stars, 0);   // x2 so far
});

test('tandem: the total the caller passes in is what counts, and it never goes down', () => {
  const def = byId('tandem-duo');
  let run = newRun(def);
  for (const t of [0, 50, 150, 450, 300]) run = runStep(run, D(0.5, 20, { tandem: t }), dt);
  assert.equal(valueOf(run), 450);
  assert.equal(resultOf(run).stars, 2);
});

test('clean-sheet: a wall hit ends the run at once, with what was banked before it', () => {
  const def = byId('clean-sheet');
  let run = feed(newRun(def), D(0.6, 25), 6);
  run = feed(run, D(0.02, 25), 2);                   // the chain is banked
  const before = valueOf(run);
  assert.ok(before > 800, `${before}`);
  run = runStep(run, D(0.1, 25, { hit: 8 }), dt);
  assert.equal(run.done, true); assert.equal(run.failed, true);
  assert.ok(Math.abs(valueOf(run) - before) < 5, 'what was banked stays');
  // a hit on another type does not end the run
  const other = runStep(newRun(byId('first-slide')), D(0.1, 25, { hit: 8 }), dt);
  assert.equal(other.done, false);
});
