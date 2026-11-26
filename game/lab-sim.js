// The test page of the new driving model (sim/sim2.js): the owner drives the AE86 alone on the practice ground's flat pad and tells us whether it feels right. No network, no score,
// no modes. The model is not touched here: this page only feeds it the keys, draws the car from its numbers (body height, pitch and roll on the body's own node so the wheels
// stay on the pad; each wheel spins by `wheel[i]`, the front ones are turned by `steer`), makes marks and smoke per wheel, shows the read-outs and feeds the engine sound with
// the model's own revs. Keys as in the game (arrows or WASD, Space = handbrake) and: Shift = clutch, Q / E = gear down / up, M = manual gearbox, 1 / 2 / 3 = Arcade / Sport / Sim,
// T = stock car / drift set-up, R = back to the start. Touch: the buttons of the page. Defaults: drift set-up, Arcade, automatic gearbox.
// (the driving itself, the texts, keys, read-outs, cameras and sound are lab-drive-core.js, shared with lab-drive.html; this page is the training place around them)
import * as THREE from '../vendor/three/three.module.js';
import { createStage, loadLook } from './view/look/stage.js';
import { sceneFromMap } from './view/look/mapscene.js';
import { Fleet } from './view/look/fleet.js';
import { lookChoice, lookFile } from './view/look/variant.js';
import { buildPlace, ConeField } from './view/academy.js';
import { buildPlaceLook } from './view/look/place.js';
import { buildNature } from './view/look/nature.js';
import { newCones, coneStep } from './sim/cones.js';
import { gripPerWheel } from './sim/exercise.js';
import { prepareMap } from './sim/map.js';
import { createDrive, makeTexts, $, clamp, FLAT, squealOf, smokeOf } from './lab-drive-core.js';
import { X } from './view/space.js';

const params = new URLSearchParams(location.search);
const { t } = makeTexts({
  en: { title: 'Drift: new driving model (test page)', hint: 'Arrows/WASD drive, Space handbrake, Shift clutch, Q/E gear, M manual, 1/2/3 Arcade/Sport/Sim, T stock/drift set-up, C camera, N wet pad, R back to the start. Burnout: hold the brake and full throttle',
    exercise: 'Exercise', wet: 'Wet (N)', ex_circle: 'Circle', ex_eight: 'Eight', ex_slalom: 'Slalom', ex_hairpin: 'Hairpin', ex_sBends: 'S-bends', ex_wallBend: 'Wall bend', ex_wetPad: 'Wet pad', ex_straight: 'Straight', ex_free: 'Free pad' },
  de: { title: 'Drift: neues Fahrmodell (Testseite)', hint: 'Pfeile/WASD fahren, Leertaste Handbremse, Shift Kupplung, Q/E Gang, M manuell, 1/2/3 Arcade/Sport/Sim, T Serie/Drift-Aufbau, C Kamera, N nasse Fläche, R zurück zum Start. Burnout: Bremse halten und Vollgas',
    exercise: 'Übung', wet: 'Nass (N)', ex_circle: 'Kreis', ex_eight: 'Acht', ex_slalom: 'Slalom', ex_hairpin: 'Kehre', ex_sBends: 'S-Kurven', ex_wallBend: 'Wandkurve', ex_wetPad: 'Nasse Fläche', ex_straight: 'Gerade', ex_free: 'Freie Fläche' },
}, params);
const coarse = matchMedia('(pointer: coarse)').matches || params.has('touch');

