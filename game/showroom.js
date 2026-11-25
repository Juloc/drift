// The showroom: one car (or two side by side) in a studio. Address options:
//   ?car=s15|dart|both   ?kit=1 (body kit and wing)   ?view=front|rear|side|top|front-low   ?tier=high|low   ?dpr=2   ?paint=1d3f8a   ?spin=1 (turntable)   ?info=1
import * as THREE from '../vendor/three/three.module.js';
import { buildS15 } from './view/s15.js';
import { makeEnvironment, contactShadow, studio } from './view/studio.js';
import { buildCar, WHEEL } from './view/carmodel.js';
import { makeClay } from './core/materials.js';

const q = new URLSearchParams(location.search);
const tier = q.get('tier') === 'low' ? 'low' : 'high';
const which = q.get('car') ?? 's15';
const kit = q.get('kit') === '1';
const paint = parseInt(q.get('paint') ?? '1d3f8a', 16);
const high = tier === 'high';
const dpr = +(q.get('dpr') ?? (high ? 2 : 1.5));

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: high, powerPreference: 'high-performance' });
renderer.setPixelRatio(dpr);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = high; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const env = makeEnvironment(renderer, high ? 256 : 64);
studio(scene, { shadows: high, size: 2048 });
scene.environment = null;   // each material of the probe gets the map itself; the old Dart stays as the game draws it

const cars = [];
const dartAt = (x) => {
  const parts = buildCar({ paint: 0x3a7de0, lite: !high });
  const g = new THREE.Group(), clay = makeClay();
  g.add(new THREE.Mesh(parts.body, clay), new THREE.Mesh(parts.lights, new THREE.MeshBasicMaterial({ vertexColors: true })));
  const tyre = new THREE.CylinderGeometry(WHEEL.r, WHEEL.r, WHEEL.w, 14).rotateZ(Math.PI / 2), tm = new THREE.MeshLambertMaterial({ color: 0x24262d });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const w = new THREE.Mesh(tyre, tm); w.position.set(sx * 0.82, WHEEL.r, sz * 1.3); g.add(w); }
  g.position.x = x; g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const sh = contactShadow(4.0, 7.6); sh.position.x = x;
  scene.add(g, sh);
  cars.push(g);
};
const s15At = (x) => {
  const car = buildS15({ paint, kit, tier, env });
  car.group.position.x = x;
  const sh = contactShadow(4.3, 8.4); sh.position.x = x;
  scene.add(car.group, sh);
  cars.push(car.group);
  return car;
};
let probe = null;
if (which === 'both') { probe = s15At(-2.7); dartAt(2.7); }
else if (which === 'dart') dartAt(0);
else probe = s15At(0);

// camera: front and rear three-quarter views, the side, from above, or low in front
const camera = new THREE.PerspectiveCamera(high ? 26 : 30, 1, 0.5, 120);
const dist = which === 'both' ? 12.5 : 7.6;
const views = { front: [-38, 1.9], rear: [148, 2.0], side: [90, 1.2], top: [-20, 11], 'front-low': [-30, 0.7] };
const [az, h] = views[q.get('view') ?? 'front'] ?? views.front;
const aim = new THREE.Vector3(0, 0.55, 0);
function place(angle) {
  const a = (angle * Math.PI) / 180;
  camera.position.set(Math.sin(a) * dist, h * (dist / 9.4), Math.cos(a) * dist);
  camera.lookAt(aim);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize(); place(az);

const info = document.getElementById('info');
let frames = 0;
function frame(t) {
  if (q.get('spin') === '1') place(az + t / 60);
  probe?.setWheels(0.0, t / 400);
  renderer.render(scene, camera);
  frames++;
  const r = renderer.info.render;
  window.__showroom = { tier, calls: r.calls, triangles: r.triangles, probeTriangles: probe?.triangles, probeDrawCalls: probe?.drawCalls, dpr };
  if (q.get('info') === '1') info.textContent = `${tier} tier, pixel ratio ${dpr}\nwhole scene: ${r.calls} draw calls, ${r.triangles} triangles (shadow pass included)\n${probe ? `the S15 alone: ${probe.drawCalls} draw calls, ${probe.triangles} triangles` : ''}`;
  if (q.get('spin') === '1' || frames < 4) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
