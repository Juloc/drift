// Drive in the harbour corner (view/look/harbour.js): the new driving model (sim2) in the chef's scene, with the test page's controls, read-outs and cameras (lab-drive-core.js). What this page
// adds to the scene: the AE86 on its body node, barrier walls and the pad's edge (collision.js), pylons that fall and stand up on R (ONE instanced mesh per material of the scene's pylon model),
// grip 0.6 in a puddle (the asphalt shader's own noise, in JavaScript), the sun's shadow following the car, a pool of smoke sprites with the scene's cloud picture driven by smokeOf, skid marks.
// The simulation runs in x mirrored against the scene (view/space.js X): the scene's x is -x of the simulation, as on every other page; the car is drawn inside `root`.
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { buildHarbour, NOISE_GLSL, hollowAt } from './view/look/harbour.js';
import { Skids } from './view/fx.js';
import { prepareMap } from './sim/map.js';
import { newCones, coneStep } from './sim/cones.js';
import { createDrive, makeTexts, rigCar, $, FLAT, smokeOf, clamp } from './lab-drive-core.js';
import { X } from './view/space.js';

window.__err = []; addEventListener('error', (e) => window.__err.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__err.push(String(e.reason?.message ?? e.reason)));
const params = new URLSearchParams(location.search);
const { t } = makeTexts({
  en: { title: 'Drift: drive in the harbour (test page)', hint: 'Arrows/WASD drive, Space handbrake, Shift clutch, Q/E gear, M manual, 1/2/3 Arcade/Sport/Sim, T stock/drift set-up, C camera, R back to the start. Burnout: hold the brake and full throttle' },
  de: { title: 'Drift: Fahren im Hafen (Testseite)', hint: 'Pfeile/WASD fahren, Leertaste Handbremse, Shift Kupplung, Q/E Gang, M manuell, 1/2/3 Arcade/Sport/Sim, T Serie/Drift-Aufbau, C Kamera, R zurück zum Start. Burnout: Bremse halten und Vollgas' },
}, params);
const coarse = matchMedia('(pointer: coarse)').matches || params.has('touch');

// ---- the scene (for driving: no posed car, no posed smoke, no plain pylons)
const canvas = $('view'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.info.autoReset = false;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight, false);
const tierName = ['high', 'low'].includes(params.get('tier')) ? params.get('tier') : coarse ? 'low' : 'high';
const h = await buildHarbour({ renderer, params, still: false, tier: tierName });
await h.setTier(tierName);   // (high: as the still; low: no ambient occlusion, bloom at half size, shadow map 1024, pixel ratio 1.5, a quarter of the grass and flowers, the 1k sky)
const { root, camera, sun } = h;
addEventListener('resize', () => h.resize(innerWidth, innerHeight));

// ---- the car: the AE86 file as the still shows it, its wheels and body made movable
const carLoader = new GLTFLoader(); carLoader.register((parser) => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); return { name: 'drift_plain_images' }; });   // (the app's content policy, see quay.js)
const car = rigCar((await carLoader.loadAsync('assets/cars/ae86-hi.glb')).scene);
car.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
root.add(car.group);

// ---- the walls and the cones, in the simulation's axes (x mirrored)
const mirror = ([x, z]) => [-x, z];
const map = prepareMap({ bounds: h.bounds.map(mirror), walls: h.walls.map((pts) => ({ pts: pts.map(mirror), closed: false })), obstacles: [], zones: [], ground: 'asphalt' });
const simCones = h.coneSpots.map(([x, z]) => ({ x: -x, z }));
const up = new THREE.Vector3(0, 1, 0);
/** The scene's pylons, made here: one instanced mesh per material, each pylon standing or lying (it falls the way the car went and slides a little). */
class Pylons {
  constructor(meshes, spots) { this.meshes = meshes; this.spots = spots; this.n = spots.length; this.ang = new Float32Array(this.n); this.target = new Float32Array(this.n); this.dir = new Float32Array(this.n * 3); this.dirty = false; }
  fall(i, dx, dz, v) { this.target[i] = 1; this.dir[i * 3] = -dx; this.dir[i * 3 + 1] = dz; this.dir[i * 3 + 2] = 0.4 + 1.6 * v; this.dirty = true; }   // (the simulation's direction to the scene's axes)
  standAll() { this.target.fill(0); this.dirty = true; }
  update(dt) {
    if (!this.dirty) return;
    let moving = false;
    for (let i = 0; i < this.n; i++) { const d = this.target[i] - this.ang[i]; if (d !== 0) { this.ang[i] = Math.abs(d) < 0.001 ? this.target[i] : this.ang[i] + Math.sign(d) * Math.min(Math.abs(d), dt * (d > 0 ? 7 : 3)); moving = true; this.set(i); } }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
    this.dirty = moving;
  }
  set(i) {
    const [x, z, ry = 0, sc = 1, y = 0] = this.spots[i], a = this.ang[i], dx = this.dir[i * 3], dz = this.dir[i * 3 + 1], slide = a * this.dir[i * 3 + 2], q = new THREE.Quaternion().setFromAxisAngle(up, ry), p = new THREE.Vector3(x, y, z);
    if (a > 0) { const l = Math.hypot(dx, dz) || 1; q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(dz / l, 0, -dx / l), a * (Math.PI / 2) * 0.96)); p.x += (dx / l) * slide; p.z += (dz / l) * slide; }
    const m = new THREE.Matrix4();
    for (const mesh of this.meshes) { const b = mesh.userData.base; mesh.setMatrixAt(i, m.compose(p, q, new THREE.Vector3(sc, sc, sc)).multiply(b.fix).multiply(b.mw)); }
  }
  downCount() { let n = 0; for (let i = 0; i < this.n; i++) if (this.target[i] === 1) n++; return n; }
}
const pylons = new Pylons(await h.scatter('kit/racing/pylon.gltf', h.coneSpots, { tint: '#ff8a3a', add: false }), h.coneSpots);   // (the same model, tint, scale and places as the still's)
for (const m of pylons.meshes) root.add(m);
let cs = newCones(simCones);

