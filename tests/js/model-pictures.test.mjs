// The app's content policy (connect-src 'self') forbids fetching blob: addresses, and three.js' glTF loader fetches the pictures inside a model file
// that way unless it is told to use ordinary images. A page that forgets this shows black models in the app and looks fine everywhere else (0.7.18 did).
// So: every file of the game that makes a glTF loader must hand it the plain-images plugin, or swap createImageBitmap away as the car loader does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const files = []; (function walk(dir) { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) { if (n !== 'assets') walk(p); } else if (/\.js$/.test(n) && !/\.test\./.test(n)) files.push(p); } })(join(root, 'game'));

test('every glTF loader of the game reads the models\' pictures in a way the content policy allows', () => {
  const makers = files.filter((p) => /new GLTFLoader\(/.test(readFileSync(p, 'utf8')));
  assert.ok(makers.length >= 3, 'the files that make a loader were found');
  for (const p of makers) { const s = readFileSync(p, 'utf8'); assert.ok(/drift_plain_images/.test(s) || /createImageBitmap = undefined/.test(s), `${p.slice(root.length + 1)} makes a glTF loader without the plain-images plugin`); }
});
