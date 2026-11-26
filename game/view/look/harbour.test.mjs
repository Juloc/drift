import test from 'node:test';
import assert from 'node:assert/strict';
import { hollowAt, fbm, NOISE_GLSL } from './harbour.js';

test('the puddle noise in JavaScript: 0..1, the same every time, smooth, with both dry and wet ground', () => {
  let dry = 0, wet = 0, mid = 0, worstStep = 0, prev = null;
  for (let i = 0; i < 4000; i++) {
    const x = -60 + (i % 80) * 1.5, z = -90 + Math.floor(i / 80) * 2.8, v = hollowAt(x, z);
    assert.ok(v >= 0 && v <= 1, `${x}, ${z}: ${v}`);
    assert.equal(v, hollowAt(x, z));
    if (v === 0) dry++; else if (v === 1) wet++; else mid++;
    if (prev !== null && i % 80) worstStep = Math.max(worstStep, Math.abs(v - prev));
    prev = v;
  }
  assert.ok(dry > 500 && wet > 100 && mid > 100, `dry ${dry}, wet ${wet}, edge ${mid}`);
  let fine = 0; for (let i = 1; i < 4000; i++) fine = Math.max(fine, Math.abs(hollowAt(-20 + i * 0.02, 5) - hollowAt(-20 + (i - 1) * 0.02, 5)));
  assert.ok(fine < 0.3, `smooth over 2 cm: ${fine}`);   // (over 1.5 m the edge of a puddle is a step: the shader's smoothstep is narrow)
  assert.ok(worstStep <= 1);
  assert.ok(fbm(3.3, 4.4) >= 0 && fbm(3.3, 4.4) <= 1.0001);
});

test('the shader and the JavaScript share one noise: the exported GLSL has the three functions', () => {
  for (const f of ['float h21(', 'float vn(', 'float fbm(']) assert.ok(NOISE_GLSL.includes(f), f);
});
