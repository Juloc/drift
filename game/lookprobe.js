// The look probe: a meeting place on a mountain pass in the soft, painted sunset look of the owner's mockup, three parked cars and one drifting on the
// road (driven by the line bot), with the mockup's HUD. Only for pictures and for the owner's decision; the game, its maps,
// physics, server and network code are not touched. World and look are data: data/probe-sunset.json and data/looks/sunset.json.
import * as THREE from '../vendor/three/three.module.js';
import { step, makeCar, bodySlip, bodyVelocity, speedOf, turnedAngle, DT } from './sim/physics.js';
import { newScore, scoreStep } from './sim/score.js';
import { lineBot } from './sim/linebot.js';
import { FixedLoop } from './sim/loop.js';
import { S15 } from './view/s15.js';
import { LookChase } from './view/camera.js';
import { WheelPool } from './view/wheels.js';
import { angDiff } from './core/rng.js';
import { X, HEAD } from './view/space.js';
import { createStage, carMaker } from './view/look/stage.js';
import { mergeParked } from './view/look/parked.js';
import { paintCar } from './view/look/paint.js';
import { ProbeHud } from './view/probehud.js';

const params = new URLSearchParams(location.search);
const lang = (params.get('lang') ?? (navigator.language?.startsWith('de') ? 'de' : 'en')) === 'de' ? 'de' : 'en';
const T = {
  en: { lap: 'Lap', time: 'Time', best: 'Best', score: 'Drift score', position: 'Position', angle: 'Drift angle', gear: 'Gear', gas: 'Throttle', brake: 'Brake', hand: 'Handbrake', lost: 'Lost!', handBtn: 'HAND', brakeBtn: 'BRAKE', gasBtn: 'GAS' },
  de: { lap: 'Runde', time: 'Zeit', best: 'Beste', score: 'Drift-Score', position: 'Position', angle: 'Driftwinkel', gear: 'Gang', gas: 'Gas', brake: 'Bremse', hand: 'Handbremse', lost: 'Verloren!', handBtn: 'HAND', brakeBtn: 'BREMSE', gasBtn: 'GAS' },
}[lang];
document.documentElement.lang = lang;
for (const e of document.querySelectorAll('[data-t]')) e.textContent = T[e.dataset.t];
const $ = (id) => document.getElementById(id);
const touch = matchMedia('(pointer: coarse)').matches || params.has('touch');
const tierName = params.get('tier') === 'low' || (params.get('tier') !== 'high' && touch) ? 'low' : 'high';
document.body.classList.toggle('touch', touch);
document.body.classList.toggle('lite', tierName === 'low');
$('touch').hidden = !touch;

const [scene0, look, cars] = await Promise.all([
  fetch('data/probe-sunset.json').then((r) => r.json()),
  fetch('data/looks/sunset.json').then((r) => r.json()),
  fetch('data/cars.json').then((r) => r.json()).then((j) => j.cars),
]);
const tier = look.tiers[tierName];

// ----- the stage: renderer, light, sky, the world, mist, halos, reflection, tyre marks, smoke (view/look/stage.js, shared with the game)
const stage = createStage({ canvas: $('view'), look, scene0, tierName });
const { renderer, post, scene, camera, sun, sunDir, sky, world, field: f, mist, halos, env, skids, smoke, buildMs } = stage;   // (the probe loads one scene only, so these stay)

// ----- cars: the driver (white, kit) and the parked ones (merged)
const D = scene0.driver;
const makeLookCar = carMaker(stage);
// the cars: a model file (docs/CAR-MODELS.md, here the RX-7) in the paint of the scene; the code S15 when the file cannot be used
const carModel = (paint, kit) => makeLookCar(paint, { model: D.model, kit });
const [probe, ...parkedCars] = await Promise.all([carModel(D.paint, D.kit), ...scene0.parked.map((p) => carModel(p.paint, false))]);
const carGroup = new THREE.Group();
carGroup.add(probe.group);
scene.add(carGroup);
// CC BY needs the author named wherever the model is seen: the line from data/credits.json, small at the bottom of the page
if (probe.url) {
  const credits = await fetch('data/credits.json').then((r) => r.json()).catch(() => null);
  const lang = document.documentElement.lang === 'en' ? 'en' : 'de';
  const c = credits?.entries?.find((e) => e.kind === 'model' && [].concat(e.file || []).some((f) => probe.url.endsWith(f)));
  if (c) document.body.append(Object.assign(document.createElement('p'), { id: 'credit', textContent: c.use[lang] || c.use.en }));
}
const parkedSrc = scene0.parked.map((p, i) => ({ probe: parkedCars[i], matrix: new THREE.Matrix4().compose(new THREE.Vector3(X(p.x), 0, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, HEAD(p.h), 0)), new THREE.Vector3(1, 1, 1)), paint: new THREE.Color(p.paint) }));
const parked = mergeParked(parkedSrc);
// the painted car style (toon steps, contour, dust) only when the look asks for it; the owner wants the model's own PBR materials
const carPaint = look.car?.painted ? paintCar(carGroup, sun, look.car) : null;
if (look.car?.painted) paintCar(parked, sun, look.car);
for (const p of parkedSrc) p.probe.group.traverse((o) => o.geometry?.dispose?.());
scene.add(parked);
const pool = new WheelPool(8);
scene.add(pool.blobs);

