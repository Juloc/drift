import test from 'node:test';
import assert from 'node:assert/strict';
import { guessTier, TierPicker, startTier } from './autotier.js';

test('autotier: a first guess from the device', () => {
  assert.equal(guessTier({ gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))' }), 'low');
  assert.equal(guessTier({ gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)' }), 'high');
  assert.equal(guessTier({ gpu: 'Intel(R) UHD Graphics 620', memory: 4 }), 'low');
  assert.equal(guessTier({ gpu: 'Intel(R) Iris(R) Xe Graphics', memory: 16 }), 'medium');
  assert.equal(guessTier({ gpu: 'Apple GPU', mobile: true }), 'medium');
  assert.equal(guessTier({ gpu: 'Mali-G52', mobile: true, memory: 4 }), 'low');
  assert.equal(guessTier({ gpu: 'Adreno (TM) 740', mobile: true }), 'medium');
});

test('autotier: the frame rate of the first seconds decides, then it stays', () => {
  const slow = new TierPicker('high');
  let got = null;
  for (let i = 0; i < 400 && !got; i++) got = slow.sample(40);   // 25 fps
  assert.equal(got, 'medium');
  let again = null;
  for (let i = 0; i < 400 && !again; i++) again = slow.sample(40);
  assert.equal(again, 'low');
  for (let i = 0; i < 400; i++) assert.equal(slow.sample(40), null, 'two steps at most, then it stays');
  const fast = new TierPicker('medium');
  let up = null;
  for (let i = 0; i < 600 && !up; i++) up = fast.sample(8);   // 125 fps
  assert.equal(up, 'high');
  const fine = new TierPicker('medium');
  for (let i = 0; i < 600; i++) assert.equal(fine.sample(20), null);   // 50 fps: stays
  assert.ok(fine.done);
});

test('autotier: the player\'s setting wins over auto', () => {
  assert.deepEqual(startTier('low', { gpu: 'GeForce RTX 4090' }), { tier: 'low', auto: false });
  assert.deepEqual(startTier('auto', { gpu: 'GeForce RTX 4090' }), { tier: 'high', auto: true });
});
