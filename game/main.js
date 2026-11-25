// Drift, milestone 1: driving alone. Fixed-step simulation (sim/), drawn with three.js (view/).
// Address options: ?debug=1 numbers, ?tier=low|medium|high fixes the quality, ?touch=1 shows the touch buttons,
// ?demo=orbit lets a bot drive a drift circle, ?t=6 runs that many seconds of simulation before the first frame.
import * as THREE from '../vendor/three/three.module.js';
import { step, makeCar, bodySlip, bodyVelocity, speedOf, turnedAngle, DT } from './sim/physics.js';
import { prepareMap, surfaceAt, collide } from './sim/map.js';
import { newScore, scoreStep } from './sim/score.js';
import { FixedLoop } from './sim/loop.js';
import { orbitBot } from './sim/bot.js';
import { createView, TIERS } from './view/scene.js';
import { buildMap } from './view/mapview.js';
import { buildCar, WHEEL, BLOB } from './view/carmodel.js';
import { WheelPool } from './view/wheels.js';
import { Smoke, Skids } from './view/fx.js';
import { FollowCam } from './view/camera.js';
import { Input } from './view/input.js';
import { Hud } from './view/hud.js';
import { makeClay, makeGlow } from './core/materials.js';
import { angDiff } from './core/rng.js';
import { X, HEAD } from './view/space.js';
import { WorldClient } from './net/world.js';
import { Remotes, paintFor } from './view/remotes.js';

const params = new URLSearchParams(location.search);
const de = params.get('lang') ? params.get('lang') === 'de' : navigator.language?.startsWith('de');
const T = {
  en: { drift: 'DRIFT', score: 'Score', lost: 'Lost!', hand: 'HAND', brake: 'BRAKE', gas: 'GAS', rotate: 'Turn your phone to landscape', tip: 'Hold GAS, steer with the arrows, tap HAND to throw the tail out',
    online: 'driving here', you: 'You are', dropped: 'You were dropped. Tap to rejoin.', full: 'The world is full right now. Tap to try again.',
    hintKeys: 'Arrows or WASD to drive, Space = handbrake, Shift = brake, R = restart, F = fullscreen' },
  de: { drift: 'DRIFT', score: 'Punkte', lost: 'Verloren!', hand: 'HAND', brake: 'BREMSE', gas: 'GAS', rotate: 'Dreh das Handy ins Querformat', tip: 'GAS halten, mit den Pfeilen lenken, HAND wirft das Heck raus',
    online: 'fahren hier', you: 'Du bist', dropped: 'Du wurdest getrennt. Tippen zum Zurückkehren.', full: 'Die Welt ist gerade voll. Tippen zum Erneut-Versuchen.',
    hintKeys: 'Pfeile oder WASD fahren, Leertaste = Handbremse, Shift = Bremse, R = neu starten, F = Vollbild' },
}[de ? 'de' : 'en'];
document.documentElement.lang = de ? 'de' : 'en';
for (const e of document.querySelectorAll('[data-t]')) e.textContent = T[e.dataset.t];

const $ = (id) => document.getElementById(id);
const coarse = matchMedia('(pointer: coarse)').matches || params.has('touch');
if (coarse) $('hint').hidden = true;
if (params.has('debug')) $('hint').hidden = true;

const [cars, mapJson] = await Promise.all([
  fetch('data/cars.json').then((r) => r.json()).then((j) => j.cars),
  fetch('data/maps/01-car-park.json').then((r) => r.json()),
]);
const online = document.documentElement.dataset.mode === 'online';
const carIndex = params.has('car') ? Math.min(cars.length - 1, +params.get('car') || 0) : online ? Math.floor(Math.random() * cars.length) : 0;
const car = cars[carIndex];
const map = prepareMap(mapJson);

