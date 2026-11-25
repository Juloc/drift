import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three/three.module.js';
import { CameraRig, DriverCam, CAMERAS } from './camera.js';
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
