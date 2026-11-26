// The test page of the new driving model (sim/sim2.js): the owner drives the AE86 alone on the practice ground's flat pad and tells us whether it feels right. No network, no score,
// no modes. The model is not touched here: this page only feeds it the keys, draws the car from its numbers (body height, pitch and roll on the body's own node so the wheels
// stay on the pad; each wheel spins by `wheel[i]`, the front ones are turned by `steer`), makes marks and smoke per wheel, shows the read-outs and feeds the engine sound with
// the model's own revs. Keys as in the game (arrows or WASD, Space = handbrake) and: Shift = clutch, Q / E = gear down / up, M = manual gearbox, 1 / 2 / 3 = Arcade / Sport / Sim,
// T = stock car / drift set-up, R = back to the start. Touch: the buttons of the page. Defaults: drift set-up, Arcade, automatic gearbox.
import * as THREE from '../vendor/three/three.module.js';
import { createStage, loadLook } from './view/look/stage.js';
import { sceneFromMap } from './view/look/mapscene.js';
import { Fleet } from './view/look/fleet.js';
import { lookChoice, lookFile } from './view/look/variant.js';
import { CameraRig, ActionCam } from './view/camera.js';
import { SoundSystem } from './view/sound.js';
import { buildPlace, ConeField } from './view/academy.js';
import { buildPlaceLook } from './view/look/place.js';
import { newCones, coneStep } from './sim/cones.js';
import { gripPerWheel } from './sim/exercise.js';
import { FixedLoop } from './sim/loop.js';
import { prepareMap } from './sim/map.js';
import { collideBody } from './sim/collision.js';
import { step, makeCar, AE86, AE86_DRIFT, ASSISTS, FLAT, DT, G, squealOf, smokeOf } from './sim/sim2.js';
import { X, HEAD } from './view/space.js';

