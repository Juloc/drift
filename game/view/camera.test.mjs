import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three/three.module.js';
import { CameraRig, DriverCam, CAMERAS, PRESETS } from './camera.js';
import { makeCar } from '../sim/physics.js';

const state = (x, z, h, vx = 0, vz = 0) => ({ ...makeCar(x, z, h), vx, vz });

test('the bonnet camera sits on the nose of the car and looks along it; the cockpit hides the body', () => {
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 500);
  const rig = new CameraRig(camera);
  assert.equal(rig.mode, 'chase'); assert.equal(rig.hidesCar, false);
  rig.set('bonnet', state(10, 20, 0));
  assert.ok(Math.abs(camera.position.z - 20.9) < 0.01 && Math.abs(camera.position.y - 1.12) < 0.01, `${camera.position.toArray()}`);
  const dir = camera.getWorldDirection(new THREE.Vector3());
  assert.ok(dir.z > 0.99, 'looks along +z when the car faces +z');
  rig.set('cockpit', state(10, 20, 0));
  assert.equal(rig.hidesCar, true);
  assert.ok(camera.position.z < 20.2 && camera.position.y > 1.15);
});

test('a camera turns with the car and leans into a slide', () => {
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 500);
  const cam = new DriverCam(camera, { fwd: 0.9, up: 1.12, lean: 0.5, fov: 68 });
  const slide = state(0, 0, 0, 14, 14);   // the nose points to +z but the car goes diagonally
  cam.snap(slide);
  for (let i = 0; i < 60; i++) cam.update(slide, 35, 1 / 60);
  const dir = camera.getWorldDirection(new THREE.Vector3());
  // X is mirrored in the view (space.js): a car going to +x shows to the left; what counts is that the view leans away from the straight nose
  assert.ok(Math.abs(dir.x) > 0.15, `leaned by ${dir.x}`);
  const turned = state(0, 0, Math.PI / 2);   // facing +x
  const c2 = new DriverCam(camera, { lean: 0 }); c2.snap(turned);
  assert.ok(Math.abs(camera.getWorldDirection(new THREE.Vector3()).x) > 0.99);
});

test('the key cycles chase, bonnet, cockpit and round again', () => {
  const rig = new CameraRig(new THREE.PerspectiveCamera(55, 1.6, 0.1, 500));
  const seen = [rig.mode]; for (let i = 0; i < 3; i++) seen.push(rig.cycle(state(0, 0, 0)));
  assert.deepEqual(seen, [...CAMERAS, 'chase']);
});

test('going backwards the chase camera stays behind the nose, it does not swing round', () => {
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.1, 500);
  const rig = new CameraRig(camera);
  const back = state(0, 0, 0, 0, -12);   // facing +z, rolling back at 12 m/s
  rig.snap(back);
  for (let i = 0; i < 120; i++) rig.update(back, 35, 1 / 60);
  assert.ok(camera.position.z < -5, `the camera is behind the car (z ${camera.position.z})`);
  assert.ok(rig.cams.chase.yaw < 0.2 && rig.cams.chase.yaw > -0.2, `yaw ${rig.cams.chase.yaw}`);
});

test('the look chase camera swings out with the drift angle (docs/FOCUS.md): sliding sideways moves it sideways, driving straight does not', () => {
  const C = { dist: 6, height: 1.7, side: 0, look: 14, lookY: 1.2, travel: 0.6, fov: 52, turn: 0, swing: 3 };
  const run = (vx, vz) => {
    const camera = new THREE.PerspectiveCamera(52, 1.6, 0.1, 500), rig = new CameraRig(camera, { look: C, ground: () => 0 });
    const s = state(0, 0, 0, vx, vz);
    for (let i = 0; i < 240; i++) rig.update(s, 35, 1 / 60);
    return camera.position.x;
  };
  const straight = run(0, 25), sideways = run(14, 20);   // facing +z; the second travels 35 degrees to one side of the nose
  assert.ok(Math.abs(straight) < 0.05, `straight: ${straight}`);
  assert.ok(Math.abs(sideways - straight) > 1, `the swing is ${sideways - straight} m`);
});

