// Drive the touge uphill in the mock stage's look: the game's own touge map (data/maps/06-touge.json, its baked track and its walls) from the
// bottom of the pass to the plaza on top, with the new driving model (sim2) and the test pages' controls and cameras (lab-drive-core.js).
// The slope pulls on the car (the surface's gradient as an acceleration); the car lies on the road as its four wheels find it.
// ?tier=low is the phone's tier; ?s=<metres along the track> starts somewhere else; ?down=1 drives the pass downhill; H or the Data chip
// shows the test read-outs. The simulation's x is the scene's x mirrored (view/space.js).
import * as THREE from '../vendor/three/three.module.js';
import { KEY, shared } from './mock/toon.js';
import { makeSky, skyEnv } from './mock/sky.js';
import { mountains } from './mock/land.js';
import { buildTouge } from './mock/touge.js';
import { loadCar, groundPatch } from './mock/car.js';
import { Smoke } from './mock/smoke.js';
import { makeFinish } from './mock/finish.js';
import { loadTrack, surfaceAt, frameAt } from './sim/track.js';
import { prepareMap } from './sim/map.js';
import { Skids } from './view/fx.js';
import { createDrive, makeTexts, rigCar, $, FLAT, G, smokeOf } from './lab-drive-core.js';
import { makeScore } from './lab-drive-hud.js';
import { X } from './view/space.js';

window.__err = []; addEventListener('error', (e) => window.__err.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__err.push(String(e.reason?.message ?? e.reason)));
const params = new URLSearchParams(location.search);
const { t } = makeTexts({
  en: { title: 'Drift: touge uphill (test page)', run: 'Touge uphill', runDown: 'Touge downhill', time: 'Time', best: 'Best', score: 'Drift score', climb: 'Climb', angle: 'Drift angle', pGas: 'Gas', pBrake: 'Brake', pHand: 'Handbrake',
    hint: 'Arrows/WASD drive, Space handbrake, Shift clutch, Q/E gear, M manual, 1/2/3 Arcade/Sport/Sim, T stock/drift set-up, C camera, R back to the start, H test read-outs' },
  de: { title: 'Drift: Touge bergauf (Testseite)', run: 'Touge bergauf', runDown: 'Touge bergab', time: 'Zeit', best: 'Beste', score: 'Drift-Score', climb: 'Anstieg', angle: 'Driftwinkel', pGas: 'Gas', pBrake: 'Bremse', pHand: 'Handbremse',
    hint: 'Pfeile/WASD fahren, Leertaste Handbremse, Shift Kupplung, Q/E Gang, M manuell, 1/2/3 Arcade/Sport/Sim, T Serie/Drift-Aufbau, C Kamera, R zurück zum Start, H Testanzeigen' },
}, params);
const coarse = matchMedia('(pointer: coarse)').matches || params.has('touch'), low = params.get('tier') === 'low' || (!params.has('tier') && coarse), DOWN = params.get('down') === '1';

// ---- the picture
const canvas = $('view'), info = $('info'), renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1.25 : 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.info.autoReset = false;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, 0.3, 9000), finish = makeFinish(renderer, { low, sun: KEY.sunDir });
KEY.sunDir.set(0.9, 0.33, -0.4).normalize();   // the low sun stands across the pass: every second leg drives into it
const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.8, 0.6), 4.2); sun.castShadow = true; sun.shadow.mapSize.set(low ? 1024 : 4096, low ? 1024 : 4096);
Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 10, far: 320 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05; sun.shadow.radius = 3;
scene.add(sun, sun.target, new THREE.HemisphereLight(new THREE.Color('#cfc0f2'), new THREE.Color('#6c5a78'), 1.25), makeSky());
const size = () => { const w = innerWidth, h = innerHeight, r = renderer.getPixelRatio(); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); finish.setSize(Math.floor(w * r), Math.floor(h * r)); };
size(); addEventListener('resize', size);

// ---- the map: its track for the ground, its walls for the collisions
const mapJson = await (await fetch(new URL('./data/maps/06-touge.json', import.meta.url))).json(), T = loadTrack(mapJson.track), q = {};
const map = prepareMap({ bounds: mapJson.bounds, walls: mapJson.walls, obstacles: [], zones: [], ground: 'asphalt' });
const groundAt = (x, z) => surfaceAt(T, x, z, q).y;
const world = buildTouge(mapJson, T, { tier: low ? 'low' : 'high', down: DOWN });
scene.add(world.group, mountains(-world.field.cx, world.field.cz, world.field.lo - 30));

// ---- the car
const { scene: model, lamps } = await loadCar(new URL('./assets/cars/s14-hi.glb', import.meta.url).href, skyEnv(renderer));
const car = rigCar(model); car.group.add(groundPatch()); scene.add(car.group);