// ----- the drive: the line bot on the road, with the Dart's numbers (the physics is the game's, unchanged)
const spec = cars[0];
const bot = lineBot(f.road, D.bot ?? { closed: false });
let cur = makeCar(D.x, D.z, D.h), prev = cur, score = newScore(), lastInp = { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, simTime = 0, spin = 0;

const view = params.get('view') ?? 'drive';
const rearWheels = (s) => { const ry = HEAD(s.h), c = Math.cos(ry), sn = Math.sin(ry); return [-1, 1].map((sx) => { const lx = sx * S15.wheelX, lz = -S15.wheelZ; return [X(s.x) + lx * c + lz * sn, s.z - lx * sn + lz * c]; }); };
// the camera of the mockup: the look's chase camera of the game (view/camera.js), on the road's drawn height
const chase = new LookChase(camera, look.camera, f.groundY);
const follow = (s, dt) => chase.update(s, 0, dt);
function simStep(i) {
  prev = cur;
  const inp = bot(i * DT, cur);
  lastInp = inp;
  cur = step(cur, inp, spec, 1);
  score = scoreStep(score, { slip: bodySlip(cur), speed: speedOf(cur), hit: 0, turned: turnedAngle(cur) }, DT);
  simTime += DT;
  spin += (bodyVelocity(cur).vf * DT) / S15.wheelY;
  // smoke and skid marks from the rear wheels, 40 times a second
  const sliding = (Math.abs(bodySlip(cur)) > 0.2 || inp.handbrake > 0) && speedOf(cur) > 3;
  if (i % 3 === 0) rearWheels(cur).forEach(([x, z], k) => {
    // the smoke drifts off to the left of the way the car is going (as in the mockup), not into the camera behind it
    const t = Math.atan2(cur.vx, cur.vz), push = look.smoke.drift ?? 0, lx = -Math.cos(t) * push, lz = Math.sin(t) * push;
    const out = look.smoke.offset ?? 0;   // the clouds start a little outside the wheel, on the side the tail swings to
    const gy = f.groundY(X(x), z);
    if (sliding) smoke.emit(x + X(-Math.cos(t)) * out, 0.35 + gy, z + Math.sin(t) * out, X(cur.vx * 0.06 + lx), cur.vz * 0.06 + lz, Math.min(1, Math.abs(bodySlip(cur)) + 0.2));
    skids.mark(k, x, z, 0, 0, sliding, gy);
  });
  smoke.update(DT);
  if (view === 'drive') follow(cur, DT);
}
const loop = new FixedLoop();
const preT = params.has('t') ? +params.get('t') : D.t;
for (let i = 0, n = Math.round(preT / DT); i < n; i++) loop.advance(DT, simStep);
const running = params.get('run') === '1';

// ----- HUD
const hud = new ProbeHud($('phud'), T, lang, { road: f.road.map(([x, z]) => [X(x), z]), plaza: scene0.plaza.pts.map(([x, z]) => [X(x), z]) });
addEventListener('keydown', (e) => { if (e.code === 'KeyH') hud.cycle(); if (e.code === 'KeyG') $('pdebug').hidden = !$('pdebug').hidden; });
$('pdebug').hidden = !params.has('debug');

const resize = () => stage.resize();
addEventListener('resize', resize); resize();

// ----- drawing
let last = performance.now(), avg = 16, shown = 0, frames = 0;
function draw(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const alpha = running ? loop.advance(dt, simStep) : 1;
  const s = { ...cur, x: prev.x + (cur.x - prev.x) * alpha, z: prev.z + (cur.z - prev.z) * alpha, h: prev.h + angDiff(prev.h, cur.h) * alpha };
  const { vf } = bodyVelocity(cur);
  // the car stands on the road's visible height and leans with its slope (only drawn)
  const gy = f.groundY(s.x, s.z), sh = Math.sin(s.h), ch = Math.cos(s.h);
  const grade = (f.groundY(s.x + sh * 1.3, s.z + ch * 1.3) - f.groundY(s.x - sh * 1.3, s.z - ch * 1.3)) / 2.6;
  carGroup.position.set(X(s.x), gy, s.z);
  if (carPaint) carPaint.uBase.value = gy;
  smoke.car.value.set(X(s.x), gy, s.z);
  carGroup.rotation.set(Math.max(-0.05, Math.min(0.05, -cur.ax * 0.004)) - Math.atan(grade), HEAD(s.h), Math.max(-0.08, Math.min(0.08, -cur.w * vf * 0.0035)), 'YXZ');
  probe.setWheels(cur.steer, spin);
  pool.begin();
  pool.blob(X(s.x), s.z, 1.15, 2.3, HEAD(s.h), gy);
  for (const p of scene0.parked) pool.blob(X(p.x), p.z, 1.15, 2.3, HEAD(p.h));
  pool.end();
  smoke.sync();
  if (camera.fov !== look.camera.fov) { camera.fov = look.camera.fov; camera.updateProjectionMatrix(); }
  if (view !== 'drive') {
    // ?view=overview, or ?view=cam&cam=x,y,z,lookX,lookY,lookZ (simulation axes) for any other place
    const o = view === 'cam' ? ((c) => ({ pos: c.slice(0, 3), look: c.slice(3, 6) }))((params.get('cam') ?? '0,80,80,0,0,0').split(',').map(Number)) : scene0.views.overview;
    camera.position.set(X(o.pos[0]), o.pos[1], o.pos[2]); camera.lookAt(X(o.look[0]), o.look[1], o.look[2]);
  }
  // the sun's shadow box follows the driver; the sky dome follows the camera
  const cx = view === 'overview' ? X(scene0.views.overview.look[0]) : X(s.x), cz = view === 'overview' ? scene0.views.overview.look[2] : s.z;   // (?view=cam keeps the driver's)
  const ty = view === 'overview' ? 0 : gy;
  stage.aimSun(cx, ty, cz);
  halos.resize(renderer.domElement.height, camera.fov);
  const kmh = speedOf(cur) * 3.6;
  const H = scene0.hud;
  hud.update({ lap: H.lap, laps: H.laps, ms: simTime * 1000, best: H.best, pos: 1, of: H.of },
    { kmh, forward: Math.sign(vf) || 1, slip: bodySlip(cur), x: X(s.x), z: s.z, h: s.h }, lastInp, score,
    scene0.parked.map((p) => [X(p.x), p.z]), running ? dt : 0.016);
  camera.updateMatrixWorld(); smoke.aim?.(camera);   // the smoke keeps the car in sight
  stage.render();
  avg += (Math.min(250, dt * 1000) - avg) * 0.05; frames++;
  if (!$('pdebug').hidden && now - shown > 400) {
    shown = now;
    const r = renderer.info.render;
    $('pdebug').textContent = `frame ${avg.toFixed(1)} ms, ${r.triangles} triangles, ${r.calls} draw calls, tier ${tierName} (${renderer.domElement.width}x${renderer.domElement.height})\nworld ${Math.round(world.triangles)} triangles, built in ${buildMs.toFixed(0)} ms; t ${simTime.toFixed(2)} s, ${kmh.toFixed(0)} km/h, slip ${(bodySlip(cur) * 57.3).toFixed(0)} deg`;
  }
  requestAnimationFrame(draw);
}
/** For the picture script: draws n frames back to back and waits for the GPU each time; returns ms per frame. */
function bench(n = 10) {
  const gl = renderer.getContext(), px = new Uint8Array(4);
  const a = performance.now();
  for (let i = 0; i < n; i++) { renderer.info.reset(); if (post) post.render(scene, camera); else renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  return (performance.now() - a) / n;
}
window.__probe = { renderer, scene, camera, model: probe.url ?? 'code S15', parts: { sky, world: world.group, mist, halos: halos.points, car: carGroup, parked, blobs: pool.blobs, skids: skids.mesh, smoke: smoke.mesh }, get frames() { return frames; }, bench, buildMs, worldTriangles: world.triangles, get t() { return simTime; }, get slip() { return bodySlip(cur) * 57.3; },
  /** where the sun is on the screen (-1..1 both ways), to frame pictures */
  /** where a point (simulation axes) is on the screen */
  screen(x, y, z) { const v = new THREE.Vector3(X(x), y, z).project(camera); return [+v.x.toFixed(2), +v.y.toFixed(2), v.z < 1]; },
  sunScreen() { const v = camera.position.clone().addScaledVector(sunDir, 1000).project(camera); return [+v.x.toFixed(2), +v.y.toFixed(2)]; } };
requestAnimationFrame(draw);