// ---- the ground: 1 on asphalt, 0.6 for a wheel in a puddle (the asphalt shader's noise)
const ENV = { ...FLAT, muW: [1, 1, 1, 1] }, minMu = [1, 1, 1, 1];
const PUDDLE_MU = 0.6;

// ---- skid marks (as on the test page) and a pool of smoke sprites
const skids = new Skids(1500); skids.mesh.material.color.set('#0e0c14'); skids.mesh.material.opacity = 0.85; root.add(skids.mesh);
const POOL = 160, LIFE = 1.6, puffs = [];
for (let i = 0; i < POOL; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: h.cloudTex, color: new THREE.Color().setRGB(1.0, 0.9, 0.88), opacity: 0, rotation: ((i * 0.6180339) % 1 - 0.5) * 0.9, depthWrite: false, fog: true }));
  sp.visible = false; root.add(sp); h.flats.push(sp); puffs.push({ sp, age: LIFE, k: 0, x: 0, y: 0, z: 0, vx: 0, vz: 0 });
}
let nextPuff = 0;
/** A puff at a tyre's contact point (the scene's axes): 0.9 m big, growing to 5 m in 1.6 s, rising 1.5 m, carried a little by the car's speed. */
function emitPuff(x, z, vx, vz, k) { const p = puffs[nextPuff]; nextPuff = (nextPuff + 1) % POOL; Object.assign(p, { age: 0, k, x, y: 0.3, z, vx, vz }); p.sp.visible = true; }
function updatePuffs(dt) {
  for (const p of puffs) {
    if (p.age >= LIFE) { if (p.sp.visible) { p.sp.visible = false; } continue; }
    p.age += dt; const u = Math.min(1, p.age / LIFE);
    p.sp.position.set(p.x + p.vx * p.age, p.y + 1.5 * u, p.z + p.vz * p.age); p.sp.scale.setScalar(0.9 + (5 - 0.9) * u); p.sp.material.opacity = 0.9 * p.k * (1 - u);
  }
}
const acc = [0, 0, 0, 0], skidIdx = [0, 1, 2, 3];
let sinceSmoke = 0;
function marksAndSmoke(s) {
  const sh = Math.sin(s.h), ch = Math.cos(s.h), moving = s.speed > 3, C = drive.car;
  sinceSmoke++;
  for (let i = 0; i < 4; i++) {
    const [lx, lz] = car.wheelLocal[i], px = s.x + lz * sh - lx * ch, pz = s.z + lz * ch + lx * sh;
    skids.mark(skidIdx[i], X(px), pz, 0, 0, s.sn[i] > 1 && s.slip[i] > 1 && moving, 0, 0, 0);
    const k = smokeOf(s, C, i);
    if (k > 0 && sinceSmoke >= 4) emitPuff(X(px), pz, -s.vx * 0.15, s.vz * 0.15, k);   // a puff every 1/30 s (4 steps of 1/120)
  }
  if (sinceSmoke >= 4) sinceSmoke = 0;
}

// ---- the driving (lab-drive-core.js) with this scene's parts
const yawQ = new THREE.Quaternion().setFromAxisAngle(up, h.yaw), sunOffset = sun.position.clone().sub(sun.target.position), sunAt = new THREE.Vector3();
const hooks = {
  beforeStep(s, wheelPts, muW) { for (let i = 0; i < 4; i++) { muW[i] = 1 - (1 - PUDDLE_MU) * h.puddleAt(-wheelPts[i][0], wheelPts[i][1]); if (muW[i] < minMu[i]) minMu[i] = muW[i]; } },
  afterStep(s) { const hit = coneStep(cs, simCones, s.x, s.z, s.vx, s.vz); if (hit !== cs) { for (const i of hit.event) pylons.fall(i, hit.down[i].dx, hit.down[i].dz, hit.down[i].v); cs = hit; } },
  fixed(s, steps) { if (steps % 2 === 0) marksAndSmoke(s); },
  onReset() { cs = newCones(simCones); pylons.standAll(); skids.clear(); },
  rows() { return [[t('conesDown'), `${pylons.downCount()}/${pylons.n}`]]; },
  // the cameras of the test page work in the scene's own axes; the root is turned towards the sun, so the camera they placed is turned with it
  overrideCamera(d, dt) { drive.activeCam().update(d, 55, dt); camera.position.applyAxisAngle(up, h.yaw); camera.quaternion.premultiply(yawQ); camera.updateMatrixWorld(); return true; },
};
// where the car stands at the start (the simulation's axes): on the open asphalt east of the ring, facing west along the north side of the ring (a right turn runs into the cones)
const drive = createDrive({ params, t, camera, rig: car, wheelLocal: car.wheelLocal, spawn: () => ({ x: -34, z: 12, h: Math.PI / 2 }), env: ENV, map, groundAt: () => 0, lookCamera: { dist: 5.6, height: 1.2, side: 0, look: 14, lookY: 0.5, travel: 0.6, fov: 52, turn: 8, swing: 3, turnDrift: -24 }, soundId: 1, hooks });
$('simhint').textContent = t('hint');

