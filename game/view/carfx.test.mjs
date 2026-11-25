// The behaviour of the car effects (game/view/carfx.js) without a browser: the parts are made, the brake lights brighten,
// a lift of the throttle and an upshift under throttle pop, and every pop is announced as `car.pop`.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three/three.module.js';
import { prepareCar } from './carglb.js';
import { SLOTS } from './carglb.js';
import { dressCar, carFx, measure } from './carfx.js';
import { ENGINES } from '../sim/engine.js';

function fakeCar() {
  const mats = Object.fromEntries(SLOTS.map((s) => [s, new THREE.MeshStandardMaterial({ name: 'game_' + s })]));
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.0, 4.2).translate(0, 0.7, 0), new THREE.MeshStandardMaterial({ name: 'paint' }));
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.05).translate(0, 0.8, -2.1), new THREE.MeshStandardMaterial({ name: 'lamp_rear_x', color: 0xff0000 }));
  root.add(body, tail);
  for (const [n, x, z] of [['wheel_fl', 0.7, 1.2], ['wheel_fr', -0.7, 1.2], ['wheel_rl', 0.7, -1.2], ['wheel_rr', -0.7, -1.2]]) {
    const w = new THREE.Group(); w.name = n; w.position.set(x, 0.3, z); w.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2), mats.rubber)); root.add(w);
  }
  return prepareCar(root, mats);
}

test('measure finds the box and the axles; dressCar adds underbody, shadow and headlight pool without changing the box', () => {
  const car = fakeCar(), m = measure(car.group);
  assert.ok(Math.abs(m.front - 1.2) < 1e-6 && Math.abs(m.rear + 1.2) < 1e-6 && Math.abs(m.halfTrack - 0.7) < 1e-6);
  dressCar(car.group, { exhaust: [[0.4, 0.3, -2.1]] });
  for (const n of ['fx_underbody', 'fx_shadow', 'fx_pool']) assert.ok(car.group.getObjectByName(n), n);
  assert.ok(Math.abs(measure(car.group).box.max.z - m.box.max.z) < 1e-6, 'the effects are not part of the measured car');
});

test('brake lights brighten on this car only; pops after a lift and at an upshift, each one announced', () => {
  const car = fakeCar(), heard = [];
  globalThis.window = { dispatchEvent: (e) => heard.push(e) };
  globalThis.CustomEvent ??= class { constructor(type, o) { this.type = type; this.detail = o?.detail; } };
  try {
    const fx = carFx(car, { exhaust: [[0.4, 0.3, -2.1]] }, { lite: true, announce: true });
    const tail = [...fx.brakeMats.values()][0], base = tail.userData.base;
    const s = { throttle: 0, brake: 0, speed: 20, top: 33, engine: ENGINES[1] };
    fx.update(0.016, s); assert.equal(tail.emissiveIntensity, base);
    fx.update(0.016, { ...s, brake: 1 }); assert.ok(tail.emissiveIntensity > base * 2);
    // full throttle for a second, then off: a burst of pops over the next few tenths
    for (let i = 0; i < 60; i++) fx.update(0.016, { ...s, throttle: 1 });
    const before = heard.length;
    for (let i = 0; i < 40; i++) fx.update(0.016, { ...s, throttle: 0 });
    const lift = heard.slice(before);
    assert.ok(lift.length >= 2 && lift.length <= 4, `${lift.length} pops after the lift`);
    assert.ok(lift.every((e) => e.type === 'car.pop' && e.detail.kind === 'lift' && Number.isFinite(e.detail.x)));
    // accelerating through the gears under throttle: at least one shift pop
    const n = heard.length;
    for (let v = 5; v < 30; v += 0.25) fx.update(0.016, { ...s, throttle: 1, speed: v });
    assert.ok(heard.slice(n).some((e) => e.detail.kind === 'shift'));
    // no pops while cruising with a light foot
    const m = heard.length;
    for (let i = 0; i < 100; i++) fx.update(0.016, { ...s, throttle: 0.3, speed: 15 });
    assert.equal(heard.length, m);
  } finally { delete globalThis.window; }
});
