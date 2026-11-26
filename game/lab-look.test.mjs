import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLIDERS, GROUPS, getPath, setPath, anglesOf, dirOf } from './lab-look-schema.js';

const look = JSON.parse(readFileSync(new URL('./data/looks/academy-sunset.json', import.meta.url), 'utf8'));

test('every slider path exists in the look file, with the kind of value the slider writes', () => {
  for (const s of SLIDERS) {
    const v = getPath(look, s.path);
    assert.ok(v !== undefined, `${s.path} is in academy-sunset.json`);
    if (s.t === 'num') assert.ok(typeof v === 'number' && v >= s.min && v <= s.max, `${s.path} = ${v} inside ${s.min}..${s.max}`);
    else if (s.t === 'colour') assert.match(v, /^#[0-9a-f]{6}$/i, `${s.path} is a #rrggbb colour`);
    else assert.ok(Array.isArray(v) && v.length === 3, `${s.path} is a direction vector`);
    assert.ok(GROUPS.some((g) => g.id === s.g), `${s.path} has a group`);
    assert.equal(s.label.length, 2, `${s.path} has a German and an English label`);
    assert.match(s.apply, /^(light|grade|place|stage)(\+(light|grade|place|stage))*$/);
  }
});

test('the direction sliders: angles and vector go both ways, the look values are inside the sliders', () => {
  for (const path of ['sun.dir', 'key2.dir']) {
    const v = getPath(look, path), a = anglesOf(v), back = dirOf(a.az, a.el), n = Math.hypot(...v);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(back[i] - v[i] / n) < 0.002, `${path}[${i}]`);
    const az = SLIDERS.find((s) => s.path === path && s.t === 'az'), el = SLIDERS.find((s) => s.path === path && s.t === 'el');
    assert.ok(a.az >= az.min && a.az <= az.max && a.el >= el.min && a.el <= el.max, `${path} angles ${a.az.toFixed(0)}, ${a.el.toFixed(0)}`);
  }
});

test('setPath writes into the look and nothing else; no two sliders share a path and kind', () => {
  const o = { a: { b: { c: 1 } }, d: 2 };
  setPath(o, 'a.b.c', 5); assert.deepEqual(o, { a: { b: { c: 5 } }, d: 2 });
  const keys = SLIDERS.map((s) => `${s.path}/${s.t}`); assert.equal(new Set(keys).size, keys.length);
});
