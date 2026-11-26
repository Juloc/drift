// The maps made with the track system (tools/make-*.mjs): each road is inside every limit, a bot drives it without touching a wall, and what the map says it has is there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTrack, checkTrack, surfaceAt } from './track.js';
import { mapDrive } from '../../tools/mapdrive.mjs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const MAPS = read('../data/maps.json').maps;
const TRACKED = ['07-practice.json', '05-winter.json', '08-autumn-course.json'];

for (const file of TRACKED) {
  test(`maps: ${file} is listed, its road is inside every limit and the AE86 bot drives it without touching a wall (drifting where the grip allows)`, () => {
    const json = read(`../data/maps/${file}`), entry = MAPS.find((m) => m.file === file);
    assert.ok(entry && entry.id === json.id, 'listed in maps.json with its id');
    const T = loadTrack(json.track), c = checkTrack(T);
    assert.deepEqual(c.problems.map((p) => p.text), []);
    const r = mapDrive(json, 1);
    assert.ok(r.clean, JSON.stringify(r));
    if (!r.bot.steady) assert.ok(r.bends.filter((b) => b.deg >= 20).length >= Math.ceil(r.bends.length * 0.6), `it drifts in most bends: ${JSON.stringify(r.bends)}`);
    for (const g of json.grid) assert.ok(['road', 'plaza'].includes(surfaceAt(T, g.x, g.z).kind), 'start slots on the road or the pad');
  });
}

test('maps: the practice ground has its exercises on the pad (circles, eight, slalom lanes), soft cones, clipping points in every bend of the course', () => {
  const json = read('../data/maps/07-practice.json'), T = loadTrack(json.track);
  const what = new Set(json.cones.map((c) => c.what));
  for (const w of ['circle-15', 'circle-25', 'eight', 'slalom-15', 'slalom-22']) assert.ok(what.has(w), w);
  for (const c of json.cones) assert.equal(surfaceAt(T, c.x, c.z).kind, 'plaza');
  assert.equal(json.obstacles.length, 0, 'cones are not walls');
  assert.equal(json.clips.length, json.track.bends.length);
  assert.ok(Math.max(...T.y) - Math.min(...T.y) > 5, 'a gentle hill on the course');
});

test('maps: the winter pass is a circuit of three laps on packed snow with ice patches on the road, wide enough to drift on snow', () => {
  const json = read('../data/maps/05-winter.json'), T = loadTrack(json.track);
  assert.ok(T.closed && json.closed && json.laps === 3);
  assert.equal(json.road.kind, 'snow');
  const ice = json.zones.filter((z) => z.kind === 'ice');
  assert.ok(ice.length >= 3);
  for (const z of ice) assert.equal(surfaceAt(T, z.x, z.z).kind, 'road');
  assert.ok(json.halfWidth >= 6);
  assert.ok(json.track.bends.filter((b) => b.name.startsWith('pin')).length === 2, 'two hairpins');
  assert.ok(Math.max(...T.y) - Math.min(...T.y) > 15, 'up the mountainside');
});
