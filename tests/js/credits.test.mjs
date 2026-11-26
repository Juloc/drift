// game/data/credits.json: every entry says who made it, where it comes from and under which licence; a licence that asks for naming (CC BY and the like) has author, source and licence link;
// every model or picture file under game/assets/ that is not our own has an entry; every link is https.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const credits = JSON.parse(readFileSync(join(root, 'game/data/credits.json'), 'utf8'));

test('every entry has a name, an author, a licence and a use in German and English', () => {
  assert.ok(credits.entries.length >= 5);
  const ids = new Set();
  for (const e of credits.entries) {
    for (const k of ['id', 'kind', 'name', 'author', 'licence']) assert.ok(e[k], `${e.id ?? e.name}: ${k}`);
    assert.ok(e.use?.en && e.use?.de, `${e.id}: use in both languages`);
    assert.ok(!ids.has(e.id), `${e.id} twice`); ids.add(e.id);
  }
});

test('a licence that asks for naming has author, https source and the licence link; all links are https', () => {
  for (const e of credits.entries) {
    if (/^CC[ -]BY/i.test(e.licence) || e.attribution === true) {
      assert.ok(e.author && /^https:\/\//.test(e.source ?? '') && /^https:\/\//.test(e.licenceUrl ?? ''), `${e.id}: CC BY needs author, source and licence link`);
    }
    for (const k of ['source', 'licenceUrl']) if (e[k]) assert.match(e[k], /^https:\/\//, `${e.id}.${k}`);
  }
});

test('three.js is credited and the licence of what is vendored matches', () => {
  const three = credits.entries.find((e) => e.id === 'three');
  assert.equal(three.licence, 'MIT');
  assert.match(readFileSync(join(root, 'vendor/three/LICENSE'), 'utf8'), /MIT/i);
  assert.ok(readFileSync(join(root, 'vendor/README.md'), 'utf8').includes(three.version.split(' ')[0]));
});

test('every outside model, picture or sound file under game/assets has its entry with the file named', () => {
  const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const files = walk(join(root, 'game/assets')).map((p) => relative(root, p)).filter((f) => !/\/s15-test(-hi)?\.glb$/.test(f));   // the S15 test models are made by our own tools/export-s15.mjs
  for (const f of files) assert.ok(credits.entries.some((e) => [].concat(e.file ?? []).includes(f)), `${f} is not in game/data/credits.json`);
});

test('the quay\'s Sketchfab models (CC BY 4.0): each has its entry with attribution, and the four files together stay under 4 MB', () => {
  let total = 0;
  for (const f of ['palm-set', 'barriers', 'fence-set', 'crowd']) {
    const path = `game/assets/skfb/${f}.glb`, e = credits.entries.find((c) => (c.file ?? []).includes(path));
    assert.ok(e, `${path} is in the credits`); assert.equal(e.licence, 'CC BY 4.0'); assert.equal(e.attribution, true); assert.ok(/^https:\/\/sketchfab\.com\//.test(e.source) && e.author && e.changes);
    total += statSync(join(root, path)).size;
  }
  assert.ok(total < 4 * 1024 * 1024, `${(total / 1048576).toFixed(2)} MB`);
});