// ---- smoke and skid marks from the tyres
const smoke = new Smoke(low ? 90 : 220); scene.add(smoke.mesh);
const skids = new Skids(1800); skids.mesh.material.color.set('#140c1c'); skids.mesh.material.opacity = 0.55; scene.add(skids.mesh);
function marksAndSmoke(s, steps) {
  const sh = Math.sin(s.h), ch = Math.cos(s.h), moving = s.speed > 3, smokeNow = steps % 4 === 0;
  for (let i = 0; i < 4; i++) { const [lx, lz] = car.wheelLocal[i], px = s.x + lz * sh - lx * ch, pz = s.z + lz * ch + lx * sh, g = surfaceAt(T, px, pz, q);
    skids.mark(i, X(px), pz, 0, 0, s.sn[i] > 1 && s.slip[i] > 1 && moving, g.y, -g.gx, g.gz);
    const k = smokeOf(s, drive.car, i); if (smokeNow && k > 0.05 && Math.random() < 0.25 + 0.5 * k) smoke.emit(X(px), g.y, pz, k, -s.vx, s.vz); }
}

// ---- the driving
const ENV = { ...FLAT, muW: [1, 1, 1, 1] }, S0 = params.has('s') ? +params.get('s') : DOWN ? 34 : T.len - 14;
const spawn = () => { const f = frameAt(T, S0, 0); return { x: f.x, z: f.z, h: f.head + (DOWN ? 0 : Math.PI) }; };
const run = { time: 0, best: null, going: false, done: false, sNow: S0 }, score = makeScore();
const hooks = {
  beforeStep(s, wheelPts, muW) { const g = surfaceAt(T, s.x, s.z, q); ENV.ax = -G * g.gx; ENV.az = -G * g.gz; run.sNow = g.s;                     // the slope pulls on the car
    for (let i = 0; i < 4; i++) muW[i] = surfaceAt(T, wheelPts[i][0], wheelPts[i][1], q).kind === 'land' ? 0.62 : 1; },                        // grass beside the road grips less
  fixed(s, steps) { if (steps % 2 === 0) marksAndSmoke(s, steps); },
  onReset() { smoke.clear(); skids.clear(); score.reset(); run.time = 0; run.going = false; run.done = false; },
  key(code) { if (code === 'KeyH') { document.body.classList.toggle('data-open'); return true; } return false; },
  rows: () => [['fps', perfLine]],
  // the car lies on the road as its wheels find it: nose up on the climb, leaning with the bank
  afterPlace(d) { const g = car.group, h = (lx, lz) => { v.set(lx, 0, lz).applyAxisAngle(up, g.rotation.y); return groundAt(X(g.position.x + v.x), g.position.z + v.z); };
    g.rotation.x = -Math.atan2(h(0, 1.3) - h(0, -1.3), 2.6); g.rotation.z = Math.atan2(h(0.8, 0) - h(-0.8, 0), 1.6); g.updateMatrix(); },
};
const v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const qn = (k, d) => (params.has(k) ? +params.get(k) : d), CAM = { dist: qn('cd', 5.2), height: qn('ch', 1.85), side: 0, look: qn('cl', 14), lookY: qn('cy', 0.35), travel: 0.6, fov: qn('cf', 56), turn: 8, swing: 3, turnDrift: -24 };
let perfLine = '';
const drive = createDrive({ params, t, camera, rig: car, wheelLocal: car.wheelLocal, spawn, env: ENV, map, groundAt, lookCamera: CAM, soundId: 1, hooks });
$('simhint').textContent = t('hint');

