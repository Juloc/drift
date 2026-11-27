// The mock stage: one still scene built to stand next to the owner's mockup of the mountain pass at sunset (the picture itself is not in the
// repository). It proves the way to the look: one light model with coloured shadows and a sky-coloured haze (mock/toon.js), a land made of real
// facets (mock/land.js), kit models through the same light (mock/props.js), lump smoke (mock/smoke.js), a small finish (mock/finish.js).
// ?tier=low is the phone's tier; ?hud=0 hides the display; ?orbit=1 lets the camera circle slowly; ?off=smoke,props,finish switches parts off.
import * as THREE from '../vendor/three/three.module.js';
import { KEY } from './mock/toon.js';
import { makeSky, skyEnv } from './mock/sky.js';
import { buildLand, at, nearest, path } from './mock/land.js';
import { buildProps, loadGlb } from './mock/props.js';
import { Smoke } from './mock/smoke.js';
import { makeFinish } from './mock/finish.js';

window.__err = []; addEventListener('error', (e) => window.__err.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__err.push(String(e.reason?.message ?? e.reason)));
const params = new URLSearchParams(location.search), off = new Set((params.get('off') ?? '').split(',')), canvas = document.getElementById('view'), info = document.getElementById('info');
const low = params.get('tier') === 'low' || (!params.has('tier') && matchMedia('(pointer: coarse)').matches);
if (params.get('hud') === '0') document.getElementById('hud').hidden = true;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1.5 : 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.info.autoReset = false;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.3, 9000);

// ---- the car: where it is in its slide (in the right-hander, its nose turned further in than the road)
const CAR = { s: 30, off: -0.2, slip: 0.62 }, here = at(CAR.s, CAR.off), carPos = new THREE.Vector3(here.x, here.y, here.z), yaw = here.th + CAR.slip;
const T = new THREE.Vector3(here.tx, 0, here.tz), L = new THREE.Vector3(here.tz, 0, -here.tx);                       // the road's direction here, and its left
const fwd = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw)), side = new THREE.Vector3(fwd.z, 0, -fwd.x);          // side: the car's left
const rear = [1, -1].map((k) => { const p = carPos.clone().addScaledVector(fwd, -1.3).addScaledVector(side, k * 0.78), n = nearest(p.x, p.z); return { p, s: n.s + (p.x - path[n.i].x) * path[n.i].tx + (p.z - path[n.i].z) * path[n.i].tz, d: n.d }; });
// the marks its rear tyres drew on the way here: further back the car was straighter, so the two lines run closer together
const trail = (rw, back, i) => { const p = at(rw.s - back, rw.d - (i ? -1 : 1) * 0.5 * Math.min(1, back / 14) + 0.4 * Math.min(1, back / 20)); return [p.x, p.z]; };
const marks = rear.map((rw, i) => ({ w: 0.17, a: 0.85, pts: Array.from({ length: 30 }, (_, k) => trail(rw, 44 * (1 - k / 29), i)) }));

// ---- light: the sun for the shadows and for the car's own (physical) materials; the world's colours come from toon.js
const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.74, 0.52), 3.2); sun.position.copy(carPos).addScaledVector(KEY.sunDir, 120); sun.target.position.copy(carPos);
sun.castShadow = true; sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 260 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05; sun.shadow.radius = 3;
scene.add(sun, sun.target, new THREE.HemisphereLight(new THREE.Color('#d9b3ee'), new THREE.Color('#7a5a7a'), 1.5));

scene.add(makeSky(), buildLand({ marks }));
const envMap = skyEnv(renderer);

async function buildCar() {
  const gltf = await loadGlb(new URL('./assets/cars/s14-hi.glb', import.meta.url).href), car = gltf.scene;
  const P = (o) => new THREE.MeshPhysicalMaterial({ envMap, ...o });
  const mats = { paint: P({ color: '#f1ecf0', roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.85 }), glass: P({ color: '#171222', roughness: 0.06, envMapIntensity: 1.5 }),
    chrome: P({ color: '#e4dfe8', metalness: 0.7, roughness: 0.3 }), plastic: P({ color: '#1c1822', roughness: 0.7, envMapIntensity: 0.4 }), carbon: P({ color: '#15121a', roughness: 0.45, envMapIntensity: 0.6 }),
    rubber: P({ color: '#1b1820', roughness: 0.92, envMapIntensity: 0.2 }), light_front: P({ color: '#fff4dc', emissive: '#fff0cc', emissiveIntensity: 0.6, roughness: 0.2 }),
    light_rear: new THREE.MeshBasicMaterial({ color: new THREE.Color(5.2, 0.5, 0.95), toneMapped: false }) };
  let frontZ = 1;
  car.traverse((o) => { if (!o.isMesh) return; const key = Object.keys(mats).find((k) => (o.material.name ?? '').startsWith(k)); if (key) o.material = mats[key]; o.castShadow = true; o.receiveShadow = key !== 'light_rear';
    if (o.name.includes('light_front')) frontZ = Math.sign(new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).z) || 1; });
  car.rotation.y = frontZ > 0 ? Math.PI - yaw : -yaw; car.position.copy(carPos);
  { const ahead = at(CAR.s + 1.4, CAR.off), behind = at(CAR.s - 1.4, CAR.off), slope = Math.atan2(ahead.y - behind.y, 2.8); car.rotateOnWorldAxis(L, -slope * Math.cos(CAR.slip)); }   // the car lies on the falling road
  for (const n of ['wheel_fl', 'wheel_fr']) { const w = car.getObjectByName(n); if (w) w.rotation.y += 0.42 * frontZ; }                 // counter-steer
  // a soft dark patch under the car (the low sun's shadow lies long and thin; this keeps the car on the road)
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 6, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 6.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color: 0x1a0c26, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  patch.position.copy(carPos).setY(carPos.y + 0.02); patch.rotation.y = car.rotation.y; patch.renderOrder = 2;
  const hv = document.createElement('canvas'); hv.width = hv.height = 64; const hc = hv.getContext('2d'), hg = hc.createRadialGradient(32, 32, 1, 32, 32, 32); hg.addColorStop(0, 'rgba(255,255,255,1)'); hg.addColorStop(0.25, 'rgba(255,255,255,0.5)'); hg.addColorStop(1, 'rgba(255,255,255,0)'); hc.fillStyle = hg; hc.fillRect(0, 0, 64, 64);
  const halo = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(hv), color: new THREE.Color(3.4, 0.5, 0.9), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const k of [0.56, -0.56]) { const sp = new THREE.Sprite(halo); sp.scale.set(0.7, 0.36, 1); sp.position.copy(carPos).addScaledVector(fwd, -2.16).addScaledVector(side, k).setY(carPos.y + 0.78); sp.renderOrder = 6; scene.add(sp); }
  scene.add(car, patch); return car;
}

const CAM = { back: 7.0, d: -1.5, up: 2.45 };                                                                          // behind the car along the road, a little right of its line
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
const eye = carPos.clone().addScaledVector(T, -CAM.back).addScaledVector(L, CAM.d + CAR.off).setY(carPos.y + CAM.up), aim = carPos.clone().addScaledVector(T, 8).addScaledVector(L, -1.9).setY(carPos.y - 0.35);
const finish = makeFinish(renderer, { low });
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
ready = true; window.__mock = { scene, camera, renderer, eye, aim, smoke, finish, KEY };
