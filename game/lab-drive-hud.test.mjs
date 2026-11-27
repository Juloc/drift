// The driving display's numbers: the drift score and the laps (the parts without a page).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeScore, makeLaps } from './lab-drive-hud.js';

test('points only while the car slides; a chain raises the multiplier; a pause banks them', () => {
  const s = makeScore(); for (let i = 0; i < 60; i++) s.step(1 / 60, 80, 3); assert.equal(s.run, 0, 'driving straight scores nothing');
  for (let i = 0; i < 180; i++) s.step(1 / 60, 60, 30); assert.ok(s.run > 500 && s.mult >= 1.8 && s.live, `a three-second slide: ${s.run} at x${s.mult}`);
  const run = s.run; for (let i = 0; i < 60; i++) s.step(1 / 60, 60, 2); assert.equal(s.run, run, 'a short straight keeps the chain');
  for (let i = 0; i < 60; i++) s.step(1 / 60, 60, 2); assert.equal(s.run, 0); assert.equal(Math.round(s.total), Math.round(run)); assert.equal(s.mult, 1);
  s.step(1, 10, 40); assert.equal(s.run, 0, 'a slow spin on the spot scores nothing');
});
test('a lap is one full turn round the middle, either way, with its time', () => {
  const l = makeLaps(30, -4); for (let i = 0; i <= 400; i++) { const a = (i / 400) * 2 * Math.PI * 2.05; l.step(0.05, 30 + 26 * Math.cos(a), -4 + 26 * Math.sin(a)); }
  assert.equal(l.lap, 3); assert.ok(Math.abs(l.best - 400 * 0.05 / 2.05) < 0.2, `best lap ${l.best}`);
  const back = makeLaps(0, 0); for (let i = 0; i <= 100; i++) { const a = -(i / 100) * 2 * Math.PI * 1.01; back.step(0.1, Math.cos(a), Math.sin(a)); } assert.equal(back.lap, 2);
});
