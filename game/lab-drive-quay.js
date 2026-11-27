// Drive on the quay ring (view/look/quay.js): the new driving model (sim2) on the chef's ring of track, with the test page's controls, read-outs and cameras (lab-drive-core.js). What this page adds
// to the scene: the AE86 on its body node (`h.dressCar`), the two wall rings and the square round them (collision.js), grip 0.6 in a puddle (`h.puddleAt`, the asphalt shader's own noise),
// the sun's shadow following the car, smoke from the tyres (`h.smoke.emit` every 1/30 s while `smokeOf > 0`), skid marks. There are no cones on the ring.
// The simulation runs in x mirrored against the scene (view/space.js X): the scene's x is -x of the simulation, as on every other page. The scene has no turn (yaw 0).
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { buildQuay } from './view/look/quay.js';
import { Skids } from './view/fx.js';
import { prepareMap } from './sim/map.js';
import { createDrive, makeTexts, rigCar, $, FLAT, smokeOf } from './lab-drive-core.js';
import { X } from './view/space.js';

window.__err = []; addEventListener('error', (e) => window.__err.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__err.push(String(e.reason?.message ?? e.reason)));
const params = new URLSearchParams(location.search);
const { t } = makeTexts({
  en: { title: 'Drift: drive on the quay (test page)', hint: 'Arrows/WASD drive, Space handbrake, Shift clutch, Q/E gear, M manual, 1/2/3 Arcade/Sport/Sim, T stock/drift set-up, C camera, R back to the start. Burnout: hold the brake and full throttle' },
  de: { title: 'Drift: Fahren auf dem Kai (Testseite)', hint: 'Pfeile/WASD fahren, Leertaste Handbremse, Shift Kupplung, Q/E Gang, M manuell, 1/2/3 Arcade/Sport/Sim, T Serie/Drift-Aufbau, C Kamera, R zurück zum Start. Burnout: Bremse halten und Vollgas' },
}, params);
const coarse = matchMedia('(pointer: coarse)').matches || params.has('touch');

// ---- the scene (for driving: no posed car, no posed smoke)
const canvas = $('view'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.info.autoReset = false;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight, false);
const tierName = ['high', 'low'].includes(params.get('tier')) ? params.get('tier') : coarse ? 'low' : 'high';
const h = await buildQuay({ renderer, params, still: false, tier: tierName });
const { camera, sun } = h;
addEventListener('resize', () => h.resize(innerWidth, innerHeight));

// ---- the car: the AE86 file as the still shows it, its wheels and body made movable, dressed by the scene (shadows, tail lamps)
const car = rigCar(h.dressCar((await new GLTFLoader().loadAsync('assets/cars/ae86-hi.glb')).scene));
h.scene.add(car.group);

// ---- the walls (two closed rings of points, first = last) and the square round them, in the simulation's axes (x mirrored); no cones here
const mirror = ([x, z]) => [-x, z];
const map = prepareMap({ bounds: h.bounds.map(mirror), walls: h.walls.map((pts) => ({ pts: pts.map(mirror), closed: false })), obstacles: [], zones: [], ground: 'asphalt' });

// ---- the ground: 1 on asphalt, 0.6 for a wheel in a puddle
const ENV = { ...FLAT, muW: [1, 1, 1, 1] }, minMu = [1, 1, 1, 1], PUDDLE_MU = 0.6;

// ---- skid marks (as on the test page)
const skids = new Skids(1500); skids.mesh.material.color.set('#0e0c14'); skids.mesh.material.opacity = 0.85; h.scene.add(skids.mesh);
const skidIdx = [0, 1, 2, 3];
function marksAndSmoke(s, steps) {
  const sh = Math.sin(s.h), ch = Math.cos(s.h), moving = s.speed > 3, C = drive.car, smokeNow = steps % 4 === 0;   // smoke every 1/30 s (4 steps of 1/120)
  for (let i = 0; i < 4; i++) {
    const [lx, lz] = car.wheelLocal[i], px = s.x + lz * sh - lx * ch, pz = s.z + lz * ch + lx * sh;
    skids.mark(skidIdx[i], X(px), pz, 0, 0, s.sn[i] > 1 && s.slip[i] > 1 && moving, 0, 0, 0);
    const k = smokeOf(s, C, i);
    if (smokeNow && k > 0) h.smoke.emit(X(px), pz, k, -s.vx, s.vz);   // the tyre's contact point and the car's speed there, in the scene's axes
  }
}