const $ = (id) => document.getElementById(id);
// the page's texts, German and English (the language: ?lang=, else the browser's)
const LANG = (new URLSearchParams(location.search).get('lang') ?? navigator.language ?? '').startsWith('de') ? 'de' : 'en';
const TEXT = {
  en: { title: 'Drift: new driving model (test page)', action: 'Action', calm: 'Calm', wide: 'Wide', camB: 'Camera (Action, Calm, Wide)', hint: 'Arrows/WASD drive, Space handbrake, Shift clutch, Q/E gear, M manual, 1/2/3 Arcade/Sport/Sim, T stock/drift set-up, C camera, N wet pad, R back to the start. Burnout: hold the brake and full throttle',
    mode: 'mode', car: 'car', gearbox: 'gearbox', auto: 'automatic', manual: 'manual (Q/E, Shift)', bodyAngle: 'body angle', rpm: 'rpm', yaw: 'yaw', arcade: 'Arcade', sport: 'Sport', sim: 'Sim',
    gas: 'GAS', brake: 'BRAKE', clutch: 'CLUTCH', hand: 'HAND', gcircle: 'g (grip circle)', wheels: 'per wheel: slip (red over its peak) and load', data: 'Data', sq: 'squeal', sm: 'smoke', stock: 'AE86 (stock)', drift: 'AE86 (drift set-up)',
    exercise: 'Exercise', wet: 'Wet (N)', conesDown: 'cones down', ex_circle: 'Circle', ex_eight: 'Eight', ex_slalom: 'Slalom', ex_hairpin: 'Hairpin', ex_sBends: 'S-bends', ex_wallBend: 'Wall bend', ex_wetPad: 'Wet pad', ex_straight: 'Straight', ex_free: 'Free pad',
    steerL: 'Steer left', steerR: 'Steer right', gearDown: 'Gear down', gearUp: 'Gear up', manualBox: 'Manual gearbox', carToggle: 'Stock car or drift set-up', resetB: 'Reset' },
  de: { title: 'Drift: neues Fahrmodell (Testseite)', action: 'Action', calm: 'Ruhig', wide: 'Weit', camB: 'Kamera (Action, Ruhig, Weit)', hint: 'Pfeile/WASD fahren, Leertaste Handbremse, Shift Kupplung, Q/E Gang, M manuell, 1/2/3 Arcade/Sport/Sim, T Serie/Drift-Aufbau, C Kamera, N nasse Fläche, R zurück zum Start. Burnout: Bremse halten und Vollgas',
    mode: 'Modus', car: 'Auto', gearbox: 'Getriebe', auto: 'automatisch', manual: 'manuell (Q/E, Shift)', bodyAngle: 'Driftwinkel', rpm: 'Drehzahl', yaw: 'Gierrate', arcade: 'Arcade', sport: 'Sport', sim: 'Sim',
    gas: 'GAS', brake: 'BREMSE', clutch: 'KUPPLUNG', hand: 'HAND', gcircle: 'g (Kammscher Kreis)', wheels: 'je Rad: Schlupf (rot über dem Maximum) und Last', data: 'Daten', sq: 'Quietsch.', sm: 'Rauch', stock: 'AE86 (Serie)', drift: 'AE86 (Drift-Aufbau)',
    exercise: 'Übung', wet: 'Nass (N)', conesDown: 'Kegel gefallen', ex_circle: 'Kreis', ex_eight: 'Acht', ex_slalom: 'Slalom', ex_hairpin: 'Kehre', ex_sBends: 'S-Kurven', ex_wallBend: 'Wandkurve', ex_wetPad: 'Nasse Fläche', ex_straight: 'Gerade', ex_free: 'Freie Fläche',
    steerL: 'Links lenken', steerR: 'Rechts lenken', gearDown: 'Runterschalten', gearUp: 'Hochschalten', manualBox: 'Schaltgetriebe', carToggle: 'Serienauto oder Drift-Aufbau', resetB: 'Neu starten' },
};
const t = (k) => TEXT[LANG][k] ?? TEXT.en[k] ?? k;
document.documentElement.lang = LANG; document.title = t('title');
for (const e of document.querySelectorAll('[data-t]')) e.textContent = t(e.dataset.t);
for (const e of document.querySelectorAll('[data-ta]')) e.setAttribute('aria-label', t(e.dataset.ta));
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const AUTO = +(params.get('auto') ?? 0) * Math.PI / 180;   // measuring tool: a driver that holds a drift of that body angle (degrees) to the right
const CRUISE = +(params.get('cruise') ?? 0), RAW = params.has('raw');   // cruise: hold that speed (m/s) for the measuring tool; raw: draw the last step's state unblended (to show the difference)
const coarse = matchMedia('(pointer: coarse)').matches || params.has('touch');
document.body.classList.toggle('touch', coarse);

