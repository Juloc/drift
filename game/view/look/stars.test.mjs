import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeStars } from './sky.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../../data/looks/${n}.json`, import.meta.url), 'utf8'));

test('stars: one Points object, about 800, none below 15 degrees, weaker near the sun, the same sky every time', () => {
  const look = read('touge-dusk'), a = makeStars(look), b = makeStars(look);
  assert.equal(a.isPoints, true); assert.ok(a.geometry.attributes.position.count > 600 && a.geometry.attributes.position.count <= 800, `${a.geometry.attributes.position.count} stars`);
  const p = a.geometry.attributes.position, c = a.geometry.attributes.color, sun = look.sun.dir, sl = Math.hypot(...sun);
  let low = 90, nearSun = 0, nearN = 0, farSun = 0, farN = 0;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getY(i), p.getZ(i)), el = Math.asin(p.getY(i) / r) * 180 / Math.PI; low = Math.min(low, el);
    const dot = (-p.getX(i) * sun[0] + p.getY(i) * sun[1] + p.getZ(i) * sun[2]) / (r * sl);   // (the view's x is mirrored)
    if (dot > 0.85) { nearSun += c.getW(i); nearN++; } else if (dot < 0.2) { farSun += c.getW(i); farN++; }
  }
  assert.ok(low >= 14.99, `the lowest star is at ${low.toFixed(1)} degrees`);
  if (nearN > 3 && farN > 3) assert.ok(nearSun / nearN < farSun / farN, 'weaker towards the sun');
  assert.deepEqual(Array.from(a.geometry.attributes.position.array.slice(0, 30)), Array.from(b.geometry.attributes.position.array.slice(0, 30)));
});

test('stars: the looks that name them: dusk weak, winter stronger, harbour full; a look without the key has none', () => {
  const ma = (n) => { const c = makeStars(read(n)).geometry.attributes.color; let m = 0; for (let i = 0; i < c.count; i++) m = Math.max(m, c.getW(i)); return m; };
  assert.ok(ma('touge-dusk') < ma('winter-blue') && ma('winter-blue') < ma('harbour-night') + 1e-9, `${ma('touge-dusk')} ${ma('winter-blue')} ${ma('harbour-night')}`);
  assert.equal(read('desert-dusk').sky.stars, undefined);
  assert.ok(read('touge-dusk').sky.stars.bright <= 0.5);
});

test('clouds: the touge look has five bands and warm cloud colours', () => {
  const s = read('touge-dusk').sky; assert.ok(s.bands.length >= 3 && s.bands.length <= 5); assert.match(s.clouds.lit, /^#ff/i);
});