// ---- the loop
let last = performance.now();
function frame(now) {
  const { d, dt } = drive.frame(now);
  pylons.update(dt); updatePuffs(dt);
  sunAt.copy(h.toWorld(X(d.x), 0, d.z)); sun.target.position.copy(sunAt); sun.position.copy(sunAt).add(sunOffset);   // the sun's shadow box follows the car
  if (innerWidth !== frame.w || innerHeight !== frame.h) { frame.w = innerWidth; frame.h = innerHeight; h.resize(innerWidth, innerHeight); }
  renderer.info.reset(); h.composer.render();   // (one picture is several renders: the passes are counted together)
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// for the checking tools (tools/simdrive.mjs --sim)
window.__sim = { get state() { return drive.s; }, get frames() { return drive.frames; }, get mode() { return drive.mode; }, held: drive.held, reset: drive.reset, setMode: drive.setMode, minMu, get cones() { return cs; }, pylons, drive, harbour: h, renderer, camera, car,
  puddleAt: (x, z) => h.puddleAt(x, z) };

/** The puddle noise in JavaScript against the shader's own: the same 200 points (the ground's world x, z) go through the asphalt shader's noise on the graphics card into a tiny picture
 * and come back as bytes; returns { points, worst, mean } (the difference of the depth, in 1/255). */
window.__sim.puddleCheck = (n = 200) => {
  const pts = new Float32Array(n * 4); let seed = 12345; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < n; i++) { pts[i * 4] = -60 + rnd() * 120; pts[i * 4 + 1] = -90 + rnd() * 140; pts[i * 4 + 3] = 1; }
  const tex = new THREE.DataTexture(pts, n, 1, THREE.RGBAFormat, THREE.FloatType); tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
  const target = new THREE.WebGLRenderTarget(n, 1, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const mat = new THREE.ShaderMaterial({ uniforms: { tP: { value: tex } }, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `precision highp float; uniform sampler2D tP; varying vec2 vUv;\n${NOISE_GLSL}\nvoid main() { vec2 w = texture2D(tP, vUv).xy; float hollow = fbm(w * 0.16 + 31.0); gl_FragColor = vec4(smoothstep(0.46, 0.58, hollow), 0.0, 0.0, 1.0); }` });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat), sc = new THREE.Scene(); sc.add(quad);
  const old = renderer.getRenderTarget(); renderer.setRenderTarget(target); renderer.render(sc, new THREE.Camera()); renderer.setRenderTarget(old);
  const px = new Uint8Array(n * 4); renderer.readRenderTargetPixels(target, 0, 0, n, 1, px);
  let worst = 0, sum = 0;
  for (let i = 0; i < n; i++) { const d = Math.abs(px[i * 4] - Math.round(hollowAt(pts[i * 4], pts[i * 4 + 1]) * 255)); worst = Math.max(worst, d); sum += d; }
  target.dispose(); tex.dispose(); mat.dispose();
  return { points: n, worst, mean: +(sum / n).toFixed(3), wet: Array.from(px).filter((_, i) => i % 4 === 0).filter((v) => v > 0 && v < 255).length };
};

/** The numbers of the picture now: draw calls and triangles of one whole picture (all passes), the cost of one picture in ms (the render and a wait for the graphics to finish, the
 * smallest of `n` tries: the least disturbed by other work on the machine), the pixel size and the memory estimate. */
window.__sim.measure = (n = 12) => {
  const gl = renderer.getContext(), px = new Uint8Array(4); let best = 1e9, calls = 0, triangles = 0;
  for (let i = 0; i < n; i++) { renderer.info.reset(); const t0 = performance.now(); h.composer.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); best = Math.min(best, performance.now() - t0); calls = renderer.info.render.calls; triangles = renderer.info.render.triangles; }
  const dbg = renderer.getContext().getExtension('WEBGL_debug_renderer_info');
  return { tier: tierName, ms: +best.toFixed(1), calls, triangles, size: [renderer.domElement.width, renderer.domElement.height], memory: h.memoryEstimate(), textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?' };
};
