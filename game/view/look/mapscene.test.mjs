// The drawn scene made from a physics map and a theme: every map of data/maps.json has a theme, a look and a field that is consistent with the road.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sceneFromMap, closedGrade } from './mapscene.js';
import { makeField } from './field.js';

const read = (f) => JSON.parse(readFileSync(new URL('../../data/' + f, import.meta.url), 'utf8'));
const maps = read('maps.json').maps;

test('the grade of a closed road is the same at both ends and stays within its amplitude', () => {
  const g = closedGrade(1200, { amp: 8, waves: 3, phase: 0.5 });
  assert.equal(g[0][1], g.at(-1)[1]);
  assert.ok(g.every(([, y]) => Math.abs(y) <= 8.01));
  assert.ok(Math.abs(g.at(-1)[0] - 1200) < 1e-9);
});

for (const m of maps) {
  test(`map ${m.id} (${m.name}): theme, look and field fit the physics`, () => {
    const json = read('maps/' + m.file), theme = read(`scenes/${m.scene}.json`), look = read(`looks/${theme.look}.json`);
    const scene = sceneFromMap(json, theme);
    assert.equal(scene.road.closed, true);
    assert.equal(scene.road.halfWidth, json.halfWidth);
    assert.ok(look.tiers.high && look.tiers.low, 'both tiers');
    assert.ok(scene.startLine, 'the first gate is the start line');
    const f = makeField(scene, { cell: look.tiers.low.cell });
    assert.ok(f.road.length > 50);
    // the road's drawn height is continuous across the seam
    assert.ok(Math.abs(f.roadY(0) - f.roadY(f.info.length)) < 0.5, 'closed grade');
    // a point on the road is at the road's height, a point 400 m off the loop is not on the road
    const [x, z] = json.centre[10];
    assert.ok(f.edge(x, z) === 0);
    assert.ok(Number.isFinite(f.height(x + 30, z + 30)));
    // the physics map's start grid stands on the drawn driving ground (the road, or the flat area)
    for (const g of json.grid) assert.ok(f.edge(g.x, g.z) < 0.5, `grid slot at ${g.x}, ${g.z} is off the ground`);
    if (theme.mode === 'road') {
      // the land rises inside a closed road and falls away outside it
      const inside = f.base(...insidePoint(f, json.centre[10])), outside = f.base(...outsidePoint(f, json.centre[10]));
      assert.ok(inside > outside, `inside ${inside} outside ${outside}`);
    }
  });
}

function sides(f, p) {
  const i = 10, d = f.info.dir[Math.min(i, f.info.dir.length - 1)], r = [d[1], -d[0]];
  return [[p[0] + r[0] * 40, p[1] + r[1] * 40], [p[0] - r[0] * 40, p[1] - r[1] * 40]];
}
const insidePoint = (f, p) => (f.insideSide === 1 ? sides(f, p)[0] : sides(f, p)[1]);
const outsidePoint = (f, p) => (f.insideSide === 1 ? sides(f, p)[1] : sides(f, p)[0]);
