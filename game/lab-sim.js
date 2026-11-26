// The test page of the new driving model (sim/sim2.js): the owner drives the AE86 alone on the practice ground's flat pad and tells us whether it feels right. No network, no score,
// no modes. The model is not touched here: this page only feeds it the keys, draws the car from its numbers (body height, pitch and roll on the body's own node so the wheels
// stay on the pad; each wheel spins by `wheel[i]`, the front ones are turned by `steer`), makes marks and smoke per wheel, shows the read-outs and feeds the engine sound with
// the model's own revs. Keys as in the game (arrows or WASD, Space = handbrake) and: Shift = clutch, Q / E = gear down / up, M = manual gearbox, 1 / 2 / 3 = Arcade / Sport / Sim,
// T = stock car / drift set-up, R = back to the start. Touch: the buttons of the page. Defaults: drift set-up, Arcade, automatic gearbox.
import * as THREE from '../vendor/three/three.module.js';
import { createStage, loadLook } from './view/look/stage.js';
import { sceneFromMap } from './view/look/mapscene.js';
import { Fleet } from './view/look/fleet.js';
import { CameraRig } from './view/camera.js';
import { SoundSystem } from './view/sound.js';
import { FixedLoop } from './sim/loop.js';
import { prepareMap } from './sim/map.js';
import { collideBody } from './sim/collision.js';
import { step, makeCar, AE86, AE86_DRIFT, ASSISTS, FLAT, DT, G } from './sim/sim2.js';
import { X, HEAD } from './view/space.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const coarse = matchMedia('(pointer: coarse)').matches || params.has('touch');
document.body.classList.toggle('touch', coarse);

// ---- the pad: the practice ground's map (its walls), its look and scene, as in the game
const [cars, mapList] = await Promise.all([fetch('data/cars.json').then((r) => r.json()).then((j) => j.cars), fetch('data/maps.json').then((r) => r.json()).then((j) => j.maps)]);
const entry = mapList.find((m) => m.scene === 'practice');
const [json, theme] = await Promise.all([fetch('data/maps/' + entry.file).then((r) => r.json()), fetch(`data/scenes/${entry.scene}.json`).then((r) => r.json())]);
const look = await loadLook(theme.look), map = prepareMap(json);
const tierName = ['high', 'medium', 'low'].includes(params.get('tier')) ? params.get('tier') : coarse ? 'low' : 'high';
const stage = createStage({ canvas: $('view'), look, scene0: sceneFromMap(json, theme), tierName });
const { camera } = stage;
const AE = cars.find((c) => c.model === 'ae86') ?? cars[1];
const fleet = await new Fleet(stage, { model: 'ae86', fx: AE?.fx }).load();
const mine = fleet.spawn(new THREE.Color('#d8d4cc'));
stage.scene.add(mine.group);
const cam = new CameraRig(camera, { look: look.camera, ground: (x, z) => stage.field.groundY(x, z) });
const START = { x: -30, z: -30, h: Math.PI / 2 };

