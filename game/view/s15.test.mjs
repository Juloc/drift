// The probe car: it builds in both tiers without a browser, stays inside a triangle budget and keeps one mesh per material.
import test from 'node:test';
import assert from 'node:assert/strict';

const ctx = { fillStyle: '', fillRect() {}, createLinearGradient: () => ({ addColorStop() {} }) };
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
const { buildS15 } = await import('./s15.js');

test('S15 high tier: budget and shape', () => {
  const c = buildS15({ tier: 'high', kit: true });
  assert.ok(c.triangles < 14000, `triangles ${c.triangles}`);
  assert.ok(c.drawCalls <= 16, `draw calls ${c.drawCalls}`);
  assert.equal(c.wheels.length, 4);
  c.setWheels(0.3, 1); // must not throw
  c.dispose();
});

test('S15 phone tier is much lighter than the high tier', () => {
  const hi = buildS15({ tier: 'high' }), lo = buildS15({ tier: 'low' });
  assert.ok(lo.triangles < hi.triangles / 1.8, `${lo.triangles} vs ${hi.triangles}`);
  assert.ok(lo.triangles < 6500);
  hi.dispose(); lo.dispose();
});
