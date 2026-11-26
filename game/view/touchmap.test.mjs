// Every key of the game has a way by touch (docs: the owner's rule), and the buttons really exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KEYS } from './touchmap.js';

const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const pages = ['../../src/Drift/wwwroot/play/index.html', '../index.html'].map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');

test('every key that main.js listens for is in the touch map', () => {
  const used = new Set([...main.matchAll(/input\.onkey\.(\w+)/g)].map((m) => m[1]));
  for (const m of main.matchAll(/e\.code === '(\w+)'/g)) used.add(m[1]);
  if (/\^\[0-9\]\$/.test(main)) used.add('Digit');   // the emote keys
  for (const k of used) assert.ok(KEYS[k], `the key ${k} has no entry in game/view/touchmap.js`);
});

test('every touch button of the map is made by main.js or the page', () => {
  for (const [key, v] of Object.entries(KEYS)) {
    if (v.exempt) { assert.ok(v.exempt.length > 8, `${key}: say why it is exempt`); continue; }
    const made = new RegExp(`id: '${v.touch}'|menuBtn\\('${v.touch}'|id="${v.touch}"`).test(main + pages);
    assert.ok(made, `${key}: no button with the id ${v.touch}`);
  }
});