// ---- the state of the drive
const MODES = ['arcade', 'sport', 'sim'], CARS = [AE86_DRIFT, AE86];
let mode = MODES.includes(params.get('mode')) ? params.get('mode') : 'arcade', carNo = params.get('car') === 'stock' ? 1 : 0, manual = params.get('manual') === '1';
const REST = { throttle: 0, brake: 0, steer: 0, handbrake: 0, clutch: 0, up: false, down: false, manual: false };
/** A car at the start that has stood a second on its springs (so it does not bounce down onto them). */
function fresh() { const c = makeCar(START.x, START.z, START.h); for (let i = 0; i < 120; i++) step(c, REST, CARS[carNo], ASSISTS[mode], FLAT, DT); return c; }
let s = fresh();
const held = new Set(), touchHeld = new Set(), pending = { up: false, down: false };
const inp = { throttle: 0, brake: 0, steer: 0, handbrake: 0, clutch: 0, up: false, down: false, manual: false };
const ramp = (v, target, up, down, dt) => (target > v ? Math.min(target, v + up * dt) : Math.max(target, v - down * dt));
const has = (k, ctl) => held.has(k) || touchHeld.has(ctl);
function reset() { s = fresh(); stage.skids.clear(); cam.snap(s); inp.throttle = inp.brake = inp.steer = inp.clutch = 0; }
const setMode = (m) => { mode = m; syncChips(); };
const toggleCar = () => { carNo = 1 - carNo; syncChips(); };
const toggleManual = () => { manual = !manual; syncChips(); };
function key(code, down) {
  if (down) {
    if (code === 'KeyR') reset(); else if (code === 'KeyM') toggleManual(); else if (code === 'KeyT') toggleCar();
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
for (const b of document.querySelectorAll('#simtouch [data-key]')) b.addEventListener('pointerdown', (e) => { key(b.dataset.key, true); e.preventDefault(); unlockSound(); });
const chips = [...document.querySelectorAll('#simmodes [data-mode]')];
for (const c of chips) c.addEventListener('click', () => setMode(c.dataset.mode));
function syncChips() { for (const c of chips) c.setAttribute('aria-pressed', c.dataset.mode === mode); }
syncChips();
$('simhint').textContent = 'Arrows/WASD drive, Space handbrake, Shift clutch, Q/E gear, M manual, 1/2/3 Arcade/Sport/Sim, T stock/drift set-up, R reset';

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
cSpeed.append(big, revBar, ...pedal('GAS', gasBar), ...pedal('BRAKE', brkBar), ...pedal('CLUTCH', cluBar));
const cMode = el('div', 'card'); cMode.id = 'c-mode';
const cG = el('div', 'card'), gCanvas = el('canvas'); cG.id = 'c-g'; gCanvas.width = gCanvas.height = 150; cG.append(el('div', 'lbl', 'g (grip circle)'), gCanvas);
const cW = el('div', 'card'); cW.id = 'c-wheels';
const wGrid = el('div', 'grid'), wc = [];
for (const name of ['FL', 'FR', 'RL', 'RR']) { const w = el('div', 'w'), [sb, si] = bar(), [lb, li] = bar(); const head = el('div', 'lbl'), t = el('span', '', name), v = el('span', '', ''); head.append(t, v); w.append(head, sb, lb); li.classList.add('blue'); wGrid.append(w); wc.push({ si, li, v }); }
cW.append(el('div', 'lbl', 'per wheel: slip (red over its peak) and load'), wGrid);
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
  cMode.replaceChildren(...[['mode', mode], ['car', C.name], ['gearbox', manual ? 'manual (Q/E, Shift)' : 'automatic'], ['body angle', `${Math.round((s.beta * 180) / Math.PI)}°`], ['rpm', String(Math.round(s.rpm))], ['yaw', `${((s.w * 180) / Math.PI).toFixed(0)}°/s`]].map(([k, v]) => { const d = el('div'); d.append(`${k}: `, el('b', '', v)); return d; }));
  for (let i = 0; i < 4; i++) { wc[i].si.style.width = `${clamp((s.sn[i] / 2) * 100, 0, 100)}%`; wc[i].si.classList.toggle('red', s.sn[i] > 1); wc[i].li.style.width = `${clamp((s.fz[i] / 6000) * 100, 0, 100)}%`; wc[i].v.textContent = `${s.sn[i].toFixed(2)}  ${Math.round(s.fz[i])} N`; }
  drawG();
}

// ---- one simulation step: the keys into the model, then the pad's walls
function simStep(dt) {
  const C = CARS[carNo], A = ASSISTS[mode];
  const steerKey = (has('ArrowRight', 'right') || held.has('KeyD') ? 1 : 0) - (has('ArrowLeft', 'left') || held.has('KeyA') ? 1 : 0);
  const gas = has('ArrowUp', 'gas') || held.has('KeyW'), brake = has('ArrowDown', 'brake') || held.has('KeyS');
  inp.steer = ramp(inp.steer, steerKey, 5, steerKey === 0 ? 9 : 7, dt);
  inp.throttle = ramp(inp.throttle, gas ? 1 : 0, 6, 12, dt);
  inp.brake = ramp(inp.brake, brake ? 1 : 0, 8, 14, dt);
  inp.handbrake = has('Space', 'hand') ? 1 : 0;
  inp.clutch = has('ShiftLeft', 'clutch') || held.has('ShiftRight') ? 1 : 0;
  inp.manual = manual; inp.up = pending.up; inp.down = pending.down; pending.up = pending.down = false;
  step(s, inp, C, A, FLAT, dt);
  s = collideBody(map, s);
}

// ---- the picture: the car on its body node, marks and smoke per wheel
const pivots = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) => mine.group.getObjectByName(n + '_pivot'));
const bodyLean = mine.group.getObjectByName('body_lean');
const bodyY0 = bodyLean ? bodyLean.position.y : 0;
const wheelLocal = (fleet.dims?.wheels?.length === 4 ? fleet.dims.wheels.map((w) => [w.x, w.z]) : [[0.8, 1.27], [-0.8, 1.27], [0.8, -1.27], [-0.8, -1.27]]);
const spin = [0, 0, 0, 0], skidIdx = [0, 1, 2, 3];
let simSteps = 0;
function place() {
  const g = stage.field.groundY(s.x, s.z);
  mine.group.position.set(X(s.x), g, s.z);
  mine.group.rotation.set(0, HEAD(s.h), 0, 'YXZ');
  // the body alone moves on its springs (height, nose, lean to the side of the bend's outside): the wheels stay on the pad
  if (bodyLean) { bodyLean.position.y = bodyY0 + s.y; bodyLean.rotation.set(-s.pitch, 0, s.roll); }
  for (let i = 0; i < 4; i++) {
    spin[i] += s.wheel[i] * DT_FRAME;
    const p = pivots[i]; if (!p) continue;
    p.rotation.y = i < 2 ? -s.steer : 0;
    if (p.children[0]) p.children[0].rotation.x = spin[i];
  }
  mine.group.updateMatrix();
  stage.smoke.car.value.set(X(s.x), g, s.z);
}
let DT_FRAME = 1 / 60;
function marksAndSmoke() {
  const sh = Math.sin(s.h), ch = Math.cos(s.h), g = stage.field.groundY(s.x, s.z), moving = s.speed > 3;
  for (let i = 0; i < 4; i++) {
    const [lx, lz] = wheelLocal[i], px = s.x + lz * sh - lx * ch, pz = s.z + lz * ch + lx * sh;
    stage.skids.mark(skidIdx[i], X(px), pz, 0, 0, s.sn[i] > 1 && moving, g, 0, 0);
    if (simSteps % 2 === 0 && s.heat[i] > 8000 && s.temp[i] > 110 && moving) {
      const t = Math.atan2(s.vx, s.vz);
      stage.smoke.emit(X(px) + X(-Math.cos(t)) * 0.2, g + 0.12, pz + Math.sin(t) * 0.2, X(s.vx * -0.12), s.vz * -0.12, clamp(s.heat[i] / 40000, 0.15, 1));
    }
  }
}

// ---- the loop
const loop = new FixedLoop(DT, 0.25);
reset();
let last = performance.now(), frames = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; DT_FRAME = dt || 1 / 60;
  loop.advance(dt, () => { simStep(DT); stage.smoke.update(DT); simSteps++; if (simSteps % 2 === 0) marksAndSmoke(); });
  cam.update(s, 55, dt);
  place();
  stage.aimSun(X(s.x), 0, s.z);
  readout();
  if (unlocked && sound.unlocked) sound.update({ speed: s.speed, throttle: s.load, slide: clamp((Math.max(s.sn[2], s.sn[3]) - 0.8) / 0.8, 0, 1), car: AE?.id ?? 1, top: 55, surface: 'asphalt', rpm: s.rpm, gear: s.gear }, [], { x: s.x, z: s.z, heading: s.h });
  if (innerWidth !== frame.w || innerHeight !== frame.h) { frame.w = innerWidth; frame.h = innerHeight; stage.resize(); }
  stage.render();
  frames++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// for the checking tools (tools/simdrive.mjs) and the pictures
window.__sim = { get state() { return s; }, get frames() { return frames; }, get mode() { return mode; }, held, reset, setMode, toggleCar, toggleManual, stage, camera };