// ---- the pad: the practice ground's map (its walls), its look and scene, as in the game
const [cars, mapList] = await Promise.all([fetch('data/cars.json').then((r) => r.json()).then((j) => j.cars), fetch('data/maps.json').then((r) => r.json()).then((j) => j.maps)]);
const [json, theme] = await Promise.all([fetch('data/maps/09-academy.json').then((r) => r.json()), fetch('data/scenes/academy.json').then((r) => r.json())]);   // the drift academy (tools/make-academy.mjs)
const look = await loadLook(theme.look === 'touge-dusk' ? lookFile(theme.look, lookChoice(params)) : theme.look), map = prepareMap(json);   // the place has its own look (no A/B)
const tierName = ['high', 'medium', 'low'].includes(params.get('tier')) ? params.get('tier') : coarse ? 'low' : 'high';
const stage = createStage({ canvas: $('view'), look, scene0: sceneFromMap(json, theme), tierName });
const { camera } = stage;
const AE = cars.find((c) => c.model === 'ae86') ?? cars[1];
const fleet = await new Fleet(stage, { model: 'ae86', fx: AE?.fx }).load();
const mine = fleet.spawn(new THREE.Color('#d8d4cc'));
stage.scene.add(mine.group);
// the place in plain shapes (paint, zones, walls) and ONE mesh for all cones; the zones' grip goes per wheel into the model's ground (`ENV.muW`)
const groundAt = (x, z) => stage.field.groundY(x, z);
const EXERCISES = json.academy.exercises;
let exNo = Math.max(0, EXERCISES.findIndex((e) => e.key === (params.get('ex') ?? 'circle')));   // the chosen start (the chip "Übung"); R goes back to it
// ?top=1 (for pictures): the whole pad from straight above, every exercise labelled
const TOP = params.has('top'), labelEls = [];
if (TOP) { document.body.classList.add('top'); for (const e of EXERCISES) { const d = Object.assign(document.createElement('div'), { className: 'exlabel', textContent: t('ex_' + e.key) }); document.body.append(d); labelEls.push([d, e]); } }
function topView() {
  const f = 40, tan = Math.tan((f / 2) * Math.PI / 180), aspect = innerWidth / innerHeight, H = Math.max(196 / (2 * tan), 262 / (aspect * 2 * tan));
  camera.up.set(0, 0, 1); camera.position.set(0, H, 0); camera.lookAt(0, 0, 0); if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();
  const v = new THREE.Vector3();
  for (const [d, e] of labelEls) { const cx = (e.box[0] + e.box[2]) / 2, cz = (e.box[1] + e.box[3]) / 2; v.set(X(cx), 0, cz).project(camera); d.style.left = `${((v.x + 1) / 2) * innerWidth}px`; d.style.top = `${((1 - v.y) / 2) * innerHeight}px`; }
}
const academy = buildPlace(json, groundAt); stage.scene.add(academy.group);
// the look of the place (view/look/place.js): asphalt, barriers, sea and harbour, stand, palms, floodlights; the plain pad's blocks and wet sheet go
const placeLook = buildPlaceLook(json, look, stage.env, groundAt, tierName); stage.scene.add(placeLook.group);
if (stage.world.road) stage.world.road.visible = false;   // the place draws its own asphalt
for (const m of academy.wet) m.visible = false; academy.group.children.forEach((o) => { if (o.isInstancedMesh) o.visible = false; });
for (const [x, y, z, size] of placeLook.lampHeads) stage.halos.add(x, y, z, new THREE.Color(look.lamp.light).multiplyScalar((look.lamp.halo ?? 0.55) * (stage.tier.post ? look.lamp.haloPost ?? 0.4 : 1)), size);
const coneField = new ConeField(json.cones, groundAt); stage.scene.add(coneField.mesh);
let cs = newCones(json.cones), wetOn = params.get('wet') !== '0';
const minMu = [1, 1, 1, 1];   // the lowest grip each wheel had since the page began (for the checking tool)
const ENV = { ...FLAT, muW: [1, 1, 1, 1] }, wheelPts = [[0, 0], [0, 0], [0, 0], [0, 0]];
const cam = new CameraRig(camera, { look: look.camera, ground: (x, z) => stage.field.groundY(x, z) });
const START = () => EXERCISES[exNo].spawn;

