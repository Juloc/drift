// The behaviour of the car effects (game/view/carfx.js) without a browser: the parts are made, the brake lights brighten,
// a lift of the throttle and an upshift under throttle pop, and every pop is announced as `car.pop`.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three/three.module.js';
import { prepareCar } from './carglb.js';
import { SLOTS } from './carglb.js';
import { dressCar, carFx, measure, splitPalette, treadTyres } from './carfx.js';

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

test('brake lights brighten on this car only; the flames answer the game\'s car.pop and go out again', () => {
  const car = fakeCar(), other = fakeCar(), listeners = {};
  globalThis.window = { addEventListener: (t, f) => (listeners[t] ??= []).push(f), removeEventListener: (t, f) => { listeners[t] = listeners[t].filter((g) => g !== f); } };
  try {
    const fx = carFx(car, { exhaust: [[0.4, 0.3, -2.1]] }, { lite: true });
    const fx2 = carFx(other, {}, { lite: true });
    const tail = [...fx.brakeMats.values()][0], base = tail.userData.base;
    fx.update(0.016, { brake: 0 }); assert.equal(tail.emissiveIntensity, base);
    fx.update(0.016, { brake: 1 }); fx2.update(0.016, { brake: 0 });
    assert.ok(tail.emissiveIntensity > base * 2);
    assert.equal([...fx2.brakeMats.values()][0].emissiveIntensity, base, 'the other car\'s lamps are its own');
    assert.ok(fx.flames.every((f) => !f.visible));
    for (const f of listeners['car.pop']) f({ detail: { strength: 1 } });   // the game: a lift at speed
    fx.update(0.016, { brake: 0 });
    assert.ok(fx.flames.every((f) => f.visible), 'flame on the pop');
    let after = 0;
    for (let i = 0; i < 30; i++) { const was = fx.flames[0].visible; fx.update(0.016, { brake: 0 }); if (!was && fx.flames[0].visible) after++; }
    assert.ok(after >= 1, 'a strong pop has after-bangs');
    for (let i = 0; i < 30; i++) fx.update(0.016, { brake: 0 });
    assert.ok(fx.flames.every((f) => !f.visible), 'and goes out');
    fx.dispose(); fx2.dispose();
    assert.equal(listeners['car.pop'].length, 0);
  } finally { delete globalThis.window; }
});

test('splitPalette takes the faces of one palette field into their own mesh and leaves the rest', () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0.375, 0.625, 0.375, 0.625, 0.375, 0.625, 0.125, 0.875, 0.125, 0.875, 0.125, 0.875], 2));
  g.setIndex([0, 1, 2, 3, 4, 5]);
  const root = new THREE.Group(), mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ name: 'own_palette' })); root.add(mesh);
  const glass = splitPalette(root, [0.375, 0.625], new THREE.MeshStandardMaterial({ name: 'fx_glass' }));
  assert.ok(glass && glass.material.name === 'fx_glass');
  assert.deepEqual([...glass.geometry.index.array], [0, 1, 2]);
  assert.deepEqual([...mesh.geometry.index.array], [3, 4, 5]);
  assert.equal(splitPalette(root, [0.9, 0.1], new THREE.MeshStandardMaterial()), null);
});

test('treadTyres takes the tyre faces of each wheel into a tread mesh with UVs round the axle', () => {
  const root = new THREE.Group();
  for (const n of ['wheel_fl', 'wheel_fr']) {
    const spin = new THREE.Group(); root.add(spin);
    const g = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16, 1, true).rotateZ(Math.PI / 2);   // the tread round the x axis, like a wheel (open: a tyre has no centre point)
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2).map((_, i) => (i % 2 ? 0.875 : 0.625)), 2));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ name: 'own_palette' })); m.name = n + '_own'; spin.add(m);
  }
  assert.equal(treadTyres(root, [0.625, 0.875]), 2);
  const tyres = []; root.traverse((o) => { if (o.isMesh && o.material.name === 'fx_tyre') tyres.push(o); });
  assert.equal(tyres.length, 2);
  const uv = tyres[0].geometry.attributes.uv;
  let span = 0; for (let t = 0; t < uv.count; t += 3) span = Math.max(span, Math.abs(uv.getX(t) - uv.getX(t + 1)), Math.abs(uv.getX(t) - uv.getX(t + 2)));
  assert.ok(span < 0.5, 'no triangle runs round the seam');
});

test('dressCar takes the rims out of each wheel into their own satin metal part', () => {
  const root = new THREE.Group();
  for (const n of ['wheel_fl', 'wheel_rr']) {
    const spin = new THREE.Group(); root.add(spin);
    const g = new THREE.CylinderGeometry(0.2, 0.2, 0.15, 12).rotateZ(Math.PI / 2);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2).map((_, i) => (i % 2 ? 0.875 : 0.375)), 2));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ name: 'own_palette' })); m.name = n + '_own'; spin.add(m);
  }
  dressCar(root, { rimUv: [0.375, 0.875], rim: { metal: 0.5 } });
  const rims = []; root.traverse((o) => { if (o.isMesh && o.material.name === 'fx_rim') rims.push(o); });
  assert.equal(rims.length, 2);
  assert.equal(rims[0].material, rims[1].material, 'one material for all rims (one place to change colour and finish)');
  assert.equal(rims[0].material.metalness, 0.5);
});
