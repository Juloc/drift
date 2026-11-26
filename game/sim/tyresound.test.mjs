// The tyre layers (sim/tyresound.js): rolling grows with speed, a little slip hisses, a drift squeals between 500 and 1500 Hz and sinks
// as the angle grows, a big angle scrubs; standing still is silent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tyreLayers } from './tyresound.js';

test('standing still is silent; rolling grows with the speed and nothing else sounds without slip', () => {
  const still = tyreLayers(0.8, 0, 1);
  assert.equal(still.roll + still.hiss + still.squeal + still.scrub, 0);
  const slow = tyreLayers(0, 8), fast = tyreLayers(0, 28);
  assert.ok(fast.roll > slow.roll && slow.roll > 0);
  assert.equal(fast.hiss + fast.squeal + fast.scrub, 0);
});

test('a little slip hisses, a drift squeals in 500..1500 Hz (lower at a bigger angle), a big angle scrubs', () => {
  const turnIn = tyreLayers(0.12, 20, 0.5), drift = tyreLayers(0.55, 20, 0.8), wide = tyreLayers(0.95, 20, 0.8);
  assert.ok(turnIn.hiss > 0 && turnIn.squeal < 0.05);
  assert.ok(drift.squeal > 0.4 && drift.hiss < turnIn.hiss);
  for (const l of [turnIn, drift, wide]) assert.ok(l.squealF >= 500 && l.squealF <= 1500);
  assert.ok(wide.squealF < drift.squealF, 'the tone sinks as the angle grows');
  assert.ok(wide.scrub > 0.5 && drift.scrub < wide.scrub);
  assert.ok(tyreLayers(0.55, 20, 1).squeal > tyreLayers(0.55, 20, 0).squeal, 'louder under load');
});

import { surfaceMix, looseLevel, SURFACE_MIX } from './tyresound.js';

test('tyre sound by ground: asphalt is the reference, grass and sand do not squeal but rumble and crackle with the speed, snow swishes, nothing crackles standing still, an unknown ground is asphalt', () => {
  assert.deepEqual(surfaceMix('asphalt'), { squeal: 1, roll: 1, hiss: 1, scrub: 1, loose: 0 });
  assert.deepEqual(surfaceMix('lava'), surfaceMix('asphalt'));
  for (const k of ['grass', 'sand']) { const m = surfaceMix(k); assert.ok(m.squeal < 0.1 && m.roll > 1.5 && m.scrub > 1.2 && m.loose > 0.4, k); }
  assert.ok(surfaceMix('snow').hiss > 1.5 && surfaceMix('snow').squeal < 0.3 && surfaceMix('ice').roll < 0.5);
  assert.equal(looseLevel('grass', 0), 0); assert.equal(looseLevel('grass', 1.5), 0);
  assert.ok(looseLevel('grass', 12) > 0 && looseLevel('grass', 30) === SURFACE_MIX.grass.loose && looseLevel('asphalt', 30) === 0);
  assert.ok(looseLevel('sand', 20) > looseLevel('sand', 8), 'grows with the speed');
});
