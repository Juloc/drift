// The mock stage: one still scene built to stand next to the owner's mockup of the mountain pass at sunset (the picture itself is not in the
// repository). It proves the way to the look: one light model with coloured shadows and a sky-coloured haze (mock/toon.js), a land made of real
// facets (mock/land.js), kit models through the same light (mock/props.js), lump smoke (mock/smoke.js), a small finish (mock/finish.js).
// ?tier=low is the phone's tier; ?hud=0 hides the display; ?orbit=1 lets the camera circle slowly; ?off=smoke,props,finish switches parts off.
import * as THREE from '../vendor/three/three.module.js';
import { KEY } from './mock/toon.js';
import { makeSky, skyEnv } from './mock/sky.js';
import { buildLand, at, nearest, path } from './mock/land.js';
import { buildProps } from './mock/props.js';
import { loadCarSource, MX5 } from './mock/car.js';
import { Smoke } from './mock/smoke.js';
import { makeFinish } from './mock/finish.js';

window.__err = []; addEventListener('error', (e) => window.__err.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__err.push(String(e.reason?.message ?? e.reason)));
const params = new URLSearchParams(location.search), off = new Set((params.get('off') ?? '').split(',')), canvas = document.getElementById('view'), info = document.getElementById('info');
const low = params.get('tier') === 'low' || (!params.has('tier') && matchMedia('(pointer: coarse)').matches);
if (params.get('hud') === '0') document.getElementById('hud').hidden = true;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1.5 : 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.info.autoReset = false;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.3, 9000);

// ---- the car: where it is in its slide (in the right-hander, its nose turned further in than the road)
const CAR = { s: 25, off: -0.2, slip: 0.214 }, here = at(CAR.s, CAR.off), carPos = new THREE.Vector3(here.x, here.y, here.z), yaw = here.th + CAR.slip;
const T = new THREE.Vector3(here.tx, 0, here.tz), L = new THREE.Vector3(here.tz, 0, -here.tx);                       // the road's direction here, and its left
const fwd = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw)), side = new THREE.Vector3(fwd.z, 0, -fwd.x);          // side: the car's left
const rear = [1, -1].map((k) => { const p = carPos.clone().addScaledVector(fwd, -1.3).addScaledVector(side, k * 0.78), n = nearest(p.x, p.z); return { p, s: n.s + (p.x - path[n.i].x) * path[n.i].tx + (p.z - path[n.i].z) * path[n.i].tz, d: n.d }; });
// the marks its rear tyres drew on the way here: further back the car was straighter, so the two lines run closer together
const trail = (rw, back, i) => { const p = at(rw.s - back, rw.d - (i ? -1 : 1) * 0.5 * Math.min(1, back / 14) + 0.4 * Math.min(1, back / 20)); return [p.x, p.z]; };
const marks = rear.map((rw, i) => ({ w: 0.17, a: 0.85, pts: Array.from({ length: 30 }, (_, k) => trail(rw, 44 * (1 - k / 29), i)) }));

{ const az = here.th + CAR.slip - 0.276 + 22.8 * Math.PI / 180, el = 5.9 * Math.PI / 180; KEY.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); }   // the sun where the mockup has it: 23 degrees right of the view, 6 up
// ---- light: the sun for the shadows and for the car's own (physical) materials; the world's colours come from toon.js
const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.56, 0.5), 1.7); sun.position.copy(carPos).addScaledVector(KEY.sunDir, 120); sun.target.position.copy(carPos);
sun.castShadow = true; sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 260 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05; sun.shadow.radius = 3;
scene.add(sun, sun.target, new THREE.HemisphereLight(new THREE.Color(0.95, 0.5, 0.62), new THREE.Color(0.34, 0.16, 0.2), 0.95));   // (the car's own light: the same rose evening as the world's, in the units of the physical materials)

scene.add(makeSky(), buildLand({ marks }));
const envMap = skyEnv(renderer);

async function buildCar() {
  const { scene: car } = await loadCarSource(MX5, envMap);
  car.rotation.y = Math.PI - yaw; car.position.copy(carPos);                                                            // (the car's nose is +z; the stage's forward is (sin yaw, -cos yaw))
  { const ahead = at(CAR.s + 1.4, CAR.off), behind = at(CAR.s - 1.4, CAR.off), slope = Math.atan2(ahead.y - behind.y, 2.8); car.rotateOnWorldAxis(L, -slope * Math.cos(CAR.slip)); }   // the car lies on the falling road
  for (const n of ['wheel_fl', 'wheel_fr']) { const w = car.getObjectByName(n); if (w) { const c = new THREE.Box3().setFromObject(w).getCenter(new THREE.Vector3()), p = new THREE.Group(); w.parent.add(p); p.position.copy(w.parent.worldToLocal(c.clone())); p.attach(w); p.rotation.y = -0.42; } }   // counter-steer, each wheel about its own middle
  // a soft dark patch under the car (the low sun's shadow lies long and thin; this keeps the car on the road)
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 6, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 6.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color: 0x1a0c26, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  patch.position.copy(carPos).setY(carPos.y + 0.02); patch.rotation.y = car.rotation.y; patch.renderOrder = 2;
  scene.add(car, patch); return car;
}

