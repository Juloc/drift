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
    online: 'driving here', you: 'You are', race: 'Start a race', invite: '{by} starts a race on {map} ({laps} laps).', join: 'Join', no: 'No', waiting: 'Invitation sent: the race starts in a few seconds.', joined: 'You are in. Get ready.', busy: 'A race is on right now.', pause: 'The next race can start in {s} s.', getReady: 'Get ready', waitOthers: 'Waiting for the others', go: 'GO!', lap: 'Lap', finished: 'Finished', result: 'Result', dnf: 'DNF', newBest: 'new best', leave: 'Leave', backLobby: 'Back to the lobby', dropped: 'You were dropped. Tap to rejoin.', full: 'The world is full right now. Tap to try again.',
    hintKeys: 'Arrows or WASD to drive, Space = handbrake, Shift = brake, R = restart, F = fullscreen' },
  de: { drift: 'DRIFT', score: 'Punkte', lost: 'Verloren!', hand: 'HAND', brake: 'BREMSE', gas: 'GAS', rotate: 'Dreh das Handy ins Querformat', tip: 'GAS halten, mit den Pfeilen lenken, HAND wirft das Heck raus',
    online: 'fahren hier', you: 'Du bist', race: 'Rennen starten', invite: '{by} startet ein Rennen auf {map} ({laps} Runden).', join: 'Mitfahren', no: 'Nein', waiting: 'Einladung verschickt: das Rennen startet in ein paar Sekunden.', joined: 'Du bist dabei. Mach dich bereit.', busy: 'Gerade läuft ein Rennen.', pause: 'Das nächste Rennen geht in {s} s.', getReady: 'Mach dich bereit', waitOthers: 'Warte auf die anderen', go: 'LOS!', lap: 'Runde', finished: 'Im Ziel', result: 'Ergebnis', dnf: 'Ausgeschieden', newBest: 'neue Bestzeit', leave: 'Verlassen', backLobby: 'Zurück zur Lobby', dropped: 'Du wurdest getrennt. Tippen zum Zurückkehren.', full: 'Die Welt ist gerade voll. Tippen zum Erneut-Versuchen.',
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
let map = prepareMap(mapJson);
let mapList = null, mapGroup = null, mapId = 0;
const mapCache = new Map([[0, mapJson]]);

// ----- view
const forced = params.get('tier');
const view = createView($('view'), { tier: TIERS[forced] ? forced : coarse ? 'medium' : 'high', auto: !TIERS[forced], sky: map.sky });
const { renderer, scene, camera } = view;
const lite = coarse;
mapGroup = buildMap(map, { lite });
scene.add(mapGroup);
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
// the state, declared before anything can call back (a socket may welcome us while the module still waits for a file)
let cur, prev, score, spin = 0, simSteps = 0, paused = false;
let net = null, spawned = false, locked = false;
const raceMode = online && document.documentElement.dataset.race === '1';   // the signed-in app: races (the public demo has none)
const lobbyUrl = params.get('ws') || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?car=${carIndex}`;
const fmt = (ms) => { const t = Math.max(0, Math.round(ms)); return `${Math.floor(t / 60000)}:${String(Math.floor(t / 1000) % 60).padStart(2, '0')}.${String(Math.floor((t % 1000) / 10)).padStart(2, '0')}`; };
const show = (id, on) => { const el = $(id); if (el) el.hidden = !on; };
let noteTimer = 0;
const note = (text) => { const el = $('note'); if (!el) return; el.textContent = text; el.hidden = false; clearTimeout(noteTimer); noteTimer = setTimeout(() => (el.hidden = true), 3500); };

/** Makes the map with this id the one that is drawn and driven on (loads its file the first time). Races are on any of the maps; the lobby is map 0. */
async function ensureMap(id) {
  if (id === mapId && mapGroup) return;
  mapList ??= (await fetch('data/maps.json').then((r) => r.json())).maps;
  if (!mapCache.has(id)) mapCache.set(id, await fetch('data/maps/' + mapList.find((m) => m.id === id).file).then((r) => r.json()));
  const json = mapCache.get(id);
  scene.remove(mapGroup);
  mapGroup.traverse((o) => { o.geometry?.dispose(); });
  map = prepareMap(json); mapId = id;
  mapGroup = buildMap(map, { lite });
  scene.add(mapGroup);
  view.look(map);
  skids.clear();
}

function openNet(url, inRace) {
  const droppedBtn = $('dropped');
  const n = new WorldClient({
    url,
    onWelcome(me) {
      if (!inRace && !spawned) {
        const ls = mapJson.lobbySpawn;   // the lobby is the car park, whichever map is drawn at this moment
        const g = raceMode ? { x: ls.x + (me.id % 8) * 6 - 20, z: ls.z, h: ls.h } : map.grid[me.id % map.grid.length];
        cur = prev = makeCar(g.x, g.z, g.h); score = newScore(); cam.snap(cur); spawned = true;
      }
      droppedBtn.hidden = true;
    },
    onRoster(roster) {
      $('online-n').textContent = roster.size;
      const me = n.me && roster.get(n.me.id);
      if (me) {
        $('me').textContent = `${T.you} ${me.name}`;
        if (bodyMesh.userData.hue !== me.hue) { bodyMesh.userData.hue = me.hue; bodyMesh.geometry = paintFor(me.hue, lite, carIndex).body; }
      }
    },
    onFix(f) { cur = prev = { ...cur, x: f.x, z: f.z, h: f.h, vx: 0, vz: 0, w: 0 }; },
    onBye(reason) { if (n === net && !racing) { droppedBtn.textContent = reason === 5 ? T.full : T.dropped; droppedBtn.hidden = false; } },
    onState(st) { if (st === 'closed' && n === net && !racing) { $('online-n').textContent = 0; $('me').textContent = ''; spawned = false; } },
    onJson: (j) => (inRace ? raceMessage(j) : lobbyMessage(j)),
  });
  n.connect();
  return n;
}

// ----- races (signed-in app only): invitation, grid, countdown, laps, result, back to the lobby
let racing = false;
function lobbyMessage(j) {
  if (j.t === 'race.invite') {
    $('invite-text').textContent = T.invite.replace('{by}', j.by).replace('{laps}', j.laps).replace('{map}', j.mapName ?? '');
    show('invite', true);
    clearTimeout(lobbyMessage.timer); lobbyMessage.timer = setTimeout(() => show('invite', false), j.ms);
  } else if (j.t === 'race.wait') note(T.waiting);
  else if (j.t === 'race.joined') { show('invite', false); note(T.joined); }
  else if (j.t === 'race.busy') note(j.wait ? T.pause.replace('{s}', j.wait) : T.busy);
  else if (j.t === 'race.go') { show('invite', false); startRace(); }
}
function startRace() {
  racing = true; locked = true;
  net.close();
  remotes.clear();
  show('racebar', false);
  $('count').textContent = T.getReady; show('count', true); show('result', false);
  net = openNet(params.get('rws') || lobbyUrl.replace('/play/ws', '/play/race/ws'), true);
  window.__net = net;
}
function raceMessage(j) {
  if (j.t === 'grid') {
    locked = true;
    ensureMap(j.map ?? 0).then(() => { cur = prev = makeCar(j.x, j.z, j.h); score = newScore(); cam.snap(cur); skids.clear(); });
    $('rh-pos').textContent = `P${j.slot + 1}/${j.n}`; $('rh-lap').textContent = `${T.lap} 1/${j.laps}`; $('rh-time').textContent = fmt(0); $('rh-drift').textContent = '';
    show('racehud', true); $('count').textContent = T.waitOthers;
  } else if (j.t === 'count') $('count').textContent = j.n;
  else if (j.t === 'go') { locked = false; $('count').textContent = T.go; setTimeout(() => show('count', false), 900); }
  else if (j.t === 'prog') {
    $('rh-pos').textContent = `P${j.pos}/${j.of}`; $('rh-lap').textContent = `${T.lap} ${j.lap}/${j.laps}`; $('rh-time').textContent = fmt(j.ms);
    $('rh-drift').textContent = j.drift ? `${j.drift} x${j.mult}` : '';
  } else if (j.t === 'lap') note(`${T.lap} ${j.lap}/${j.of}: ${fmt(j.ms)}`);
  else if (j.t === 'finish') note(`${T.finished} P${j.pos}: ${fmt(j.ms)}`);
  else if (j.t === 'result') showResult(j);
  else if (j.t === 'back') endRace();
}
function showResult(j) {
  $('res-title').textContent = T.result;
  const body = $('res-table').querySelector('tbody');
  body.replaceChildren();
  for (const r of j.rows) {
    const tr = document.createElement('tr');
    const cells = [r.dnf ? '-' : r.pos, r.name, r.ms == null ? T.dnf : fmt(r.ms), r.bestLap == null ? '' : fmt(r.bestLap), r.drift, r.points];
    for (const c of cells) { const td = document.createElement('td'); td.textContent = c; tr.append(td); }
    if (r.newRace || r.newLap) { const td = document.createElement('td'); td.textContent = T.newBest; tr.append(td); }
    body.append(tr);
  }
  show('count', false); show('racehud', false); show('result', true);
}
function endRace() {
  if (!racing) return;
  racing = false; locked = false;
  net.close(); remotes.clear();
  show('result', false); show('racehud', false); show('count', false);
  spawned = false;
  ensureMap(0).then(() => { reset(); });
  net = openNet(lobbyUrl, false); window.__net = net;
  show('racebar', true);
}

if (online) {
  net = openNet(lobbyUrl, false);
  window.__net = net;
  $('dropped').addEventListener('click', () => { $('dropped').hidden = true; net.connect(); });
  if (raceMode) {
    show('racebar', true);
    mapList ??= (await fetch('data/maps.json').then((r) => r.json())).maps;
    const sel = $('mapSel');
    for (const m of mapList) sel.append(Object.assign(document.createElement('option'), { value: m.id, textContent: m.name }));
    $('raceBtn').addEventListener('click', () => { const m = mapList.find((x) => x.id === +sel.value); net.sendJson({ t: 'race.start', map: m.id, laps: m.laps }); });
    $('invite-yes').addEventListener('click', () => { net.sendJson({ t: 'race.join' }); show('invite', false); });
    $('invite-no').addEventListener('click', () => { net.sendJson({ t: 'race.decline' }); show('invite', false); });
    $('rh-leave').addEventListener('click', () => { net.sendJson({ t: 'leave' }); endRace(); });
    $('res-back').addEventListener('click', endRace);
  }
}

// ----- state
const loop = new FixedLoop();
function reset() {
  const s = map.lobbySpawn ?? map.grid[0];
  cur = prev = makeCar(s.x, s.z, s.h);
  score = newScore();
  spin = 0;
  skids.clear();
  cam.snap(cur);
}
reset();
if (params.has('map')) { await ensureMap(+params.get('map') || 0); reset(); }   // ?map=N: start on that map (for looking at it)
const demo = params.get('demo') === 'orbit';
if (demo) { const o = mapId === 0 ? { x: 66, z: 48, h: Math.PI / 2 } : map.grid[0]; cur = prev = makeCar(o.x, o.z, o.h); cam.snap(cur); }

function simStep(i) {
  prev = cur;
  const inp = locked ? { steer: 0, throttle: 0, brake: 0, handbrake: 1 } : demo ? orbitBot(i * DT, cur, { start: 1.5 }) : input.read();
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
window.__drift = { get state() { return cur; }, get score() { return score; }, view, renderer, info, car, get map() { return map; }, reset, input };
requestAnimationFrame(frame);
