// Pure logic of the model-file path: slot names, wheels, the fallback. No DOM, no renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three/three.module.js';
import { SLOTS, slotOf, ownOf, applySlots, findWheels, prepareCar, loadCarGlb, modelUrls, countOf } from './carglb.js';

const mats = Object.fromEntries(SLOTS.map((s) => [s, new THREE.MeshBasicMaterial({ name: 'game_' + s })]));
const mesh = (slot, name = slot) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ name: slot })); m.name = name; return m; };
function fakeCar({ without = [] } = {}) {
  const root = new THREE.Group();
  root.add(mesh('paint'), mesh('glass'), mesh('light_front'));
  for (const [n, x, z] of [['wheel_fl', 0.8, 1.3], ['wheel_fr', -0.8, 1.3], ['wheel_rl', 0.8, -1.3], ['wheel_rr', -0.8, -1.3]]) {
    if (without.includes(n)) continue;
    const w = new THREE.Group(); w.name = n; w.position.set(x, 0.35, z); w.add(mesh('rubber'), mesh('chrome')); root.add(w);
  }
  return root;
}

test('slot names: case, Blender copy numbers, unknown', () => {
  assert.equal(slotOf('paint'), 'paint');
  assert.equal(slotOf('Paint.003'), 'paint');
  assert.equal(slotOf('light_front.001'), 'light_front');
  assert.equal(slotOf('chrome2'), null);
  assert.equal(slotOf(undefined), null);
});

test('applySlots replaces by slot and sends unknown materials to plastic', () => {
  const root = fakeCar(); root.add(mesh('mystery'));
  const { unknown, used } = applySlots(root, mats);
  assert.deepEqual(unknown, ['mystery']);
  assert.ok(used.has('paint') && used.has('rubber'));
  assert.equal(root.children[0].material, mats.paint);
  assert.equal(root.children.at(-1).material, mats.plastic);
  assert.equal(root.children[2].castShadow, false);   // the lamps (unlit) cast no shadow
});

test('applySlots keeps a texture and vertex colours of the file on a shared copy of the slot material', () => {
  const tex = new THREE.Texture(), root = new THREE.Group();
  const a = mesh('paint'), b = mesh('paint'), c = mesh('plastic'), d = mesh('rubber');
  a.material.map = tex; b.material.map = tex;
  c.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(c.geometry.attributes.position.count * 3).fill(0.5), 3));
  d.geometry.setAttribute('color', c.geometry.attributes.color.clone());
  const vcRubber = new THREE.MeshBasicMaterial({ name: 'game_rubber', vertexColors: true });
  root.add(a, b, c, d);
  applySlots(root, { ...mats, rubber: vcRubber });
  assert.notEqual(a.material, mats.paint);
  assert.equal(a.material, b.material);   // one copy for one texture
  assert.equal(a.material.map, tex);
  assert.equal(a.material.color.getHex(), mats.paint.color.getHex());   // the slot's colour stays (the garage paint)
  assert.ok(c.material.vertexColors && c.material !== mats.plastic);
  assert.equal(d.material, vcRubber);   // a slot that draws vertex colours anyway needs no copy
});

test('own_ and lamp_ materials are the file\'s own: kept with the room, a lamp glows in its own colour or texture', () => {
  const env = new THREE.Texture(), tex = new THREE.Texture();
  const withEnv = { ...mats, paint: new THREE.MeshStandardMaterial({ name: 'game_paint', envMap: env }) };
  const own = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: 'own_Material.013', color: 0x112233, roughness: 0.4 }));
  const lampF = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: 'lamp_front_Material.007', color: 0xff6600 }));
  const lampR = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: 'lamp_rear_Material.006', map: tex }));
  const paint = mesh('paint');
  const root = new THREE.Group(); root.add(own, lampF, lampR, paint);
  const { unknown, used } = applySlots(root, withEnv);
  assert.deepEqual(unknown, []);
  assert.ok(used.has('own') && used.has('lamp_front') && used.has('lamp_rear') && used.has('paint'));
  assert.equal(own.material.color.getHex(), 0x112233);   // its own colour, not the plastic slot's
  assert.equal(own.material.roughness, 0.4);
  assert.equal(own.material.envMap, env);
  assert.equal(lampF.material.emissive.getHex(), 0xff6600);   // glows in its own colour
  assert.ok(lampF.material.emissiveIntensity > 1);
  assert.equal(lampR.material.emissiveMap, tex);   // a textured lamp glows with its texture
  assert.equal(paint.material, withEnv.paint);   // the paint is still the game's (the garage colour)
  assert.equal(ownOf('Own_x'), 'own'); assert.equal(ownOf('paint'), null); assert.equal(ownOf('lamp_rear_a'), 'lamp_rear');
});

test('findWheels: pivot at the wheel centre, meshes below a spin group, nothing lost', () => {
  const root = fakeCar();
  const { wheels, missing } = findWheels(root);
  assert.equal(missing.length, 0);
  assert.equal(wheels.length, 4);
  const fl = wheels.find((w) => w.pivot.name === 'wheel_fl_pivot');
  assert.deepEqual(fl.pivot.position.toArray(), [0.8, 0.35, 1.3]);
  assert.equal(fl.spin.children.length, 2);
  assert.ok(fl.front && !wheels.find((w) => w.pivot.name === 'wheel_rl_pivot').front);
  assert.equal(root.getObjectByName('wheel_fl'), undefined);
});

test('prepareCar: steering turns the front wheels only, spin turns all; a car without wheels is null', () => {
  const car = prepareCar(fakeCar(), mats);
  car.setWheels(0.4, 2);
  for (const w of car.wheels) { assert.equal(w.spin.rotation.x, 2); assert.equal(w.pivot.rotation.y, w.front ? -0.4 : 0); }
  assert.equal(car.drawCalls, 3 + 4 * 2);
  assert.equal(prepareCar(fakeCar({ without: ['wheel_rr'] }), mats), null);
});

test('countOf counts triangles and one draw call per primitive', () => {
  const g = new THREE.Group(); g.add(mesh('paint'));
  assert.deepEqual(countOf(g), { triangles: 12, drawCalls: 1 });
});

test('fallback: a failing or broken load is null, a good one is the car', async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    assert.equal(await loadCarGlb('x.glb', mats, async () => { throw new Error('404'); }), null);
    assert.equal(await loadCarGlb('x.glb', mats, async () => ({ scene: fakeCar({ without: ['wheel_fl'] }) })), null);
    assert.ok(await loadCarGlb('x.glb', mats, async () => ({ scene: fakeCar() })));
  } finally { console.warn = warn; }
});

test('modelUrls: the high tier tries -hi first, the phone only the plain file', () => {
  const base = new URL('http://h/play/assets/cars/');
  assert.deepEqual(modelUrls(base, '3', 'high'), ['http://h/play/assets/cars/3-hi.glb', 'http://h/play/assets/cars/3.glb']);
  assert.deepEqual(modelUrls(base, '3', 'low'), ['http://h/play/assets/cars/3.glb']);
});
