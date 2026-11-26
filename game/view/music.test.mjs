// Sound files from outside (game/assets/sound, game/assets/music): each is in the credits with its author, source and licence, the music list matches them,
// the recorded engine's manifest fits its file; and the Ogg packing of tools/sound/oggopus.js (checksums, granule positions).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { muxOggOpus, opusHead, oggCrc } from '../../tools/sound/oggopus.js';

const read = (p) => readFileSync(new URL(p, import.meta.url));
const credits = JSON.parse(read('../data/credits.json')).entries, music = JSON.parse(read('../data/music.json')).tracks;

test('sound: every sound and music file is in the credits (author, source, licence), CC BY ones with attribution', () => {
  const listed = new Set(credits.flatMap((e) => e.file ?? []));
  for (const dir of ['sound', 'music']) for (const f of readdirSync(new URL(`../assets/${dir}/`, import.meta.url)).filter((n) => n.endsWith('.ogg'))) {
    const path = `game/assets/${dir}/${f}`, e = credits.find((c) => (c.file ?? []).includes(path));
    assert.ok(listed.has(path) && e, `${path} is in credits.json`);
    assert.ok(e.author && /^https:\/\//.test(e.source) && e.licence && ['CC0', 'CC BY 3.0', 'CC BY 4.0'].includes(e.licence), path);
    if (e.licence.startsWith('CC BY')) assert.equal(e.attribution, true);
  }
  for (const t of music) { const e = credits.find((c) => (c.file ?? []).includes(`game/assets/music/${t.file}`)); assert.ok(e && e.author === t.author && e.licence === t.licence, t.id); assert.ok(t.seconds > 30); }
});

test('sound: the recorded engine manifest has an on and an off loop at each of its revs, inside its file', () => {
  const m = JSON.parse(read('../assets/sound/ae86-engine.json')), cars = JSON.parse(read('../data/cars.json')).cars;
  assert.equal(cars.find((c) => c.id === 1).sound, 'ae86');
  for (const r of m.rpms) for (const layer of ['on', 'off']) { const l = m.loops.find((x) => x.layer === layer && x.rpm === r); assert.ok(l && l.seconds > 0.2 && l.start >= l.seconds - 1e-6, `${layer} ${r}`); }
  assert.ok(m.rpms.every((r, i) => i === 0 || r > m.rpms[i - 1]));
  const ogg = read('../assets/sound/ae86-engine.ogg');
  assert.equal(ogg.subarray(0, 4).toString(), 'OggS'); assert.equal(ogg.subarray(28, 36).toString(), 'OpusHead');
});

test('oggopus: pages carry valid checksums, the head and tags come first, the last granule is pre-skip plus the length', () => {
  const packets = Array.from({ length: 120 }, (_, i) => Uint8Array.from({ length: 30 + (i % 7) * 40 }, (_, k) => (i * 7 + k) & 255));
  const out = muxOggOpus({ head: opusHead(1, 312), packets, samples: 120 * 960 - 500 });
  const pages = []; let o = 0;
  while (o < out.length) {
    assert.equal(String.fromCharCode(...out.subarray(o, o + 4)), 'OggS');
    const nseg = out[o + 26], lacing = out.subarray(o + 27, o + 27 + nseg), len = 27 + nseg + lacing.reduce((a, b) => a + b, 0), pg = out.slice(o, o + len), v = new DataView(pg.buffer);
    const crc = v.getUint32(22, true); v.setUint32(22, 0, true); assert.equal(oggCrc(pg), crc);
    pages.push({ flags: pg[5], granule: v.getUint32(6, true), seq: v.getUint32(18, true) }); o += len;
  }
  assert.equal(pages[0].flags, 2); assert.equal(pages.at(-1).flags, 4);
  assert.deepEqual(pages.map((p) => p.seq), pages.map((_, i) => i));
  assert.equal(pages.at(-1).granule, 312 + 120 * 960 - 500);
  assert.ok(pages.slice(2).every((p, i, a) => i === 0 || p.granule >= a[i - 1].granule));
});