const LOOK = { side: 0, look: 14, lookY: 0.5, travel: 0.6, fov: 52, turn: 8, swing: 3, turnDrift: -24 };
const chaseRig = (ground) => { const camera = new THREE.PerspectiveCamera(52, 1.8, 0.1, 500); return { camera, rig: new CameraRig(camera, { look: LOOK, ground }) }; };

test('a bumpy road does not shake the chase camera (the owner got sick of the old one)', () => {
  // a car at 25 m/s over a road with 12 cm bumps every 2.5 m (10 Hz): the drawn road jumps, the camera's height must stay calm
  const bumps = (x) => 0.12 * Math.sin(x * 2.5);
  const { camera, rig } = chaseRig((x, z) => bumps(z));
  let car = state(0, 0, 0, 0, 25); rig.snap(car);
  const ys = [];
  for (let i = 0; i < 600; i++) { car = { ...car, z: i * 25 / 60 }; rig.update(car, 35, 1 / 60); ys.push(camera.position.y); }
  const tail = ys.slice(120), amp = Math.max(...tail) - Math.min(...tail);
  assert.ok(amp < 0.02, `the camera's height moves by ${amp.toFixed(3)} m over bumps of 0.24 m`);
});

test('a climb or a crest is followed softly: no jump in one frame', () => {
  const hill = (x, z) => 4 * Math.exp(-((z - 150) ** 2) / 800);   // a 4 m crest
  const { camera, rig } = chaseRig(hill);
  let car = state(0, 0, 0, 0, 25); rig.snap(car);
  let worst = 0, prev = camera.position.y;
  for (let i = 0; i < 480; i++) { car = { ...car, z: i * 25 / 60 }; rig.update(car, 35, 1 / 60); worst = Math.max(worst, Math.abs(camera.position.y - prev)); prev = camera.position.y; }
  assert.ok(worst < 0.06, `the biggest step in one frame: ${worst.toFixed(3)} m`);
});

test('the camera is higher than the old low one, and behind and above the car', () => {
  const { camera, rig } = chaseRig(() => 0);
  const car = state(0, 0, 0, 0, 10); rig.snap(car);
  for (let i = 0; i < 90; i++) rig.update(car, 35, 1 / 60);
  assert.ok(camera.position.y > 3 && camera.position.z < -6, `${camera.position.toArray().map((v) => v.toFixed(1))}`);
});

test('the player turns the camera round the car, it comes back with auto-follow and stays without; the zoom stays', () => {
  for (const auto of [true, false]) {
    const { camera, rig } = chaseRig(() => 0);
    const chase = rig.cams.chase; chase.user.auto = auto;
    const car = state(0, 0, 0, 0, 10); rig.snap(car);
    for (let i = 0; i < 60; i++) rig.update(car, 35, 1 / 60);
    const straight = camera.position.x;
    chase.nudge(1.2, 2); chase.zoomBy(1.5);
    for (let i = 0; i < 60; i++) rig.update(car, 35, 1 / 60);
    assert.ok(Math.abs(camera.position.x - straight) > 3, 'it is turned round the car');
    for (let i = 0; i < 60 * 8; i++) rig.update(car, 35, 1 / 60);
    if (auto) { assert.ok(Math.abs(chase.user.yaw) < 0.05 && Math.abs(chase.user.lift) < 0.05, `back to the angle: ${chase.user.yaw}`); assert.equal(chase.user.zoom, 1.5); }
    else assert.ok(Math.abs(chase.user.yaw - 1.2) < 1e-9, 'stays where it was put');
  }
});

test('the presets are distinct and ordered from near to far; zoom is limited', () => {
  assert.ok(PRESETS.near.dist < PRESETS.follow.dist && PRESETS.follow.dist < PRESETS.far.dist && PRESETS.top.up > PRESETS.far.up);
  const { rig } = chaseRig(() => 0), c = rig.cams.chase;
  for (let i = 0; i < 40; i++) c.zoomBy(2); assert.equal(c.user.zoom, 2.4);
  for (let i = 0; i < 40; i++) c.zoomBy(0.5); assert.equal(c.user.zoom, 0.55);
});
