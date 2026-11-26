// The engine loops (sim/enginesynth.js): whole cycles, no click where the loop starts again, the firings at the right rate,
// equal-power crossfade, the layers by the throttle, the limiter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINES } from './engine.js';
import { loopRpms, renderLoop, loopWeights, layerLevels, limiterDepth } from './enginesynth.js';

const ae86 = ENGINES[1], SR = 22050;

test('a loop is whole engine cycles, normalised, and runs into its own start without a jump', () => {
  for (const layer of ['on', 'off']) {
    const l = renderLoop(ae86, 4000, layer, SR), d = l.data;
    const cycles = l.seconds / (120 / 4000);
    assert.ok(Math.abs(cycles - Math.round(cycles)) < 0.01, `${layer}: ${cycles} cycles`);
    let peak = 0, step = 0; for (let i = 1; i < d.length; i++) { peak = Math.max(peak, Math.abs(d[i])); step = Math.max(step, Math.abs(d[i] - d[i - 1])); }
    assert.ok(Math.abs(peak - 0.9) < 1e-6);
    assert.ok(Math.abs(d[0] - d[d.length - 1]) <= step * 1.05, `${layer}: the seam is no bigger than the loop's own biggest step`);
  }
});

test('the strongest beat of the on-load loop is the firing rate (cylinders / 2 per revolution)', () => {
  const rpm = 3000, d = renderLoop(ae86, rpm, 'on', SR).data, fire = (rpm / 60) * (ae86.cyl / 2);
  // the envelope's correlation at the firing period beats the one at half and one and a half periods
  const env = Array.from(d, Math.abs), lag = (p) => { const k = Math.round(SR / p); let s = 0; for (let i = 0; i < env.length; i++) s += env[i] * env[(i + k) % env.length]; return s; };
  assert.ok(lag(fire) > lag(fire * 2 / 3) && lag(fire) > lag(fire * 2));
});

test('crossfade, layers, limiter', () => {
  const rpms = loopRpms(ae86);
  assert.equal(rpms[0], ae86.idle); assert.equal(rpms.at(-1), ae86.max);
  const w = loopWeights((rpms[1] + rpms[2]) / 2, rpms);
  assert.ok(Math.abs(w[1] ** 2 + w[2] ** 2 - 1) < 1e-9 && w[0] === 0 && w[3] === 0, 'equal power between the two neighbours');
  assert.deepEqual(loopWeights(100, rpms), [1, 0, 0, 0, 0]);
  assert.equal(layerLevels(1).off < 1e-9, true); assert.equal(layerLevels(0).on, 0);
  assert.ok(limiterDepth(ae86.max, ae86, 1) > 0 && limiterDepth(ae86.max, ae86, 0.2) === 0 && limiterDepth(5000, ae86, 1) === 0);
});