// ----- view
const forced = params.get('tier');
const view = createView($('view'), { tier: TIERS[forced] ? forced : coarse ? 'medium' : 'high', auto: !TIERS[forced], sky: map.sky });
const { renderer, scene, camera } = view;
const lite = coarse;
scene.add(buildMap(map, { lite }));
const parts = buildCar({ paint: new THREE.Color().setHSL(car.colour / 360, 0.62, 0.52).getHex(), lite, model: carIndex });
const carGroup = new THREE.Group();
const bodyMesh = new THREE.Mesh(parts.body, makeClay());
bodyMesh.castShadow = true;
carGroup.add(bodyMesh, new THREE.Mesh(parts.lights, makeGlow()));
const pool = new WheelPool(16);
const smoke = new Smoke(160);
const skids = new Skids(1500);
scene.add(carGroup, pool.mesh, pool.blobs, smoke.points, skids.mesh);
const cam = new FollowCam(camera, coarse ? { dist: 9.5, height: 4.6, look: 4.5 } : { dist: 11, height: 5.6, look: 5 });
const input = new Input($('touch'));
const hud = new Hud(T);
const remotes = online ? new Remotes({ scene, pool, smoke, skids, camera, tagsEl: $('tags'), lite }) : null;
let net = null, spawned = false;
if (online) {
  const droppedBtn = $('dropped');
  net = new WorldClient({
    url: params.get('ws') || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?car=${carIndex}`,
    onWelcome(me) {
      if (!spawned) { const g = map.grid[me.id % map.grid.length]; cur = prev = makeCar(g.x, g.z, g.h); score = newScore(); cam.snap(cur); spawned = true; }
      droppedBtn.hidden = true;
    },
    onRoster(roster) {
      $('online-n').textContent = roster.size;
      const me = net.me && roster.get(net.me.id);
      if (me) {
        $('me').textContent = `${T.you} ${me.name}`;
        if (bodyMesh.userData.hue !== me.hue) { bodyMesh.userData.hue = me.hue; bodyMesh.geometry = paintFor(me.hue, lite, carIndex).body; }
      }
    },
    onFix(f) { cur = prev = { ...cur, x: f.x, z: f.z, h: f.h, vx: 0, vz: 0, w: 0 }; },
    onBye(reason) { droppedBtn.textContent = reason === 5 ? T.full : T.dropped; droppedBtn.hidden = false; },
    onState(st) { if (st === 'closed') { $('online-n').textContent = 0; $('me').textContent = ''; spawned = false; } },
  });
  droppedBtn.addEventListener('click', () => { droppedBtn.hidden = true; net.connect(); });
  net.connect();
  window.__net = net;
}

// ----- state
let cur, prev, score, spin = 0, simSteps = 0, paused = false;
const loop = new FixedLoop();
function reset() {
  const s = map.lobbySpawn;
  cur = prev = makeCar(s.x, s.z, s.h);
  score = newScore();
  spin = 0;
  skids.clear();
  cam.snap(cur);
}
reset();
const demo = params.get('demo') === 'orbit';
if (demo) { cur = prev = makeCar(66, 48, Math.PI / 2); cam.snap(cur); }

function simStep(i) {
  prev = cur;
  const inp = demo ? orbitBot(i * DT, cur, { start: 1.5 }) : input.read();
  const mu = surfaceAt(map, cur.x, cur.z).mu;
  cur = collide(map, step(cur, inp, car, mu));
  score = scoreStep(score, { slip: bodySlip(cur), speed: speedOf(cur), hit: cur.hit, turned: turnedAngle(cur) }, DT);
  simSteps++;
}
// optional: simulate N seconds before the first frame (for pictures taken after a fixed time)
for (let i = 0, n = Math.round((+params.get('t') || 0) / DT); i < n; i++) loop.advance(DT, simStep);

input.onkey.KeyR = reset;
input.onkey.KeyP = () => (paused = !paused);
input.onkey.KeyF = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
input.onkey.KeyQ = () => { const o = ['low', 'medium', 'high']; view.governor.set(o[(o.indexOf(view.tier) + 1) % 3], false); };
input.onkey.KeyG = () => ($('debug').hidden = !$('debug').hidden);
document.addEventListener('visibilitychange', () => { if (document.hidden) input.clear(); });
const showTouch = () => {
  $('touch').hidden = false;
  if (document.fullscreenEnabled) $('fs').hidden = false;
};
$('fs').addEventListener('click', async () => {
  if (document.fullscreenElement) return document.exitFullscreen();
  try { await document.documentElement.requestFullscreen(); await screen.orientation?.lock?.('landscape'); } catch {}
});
// a first-time tip over the buttons until the first gas
const tip = $('tip');
if (coarse) { tip.hidden = false; const iv = setInterval(() => { if (input.has('gas') || cur.vx || cur.vz) { tip.hidden = true; clearInterval(iv); } }, 200); }
if (coarse) showTouch();
addEventListener('touchstart', showTouch, { once: true, passive: true });
const checkRotate = () => ($('rotate').hidden = !(coarse && innerHeight > innerWidth));
addEventListener('resize', checkRotate); checkRotate();

// ----- drawing
const m4 = new THREE.Matrix4();
const dbg = $('debug');
dbg.hidden = !params.has('debug');
let last = performance.now(), avg = 16, jsAvg = 0, fpsFrames = 0, shown = 0;
const drawn = { x: 0, z: 0, h: 0, vx: 0, vz: 0, w: 0 };
const info = { frames: 0 };

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t0 = performance.now();
  let alpha = 0;
  if (!paused) alpha = loop.advance(dt, simStep);
  else alpha = loop.acc / loop.dt;
  // interpolate between the last two simulation states
  drawn.x = prev.x + (cur.x - prev.x) * alpha; drawn.z = prev.z + (cur.z - prev.z) * alpha;
  drawn.h = prev.h + angDiff(prev.h, cur.h) * alpha;
  drawn.vx = cur.vx; drawn.vz = cur.vz; drawn.w = cur.w;
  const { vf } = bodyVelocity(cur);
  const kmh = speedOf(cur) * 3.6;

  // body pose: yaw, a little roll and pitch from the forces
  const roll = Math.max(-0.08, Math.min(0.08, -cur.w * vf * 0.0035));
  const pitch = Math.max(-0.05, Math.min(0.05, -cur.ax * 0.004));
  carGroup.position.set(X(drawn.x), 0, drawn.z);
  carGroup.rotation.set(pitch, HEAD(drawn.h), roll, 'YXZ');
  carGroup.updateMatrix();
  spin += (vf * dt) / WHEEL.r;
  pool.begin();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pool.wheel(carGroup.matrix, sx * WHEEL.x, sz * WHEEL.z, sz > 0 ? -cur.steer : 0, spin);
  pool.blob(X(drawn.x), drawn.z, BLOB[carIndex][0], BLOB[carIndex][1], HEAD(drawn.h));
  if (net) {
    const moving = speedOf(cur) > 0.3 || input.read().throttle > 0;
    net.sendPose({ x: cur.x, z: cur.z, h: cur.h, vf, steer: cur.steer }, bodySlip(cur), (input.has('hand') ? 1 : 0) | (cur.slide > 0.3 ? 2 : 0) | (cur.hit > 0 ? 4 : 0), moving, now);
    remotes.update(net.sample(now), net.roster, dt);
  }
  pool.end();

  // smoke and skid marks from the rear wheels
  const sliding = (cur.slide > 0.25 || (input.has('hand') && speedOf(cur) > 4)) && speedOf(cur) > 3 && !paused;
  for (let i = 0; i < 2; i++) {
    const sx = i ? 1 : -1;
    const wp = new THREE.Vector3(sx * WHEEL.x, 0, -WHEEL.z).applyMatrix4(carGroup.matrix);
    if (sliding && cur.slide + (input.has('hand') ? 0.4 : 0) > 0.25) smoke.emit(wp.x, 0.2, wp.z, X(cur.vx) * 0.2, cur.vz * 0.2, Math.min(1, cur.slide + 0.2));
    skids.mark(i, wp.x, wp.z, 0, 0, sliding);
  }
  smoke.update(paused ? 0 : dt);
  smoke.resize(renderer.domElement.height * 1, camera.fov);

  cam.update(drawn, car.top, dt);
  if (TIERS[view.tier].shadows) view.followSun(drawn.x, drawn.z);
  hud.update(kmh, score, dt);
  const t1 = performance.now();
  renderer.render(scene, camera);
  const t2 = performance.now();

  // frame statistics and the quality governor
  avg += (Math.min(250, dt * 1000) - avg) * 0.05;
  jsAvg += (t2 - t0 - jsAvg) * 0.05;
  view.governor.sample(dt * 1000);
  info.frames++;
  if (!dbg.hidden && now - shown > 400) {
    shown = now;
    const r = renderer.info.render;
    dbg.textContent = `frame ${avg.toFixed(1)} ms (${(1000 / avg).toFixed(0)} fps), js+submit ${jsAvg.toFixed(2)} ms\n${r.triangles} triangles, ${r.calls} draw calls, tier ${view.tier} (${renderer.domElement.width}x${renderer.domElement.height})\nsim steps ${simSteps}, speed ${kmh.toFixed(0)} km/h, slip ${(bodySlip(cur) * 57.3).toFixed(0)} deg`;
  }
  requestAnimationFrame(frame);
}
window.__drift = { get state() { return cur; }, get score() { return score; }, view, renderer, info, car, map, reset, input };
requestAnimationFrame(frame);
