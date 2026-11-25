import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINES, revs, firing, engineGain, squeal, turboWhistle, nearest } from './engine.js';

test('revs rise inside a gear and fall at the shift, and never leave the engine\'s range', () => {
  const eng = ENGINES[0], top = 35;
  let prev = null, drops = 0, gear = 1;
  for (let v = 0; v <= top; v += 0.25) {
    const r = revs(v, top, eng, gear); gear = r.gear;
    assert.ok(r.rpm >= eng.idle - 1e-9 && r.rpm <= eng.max + 1e-9, `${r.rpm} at ${v}`);
    if (prev && r.rpm < prev.rpm - 200) { drops++; assert.equal(r.gear, prev.gear + 1, 'revs fall only when the box shifts up'); }
    prev = r;
  }
  assert.equal(drops, eng.gears - 1);
  assert.equal(revs(0, top, eng).gear, 1); assert.equal(revs(0, top, eng).rpm, eng.idle);
  assert.equal(revs(top, top, eng, eng.gears).gear, eng.gears);
});

test('the five cars sound different: other revs, other firing frequency, other weights', () => {
  const at = ENGINES.map((e) => { const r = revs(20, 33, e); return { name: e.name, rpm: Math.round(r.rpm), hz: Math.round(firing(r.rpm, e)) }; });
  assert.equal(new Set(at.map((a) => a.hz)).size, 5, JSON.stringify(at));
  assert.ok(firing(5000, ENGINES[2]) > firing(5000, ENGINES[1]), 'a V8 fires more often than a three at the same revs');
  assert.equal(ENGINES.filter((e) => e.turbo).length, 1);
});

test('gain: louder under load and at high revs; the tyres squeal only in a real slide and louder the further it goes', () => {
  const e = ENGINES[0];
  assert.ok(engineGain(1, e.max, e) > engineGain(0, e.idle, e));
  assert.equal(squeal(0.1, 20).gain, 0); assert.equal(squeal(0.9, 1).gain, 0);   // no slide, or no speed: silent
  assert.ok(squeal(0.5, 20).gain > 0 && squeal(0.9, 20).gain > squeal(0.5, 20).gain);
  assert.ok(squeal(0.9, 30).freq > squeal(0.4, 10).freq);
});

test('the turbo whistles when the throttle is lifted at high revs, and only on a turbo car', () => {
  const ox = ENGINES[4], dart = ENGINES[0];
  assert.ok(turboWhistle(0, 1, ox.max, ox) > 0.9);
  assert.equal(turboWhistle(0, 1, ox.idle, ox), 0);        // at idle there is nothing to whistle
  assert.equal(turboWhistle(1, 0, ox.max, ox), 0);        // opening the throttle is no whistle
  assert.equal(turboWhistle(0, 1, dart.max, dart), 0);
});

test('only the four nearest cars get a voice, nearest first, quieter with distance, panned to their side; far cars are silent', () => {
  const cars = [{ id: 1, x: 5, z: 0 }, { id: 2, x: 20, z: 0 }, { id: 3, x: -10, z: 0 }, { id: 4, x: 40, z: 0 }, { id: 5, x: 55, z: 0 }, { id: 6, x: 200, z: 0 }];
  const v = nearest({ x: 0, z: 0, heading: Math.PI / 2 }, cars);   // looking along +x
  assert.deepEqual(v.map((x) => x.car.id), [1, 3, 2, 4]);
  assert.ok(v[0].gain > v[1].gain && v[1].gain > v[2].gain && v[2].gain > v[3].gain);
  assert.ok(v.every((x) => x.gain > 0 && x.gain <= 1));
  const side = nearest({ x: 0, z: 0, heading: 0 }, [{ id: 1, x: 10, z: 0 }, { id: 2, x: -10, z: 0 }]);   // looking along +z: +x is to the right
  assert.ok(side.find((x) => x.car.id === 1).pan > 0 && side.find((x) => x.car.id === 2).pan < 0);
  assert.deepEqual(nearest({ x: 0, z: 0 }, [{ id: 9, x: 90, z: 0 }]), []);
});
