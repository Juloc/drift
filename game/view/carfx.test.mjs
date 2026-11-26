// The behaviour of the car effects (game/view/carfx.js) without a browser: the parts are made, the brake lights brighten,
// a lift of the throttle and an upshift under throttle pop, and every pop is announced as `car.pop`.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three/three.module.js';
import { prepareCar } from './carglb.js';
import { SLOTS } from './carglb.js';
import { dressCar, carFx, measure, splitPalette, treadTyres, WheelSet, leanBody } from './carfx.js';

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

test('phone tier: the four wheels are one instanced mesh that follows steering and spin, also in a copy of the car', () => {
  const car = fakeCar();
  dressCar(car.group, {}, { lite: true });
  const copy = car.group.clone(true);
  for (const g of [car.group, copy]) {
    let ws = null; g.traverse((o) => { if (o instanceof WheelSet) ws = o; });
    assert.ok(ws, 'a WheelSet in every copy');
    ws.onBeforeRender();
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    ws.getMatrixAt(0, m); p.setFromMatrixPosition(m);
    assert.ok(Math.abs(p.z - 1.2) < 1e-6, 'the front left wheel at its place');
    let hidden = 0; g.traverse((o) => { if (o.isMesh && /_pivot$/.test(o.parent?.parent?.name ?? '') && !o.visible) hidden++; });
    assert.equal(hidden, 4, 'the single wheels are not drawn');
  }
  car.setWheels(0.4, 1); car.group.updateMatrixWorld(true);   // (the renderer does this before it draws)
  let ws = null; car.group.traverse((o) => { if (o instanceof WheelSet) ws = o; });
  ws.onBeforeRender();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(); ws.getMatrixAt(0, m); m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
  assert.ok(q.angleTo(new THREE.Quaternion()) > 0.3, 'steering and spin reach the instance');
});

test('the underglow lies on the road under each of its points (a slope, a crest), the contact shadow too; no strips', () => {
  const car = fakeCar();
  dressCar(car.group, {});
  const copy = car.group.clone();   // another copy of the same car (it shares the template's geometry)
  car.group.position.set(5, 2, 3); car.group.rotation.set(-0.1, 0.4, 0, 'YXZ'); car.group.updateMatrixWorld(true);
  const fx = carFx(car, {}, { lite: true, listen: false });
  const ground = (x, z) => 2 + 0.12 * (z - 3) - 0.03 * (x - 5) ** 2;   // a 12 % hill with a crown across it
  fx.setGlow(18);
  fx.update(0.016, { brake: 0, groundAt: ground });
  const pad = car.group.getObjectByName('fx_glow_pad'), shadow = car.group.getObjectByName('fx_shadow'), v = new THREE.Vector3();
  for (const [mesh, lift] of [[pad, 0.025], [shadow, 0.012]]) {
    const p = mesh.geometry.attributes.position;
    let worst = 0;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld); worst = Math.max(worst, Math.abs(v.y - ground(v.x, v.z) - lift)); }
    assert.ok(worst < 0.01, `${mesh.name} ${worst}`);
  }
  let strips = 0; car.group.traverse((o) => { if (o.material?.name === 'fx_glow_strip') strips++; });
  assert.equal(strips, 0);
  // each copy's shadow gets its own geometry before it is bent: the other copy's stays flat
  const ys = copy.getObjectByName('fx_shadow').geometry.attributes.position.array.filter((_, i) => i % 3 === 1);
  assert.ok(ys.every((y) => Math.abs(y - ys[0]) < 1e-6), 'the other copy\'s shadow is untouched');
  fx.setGlow(null); fx.update(0.016, { brake: 0, groundAt: ground });
  assert.equal(car.group.getObjectByName('fx_glow').visible, false);
});

test('measure gives the rear tyres as drawn: right one first, contact point on the road, width and radius', () => {
  const root = new THREE.Group(), mats = Object.fromEntries(SLOTS.map((s) => [s, new THREE.MeshStandardMaterial({ name: 'game_' + s })]));
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.0, 4.2).translate(0, 0.7, 0), new THREE.MeshStandardMaterial({ name: 'paint' })));
  // the older files name the sides the wrong way round: rl on -x here; the hub (the pivot) sits 4 cm inside the tyre's middle
  for (const [n, x, z] of [['wheel_fl', 0.7, 1.2], ['wheel_fr', -0.7, 1.2], ['wheel_rl', -0.72, -1.25], ['wheel_rr', 0.72, -1.25]]) {
    const w = new THREE.Group(); w.name = n; w.position.set(x, 0.3, z);
    w.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16).rotateZ(Math.PI / 2).translate(Math.sign(x) * 0.04, 0, 0), mats.rubber)); root.add(w);
  }
  const m = measure(prepareCar(root, mats).group);
  assert.equal(m.rearTyres.length, 2);
  const [r, l] = m.rearTyres;
  assert.ok(Math.abs(r.contact.x + 0.76) < 1e-3 && Math.abs(l.contact.x - 0.76) < 1e-3, `${r.contact.x} ${l.contact.x}`);
  assert.ok(Math.abs(r.contact.z + 1.25) < 1e-3 && Math.abs(r.contact.y) < 1e-3);
  assert.ok(Math.abs(r.width - 0.2) < 1e-3 && Math.abs(r.radius - 0.3) < 0.01);
});

test('leanBody: the body turns on its own group, the wheels stay where they are; a copy has it too; the effects go with the body', () => {
  const car = fakeCar();
  dressCar(car.group, {});
  const lean = leanBody(car.group);
  assert.ok(lean && lean.getObjectByName('body_lean_in'));
  const wheel = car.group.getObjectByName('wheel_rl_pivot') ?? car.group.getObjectByName('wheel_rl');
  let up = wheel; while (up && up !== lean) up = up.parent; assert.equal(up, null, 'the wheels are not in the lean group');
  let bodyIn = false; lean.traverse((o) => { if (o.material?.name === 'paint' || o.material?.name === 'game_paint') bodyIn = true; }); assert.ok(bodyIn, 'the body is');
  const before = new THREE.Vector3(); car.group.updateMatrixWorld(true); wheel.getWorldPosition(before);
  lean.rotation.set(0.05, 0, 0.08); car.group.updateMatrixWorld(true);
  assert.ok(wheel.getWorldPosition(new THREE.Vector3()).distanceTo(before) < 1e-9, 'leaning the body does not move a wheel');
  assert.equal(leanBody(car.group), lean, 'a second call finds it');
  assert.ok(car.group.clone(true).getObjectByName('body_lean'));
  const fx = carFx(car, {}, { lite: true, listen: false });
  let p = fx.flames[0]; while (p && p.name !== 'body_lean_in') p = p.parent; assert.ok(p, 'the flames are with the body');
});