// ---- the state of the drive
const MODES = ['arcade', 'sport', 'sim'], CARS = [AE86_DRIFT, AE86];
let mode = MODES.includes(params.get('mode')) ? params.get('mode') : 'arcade', carNo = params.get('car') === 'stock' ? 1 : 0, manual = params.get('manual') === '1';
const REST = { throttle: 0, brake: 0, steer: 0, handbrake: 0, clutch: 0, up: false, down: false, manual: false };
/** A car at the start that has stood a second on its springs (so it does not bounce down onto them). */
function fresh() { const c = makeCar(START().x, START().z, START().h); for (let i = 0; i < 120; i++) step(c, REST, CARS[carNo], ASSISTS[mode], FLAT, DT); return c; }
let s = fresh(), prev = null;   // `prev`: the state one step back; the picture is the blend of the two (as in main.js)
let autoT = 0, autoPhase = 0, autoSteer = 0, autoHand = 0;
const held = new Set(), touchHeld = new Set(), pending = { up: false, down: false };
const inp = { throttle: 0, brake: 0, steer: 0, handbrake: 0, clutch: 0, up: false, down: false, manual: false };
const ramp = (v, target, up, down, dt) => (target > v ? Math.min(target, v + up * dt) : Math.max(target, v - down * dt));
const has = (k, ctl) => held.has(k) || touchHeld.has(ctl);
function reset() { s = fresh(); prev = null; cs = newCones(json.cones); coneField.standAll(); stage.skids.clear(); activeCam().snap(s); inp.throttle = inp.brake = inp.steer = inp.clutch = 0; }
// the cameras: Action (the test page's own, close and low, behind the way the car travels), Calm (the game's chase) and Wide (the game's chase, far); C cycles
const action = new ActionCam(camera);
action.ground = (x, z) => stage.field.groundY(x, z); if (stage.field.height) action.cover = (x, z) => stage.field.height(x, z);
const CAMS = ['action', 'calm', 'wide'];
let camNo = Math.max(0, CAMS.indexOf(params.get('cam') ?? 'action'));
const activeCam = () => (camNo === 0 ? action : cam);
function setCam(n) { camNo = n; if (n > 0) { cam.cams.chase.user.preset = n === 1 ? 'follow' : 'far'; cam.cams.chase.user.auto = true; } camera.up.set(0, 1, 0); if (s) activeCam().snap(drawn ?? s); }
const camLabel = () => { $('simcam').textContent = t(CAMS[camNo]); };
const cycleCam = () => { setCam((camNo + 1) % CAMS.length); camLabel(); };
camLabel();
const setMode = (m) => { mode = m; syncChips(); };
const toggleCar = () => { carNo = 1 - carNo; syncChips(); };
const toggleManual = () => { manual = !manual; syncChips(); };
const toggleWet = () => { wetOn = !wetOn; placeLook.setWet(wetOn); syncChips(); };
function setExercise(n) { exNo = clamp(n, 0, EXERCISES.length - 1); reset(); syncChips(); document.body.classList.remove('list-open'); }
function key(code, down) {
  if (down) {
    if (code === 'KeyN') toggleWet(); else if (code === 'KeyC') cycleCam(); else if (code === 'KeyR') reset(); else if (code === 'KeyM') toggleManual(); else if (code === 'KeyT') toggleCar();
    else if (code === 'KeyQ') pending.down = true; else if (code === 'KeyE') pending.up = true;
    else if (code === 'Digit1') setMode('arcade'); else if (code === 'Digit2') setMode('sport'); else if (code === 'Digit3') setMode('sim');
  }
}
addEventListener('keydown', (e) => { if (e.ctrlKey || e.metaKey || e.altKey) return; if (/^(Arrow|Key|Digit|Space|Shift)/.test(e.code)) e.preventDefault(); if (!e.repeat) { held.add(e.code); key(e.code, true); } unlockSound(); });
addEventListener('keyup', (e) => { held.delete(e.code); });
addEventListener('blur', () => { held.clear(); touchHeld.clear(); });
// touch: the page's buttons (held ones by data-ctl, one-shot ones by data-key)
for (const b of document.querySelectorAll('#simtouch [data-ctl]')) {
  const ctl = b.dataset.ctl, down = (e) => { touchHeld.add(ctl); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch { /* not capturable */ } e.preventDefault(); unlockSound(); }, up = () => { touchHeld.delete(ctl); b.classList.remove('on'); };
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
}
$('simdata').addEventListener('pointerdown', (e) => { document.body.classList.toggle('data-open'); e.preventDefault(); });
for (const b of document.querySelectorAll('#simtouch [data-key]')) b.addEventListener('pointerdown', (e) => { key(b.dataset.key, true); e.preventDefault(); unlockSound(); });
const chips = [...document.querySelectorAll('#simmodes [data-mode]')];
for (const c of chips) c.addEventListener('click', () => setMode(c.dataset.mode));
const list = $('simlist'), exButtons = EXERCISES.map((e, i) => { const b = Object.assign(document.createElement('button'), { type: 'button', textContent: t('ex_' + e.key) }); b.addEventListener('click', () => setExercise(i)); list.append(b); return b; });
if (params.has('list')) document.body.classList.add('list-open');   // (for pictures)
$('simex').addEventListener('click', () => document.body.classList.toggle('list-open'));
$('simwet').addEventListener('click', toggleWet);
function syncChips() { for (const c of chips) c.setAttribute('aria-pressed', c.dataset.mode === mode); exButtons.forEach((b, i) => b.setAttribute('aria-pressed', i === exNo)); $('simwet').setAttribute('aria-pressed', wetOn); $('simex').textContent = t('exercise') + ': ' + t('ex_' + EXERCISES[exNo].key); }
syncChips();
$('simhint').textContent = t('hint');

