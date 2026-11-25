import test from 'node:test';
import assert from 'node:assert/strict';
import { steerOf, padControls, PadEdges, PAD, BTN, ACTIONS } from './gamepad.js';

const pad = (axes = [0, 0, 0, 0], pressed = {}) => ({ axes, buttons: Array.from({ length: 17 }, (_, i) => ({ value: pressed[i] ?? 0, pressed: (pressed[i] ?? 0) > 0.5 })) });

test('the stick has a dead zone, a curve and reaches the full lock at the end', () => {
  assert.equal(steerOf(0), 0);
  assert.equal(steerOf(PAD.deadzone * 0.9), 0);                       // drift of a worn stick is nothing
  assert.ok(steerOf(0.3) > 0 && steerOf(0.3) < 0.2, 'a small deflection steers little');
  assert.ok(Math.abs(steerOf(1) - 1) < 1e-9 && Math.abs(steerOf(-1) + 1) < 1e-9);
  assert.ok(steerOf(0.6) < 0.6 && steerOf(0.6) > steerOf(0.4));      // rising, below the straight line
  assert.equal(steerOf(undefined), 0);
});

test('triggers are the pedals (analog), A is the handbrake, a resting trigger is no pedal', () => {
  const c = padControls(pad([0.5, 0, 0, 0], { [BTN.rt]: 0.7, [BTN.lt]: 0.02, [BTN.a]: 1 }));
  assert.ok(c.steer > 0 && c.steer < 0.5);
  assert.ok(c.throttle > 0.6 && c.throttle < 0.7);
  assert.equal(c.brake, 0);
  assert.equal(c.handbrake, 1);
  assert.equal(c.active, true);
  assert.deepEqual(padControls(pad()), { steer: 0, throttle: 0, brake: 0, handbrake: 0, active: false });
  assert.equal(padControls(null).active, false);
  assert.equal(padControls({ axes: [], buttons: [] }).active, false);   // a pad that says nothing is not an error
});

test('a button acts once per press, and the d-pad is four emotes', () => {
  const e = new PadEdges();
  assert.deepEqual(e.update(pad([0, 0], { [BTN.y]: 1 })), ['camera']);
  assert.deepEqual(e.update(pad([0, 0], { [BTN.y]: 1 })), []);          // held: nothing more
  assert.deepEqual(e.update(pad()), []);
  assert.deepEqual(e.update(pad([0, 0], { [BTN.y]: 1, [BTN.x]: 1 })).sort(), ['camera', 'reset']);
  assert.deepEqual(e.update(pad([0, 0], { [BTN.up]: 1 })), ['emote0']);
  assert.deepEqual(new PadEdges().update(null), []);
  for (const n of ['emote0', 'emote1', 'emote2', 'emote3', 'reset', 'camera', 'feel', 'pause', 'bot']) assert.ok(Object.values(ACTIONS).includes(n), n);
});