// ---- the place: the drift academy's map (its walls), the place's look and scene
const [cars] = await Promise.all([fetch('data/cars.json').then((r) => r.json()).then((j) => j.cars)]);
const [json, theme] = await Promise.all([fetch('data/maps/09-academy.json').then((r) => r.json()), fetch('data/scenes/academy.json').then((r) => r.json())]);   // (tools/make-academy.mjs)
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
const placeLook = buildPlaceLook(json, look, stage.env, groundAt, tierName); stage.scene.add(placeLook.group); placeLook.setWet(params.get('wet') !== '0');   // (the shine starts as the grip does: ?wet=0 starts dry)
if (stage.world.road) stage.world.road.visible = false;   // the place draws its own asphalt
buildNature(json, look, groundAt, tierName).then((g) => stage.scene.add(g));   // bushes, grass, flowers, trees and pebbles on the green platform (CC0 models, view/look/nature.js)
for (const m of academy.wet) m.visible = false; academy.group.children.forEach((o) => { if (o.isInstancedMesh) o.visible = false; });
// ?off=sea,props,palms,containers,lamps,shadow,smoke,world: switches parts of the picture off one at a time to find what costs the frame rate (kept for later); `__sim.setOff(key, bool)` does it live
function setOff(k, off) {
  if (k === 'shadow') { stage.renderer.shadowMap.enabled = !off && !!stage.tier.shadows; stage.sun.castShadow = !off && !!stage.tier.shadows; stage.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
  else if (k === 'world') stage.world.group.visible = !off;
  else if (k === 'smoke') stage.smoke.mesh.visible = !off;
  else if (k === 'nature') stage.scene.traverse((o) => { if (o.name === 'place:nature') o.visible = !off; });
  else placeLook.group.traverse((o) => { if (o.name === 'place:' + k) o.visible = !off; });
}
for (const k of (params.get('off') ?? '').split(',').filter(Boolean)) setOff(k, true);
/** The cost of one picture in ms (the render and a wait for the graphics to finish), the smallest of `n` tries: the least disturbed by other work on the machine. */
function frameCost(n = 12) {
  const gl = stage.renderer.getContext(), px = new Uint8Array(4); let best = 1e9;
  for (let i = 0; i < n; i++) { const t0 = performance.now(); stage.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); best = Math.min(best, performance.now() - t0); }
  return best;
}
for (const [x, y, z, size] of placeLook.lampHeads) stage.halos.add(x, y, z, new THREE.Color(look.lamp.light).multiplyScalar((look.lamp.halo ?? 0.55) * (stage.tier.post ? look.lamp.haloPost ?? 0.4 : 1)), size);
const coneField = new ConeField(json.cones, groundAt); stage.scene.add(coneField.mesh);
let cs = newCones(json.cones), wetOn = params.get('wet') !== '0', ready = false;
const minMu = [1, 1, 1, 1];   // the lowest grip each wheel had since the page began (for the checking tool)
const ENV = { ...FLAT, muW: [1, 1, 1, 1] };
const wheelLocal = (fleet.dims?.wheels?.length === 4 ? fleet.dims.wheels.map((w) => [w.x, w.z]) : [[0.8, 1.27], [-0.8, 1.27], [0.8, -1.27], [-0.8, -1.27]]);
const rig = { group: mine.group, pivots: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) => mine.group.getObjectByName(n + '_pivot')), bodyLean: mine.group.getObjectByName('body_lean') };