// ---- sound: the engine of the AE86 with the model's own revs; the squeal on the rear wheels' slip
const sound = new SoundSystem({ recorded: { [AE?.id ?? 1]: 'assets/sound/ae86-engine.json' }, squeal: 'assets/sound/squeal.json', pops: 'assets/sound/pops.json' });
let unlocked = false;
function unlockSound() { if (unlocked) return; unlocked = true; try { sound.unlock(); } catch { /* no audio */ } }

// ---- the read-outs (HTML, the HUD's glass style; built once, updated every frame)
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const bar = (cls) => { const b = el('div', `bar ${cls ?? ''}`), i = el('i'); b.append(i); return [b, i]; };
const hud = $('simhud');
const cSpeed = el('div', 'card'), speedB = el('b', '', '0'), gearB = el('div', 'gear', 'N');
cSpeed.id = 'c-speed';
const big = el('div', 'big'); big.append(speedB, el('span', '', 'km/h'), gearB);
const [revBar, revI] = bar('rev'), limitMark = el('u'); revBar.append(limitMark);
const [gasBar, gasI] = bar(), [brkBar, brkI] = bar(), [cluBar, cluI] = bar();
const pedal = (name, b) => { const r = el('div', 'lbl'); r.append(el('span', '', name)); return [r, b]; };
cSpeed.append(big, revBar, ...pedal(t('gas'), gasBar), ...pedal(t('brake'), brkBar), ...pedal(t('clutch'), cluBar));
const cMode = el('div', 'card'); cMode.id = 'c-mode';
const cG = el('div', 'card'), gCanvas = el('canvas'); cG.id = 'c-g'; gCanvas.width = gCanvas.height = 150; cG.append(el('div', 'lbl', t('gcircle')), gCanvas);
const cW = el('div', 'card'); cW.id = 'c-wheels';
const wGrid = el('div', 'grid'), wc = [];
for (const name of ['FL', 'FR', 'RL', 'RR']) { const w = el('div', 'w'), [sb, si] = bar(), [lb, li] = bar(); const head = el('div', 'lbl'), tn = el('span', '', name), v = el('span', '', ''), v2 = el('div', 'lbl'); head.append(tn, v); w.append(head, sb, lb, v2); li.classList.add('blue'); wGrid.append(w); wc.push({ si, li, v, v2 }); }
cW.append(el('div', 'lbl', t('wheels')), wGrid);
hud.append(cMode, cSpeed, cG, cW);
const gctx = gCanvas.getContext('2d');
function drawG() {
  const c = 75, r = 62; gctx.clearRect(0, 0, 150, 150); gctx.strokeStyle = 'rgba(255,255,255,0.35)'; gctx.lineWidth = 1;
  for (const k of [0.5, 1, 1.5]) { gctx.beginPath(); gctx.arc(c, c, (r * k) / 1.5, 0, 6.2832); gctx.stroke(); }
  gctx.beginPath(); gctx.moveTo(c - r, c); gctx.lineTo(c + r, c); gctx.moveTo(c, c - r); gctx.lineTo(c, c + r); gctx.stroke();
  const gx = clamp(s.alat / G, -1.5, 1.5), gy = clamp(s.alon / G, -1.5, 1.5);
  gctx.fillStyle = '#e0409a'; gctx.beginPath(); gctx.arc(c + (gx / 1.5) * r, c - (gy / 1.5) * r, 6, 0, 6.2832); gctx.fill();
}
const GEAR = (s) => (s.gear === 0 ? 'N' : s.gear < 0 ? 'R' : String(s.gear));
function readout() {
  const C = CARS[carNo], kmh = s.speed * 3.6;
  speedB.textContent = String(Math.round(kmh)); gearB.textContent = GEAR(s) + (manual ? ' M' : ' A');
  revI.style.width = `${clamp((s.rpm / (C.engine.limit * 1.05)) * 100, 0, 100)}%`; revI.classList.toggle('hot', s.rpm > C.engine.limit * 0.97);
  limitMark.style.left = `${(C.engine.limit / (C.engine.limit * 1.05)) * 100}%`;
  gasI.style.width = `${inp.throttle * 100}%`; brkI.style.width = `${inp.brake * 100}%`; cluI.style.width = `${(1 - s.engage) * 100}%`;
  const rows = [[t('mode'), t(mode)], [t('car'), carNo === 0 ? t('drift') : t('stock')], [t('gearbox'), manual ? t('manual') : t('auto')], [t('bodyAngle'), `${Math.round((s.beta * 180) / Math.PI)}\u00b0`]];
  { const e = EXERCISES[exNo], n = e.cones[1] - e.cones[0]; rows.push([t('conesDown'), n ? `${coneField.downCount(e.cones)}/${n}` : '-']); }
  if (!coarse) rows.push([t('rpm'), String(Math.round(s.rpm))], [t('yaw'), `${((s.w * 180) / Math.PI).toFixed(0)}\u00b0/s`]);   // (a phone's card is short: nothing may lie over the car)
  cMode.replaceChildren(...rows.map(([k, v]) => { const d = el('div'); d.append(`${k}: `, el('b', '', v)); return d; }));
  for (let i = 0; i < 4; i++) { wc[i].si.style.width = `${clamp((s.sn[i] / 2) * 100, 0, 100)}%`; wc[i].si.classList.toggle('red', s.sn[i] > 1); wc[i].li.style.width = `${clamp((s.fz[i] / 6000) * 100, 0, 100)}%`; wc[i].v.textContent = `${s.sn[i].toFixed(2)}  ${Math.round(s.fz[i])} N`; wc[i].v2.textContent = `${Math.round(s.temp[i])}\u00b0C  ${t('sq')} ${squealOf(s, C, i).toFixed(2)}  ${t('sm')} ${smokeOf(s, C, i).toFixed(2)}`; }
  drawG();
}