// ---- the driving display (the mockup's cards, live)
const clock = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return `${String(m).padStart(2, '0')}:${r.toFixed(3).padStart(6, '0')}`; }, dots = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
for (const [id, key] of [['h-title', DOWN ? 'runDown' : 'run'], ['h-timeL', 'time'], ['h-bestL', 'best'], ['h-scoreL', 'score'], ['h-climbL', 'climb'], ['h-angleL', 'angle'], ['h-gasL', 'pGas'], ['h-brakeL', 'pBrake'], ['h-handL', 'pHand']]) $(id).textContent = key === 'best' ? `★ ${t(key)}` : t(key);
{ // the map card: the pass from above, the bottom at the bottom
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < T.x.length; i++) { x0 = Math.min(x0, -T.x[i]); x1 = Math.max(x1, -T.x[i]); z0 = Math.min(z0, T.z[i]); z1 = Math.max(z1, T.z[i]); }
  const pad = 14; $('h-map').setAttribute('viewBox', `${x0 - pad} ${-z1 - pad} ${x1 - x0 + 2 * pad} ${z1 - z0 + 2 * pad}`);
  let d = ''; for (let i = 0; i < T.x.length; i += 3) d += `${i ? 'L' : 'M'}${(-T.x[i]).toFixed(1)} ${(-T.z[i]).toFixed(1)}`; $('h-way').setAttribute('d', d); $('h-way').setAttribute('stroke-width', '5');
}
const shown = {}, put = (key, value, apply) => { if (shown[key] !== value) { shown[key] = value; apply(value); } }, ARC = 172 * 1.01;
function hud(d, dt) {
  const s = drive.s, kmh = s.speed * 3.6, deg = (s.beta * 180) / Math.PI, a = Math.min(60, Math.abs(deg) > 90 ? 180 - Math.abs(deg) : Math.abs(deg));
  if (!run.done && (run.going || s.speed > 1)) { run.going = true; run.time += dt; }
  const climbed = DOWN ? run.sNow / T.len : 1 - run.sNow / T.len;
  if (run.going && !run.done && climbed > 0.985) { run.done = true; run.best = run.best === null ? run.time : Math.min(run.best, run.time); }
  score.step(dt, kmh, deg);
  put('time', Math.floor(run.time * 20), () => { $('h-time').textContent = clock(run.time); }); put('best', run.best, (b) => { $('h-best').textContent = b === null ? '–' : clock(b); });
  put('pts', Math.round(score.total + score.run), (n) => { $('h-score').textContent = dots(n); }); put('mult', score.mult.toFixed(1), (m) => { $('h-mult').textContent = `×${m.replace('.', ',')}`; });
  put('live', score.live, (b) => $('h-scoreC').classList.toggle('live', b)); put('chain', Math.round(Math.min(1, (score.chain % 0.6) / 0.6) * 20), (c) => { $('h-chain').style.width = `${score.run > 0 ? c * 5 : 0}%`; });
  put('climb', Math.round(Math.max(0, Math.min(1, climbed)) * 100), (n) => { $('h-climb').textContent = `${n} %`; });
  put('ang', Math.round(a), (n) => { $('h-angle').textContent = `${n}°`; $('h-arc').setAttribute('stroke-dasharray', `${((n / 60) * ARC).toFixed(1)} 999`); });
  put('gas', Math.round(drive.inp.throttle * 20), (n) => { $('h-gas').style.width = `${n * 5}%`; }); put('brk', Math.round(drive.inp.brake * 20), (n) => { $('h-brake').style.width = `${n * 5}%`; }); put('hnd', Math.round(drive.inp.handbrake * 20), (n) => { $('h-hand').style.width = `${n * 5}%`; });
  put('kmh', Math.round(kmh), (n) => { $('h-kmh').textContent = String(n); }); put('gear', s.gear === 0 ? 'N' : s.gear < 0 ? 'R' : String(s.gear), (g) => { $('h-gear').textContent = g; });
  put('me', `${X(d.x).toFixed(0)} ${(-d.z).toFixed(0)} ${Math.round((-d.h * 180) / Math.PI)}`, (p) => { const [x, z, r] = p.split(' '); $('h-me').setAttribute('transform', `translate(${x} ${z}) scale(3.5) rotate(${r})`); });
}

// ---- the loop
let frames = 0, last = performance.now(), ms = 16; const t0 = performance.now(), at = new THREE.Vector3();
function frame(now) {
  ms += (now - last - ms) * 0.05; last = now;
  const { d, dt } = drive.frame(now);
  lamps.set(drive.inp.brake); hud(d, dt);
  at.set(X(d.x), groundAt(d.x, d.z), d.z); sun.target.position.copy(at); sun.position.copy(at).addScaledVector(KEY.sunDir, 120);   // the sun's shadow box follows the car
  shared.uTime.value = (now - t0) / 1000; smoke.tick(dt); smoke.update((now - t0) / 1000, camera);
  renderer.info.reset(); finish.render(scene, camera);
  if (++frames % 30 === 0) { perfLine = `${Math.round(1000 / ms)} fps · ${renderer.info.render.calls} calls · ${Math.round(renderer.info.render.triangles / 1000)}k tri · ${low ? 'low' : 'high'}`; info.textContent = perfLine; }
  if (frames === 10) window.__ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
/** The cost of one picture in ms: the render and a wait for the graphics to finish, the smallest of n tries; with the draw calls and triangles of that picture. */
const measure = (n = 20) => { const gl = renderer.getContext(), px = new Uint8Array(4); let best = 1e9; for (let i = 0; i < n; i++) { renderer.info.reset(); const a = performance.now(); finish.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); best = Math.min(best, performance.now() - a); }
  const dbg = gl.getExtension('WEBGL_debug_renderer_info'); return { tier: low ? 'low' : 'high', ms: +best.toFixed(1), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, size: [canvas.width, canvas.height], gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?' }; };
window.__sim = { measure,  get state() { return drive.s; }, drive, T, run, score, renderer, camera, scene, world, held: drive.held, reset: drive.reset };
