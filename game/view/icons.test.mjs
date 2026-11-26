import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { GLYPHS, EMOTE_ICONS } from './icons.js';

test('every emote has an icon of its own, and there are ten', () => {
  assert.equal(EMOTE_ICONS.length, 10);
  for (const n of EMOTE_ICONS) assert.ok(GLYPHS[n], n);
});

test('no emoji anywhere in the game page (own icons only, rule D6)', () => {
  const files = ['game/main.js', 'game/index.html', 'src/Drift/wwwroot/play/index.html', ...readdirSync('game/view').filter((f) => f.endsWith('.js') && !f.endsWith('.test.mjs')).map((f) => 'game/view/' + f)];
  const emoji = /[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]|\\u\{1F[0-9A-Fa-f]{3}\}|\\u(23[0-9A-Fa-f]{2}|26[0-9A-Fa-f]{2}|27[0-9A-Fa-f]{2}|2B[0-9A-Fa-f]{2})/u;
  const found = [];
  for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((l, i) => { const m = l.replace(/\\u2605|\\u2606|★|☆/g, '').match(emoji); if (m) found.push(`${f}:${i + 1} ${m[0]}`); });
  assert.deepEqual(found, []);
});