// ---- one simulation step: the keys into the model, then the pad's walls
function simStep(dt) {
  const C = CARS[carNo], A = ASSISTS[mode];
  const steerKey = (has('ArrowRight', 'right') || held.has('KeyD') ? 1 : 0) - (has('ArrowLeft', 'left') || held.has('KeyA') ? 1 : 0);
  const gas = AUTO > 0 || has('ArrowUp', 'gas') || held.has('KeyW') || (CRUISE > 0 && s.speed < CRUISE), brake = has('ArrowDown', 'brake') || held.has('KeyS');
  if (AUTO > 0) {
    autoT += dt;
    if (autoT < 3 && s.speed < 17) autoSteer = 0;                   // run up
    else if (autoPhase === 0 && s.speed >= 17) { autoPhase = 1; autoT = 0; }
    if (autoPhase === 1) { autoSteer = 1; autoHand = autoT < 0.35 ? 1 : 0; if (autoT > 0.9) autoPhase = 2; }   // kick it round
    else if (autoPhase === 2) { autoHand = 0; autoSteer = Math.max(-1, Math.min(1, 2.2 * (s.beta + AUTO) + 0.1)); }
  }
  inp.steer = AUTO > 0 ? autoSteer : ramp(inp.steer, steerKey, 5, steerKey === 0 ? 9 : 7, dt);
  inp.throttle = ramp(inp.throttle, gas ? 1 : 0, 6, 12, dt);
  inp.brake = ramp(inp.brake, brake ? 1 : 0, 8, 14, dt);
  inp.handbrake = AUTO > 0 ? autoHand : has('Space', 'hand') ? 1 : 0;
  inp.clutch = has('ShiftLeft', 'clutch') || held.has('ShiftRight') ? 1 : 0;
  inp.manual = manual; inp.up = pending.up; inp.down = pending.down; pending.up = pending.down = false;
  const sh = Math.sin(s.h), ch = Math.cos(s.h);
  for (let i = 0; i < 4; i++) { const [lx, lz] = wheelLocal[i]; wheelPts[i][0] = s.x + lz * sh - lx * ch; wheelPts[i][1] = s.z + lz * ch + lx * sh; }
  gripPerWheel(json.academy.grip, wheelPts, ENV.muW, wetOn);   // the grip under each wheel's contact point
  for (let i = 0; i < 4; i++) if (ENV.muW[i] < minMu[i]) minMu[i] = ENV.muW[i];
  step(s, inp, C, A, ENV, dt);
  s = collideBody(map, s);
  const hit = coneStep(cs, json.cones, s.x, s.z, s.vx, s.vz);
  if (hit !== cs) { for (const i of hit.event) coneField.fall(i, hit.down[i].dx, hit.down[i].dz, hit.down[i].v); cs = hit; }
}

