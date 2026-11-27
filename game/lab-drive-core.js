// What the driving test pages share (lab-sim.html: the training place; lab-drive.html: the harbour corner): the texts, the keys and the touch buttons, the read-out cards, the three
// cameras, the engine sound, one simulation step (the keys into sim2, the walls), the blend of two steps for the picture and the car on its body node. A page brings its own
// world: it says where the car starts, how the ground grips under each wheel (`hooks.beforeStep`), what happens after a step (`hooks.afterStep`: cones), and draws.
import * as THREE from '../vendor/three/three.module.js';
import { CameraRig, ActionCam } from './view/camera.js';
import { SoundSystem } from './view/sound.js';
import { FixedLoop } from './sim/loop.js';
import { collideBody } from './sim/collision.js';
import { step, makeCar, AE86, AE86_DRIFT, ASSISTS, FLAT, DT, G, squealOf, smokeOf } from './sim/sim2.js';
import { X, HEAD } from './view/space.js';

export { AE86, AE86_DRIFT, ASSISTS, FLAT, DT, G, squealOf, smokeOf };
export const $ = (id) => document.getElementById(id);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The texts both pages use (German and English); a page adds its own. */
export const COMMON = {
  en: { action: 'Action', calm: 'Calm', wide: 'Wide', camB: 'Camera (Action, Calm, Wide)',
    mode: 'mode', car: 'car', gearbox: 'gearbox', auto: 'automatic', manual: 'manual (Q/E, Shift)', bodyAngle: 'body angle', rpm: 'rpm', yaw: 'yaw', arcade: 'Arcade', sport: 'Sport', sim: 'Sim',
    gas: 'GAS', brake: 'BRAKE', clutch: 'CLUTCH', hand: 'HAND', gcircle: 'g (grip circle)', wheels: 'per wheel: slip (red over its peak) and load', data: 'Data', sq: 'squeal', sm: 'smoke', stock: 'AE86 (stock)', drift: 'AE86 (drift set-up)',
    conesDown: 'cones down', steerL: 'Steer left', steerR: 'Steer right', gearDown: 'Gear down', gearUp: 'Gear up', manualBox: 'Manual gearbox', carToggle: 'Stock car or drift set-up', resetB: 'Reset' },
  de: { action: 'Action', calm: 'Ruhig', wide: 'Weit', camB: 'Kamera (Action, Ruhig, Weit)',
    mode: 'Modus', car: 'Auto', gearbox: 'Getriebe', auto: 'automatisch', manual: 'manuell (Q/E, Shift)', bodyAngle: 'Driftwinkel', rpm: 'Drehzahl', yaw: 'Gierrate', arcade: 'Arcade', sport: 'Sport', sim: 'Sim',
    gas: 'GAS', brake: 'BREMSE', clutch: 'KUPPLUNG', hand: 'HAND', gcircle: 'g (Kammscher Kreis)', wheels: 'je Rad: Schlupf (rot über dem Maximum) und Last', data: 'Daten', sq: 'Quietsch.', sm: 'Rauch', stock: 'AE86 (Serie)', drift: 'AE86 (Drift-Aufbau)',
    conesDown: 'Kegel gefallen', steerL: 'Links lenken', steerR: 'Rechts lenken', gearDown: 'Runterschalten', gearUp: 'Hochschalten', manualBox: 'Schaltgetriebe', carToggle: 'Serienauto oder Drift-Aufbau', resetB: 'Neu starten' },
};
/** The texts of a page: the common ones and its own; binds `data-t` (text) and `data-ta` (aria-label) of the page and sets its language and title. */
export function makeTexts(page, params = new URLSearchParams(location.search)) {
  const LANG = (params.get('lang') ?? navigator.language ?? '').startsWith('de') ? 'de' : 'en';
  const TEXT = { en: { ...COMMON.en, ...page.en }, de: { ...COMMON.de, ...page.de } };
  const t = (k) => TEXT[LANG][k] ?? TEXT.en[k] ?? k;
  document.documentElement.lang = LANG; document.title = t('title');
  for (const e of document.querySelectorAll('[data-t]')) e.textContent = t(e.dataset.t);
  for (const e of document.querySelectorAll('[data-ta]')) e.setAttribute('aria-label', t(e.dataset.ta));
  return { LANG, t };
}

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const bar = (cls) => { const b = el('div', `bar ${cls ?? ''}`), i = el('i'); b.append(i); return [b, i]; };
const lerp = (a, b, k) => a + (b - a) * k, angTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/**
 * A plain car file (the posed car of the harbour: its wheels and body are separate nodes) made ready for driving: every wheel on a pivot (steering) with a spinner (rolling) inside,
 * the rest of the body on one node that can dive and lean. Returns { group, pivots, bodyLean, wheelLocal } (wheelLocal: the four wheels' places in the car's axes, x to the left, z forwards).
 */