// ---- the camera of the mockup (the one with the roadster, 4 : 3), read off the picture: a lens 50 degrees high, the horizon a third from the top (8.8 degrees down), the car
// 5.7 m away, its middle 5 degrees left of the view and its nose 16 degrees right of it, the eye 1.7 m over the road
const VIEW = here.th + CAR.slip - 0.276, F = new THREE.Vector3(Math.sin(VIEW), 0, -Math.cos(VIEW)), Rt = new THREE.Vector3(-F.z, 0, F.x);
const eye = carPos.clone().addScaledVector(F, -5.7).addScaledVector(Rt, 0.5).setY(carPos.y + 1.7), aim = eye.clone().addScaledVector(F, 20).setY(eye.y - 20 * Math.tan(8.8 * Math.PI / 180));
const CAM = { d: nearest(eye.x, eye.z).d - CAR.off };
const smoke = new Smoke(low ? 70 : 150);
if (!off.has('smoke')) {
  const r = (() => { let s = 4242; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  // from each rear tyre back along its mark: small and dense at the tyre, growing as it drifts to the left of the road and up; the camera stays clear of it
  const camD = CAR.off + CAM.d, puff = (sP, d, size, alpha, lift) => { if (CAR.s - sP > 3) d = Math.max(d, camD + size * 1.1 + 0.9); const p = at(sP, d); smoke.add(p.x, p.y + size * lift, p.z, size, alpha); };
  rear.forEach((rw, w) => { for (let k = 0; k < (low ? 18 : 40); k++) { const t = Math.pow(r(), 1.15), size = (w ? 0.2 : 0.3) + t * 1.5 + r() * 0.25;
    puff(rw.s - t * 9 + (r() - 0.5) * 0.5, Math.max(rw.d + 0.15 + t * (0.8 + r() * 4.5), t > 0.15 ? rear[0].d + 0.4 : -9), size, 0.98 - t * 0.1, 0.62 + r() * 0.4 + t * 0.3); } });
  for (let k = 0; k < (low ? 16 : 44); k++) { const back = -1.5 + r() * 9.5, size = (0.8 + r() * 1.2) * (back > 4.5 ? 0.75 : 1); puff(CAR.s - back, rear[0].d + 1.0 + r() * 6.5, size, 0.95, 0.5 + r() * 0.75); }   // the bank that already stands left of the car
  smoke.uniforms.uGround.value = carPos.y - 0.15; scene.add(smoke.mesh);
}

// ---- the camera of the mockup: low behind the car, a little to its left, the horizon above the middle
const finish = makeFinish(renderer, { low, sun: KEY.sunDir });
const size = () => { const w = innerWidth, h = innerHeight, r = renderer.getPixelRatio(); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); finish.setSize(Math.floor(w * r), Math.floor(h * r)); };
size(); addEventListener('resize', size);

let ready = false, frames = 0, last = performance.now(), ms = 16, counts = '';
const t0 = performance.now();
const frame = () => {
  const now = performance.now(), t = (now - t0) / 1000; ms += (now - last - ms) * 0.1; last = now;
  if (params.has('orbit')) { const a = t * 0.15; camera.position.set(carPos.x + Math.sin(a) * 9, carPos.y + 2.4, carPos.z + Math.cos(a) * 9); camera.lookAt(carPos.x, carPos.y + 0.7, carPos.z); } else { camera.position.copy(eye); camera.lookAt(aim); }
  smoke.update(t, camera); renderer.info.reset();
  if (off.has('finish')) { renderer.setRenderTarget(null); renderer.render(scene, camera); } else finish.render(scene, camera);
  if (++frames % 30 === 0) info.textContent = `${Math.round(1000 / ms)} fps (${ms.toFixed(1)} ms) · ${renderer.info.render.calls} calls, ${Math.round(renderer.info.render.triangles / 1000)}k triangles${counts}`;
  if (ready && frames > 8) window.__ready = true;
  requestAnimationFrame(frame);
};
frame();
const [props] = await Promise.all([off.has('props') ? null : buildProps(), buildCar()]);
if (props) { scene.add(props); counts = ` · ${props.userData.near} pines near, ${props.userData.far} far`; }
/** The picture now as a grid of mean colours (nx by ny cells, '#rrggbb'), for measuring against the mockup: the scene is drawn and read in the same breath. */
const grid = (nx = 12, ny = 7) => { finish.render(scene, camera); const c = document.createElement('canvas'); c.width = nx * 8; c.height = ny * 8; const g = c.getContext('2d'); g.drawImage(canvas, 0, 0, c.width, c.height); const d = g.getImageData(0, 0, c.width, c.height).data, rows = [];
  for (let j = 0; j < ny; j++) { const row = []; for (let i = 0; i < nx; i++) { const a = [0, 0, 0]; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const k = ((j * 8 + y) * c.width + i * 8 + x) * 4; a[0] += d[k]; a[1] += d[k + 1]; a[2] += d[k + 2]; } row.push('#' + a.map((v) => Math.round(v / 64).toString(16).padStart(2, '0')).join('')); } rows.push(row); } return rows; };
ready = true; window.__mock = { scene, camera, renderer, eye, aim, smoke, finish, KEY, grid };