// ---- the picture: the car on its body node, marks and smoke per wheel
const pivots = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) => mine.group.getObjectByName(n + '_pivot'));
const bodyLean = mine.group.getObjectByName('body_lean');
const bodyY0 = bodyLean ? bodyLean.position.y : 0;
const wheelLocal = (fleet.dims?.wheels?.length === 4 ? fleet.dims.wheels.map((w) => [w.x, w.z]) : [[0.8, 1.27], [-0.8, 1.27], [0.8, -1.27], [-0.8, -1.27]]);
const spin = [0, 0, 0, 0], skidIdx = [0, 1, 2, 3];
let simSteps = 0;
function place(s) {
  const g = stage.field.groundY(s.x, s.z);
  mine.group.position.set(X(s.x), g, s.z);
  mine.group.rotation.set(0, HEAD(s.h), 0, 'YXZ');
  // the body alone moves on its springs (height, nose, lean to the side of the bend's outside): the wheels stay on the pad
  if (bodyLean) { bodyLean.position.y = bodyY0 + s.y; bodyLean.rotation.set(-s.pitch, 0, s.roll); }
  for (let i = 0; i < 4; i++) {
    const p = pivots[i]; if (!p) continue;
    p.rotation.y = i < 2 ? -s.steer : 0;
    if (p.children[0]) p.children[0].rotation.x = s.spin[i];
  }
  mine.group.updateMatrix();
  stage.smoke.car.value.set(X(s.x), g, s.z);
}
const lerp = (a, b, k) => a + (b - a) * k, angTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const snapshot = (c) => ({ x: c.x, z: c.z, h: c.h, y: c.y, pitch: c.pitch, roll: c.roll, steer: c.steer, vx: c.vx, vz: c.vz, speed: c.speed, spin: spin.slice() });
/** The pose to draw: the blend of the previous and the last step by the loop's alpha (angles the short way round); everything the page draws or the camera reads comes from it. */
function drawnPose(a) {
  const p = prev ?? snapshot(s), c = snapshot(s);
  return { ...s, x: lerp(p.x, c.x, a), z: lerp(p.z, c.z, a), h: p.h + angTo(p.h, c.h) * a, y: lerp(p.y, c.y, a), pitch: lerp(p.pitch, c.pitch, a), roll: lerp(p.roll, c.roll, a), steer: p.steer + angTo(p.steer, c.steer) * a,
    spin: c.spin.map((v, i) => lerp(p.spin[i], v, a)) };
}
const acc = [0, 0, 0, 0];
function marksAndSmoke() {
  const sh = Math.sin(s.h), ch = Math.cos(s.h), g = stage.field.groundY(s.x, s.z), moving = s.speed > 3, S = look.smoke ?? {}, t = Math.atan2(s.vx, s.vz), push = S.drift ?? 0, out = S.offset ?? 0;
  for (let i = 0; i < 4; i++) {
    const [lx, lz0] = wheelLocal[i], lz = i >= 2 ? lz0 - (S.behind ?? 0) : lz0, px = s.x + lz * sh - lx * ch, pz = s.z + lz * ch + lx * sh;
    stage.skids.mark(skidIdx[i], X(s.x + lz0 * sh - lx * ch), s.z + lz0 * ch + lx * sh, 0, 0, s.sn[i] > 1 && s.slip[i] > 1 && moving, g, 0, 0);
    // smoke by smokeOf(): the rate and the size follow it, nothing at 0. It starts where the look's smoke starts (a little behind and outside the tyre: the smoke keeps a
    // hole round the car, a puff inside it would not show).
    const k = smokeOf(s, CARS[carNo], i);
    acc[i] = k > 0 ? Math.min(acc[i] + k, 1.5) : 0;
    if (acc[i] >= 0.5) {
      acc[i] -= 0.5;
      const slideDir = moving ? t : s.h;
      stage.smoke.emit(X(px) + X(-Math.cos(slideDir)) * out, (S.height ?? 0.12) + g, pz + Math.sin(slideDir) * out, X(s.vx * (S.throw ?? -0.12) - Math.cos(slideDir) * push), s.vz * (S.throw ?? -0.12) + Math.sin(slideDir) * push, clamp(0.25 + k * 0.75, 0.25, 1));
    }
  }
}

