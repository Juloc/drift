// The drivers of the track system's roads (sim/trackbot.js) on the model the game drives on the surface: down the whole touge with every car, the clean driver touches
// nothing, the drift driver slides through every hairpin and touches nothing either. (tools/drivecheck.mjs measures the same drives in full: body, camera, load.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { step, makeCar, bodySlip, DT } from './physics.js';
import { prepareMap } from './map.js';
import { collideBody } from './collision.js';
import { surfaceAt } from './track.js';
import { trackBot, hairpinsOf } from './trackbot.js';

const CARS = JSON.parse(readFileSync(new URL('../data/cars.json', import.meta.url), 'utf8')).cars;
const map = prepareMap(JSON.parse(readFileSync(new URL('../data/maps/06-touge.json', import.meta.url), 'utf8'))), T = map.surface, pins = hairpinsOf(T);
const surf = (x, z, o) => surfaceAt(T, x, z, o);
function down(car, drift) {
  const bot = trackBot(T, { car, drift }), g = map.grid[0], q = {}, pin = pins.map(() => 0);
  let s = makeCar(g.x, g.z, g.h), t = 0, hits = 0;
  for (let i = 0; t < 300; t += DT, i++) {
    s = collideBody(map, step(s, bot(t, s), car, 1, DT, surf)); if (s.hit > 1) hits++;
    if (i % 3 === 0) { surfaceAt(T, s.x, s.z, q); const b = (Math.abs(bodySlip(s)) * 180) / Math.PI; for (let k = 0; k < pins.length; k++) if (q.s > pins[k].from - 5 && q.s < pins[k].to + 5 && b > pin[k]) pin[k] = b; if (q.s > T.len - 12) break; }
  }
  return { t, hits, pin, done: q.s > T.len - 12 };
}

test('track bot: the touge has eight hairpins, alternately right and left', () => {
  assert.equal(pins.length, 8);
  assert.deepEqual(pins.map((p) => p.right), [true, false, true, false, true, false, true, false]);
});

test('track bot: the clean driver takes every car down the touge without touching a wall and without a slide', () => {
  for (const car of CARS) { const r = down(car, false); assert.ok(r.done && r.hits === 0 && Math.max(...r.pin) < 8, `${car.name}: ${r.t.toFixed(0)} s, ${r.hits} hits, up to ${Math.max(...r.pin).toFixed(0)} degrees`); assert.ok(r.t < 135, `${car.name}: ${r.t.toFixed(0)} s`); }
});

test('track bot: the drift driver slides through every hairpin with every car and touches nothing; it is quicker than the clean one', () => {
  for (const car of CARS) {
    const r = down(car, true), least = car.name === 'Ox' ? 17 : 26;   // the Ox is heavy with little power: it comes round, but not far
    assert.ok(r.done && r.hits === 0, `${car.name}: ${r.t.toFixed(0)} s, ${r.hits} hits`);
    assert.ok(Math.min(...r.pin) >= least && Math.max(...r.pin) < 60, `${car.name}: ${r.pin.map((p) => p.toFixed(0)).join(' ')} degrees in the hairpins`);
    assert.ok(r.t < down(car, false).t, `${car.name}: ${r.t.toFixed(0)} s sliding`);
  }
});
