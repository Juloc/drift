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
