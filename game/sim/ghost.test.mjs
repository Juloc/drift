import test from 'node:test';
import assert from 'node:assert/strict';
import { GhostRecorder, GhostPlayer, STEP } from './ghost.js';

const run = (speed, seconds = 20) => { const r = new GhostRecorder(); for (let t = 0; t < seconds * 60; t++) r.add(1 / 60, (t / 60) * speed, 5, 1.5); return r.data(seconds * 1000); };

test('ghost: one sample every tenth of a second, and it plays back where the car was', () => {
  const d = run(10), g = new GhostPlayer(d);
  assert.ok(Math.abs(d.v.length / 3 - 20 / STEP) <= 2);
  const p = g.at(7.34);
  assert.ok(Math.abs(p.x - 73.4) < 0.3 && Math.abs(p.z - 5) < 0.1 && Math.abs(p.h - 1.5) < 0.02);
  assert.deepEqual(g.at(1000), g.at(g.length - STEP));   // after the end it stays at the last place
});

// the page asks every frame, so the answer moves on a little each time: the tests drive along the same way
const drive = (g, speed, upTo, y = 5, from = 0) => { let d; for (let t = from; t <= upTo; t += 1 / 60) d = g.delta(t, t * speed, y); return d; };

test('ghost: a slower run is behind by the time it needs more, a faster one ahead', () => {
  // the ghost drives 10 m/s; you drive 100 m in 12 s (8.33 m/s): at x = 100 the ghost was there after 10 s, so you are 2 s behind
  let g = new GhostPlayer(run(10)), d;
  for (let t = 0; t <= 12; t += 1 / 60) d = g.delta(t, t * (100 / 12), 5);
  assert.ok(Math.abs(d - 2) < 0.2, `behind by ${d}`);
  g = new GhostPlayer(run(10));
  for (let t = 0; t <= 8; t += 1 / 60) d = g.delta(t, t * 12.5, 5);   // 100 m in 8 s: 2 s ahead
  assert.ok(Math.abs(d + 2) < 0.2, `ahead by ${d}`);
  assert.ok(Math.abs(drive(new GhostPlayer(run(10)), 10, 6)) < 0.15);   // the same speed: no difference
});

test('ghost: the search only goes forwards, so the other branch of a hairpin is not taken', () => {
  // a road that goes out along z = 0 and comes back along z = 10 over the same x
  const r = new GhostRecorder();
  for (let t = 0; t < 20 * 60; t++) { const s = t / 60; r.add(1 / 60, s < 10 ? s * 10 : 100 - (s - 10) * 10, s < 10 ? 0 : 10, 0); }
  const g = new GhostPlayer(r.data(20000));
  for (let s = 0; s <= 5; s += 1 / 60) g.timeNear(s * 10, 0);
  assert.ok(Math.abs(g.timeNear(50, 0) - 5) < 0.3);
  for (let s = 5; s <= 15; s += 1 / 60) g.timeNear(s < 10 ? s * 10 : 100 - (s - 10) * 10, s < 10 ? 0 : 10);   // out and round the bend, back at x = 50 on the way home
  assert.ok(Math.abs(g.timeNear(50, 10) - 15) < 0.3);
});

test('ghost: heading interpolates the short way round', () => {
  const r = new GhostRecorder(); r.add(0.1, 0, 0, 3.1); r.add(0.1, 0, 0, -3.1);
  const g = new GhostPlayer(r.data(100)), h = g.at(0.05).h;
  assert.ok(Math.abs(Math.abs(h) - Math.PI) < 0.1, `heading ${h}`);
});