// ---- the driving (lab-drive-core.js) with this place's own parts: grip zones, cones, marks and smoke, the exercise list
const list = $('simlist');
const toggleWet = () => { wetOn = !wetOn; placeLook.setWet(wetOn); drive.syncChips(); };
function setExercise(n) { exNo = clamp(n, 0, EXERCISES.length - 1); drive.reset(); drive.syncChips(); document.body.classList.remove('list-open'); }
const acc = [0, 0, 0, 0], skidIdx = [0, 1, 2, 3];
function marksAndSmoke(s) {
  const sh = Math.sin(s.h), ch = Math.cos(s.h), g = stage.field.groundY(s.x, s.z), moving = s.speed > 3, S = look.smoke ?? {}, tr = Math.atan2(s.vx, s.vz), push = S.drift ?? 0, out = S.offset ?? 0;
  for (let i = 0; i < 4; i++) {
    const [lx, lz0] = wheelLocal[i], lz = i >= 2 ? lz0 - (S.behind ?? 0) : lz0, px = s.x + lz * sh - lx * ch, pz = s.z + lz * ch + lx * sh;
    stage.skids.mark(skidIdx[i], X(s.x + lz0 * sh - lx * ch), s.z + lz0 * ch + lx * sh, 0, 0, s.sn[i] > 1 && s.slip[i] > 1 && moving, g, 0, 0);
    // smoke by smokeOf(): the rate and the size follow it, nothing at 0. It starts where the look's smoke starts (a little behind and outside the tyre: the smoke keeps a
    // hole round the car, a puff inside it would not show).
    const k = smokeOf(s, drive.car, i);
    acc[i] = k > 0 ? Math.min(acc[i] + k, 1.5) : 0;
    if (acc[i] >= 0.5) {
      acc[i] -= 0.5;
      const slideDir = moving ? tr : s.h;
      stage.smoke.emit(X(px) + X(-Math.cos(slideDir)) * out, (S.height ?? 0.12) + g, pz + Math.sin(slideDir) * out, X(s.vx * (S.throw ?? -0.12) - Math.cos(slideDir) * push), s.vz * (S.throw ?? -0.12) + Math.sin(slideDir) * push, clamp(0.25 + k * 0.75, 0.25, 1));
    }
  }
}
const hooks = {
  beforeStep(s, wheelPts, muW) { gripPerWheel(json.academy.grip, wheelPts, muW, wetOn); for (let i = 0; i < 4; i++) if (muW[i] < minMu[i]) minMu[i] = muW[i]; },
  afterStep(s) { const hit = coneStep(cs, json.cones, s.x, s.z, s.vx, s.vz); if (hit !== cs) { for (const i of hit.event) coneField.fall(i, hit.down[i].dx, hit.down[i].dz, hit.down[i].v); cs = hit; } },
  fixed(s, steps) { stage.smoke.update(1 / 120); if (steps % 2 === 0) marksAndSmoke(s); },
  onReset() { cs = newCones(json.cones); coneField.standAll(); stage.skids.clear(); },
  key(code) { if (code === 'KeyN') { toggleWet(); return true; } return false; },
  rows() { const e = EXERCISES[exNo], n = e.cones[1] - e.cones[0]; return [[t('conesDown'), n ? `${coneField.downCount(e.cones)}/${n}` : '-']]; },
  overrideCamera() { if (!TOP) return false; topView(); return true; },
  afterPlace(d, g) { stage.smoke.car.value.set(X(d.x), g, d.z); },
  syncChips() { if (!ready) return; exButtons.forEach((b, i) => b.setAttribute('aria-pressed', i === exNo)); $('simwet').setAttribute('aria-pressed', wetOn); $('simex').textContent = t('exercise') + ': ' + t('ex_' + EXERCISES[exNo].key); },
};
const drive = createDrive({ params, t, camera, rig, wheelLocal, spawn: () => EXERCISES[exNo].spawn, env: ENV, map, groundAt, cover: stage.field.height ? (x, z) => stage.field.height(x, z) : null, lookCamera: look.camera, soundId: AE?.id ?? 1, hooks });
const exButtons = EXERCISES.map((e, i) => { const b = Object.assign(document.createElement('button'), { type: 'button', textContent: t('ex_' + e.key) }); b.addEventListener('click', () => setExercise(i)); list.append(b); return b; });
if (params.has('list')) document.body.classList.add('list-open');   // (for pictures)
$('simex').addEventListener('click', () => document.body.classList.toggle('list-open'));
$('simwet').addEventListener('click', toggleWet);
ready = true; drive.syncChips();
$('simhint').textContent = t('hint');

// ---- the loop
let probe = null;
function frame(now) {
  const { d, dt } = drive.frame(now);
  coneField.update(dt);
  stage.aimSun(X(d.x), 0, d.z);
  if (innerWidth !== frame.w || innerHeight !== frame.h) { frame.w = innerWidth; frame.h = innerHeight; stage.resize(); }
  stage.smoke.sync?.();   // the puffs' buffers to the graphics card (the stage does not do it itself)
  stage.render();
  if (probe) { const s = drive.s; mine.group.updateMatrixWorld(true); camera.updateMatrixWorld(); const nose = new THREE.Vector3(0, 0, 1).transformDirection(mine.group.matrixWorld), fwd = camera.getWorldDirection(new THREE.Vector3());
    probe.push([...new THREE.Vector3().setFromMatrixPosition(mine.group.matrixWorld).applyMatrix4(camera.matrixWorldInverse).toArray(), fwd.x, fwd.y, fwd.z, (Math.atan2(nose.x * fwd.z - nose.z * fwd.x, nose.x * fwd.x + nose.z * fwd.z) * 180) / Math.PI, (s.beta * 180) / Math.PI, s.speed]); }
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
window.__sim = { setOff, frameCost, get exNo() { return exNo; }, setExercise, toggleWet, get wetOn() { return wetOn; }, get muW() { return ENV.muW; }, minMu, get cones() { return cs; }, coneField, cycleCam: drive.cycleCam, setCam: drive.setCam, get camNo() { return drive.camNo; }, camera, startProbe() { probe = []; }, stopProbe() { const p = probe; probe = null; return p; }, carRect, get drawn() { return drive.drawn; }, camPose() { const v = new THREE.Vector3(); v.setFromMatrixPosition(mine.group.matrixWorld); camera.updateMatrixWorld(); return v.applyMatrix4(camera.matrixWorldInverse).toArray(); }, get state() { return drive.s; }, get frames() { return drive.frames; }, get mode() { return drive.mode; }, held: drive.held, reset: drive.reset, setMode: drive.setMode, toggleCar: drive.toggleCar, toggleManual: drive.toggleManual, stage, camera };
