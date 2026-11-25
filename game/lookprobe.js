// The look probe: a meeting place on a mountain pass in the soft, painted sunset look of the owner's mockup, three parked cars and one drifting on the
// road (driven by the line bot), with the mockup's HUD. Only for pictures and for the owner's decision; the game, its maps,
// physics, server and network code are not touched. World and look are data: data/probe-sunset.json and data/looks/sunset.json.
import * as THREE from '../vendor/three/three.module.js';
import { step, makeCar, bodySlip, bodyVelocity, speedOf, turnedAngle, DT } from './sim/physics.js';
import { newScore, scoreStep } from './sim/score.js';
import { lineBot } from './sim/linebot.js';
import { FixedLoop } from './sim/loop.js';
import { buildS15, S15 } from './view/s15.js';
import { loadCarModel } from './view/carmodel.js';
import { carMaterials } from './view/carmaterials.js';
import { WheelPool } from './view/wheels.js';
import { Skids } from './view/fx.js';
import { Halos } from './core/materials.js';
import { angDiff } from './core/rng.js';
import { X, HEAD } from './view/space.js';
import { buildWorld } from './view/look/world.js';
import { makeSky, makeMist, makeSkyEnvironment, sunDirection } from './view/look/sky.js';
import { Puffs } from './view/look/puffs.js';
import { Billows } from './view/look/billows.js';
import { mergeParked } from './view/look/parked.js';
import { Post } from './view/look/post.js';
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

// ----- renderer, light, sky
const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
// the mood: ACES tone mapping on both tiers; the high tier adds bloom and a colour grade (view/look/post.js), the vignette is CSS
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = look.grade.exposure;
renderer.info.autoReset = false;   // one frame is several renders (scene, bloom passes): count them together
const post = tier.post ? new Post(renderer, look.grade) : null;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(look.fog.colour, look.fog.near, look.fog.far);
scene.background = new THREE.Color(look.fog.colour);
const sunDir = sunDirection(look);
const hemi = new THREE.HemisphereLight(look.fill.sky, look.fill.ground, look.fill.intensity);
const sun = new THREE.DirectionalLight(look.sun.colour, look.sun.intensity);
scene.add(hemi, sun, sun.target);
if (tier.shadows) {
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;   // soft shadows
  sun.castShadow = true; sun.shadow.mapSize.set(tier.shadows, tier.shadows);
  const c = sun.shadow.camera; c.left = -36; c.right = 36; c.top = 36; c.bottom = -36; c.near = 1; c.far = 260;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; sun.shadow.radius = 6; sun.shadow.blurSamples = 10;
}
const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 2600);
const sky = makeSky(look, 2200);
scene.add(sky);

// ----- the world
const t0 = performance.now();
const world = buildWorld(scene0, look, tierName);
scene.add(world.group);
const f = world.field;
// low mist over the valley floor and the lake (places from the scene; the phone tier takes the first few)
const mistAt = scene0.mist.slice(0, tier.mist).map(([x, z, w, d]) => [x, z, w, d, f.groundY(x, z) + look.mist.y]);   // the mist lies relative to the road's height nearby
const mist = makeMist(look, mistAt);
scene.add(mist);
const halos = new Halos(16);
for (const [x, y, z] of world.lampHeads) halos.add(x, y, z, new THREE.Color(look.lamp.light).multiplyScalar(0.55), 2.6);
scene.add(halos.points);
const buildMs = performance.now() - t0;

// ----- cars: the driver (white, kit) and the parked ones (merged)
const env = makeSkyEnvironment(renderer, look, tier.env);
world.road.material.envMap = env;   // the road shines in the low sun
const carTier = tierName === 'high' ? 'high' : 'low';
const D = scene0.driver;
// the cars: a model file (docs/CAR-MODELS.md, here the RX-7) in the paint of the scene; the code S15 when the file cannot be used
const carModel = async (paint, kit) => {
  const materials = carMaterials({ tier: carTier, paint: new THREE.Color(paint).getHex(), env });
  if (look.car?.tail) materials.light_rear.color.set(look.car.tail).multiplyScalar(look.car.tailGlow ?? 1);   // deep red tail lights (very bright red turns orange under the tone mapping)
  const m = D.model ? await loadCarModel(D.model, { tier: carTier, materials }) : null;
  return m ? { ...m, materials } : buildS15({ paint: new THREE.Color(paint).getHex(), kit, tier: carTier, env });
};
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
const carPaint = paintCar(carGroup, sun, look.car);   // the painted look (steps, soft contour, dust)
paintCar(parked, sun, look.car);
for (const p of parkedSrc) p.probe.group.traverse((o) => o.geometry?.dispose?.());
scene.add(parked);
const pool = new WheelPool(8);
scene.add(pool.blobs);
const skids = new Skids(1500);
skids.mesh.material.color.set(look.skid.colour); skids.mesh.material.opacity = look.skid.opacity;
// smoke: painted billows (camera-facing cloud sprites) or faceted puffs, as the look says
const smoke = look.smoke.style === 'billows' ? new Billows(look, tier.billows ?? tier.smoke) : new Puffs(look, tier.smoke, tier.smokeDetail);
scene.add(skids.mesh, smoke.mesh);

