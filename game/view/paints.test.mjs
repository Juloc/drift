import test from 'node:test';
import assert from 'node:assert/strict';
import { hueColour, PAINTS } from './remotes.js';

test('paints 24 to 26 are white, black and silver; 0 to 23 are hues; white is not blown out and black is black', () => {
  assert.deepEqual(Object.keys(PAINTS).map(Number), [24, 25, 26]);
  const white = hueColour(24), black = hueColour(25), silver = hueColour(26), red = hueColour(0);
  assert.ok(white.r < 0.82 && white.r > 0.6, `white ${white.r}`);   // linear values: a clear white that the tone mapping does not burn out
  assert.ok(black.r < 0.03 && black.g < 0.03);
  assert.ok(Math.abs(silver.r - silver.b) < 0.1, 'silver is grey');
  assert.ok(red.r > red.g && red.r > red.b, 'hue 0 is red');
});