export function rigCar(scene) {
  const group = new THREE.Group(); group.add(scene); group.updateMatrixWorld(true);
  const pivots = [], wheelLocal = [], bodyLean = new THREE.Group(); bodyLean.name = 'body_lean';
  for (const n of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) {
    const w = scene.getObjectByName(n); if (!w || w.parent !== scene) throw new Error(`rigCar: ${n} is not a direct node of the car file`);
    const c = new THREE.Box3().setFromObject(w).getCenter(new THREE.Vector3()), pivot = new THREE.Group(), spin = new THREE.Group();
    pivot.name = `${n}_pivot`; pivot.position.copy(c); scene.add(pivot); pivot.add(spin); spin.add(w); w.position.sub(pivot.position);   // (the node keeps its own turn; it moves so that the pivot is the wheel's middle)
    pivots.push(pivot); wheelLocal.push([c.x, c.z]);
  }
  for (const ch of [...scene.children]) if (!pivots.includes(ch)) bodyLean.add(ch);   // everything that is not a wheel: the body
  scene.add(bodyLean); group.updateMatrixWorld(true);
  return { group, pivots, bodyLean, wheelLocal };
}

/**
 * The driving: `cfg`: { params, t, camera, rig ({ group, pivots, bodyLean }), wheelLocal, spawn(), env (the ground: FLAT with `muW`), map (prepareMap), groundAt(x, z), cover?(x, z),
 * lookCamera (the look's chase camera values), soundId, hooks: { onUnlock(soundSystem), audio(s, d, dt), beforeStep(s, wheelPts, muW), afterStep(s), fixed(s, simSteps), onReset(), key(code) -> true when handled, rows() -> [[k, v]],
 * driver(s, dt) -> { steer, gas, hand } or nothing, overrideCamera(d, dt) -> true when the page placed the camera, afterPlace(d, ground) } }.
 */