// ----- the drive: the line bot on the road, with the Dart's numbers (the physics is the game's, unchanged)
const spec = cars[0];
const bot = lineBot(f.road, D.bot ?? { closed: false });
let cur = makeCar(D.x, D.z, D.h), prev = cur, score = newScore(), lastInp = { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, simTime = 0, spin = 0;

const view = params.get('view') ?? 'drive';
const rearWheels = (s) => { const ry = HEAD(s.h), c = Math.cos(ry), sn = Math.sin(ry); return [-1, 1].map((sx) => { const lx = sx * S15.wheelX, lz = -S15.wheelZ; return [X(s.x) + lx * c + lz * sn, s.z - lx * sn + lz * c]; }); };
// the camera of the mockup: low (just over the roof), close behind the car and a little to its right, looking along where the car
// is going (between its nose and its travel) and so down the road; it follows softly
const C = look.camera, camAt = { yaw: D.h, ready: false };
function follow(s, dt) {
  const travel = speedOf(s) > 4 ? Math.atan2(s.vx, s.vz) : s.h;
  const aim = s.h + angDiff(s.h, travel) * C.travel;
  if (!camAt.ready) { camAt.yaw = aim; camAt.ready = true; }
  camAt.yaw += angDiff(camAt.yaw, aim) * (1 - Math.exp(-4 * dt));
  const fx = Math.sin(camAt.yaw), fz = Math.cos(camAt.yaw), rx = fz, rz = -fx;   // forward and right (simulation axes)
  // heights follow the road's visible height profile (the physics underneath stays flat)
  const cx = s.x - fx * C.dist + rx * C.side, cz = s.z - fz * C.dist + rz * C.side, lx = s.x + fx * C.look, lz = s.z + fz * C.look;
  camera.position.set(X(cx), C.height + Math.max(f.groundY(cx, cz), f.groundY(s.x, s.z)), cz);
  camera.lookAt(X(lx), C.lookY + f.groundY(lx, lz), lz);
}
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

function resize() {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tier.dpr));
  renderer.setSize(Math.max(2, Math.round(innerWidth * tier.scale)), Math.max(2, Math.round(innerHeight * tier.scale)), false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  halos.resize(renderer.domElement.height, camera.fov);
  post?.setSize(renderer.domElement.width, renderer.domElement.height);
}
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
  carPaint.uBase.value = gy;
  smoke.car.value.set(X(s.x), gy, s.z);
  carGroup.rotation.set(Math.max(-0.05, Math.min(0.05, -cur.ax * 0.004)) - Math.atan(grade), HEAD(s.h), Math.max(-0.08, Math.min(0.08, -cur.w * vf * 0.0035)), 'YXZ');
  probe.setWheels(cur.steer, spin);
  pool.begin();
  pool.blob(X(s.x), s.z, 1.15, 2.3, HEAD(s.h), gy);
  for (const p of scene0.parked) pool.blob(X(p.x), p.z, 1.15, 2.3, HEAD(p.h));
  pool.end();
  smoke.sync();
  if (camera.fov !== C.fov) { camera.fov = C.fov; camera.updateProjectionMatrix(); }
  if (view !== 'drive') {
    // ?view=overview, or ?view=cam&cam=x,y,z,lookX,lookY,lookZ (simulation axes) for any other place
    const o = view === 'cam' ? ((c) => ({ pos: c.slice(0, 3), look: c.slice(3, 6) }))((params.get('cam') ?? '0,80,80,0,0,0').split(',').map(Number)) : scene0.views.overview;
    camera.position.set(X(o.pos[0]), o.pos[1], o.pos[2]); camera.lookAt(X(o.look[0]), o.look[1], o.look[2]);
  }
  // the sun's shadow box follows the driver; the sky dome follows the camera
  const cx = view === 'overview' ? X(scene0.views.overview.look[0]) : X(s.x), cz = view === 'overview' ? scene0.views.overview.look[2] : s.z;   // (?view=cam keeps the driver's)
  const ty = view === 'overview' ? 0 : gy;
  sun.target.position.set(cx, ty, cz); sun.position.set(cx + sunDir.x * 120, ty + sunDir.y * 120 + 30, cz + sunDir.z * 120);
  halos.resize(renderer.domElement.height, camera.fov);
  const kmh = speedOf(cur) * 3.6;
  const H = scene0.hud;
  hud.update({ lap: H.lap, laps: H.laps, ms: simTime * 1000, best: H.best, pos: 1, of: H.of },
    { kmh, forward: Math.sign(vf) || 1, slip: bodySlip(cur), x: X(s.x), z: s.z, h: s.h }, lastInp, score,
    scene0.parked.map((p) => [X(p.x), p.z]), running ? dt : 0.016);
  renderer.info.reset();
  if (post) post.render(scene, camera); else renderer.render(scene, camera);
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