// ---- the driving (lab-drive-core.js) with this scene's parts
const start = h.ring.start;   // the scene's axes: x, z and yaw as three.js turns a model whose nose is +z (clockwise round the ring); the simulation's x is mirrored, its heading is -yaw
const sunAt = new THREE.Vector3();
const ring = { min: 1e9, max: 0 };   // the nearest and the farthest the car's middle has been from the ring's middle (for the checking tool: the track lies between the walls' radii)
// `?drive=12.5` (for the checking tool): a driver that slides round the ring at that speed (m/s): a kick with the handbrake, then it steers to keep the ring's line (26.6 m from the middle) with the nose
// a little to the inside of where it goes. Gas below the speed. It reads the simulation's axes (x mirrored).
const DRIVE = +(params.get('drive') ?? 0), LINE = h.ring.line, cs0 = { x: -h.ring.cx, z: h.ring.cz }, angTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
let dT = 0, dSign = 0;
const driver = DRIVE > 0 ? (s, dt) => {
  const dx = s.x - cs0.x, dz = s.z - cs0.z, d = Math.hypot(dx, dz) || 1;
  if (!dSign) dSign = Math.sign(Math.sin(s.h) * (dz / d) - Math.cos(s.h) * (dx / d)) || 1;   // the way round: the one the car points along at the start
  dT += dt;
  const tan = [dSign * (dz / d), -dSign * (dx / d)], push = Math.max(-0.7, Math.min(0.7, 0.06 * (d - LINE))), want = Math.atan2(tan[0] - (dx / d) * Math.tan(push), tan[1] - (dz / d) * Math.tan(push)) + dSign * +(params.get("angle") ?? 0.3);
  return { steer: dT < 0.5 ? dSign : Math.max(-1, Math.min(1, 1.6 * angTo(s.h, want))), gas: s.speed < DRIVE, hand: dT < 0.35 };
} : undefined;
const hooks = {
  driver,
  beforeStep(s, wheelPts, muW) { for (let i = 0; i < 4; i++) { muW[i] = h.puddleAt(-wheelPts[i][0], wheelPts[i][1]) > 0.5 ? PUDDLE_MU : 1; if (muW[i] < minMu[i]) minMu[i] = muW[i]; } },
  fixed(s, steps) { if (steps % 2 === 0) marksAndSmoke(s, steps); const r = Math.hypot(-s.x - h.ring.cx, s.z - h.ring.cz); ring.min = Math.min(ring.min, r); ring.max = Math.max(ring.max, r); },
  onReset() { h.smoke.clear(); skids.clear(); },
};
const drive = createDrive({ params, t, camera, rig: car, wheelLocal: car.wheelLocal, spawn: () => ({ x: -start.x, z: start.z, h: -start.yaw }), env: ENV, map, groundAt: () => 0, lookCamera: { dist: 5.6, height: 1.2, side: 0, look: 14, lookY: 0.5, travel: 0.6, fov: 52, turn: 8, swing: 3, turnDrift: -24 }, soundId: 1, hooks });
$('simhint').textContent = t('hint');

// ---- the loop
function frame(now) {
  const { d, dt } = drive.frame(now);
  h.tick(dt);   // palms, flags, people, sea, clouds and the smoke's lumps move
  sunAt.set(X(d.x), 0, d.z); sun.target.position.copy(sunAt); sun.position.copy(sunAt).add(h.sunOffset);   // the sun's shadow box follows the car
  if (innerWidth !== frame.w || innerHeight !== frame.h) { frame.w = innerWidth; frame.h = innerHeight; h.resize(innerWidth, innerHeight); }
  renderer.info.reset(); h.composer.render();   // (one picture is several renders: the passes are counted together)
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// for the checking tools (tools/simdrive.mjs --sim)
window.__sim = { get state() { return drive.s; }, get frames() { return drive.frames; }, get mode() { return drive.mode; }, held: drive.held, reset: drive.reset, setMode: drive.setMode, minMu, ring, drive, harbour: h, renderer, camera, car, puddleAt: h.puddleAt };
/** The numbers of the picture now: draw calls and triangles of one whole picture (all passes), the cost of one picture in ms (the render and a wait for the graphics to finish, the smallest of
 * `n` tries), the pixel size and the memory estimate. */
window.__sim.measure = (n = 12) => {
  const gl = renderer.getContext(), px = new Uint8Array(4); let best = 1e9, calls = 0, triangles = 0;
  for (let i = 0; i < n; i++) { renderer.info.reset(); const t0 = performance.now(); h.composer.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); best = Math.min(best, performance.now() - t0); calls = renderer.info.render.calls; triangles = renderer.info.render.triangles; }
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return { tier: tierName, ms: +best.toFixed(1), calls, triangles, size: [renderer.domElement.width, renderer.domElement.height], memory: h.memoryEstimate(), textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?' };
};