export function createDrive(cfg) {
  const { params, t, camera, rig, wheelLocal, spawn, env, map, groundAt, hooks = {} } = cfg, group = rig.group;
  const AUTO = +(params.get('auto') ?? 0) * Math.PI / 180;   // measuring tool: a driver that holds a drift of that body angle (degrees) to the right
  const CRUISE = +(params.get('cruise') ?? 0), RAW = params.has('raw');   // cruise: hold that speed (m/s); raw: draw the last step's state unblended (to show the difference)
  const coarse = matchMedia('(pointer: coarse)').matches || params.has('touch');
  document.body.classList.toggle('touch', coarse);
  const MODES = ['arcade', 'sport', 'sim'], CARS = [AE86_DRIFT, AE86];
  const D = { mode: MODES.includes(params.get('mode')) ? params.get('mode') : 'arcade', carNo: params.get('car') === 'stock' ? 1 : 0, manual: params.get('manual') === '1' };
  const REST = { throttle: 0, brake: 0, steer: 0, handbrake: 0, clutch: 0, up: false, down: false, manual: false };
  const fresh = () => { const c = makeCar(spawn().x, spawn().z, spawn().h); for (let i = 0; i < 120; i++) step(c, REST, CARS[D.carNo], ASSISTS[D.mode], FLAT, DT); return c; };   // (a car that has stood a second on its springs)
  let s = fresh(), prev = null, drawn = null, simSteps = 0, frames = 0, last = performance.now();
  let autoT = 0, autoPhase = 0, autoSteer = 0, autoHand = 0;
  const held = new Set(), touchHeld = new Set(), pending = { up: false, down: false };
  const inp = { throttle: 0, brake: 0, steer: 0, handbrake: 0, clutch: 0, up: false, down: false, manual: false };
  const ramp = (v, target, up, down, dt) => (target > v ? Math.min(target, v + up * dt) : Math.max(target, v - down * dt));
  const has = (k, ctl) => held.has(k) || touchHeld.has(ctl);
  const spin = [0, 0, 0, 0], wheelPts = [[0, 0], [0, 0], [0, 0], [0, 0]];
  const bodyY0 = rig.bodyLean ? rig.bodyLean.position.y : 0;

  // ---- the cameras: Action (close and low, behind the way the car travels), Calm (the game's chase) and Wide (the same, far); C cycles
  const cam = new CameraRig(camera, { look: cfg.lookCamera, ground: groundAt }), action = new ActionCam(camera);
  action.ground = groundAt; if (cfg.cover) action.cover = cfg.cover;
  const CAMS = ['action', 'calm', 'wide'];
  let camNo = Math.max(0, CAMS.indexOf(params.get('cam') ?? 'action'));
  const activeCam = () => (camNo === 0 ? action : cam);
  const camLabel = () => { const b = $('simcam'); if (b) b.textContent = t(CAMS[camNo]); };
  function setCam(n) { camNo = n; if (n > 0) { cam.cams.chase.user.preset = n === 1 ? 'follow' : 'far'; cam.cams.chase.user.auto = true; } camera.up.set(0, 1, 0); if (s) activeCam().snap(drawn ?? s); }
  const cycleCam = () => { setCam((camNo + 1) % CAMS.length); camLabel(); };
  camLabel();

  function reset() { s = fresh(); prev = null; hooks.onReset?.(); activeCam().snap(s); inp.throttle = inp.brake = inp.steer = inp.clutch = 0; }
  const setMode = (m) => { D.mode = m; syncChips(); };
  const toggleCar = () => { D.carNo = 1 - D.carNo; syncChips(); };
  const toggleManual = () => { D.manual = !D.manual; syncChips(); };
  function key(code, down) {
    if (!down) return;
    if (hooks.key?.(code)) return;
    if (code === 'KeyC') cycleCam(); else if (code === 'KeyR') reset(); else if (code === 'KeyM') toggleManual(); else if (code === 'KeyT') toggleCar();
    else if (code === 'KeyQ') pending.down = true; else if (code === 'KeyE') pending.up = true;
    else if (code === 'Digit1') setMode('arcade'); else if (code === 'Digit2') setMode('sport'); else if (code === 'Digit3') setMode('sim');
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
  function syncChips() { for (const c of chips) c.setAttribute('aria-pressed', c.dataset.mode === D.mode); hooks.syncChips?.(); }
  syncChips();

  // ---- sound: the engine of the AE86 with the model's own revs; the squeal on the wheels' slip
  const sound = new SoundSystem({ recorded: { [cfg.soundId ?? 1]: 'assets/sound/ae86-engine.json' }, squeal: 'assets/sound/squeal.json', pops: 'assets/sound/pops.json' });
  let unlocked = false;
  function unlockSound() { if (unlocked) return; unlocked = true; try { if (sound.unlock()) hooks.onUnlock?.(sound); } catch { /* no audio */ } }

  // ---- the read-outs (HTML, the HUD's glass style; built once, updated every frame)
  const hud = $('simhud');
  const cSpeed = el('div', 'card'), speedB = el('b', '', '0'), gearB = el('div', 'gear', 'N'); cSpeed.id = 'c-speed';
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
  const GEAR = (c) => (c.gear === 0 ? 'N' : c.gear < 0 ? 'R' : String(c.gear));
  function readout() {
    const C = CARS[D.carNo], kmh = s.speed * 3.6;
    speedB.textContent = String(Math.round(kmh)); gearB.textContent = GEAR(s) + (D.manual ? ' M' : ' A');
    revI.style.width = `${clamp((s.rpm / (C.engine.limit * 1.05)) * 100, 0, 100)}%`; revI.classList.toggle('hot', s.rpm > C.engine.limit * 0.97);
    limitMark.style.left = `${(C.engine.limit / (C.engine.limit * 1.05)) * 100}%`;
    gasI.style.width = `${inp.throttle * 100}%`; brkI.style.width = `${inp.brake * 100}%`; cluI.style.width = `${(1 - s.engage) * 100}%`;
    const rows = [[t('mode'), t(D.mode)], [t('car'), D.carNo === 0 ? t('drift') : t('stock')], [t('gearbox'), D.manual ? t('manual') : t('auto')], [t('bodyAngle'), `${Math.round((s.beta * 180) / Math.PI)}°`]];
    if (hooks.rows) rows.push(...hooks.rows());
    if (!coarse) rows.push([t('rpm'), String(Math.round(s.rpm))], [t('yaw'), `${((s.w * 180) / Math.PI).toFixed(0)}°/s`]);   // (a phone's card is short: nothing may lie over the car)
    cMode.replaceChildren(...rows.map(([k, v]) => { const d = el('div'); d.append(`${k}: `, el('b', '', v)); return d; }));
    for (let i = 0; i < 4; i++) { wc[i].si.style.width = `${clamp((s.sn[i] / 2) * 100, 0, 100)}%`; wc[i].si.classList.toggle('red', s.sn[i] > 1); wc[i].li.style.width = `${clamp((s.fz[i] / 6000) * 100, 0, 100)}%`; wc[i].v.textContent = `${s.sn[i].toFixed(2)}  ${Math.round(s.fz[i])} N`; wc[i].v2.textContent = `${Math.round(s.temp[i])}°C  ${t('sq')} ${squealOf(s, C, i).toFixed(2)}  ${t('sm')} ${smokeOf(s, C, i).toFixed(2)}`; }
    drawG();
  }

  // ---- one simulation step: the keys into the model, the ground under each wheel, then the walls
  function simStep(dt) {
    const C = CARS[D.carNo], A = ASSISTS[D.mode];
    const steerKey = (has('ArrowRight', 'right') || held.has('KeyD') ? 1 : 0) - (has('ArrowLeft', 'left') || held.has('KeyA') ? 1 : 0);
    const gas = AUTO > 0 || has('ArrowUp', 'gas') || held.has('KeyW') || (CRUISE > 0 && s.speed < CRUISE), brake = has('ArrowDown', 'brake') || held.has('KeyS');
    if (AUTO > 0) {
      autoT += dt;
      if (autoT < 3 && s.speed < 17) autoSteer = 0;                   // run up
      else if (autoPhase === 0 && s.speed >= 17) { autoPhase = 1; autoT = 0; }
      if (autoPhase === 1) { autoSteer = 1; autoHand = autoT < 0.35 ? 1 : 0; if (autoT > 0.9) autoPhase = 2; }   // kick it round
      else if (autoPhase === 2) { autoHand = 0; autoSteer = Math.max(-1, Math.min(1, 2.2 * (s.beta + AUTO) + 0.1)); }
    }
    const ai = hooks.driver?.(s, dt);   // a page's own measuring driver (`?drive=...`): { steer (-1..1), gas, hand }
    inp.steer = ai ? ai.steer : AUTO > 0 ? autoSteer : ramp(inp.steer, steerKey, 5, steerKey === 0 ? 9 : 7, dt);
    inp.throttle = ramp(inp.throttle, (ai ? ai.gas : gas) ? 1 : 0, 6, 12, dt);
    inp.brake = ramp(inp.brake, brake ? 1 : 0, 8, 14, dt);
    inp.handbrake = ai ? (ai.hand ? 1 : 0) : AUTO > 0 ? autoHand : has('Space', 'hand') ? 1 : 0;
    inp.clutch = has('ShiftLeft', 'clutch') || held.has('ShiftRight') ? 1 : 0;
    inp.manual = D.manual; inp.up = pending.up; inp.down = pending.down; pending.up = pending.down = false;
    const sh = Math.sin(s.h), ch = Math.cos(s.h);
    for (let i = 0; i < 4; i++) { const [lx, lz] = wheelLocal[i]; wheelPts[i][0] = s.x + lz * sh - lx * ch; wheelPts[i][1] = s.z + lz * ch + lx * sh; }
    hooks.beforeStep?.(s, wheelPts, env.muW);   // the grip under each wheel's contact point
    step(s, inp, C, A, env, dt);
    s = collideBody(map, s);
    hooks.afterStep?.(s);
  }

  // ---- the picture: the blend of two steps, the car on its body node
  const snapshot = (c) => ({ x: c.x, z: c.z, h: c.h, y: c.y, pitch: c.pitch, roll: c.roll, steer: c.steer, vx: c.vx, vz: c.vz, speed: c.speed, spin: spin.slice() });
  /** The pose to draw: the blend of the previous and the last step by the loop's alpha (angles the short way round); everything the page draws or the camera reads comes from it. */
  function drawnPose(a) {
    const p = prev ?? snapshot(s), c = snapshot(s);
    return { ...s, x: lerp(p.x, c.x, a), z: lerp(p.z, c.z, a), h: p.h + angTo(p.h, c.h) * a, y: lerp(p.y, c.y, a), pitch: lerp(p.pitch, c.pitch, a), roll: lerp(p.roll, c.roll, a), steer: p.steer + angTo(p.steer, c.steer) * a, spin: c.spin.map((v, i) => lerp(p.spin[i], v, a)) };
  }
  function place(d) {
    const g = groundAt(d.x, d.z);
    group.position.set(X(d.x), g, d.z);
    group.rotation.set(0, HEAD(d.h), 0, 'YXZ');
    // the body alone moves on its springs (height, nose, lean to the side of the bend's outside): the wheels stay on the ground
    if (rig.bodyLean) { rig.bodyLean.position.y = bodyY0 + d.y; rig.bodyLean.rotation.set(-d.pitch, 0, d.roll); }
    for (let i = 0; i < 4; i++) {
      const p = rig.pivots[i]; if (!p) continue;
      p.rotation.y = i < 2 ? -d.steer : 0;
      if (p.children[0]) p.children[0].rotation.x = d.spin[i];
    }
    group.updateMatrix();
    hooks.afterPlace?.(d, g);
  }

  // ---- the loop: the simulation by fixed steps, the picture between the last two
  const loop = new FixedLoop(DT, 0.25);
  reset();
  /** One picture's worth: runs the steps due, places the car, the camera and the read-outs, feeds the sound; returns { d, alpha, dt } for the page's own drawing. */
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const alpha = loop.advance(dt, () => { prev = snapshot(s); simStep(DT); for (let i = 0; i < 4; i++) spin[i] += s.wheel[i] * DT; simSteps++; hooks.fixed?.(s, simSteps); });
    const d = drawnPose(RAW ? 1 : alpha); drawn = d;
    if (!hooks.overrideCamera?.(d, dt)) activeCam().update(d, 55, dt);
    place(d);
    readout();
    if (hooks.audio) hooks.audio(s, d, dt);   // (a page with its own sound: `cfg.oldSound === false` keeps the old engine and squeal voices silent)
    if (cfg.oldSound !== false && unlocked && sound.unlocked) sound.update({ speed: s.speed, throttle: s.load, slide: Math.max(...[0, 1, 2, 3].map((i) => squealOf(s, CARS[D.carNo], i))), car: cfg.soundId ?? 1, top: 55, surface: 'asphalt', rpm: s.rpm, gear: s.gear }, [], { x: d.x, z: d.z, heading: d.h });
    frames++;
    return { d, alpha, dt };
  }
  return {
    frame, reset, setMode, toggleCar, toggleManual, cycleCam, setCam, syncChips, key, held, camera, snapshot,
    get s() { return s; }, get drawn() { return drawn; }, get frames() { return frames; }, get mode() { return D.mode; }, get carNo() { return D.carNo; }, get camNo() { return camNo; }, get car() { return CARS[D.carNo]; },
    get steps() { return simSteps; }, activeCam, readout, inp,
  };
}