// ---- the loop
const loop = new FixedLoop(DT, 0.25);
reset();
let last = performance.now(), frames = 0, drawn = null, probe = null;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; 
  const alpha = loop.advance(dt, () => { prev = snapshot(s); simStep(DT); for (let i = 0; i < 4; i++) spin[i] += s.wheel[i] * DT; stage.smoke.update(DT); simSteps++; if (simSteps % 2 === 0) marksAndSmoke(); });
  const d = drawnPose(RAW ? 1 : alpha); drawn = d;
  coneField.update(dt);
  if (TOP) topView(); else activeCam().update(d, 55, dt);
  place(d);
  stage.aimSun(X(d.x), 0, d.z);
  readout();
  if (unlocked && sound.unlocked) sound.update({ speed: s.speed, throttle: s.load, slide: Math.max(...[0, 1, 2, 3].map((i) => squealOf(s, CARS[carNo], i))), car: AE?.id ?? 1, top: 55, surface: 'asphalt', rpm: s.rpm, gear: s.gear }, [], { x: d.x, z: d.z, heading: d.h });
  if (innerWidth !== frame.w || innerHeight !== frame.h) { frame.w = innerWidth; frame.h = innerHeight; stage.resize(); }
  stage.smoke.sync?.();   // the puffs' buffers to the graphics card (the stage does not do it itself)
  stage.render();
  if (probe) { mine.group.updateMatrixWorld(true); camera.updateMatrixWorld(); const nose = new THREE.Vector3(0, 0, 1).transformDirection(mine.group.matrixWorld), fwd = camera.getWorldDirection(new THREE.Vector3());
    probe.push([...new THREE.Vector3().setFromMatrixPosition(mine.group.matrixWorld).applyMatrix4(camera.matrixWorldInverse).toArray(), fwd.x, fwd.y, fwd.z, (Math.atan2(nose.x * fwd.z - nose.z * fwd.x, nose.x * fwd.x + nose.z * fwd.z) * 180) / Math.PI, (s.beta * 180) / Math.PI, s.speed]); }
  frames++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// for the checking tools (tools/simdrive.mjs) and the pictures
// where the car is on the screen (CSS pixels), for the layout check
function carRect() {
  const box = new THREE.Box3().setFromObject(mine.group), v = new THREE.Vector3(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  camera.updateMatrixWorld();
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) { v.set(x, y, z).project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  return { x0: ((x0 + 1) / 2) * innerWidth, x1: ((x1 + 1) / 2) * innerWidth, y0: ((1 - y1) / 2) * innerHeight, y1: ((1 - y0) / 2) * innerHeight };
}
window.__sim = { get exNo() { return exNo; }, setExercise, toggleWet, get wetOn() { return wetOn; }, get muW() { return ENV.muW; }, minMu, get cones() { return cs; }, coneField, cycleCam, setCam, get camNo() { return camNo; }, camera, startProbe() { probe = []; }, stopProbe() { const p = probe; probe = null; return p; }, carRect, get drawn() { return drawn; }, camPose() { const v = new THREE.Vector3(); v.setFromMatrixPosition(mine.group.matrixWorld); camera.updateMatrixWorld(); return v.applyMatrix4(camera.matrixWorldInverse).toArray(); }, get state() { return s; }, get frames() { return frames; }, get mode() { return mode; }, held, reset, setMode, toggleCar, toggleManual, stage, camera };
