import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareMap } from './map.js';
import { botGhost } from './ghostbot.js';
import { GhostPlayer } from './ghost.js';
import { surfaceAt } from './track.js';

const CARS = JSON.parse(readFileSync(new URL('../data/cars.json', import.meta.url), 'utf8')).cars;
const map = prepareMap(JSON.parse(readFileSync(new URL('../data/maps/06-touge.json', import.meta.url), 'utf8')));

test('bot ghost: the practice bot drives the whole touge in a bit over a hundred seconds and the recording plays back along the road, forwards', () => {
  const d = botGhost(map, CARS[1]);
  assert.ok(d && d.bot && d.ms > 90000 && d.ms < 140000, `${d?.ms} ms`);
  const g = new GhostPlayer(d), q = {}; let last = -1, back = 0;
  for (let t = 0; t < g.length; t += 1) { const p = g.at(t); surfaceAt(map.surface, p.x, p.z, q); if (q.s < last - 2) back++; last = Math.max(last, q.s); }
  assert.ok(last > map.surface.len - 30, `it gets to ${last.toFixed(0)} of ${map.surface.len.toFixed(0)} m`);
  assert.equal(back, 0, 'it never goes back along the road');
});

test('bot ghost: all five cars come down, and a map that is a loop or has no road gives none', () => {
  for (const car of CARS) assert.ok(botGhost(map, car), car.name);
  assert.equal(botGhost({ ...map, surface: null }, CARS[1]), null);
  assert.equal(botGhost({ ...map, closed: true }, CARS[1]), null);
});
