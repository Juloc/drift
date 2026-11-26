// The new driving model (sim/sim2.js, written and checked by the chief; copied unchanged): its own checks (tools/simcheck.mjs: stock car and drift set-up, "all inside"), and what
// the test page needs from it: finite numbers, the same run twice gives the same state, every input does something.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { step, makeCar, AE86, AE86_DRIFT, ASSISTS, FLAT, DT } from './sim2.js';

test('sim2: tools/simcheck.mjs says "all inside" for the stock car and for the drift set-up', () => {
  for (const args of [[], ['--drift']]) {
    const out = execFileSync(process.execPath, ['tools/simcheck.mjs', ...args], { encoding: 'utf8' });
    assert.match(out, /all inside/, out.split('\n').filter((l) => !/^ok/.test(l)).join('\n'));
  }
});

const run = (car, A, seconds, inputAt) => { const s = makeCar(0, 0, 0); for (let i = 0; i < seconds / DT; i++) step(s, { throttle: 0, brake: 0, steer: 0, handbrake: 0, clutch: 0, up: false, down: false, manual: false, ...inputAt(i * DT) }, car, A, FLAT, DT); return s; };

test('sim2: the page\'s inputs all do something (throttle, brake, steer, handbrake, the gears) and nothing goes NaN under any assist', () => {
  for (const car of [AE86, AE86_DRIFT]) for (const A of Object.values(ASSISTS)) {
    const s = run(car, A, 12, (t) => ({ throttle: t < 8 ? 1 : 0, steer: t > 4 && t < 7 ? 0.8 : 0, handbrake: t > 5 && t < 5.4 ? 1 : 0, brake: t > 9 ? 1 : 0 }));
    for (const k of ['x', 'z', 'h', 'vx', 'vz', 'w', 'y', 'pitch', 'roll', 'rpm', 'load']) assert.ok(Number.isFinite(s[k]), `${car.name}: ${k}`);
    for (const k of ['wheel', 'sn', 'fz', 'heat', 'temp', 'comp']) assert.ok(s[k].every(Number.isFinite), `${car.name}: ${k}`);
  }
  const go = run(AE86_DRIFT, ASSISTS.arcade, 5, () => ({ throttle: 1 })), idle = run(AE86_DRIFT, ASSISTS.arcade, 5, () => ({}));
  assert.ok(go.speed > 15 && idle.speed < 0.5, `${go.speed} ${idle.speed}`);
  const steer = run(AE86_DRIFT, ASSISTS.arcade, 4, (t) => ({ throttle: 0.6, steer: t > 1 ? 1 : 0 })), straight = run(AE86_DRIFT, ASSISTS.arcade, 4, () => ({ throttle: 0.6 }));
  assert.ok(Math.abs(steer.h) > 0.3 && Math.abs(straight.h) < 0.02, `${steer.h} ${straight.h}`);
  const hb = run(AE86_DRIFT, ASSISTS.arcade, 6, (t) => ({ throttle: 1, handbrake: t > 3 ? 1 : 0 })); assert.ok(hb.speed < go.speed, 'the handbrake slows');
  const manual = run(AE86_DRIFT, ASSISTS.arcade, 6, (t) => ({ manual: true, throttle: 0.8, up: Math.abs(t - 3) < DT, clutch: Math.abs(t - 3) < 0.2 ? 1 : 0 }));
  assert.ok(manual.gear >= 1 && Number.isFinite(manual.rpm));
});

test('sim2: the same run twice gives the same state (it can be replayed and measured)', () => {
  const a = run(AE86_DRIFT, ASSISTS.sport, 8, (t) => ({ throttle: 1, steer: Math.sin(t) })), b = run(AE86_DRIFT, ASSISTS.sport, 8, (t) => ({ throttle: 1, steer: Math.sin(t) }));
  assert.equal(a.x, b.x); assert.equal(a.h, b.h); assert.equal(a.rpm, b.rpm);
});
