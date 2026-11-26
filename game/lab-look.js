// The environment editor (development only): the training place with the AE86 standing on it, a free orbit camera and five fixed places, and a panel of sliders that change the
// loaded look live (lab-look-schema.js lists them). Export / Import as JSON (the look file's format, to put into data/looks/academy-sunset.json), Reset, a read-out of the frame.
// A change reaches the picture the cheapest way it can: lights, fog, exposure and the after-pass at once; the place's colours build the place again; sky and smoke build the stage
// again (`stage.load`), both debounced. `?tier=high|medium|low` (default high: the low tier has no after-pass, so the grade sliders do nothing there), `?lang=de|en`.
import * as THREE from '../vendor/three/three.module.js';
import { createStage, loadLook } from './view/look/stage.js';
import { sceneFromMap } from './view/look/mapscene.js';
import { sunDirection } from './view/look/sky.js';
import { Fleet } from './view/look/fleet.js';
import { buildPlace, ConeField } from './view/academy.js';
import { buildPlaceLook } from './view/look/place.js';
import { buildNature } from './view/look/nature.js';
import { X, HEAD } from './view/space.js';
import { GROUPS, SLIDERS, getPath, setPath, anglesOf, dirOf } from './lab-look-schema.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const LANG = (params.get('lang') ?? navigator.language ?? '').startsWith('de') ? 'de' : 'en', L = LANG === 'de' ? 0 : 1;
const TEXT = {
  en: { title: 'Drift: look editor (development)', export: 'Export', import: 'Import', reset: 'Reset', smoke: 'Smoke', wet: 'Wet pad', fold: 'Panel', hint: 'Export shows the look as JSON here (and downloads it). Paste JSON and press Import.', bad: 'That is not a look file.', done: 'done',
    circle: 'Circle', hairpin: 'Hairpin', straight: 'Straight', wetPad: 'Wet pad', above: 'From above', orbit: 'Drag: turn, wheel or two fingers: zoom, right button or two fingers: move' },
  de: { title: 'Drift: Umgebungs-Editor (Entwicklung)', export: 'Export', import: 'Import', reset: 'Zurücksetzen', smoke: 'Rauch', wet: 'Nasse Fläche', fold: 'Panel', hint: 'Export zeigt den Look hier als JSON (und lädt ihn herunter). JSON einfügen und Import drücken.', bad: 'Das ist keine Look-Datei.', done: 'fertig',
    circle: 'Kreis', hairpin: 'Kehre', straight: 'Gerade', wetPad: 'Nasse Fläche', above: 'Von oben', orbit: 'Ziehen: drehen, Rad oder zwei Finger: zoomen, rechte Taste oder zwei Finger: verschieben' },
}[LANG];
document.documentElement.lang = LANG; document.title = TEXT.title;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- the stage: the place's map and scene, the look from its file
const [json, theme, cars] = await Promise.all([fetch('data/maps/09-academy.json').then((r) => r.json()), fetch('data/scenes/academy.json').then((r) => r.json()), fetch('data/cars.json').then((r) => r.json()).then((j) => j.cars)]);
const look = await loadLook(theme.look), scene0 = sceneFromMap(json, theme);
const tierName = ['high', 'medium', 'low'].includes(params.get('tier')) ? params.get('tier') : 'high';
const stage = createStage({ canvas: $('view'), look, scene0, tierName });
const { camera, renderer } = stage;
const groundAt = (x, z) => stage.field.groundY(x, z);
const AE = cars.find((c) => c.model === 'ae86') ?? cars[1];
const fleet = await new Fleet(stage, { model: 'ae86', fx: AE?.fx }).load();
const car = fleet.spawn(new THREE.Color('#d8d4cc'));
stage.scene.add(car.group);
const plain = buildPlace(json, groundAt); stage.scene.add(plain.group);   // the paint and zones as plain shapes (the place's own look replaces the blocks and the wet sheet)
for (const m of plain.wet) m.visible = false; plain.group.children.forEach((o) => { if (o.isInstancedMesh) o.visible = false; });
const cones = new ConeField(json.cones, groundAt); stage.scene.add(cones.mesh);
let wetOn = true, placeLook = null;
buildNature(json, look, groundAt, tierName).then((g) => stage.scene.add(g));   // the models of the kit on the green platform
const key2 = () => stage.scene.children.find((o) => o.isDirectionalLight && o !== stage.sun);

// ---- applying a change
function applyLight() {
  stage.sunDir = sunDirection(look); stage.sun.color.set(look.sun.colour); stage.sun.intensity = look.sun.intensity;
  stage.hemi.color.set(look.fill.sky); stage.hemi.groundColor.set(look.fill.ground); stage.hemi.intensity = look.fill.intensity;
  const k = look.key2, k2 = key2();
  if (k2) { k2.intensity = k?.intensity ?? 0; if (k) { k2.color.set(k.colour); k2.position.set(-k.dir[0] * 100, k.dir[1] * 100, k.dir[2] * 100); } }
  stage.scene.fog.color.set(look.fog.colour); stage.scene.fog.near = look.fog.near; stage.scene.fog.far = look.fog.far; stage.scene.background.set(look.fog.colour);
  renderer.toneMappingExposure = look.grade.exposure;
}
function applyGrade() {
  const p = stage.post; if (!p) return;
  p.setGrade(look.grade);
  const f = p.final.uniforms; f.uContrast.value = look.grade.contrast ?? 1; f.uLift.value.set(look.grade.lift ?? '#000000'); f.uGrain.value = look.grade.grain ?? 0;
}
function disposeTree(o) { o.traverse((c) => { c.geometry?.dispose?.(); for (const m of [].concat(c.material ?? [])) m.dispose?.(); }); }
function rebuildPlace() {
  if (placeLook) { stage.scene.remove(placeLook.group); disposeTree(placeLook.group); }
  placeLook = buildPlaceLook(json, look, stage.env, groundAt, tierName); stage.scene.add(placeLook.group); placeLook.setWet(wetOn);
}
function rebuildStage() {
  stage.load(look, scene0);
  if (stage.world.road) stage.world.road.visible = false;   // the place draws its own asphalt
  rebuildPlace(); applyGrade(); applyLight();
  for (const [x, y, z, size] of placeLook.lampHeads) stage.halos.add(x, y, z, new THREE.Color(look.lamp.light).multiplyScalar((look.lamp.halo ?? 0.55) * (stage.tier.post ? look.lamp.haloPost ?? 0.4 : 1)), size);
  stage.reflect(car.group); placeCar(placeNo);
}
const timers = {};
const later = (kind, fn) => { clearTimeout(timers[kind]); timers[kind] = setTimeout(() => { timers[kind] = null; fn(); }, 180); };
function apply(how) {
  for (const k of how.split('+')) {
    if (k === 'light') applyLight(); else if (k === 'grade') applyGrade();
    else if (k === 'place') { if (!timers.stage) later('place', rebuildPlace); }
    else if (k === 'stage') { clearTimeout(timers.place); timers.place = null; later('stage', rebuildStage); }
  }
}

// ---- the panel
const rows = [], dirs = {};
const panel = $('sliders');
for (const g of GROUPS) {
  const d = Object.assign(document.createElement('details'), { open: g.id === 'sun' }), sm = Object.assign(document.createElement('summary'), { textContent: g.label[L] });
  d.append(sm);
  for (const s of SLIDERS.filter((x) => x.g === g.id)) {
    const row = document.createElement('div'), lab = Object.assign(document.createElement('label'), { textContent: s.label[L] }), out = document.createElement('output');
    row.className = 'row';
    const input = document.createElement('input'); input.id = `s-${s.path}-${s.t}`; lab.htmlFor = input.id;
    if (s.t === 'colour') { input.type = 'color'; row.append(lab, input); }
    else { Object.assign(input, { type: 'range', min: s.min, max: s.max, step: s.step }); row.append(lab, input, out); }
    input.addEventListener('input', () => {
      if (s.t === 'colour') setPath(look, s.path, input.value);
      else if (s.t === 'num') { setPath(look, s.path, +input.value); out.textContent = (+input.value).toFixed(s.step < 0.1 ? 2 : s.step < 1 ? 1 : 0); }
      else { const dd = dirs[s.path] ??= anglesOf(getPath(look, s.path)); dd[s.t] = +input.value; setPath(look, s.path, dirOf(dd.az, dd.el)); out.textContent = `${Math.round(+input.value)}°`; }
      apply(s.apply);
    });
    rows.push({ s, input, out }); d.append(row);
  }
  panel.append(d);
}
function syncSliders() {
  for (const k in dirs) delete dirs[k];
  for (const { s, input, out } of rows) {
    const v = getPath(look, s.path);
    if (s.t === 'colour') input.value = v;
    else if (s.t === 'num') { input.value = v; out.textContent = v.toFixed(s.step < 0.1 ? 2 : s.step < 1 ? 1 : 0); }
    else { const a = anglesOf(v); input.value = a[s.t]; out.textContent = `${Math.round(a[s.t])}°`; }
  }
}
const text = $('labjson'); text.placeholder = TEXT.hint;
for (const [id, k] of [['b-export', 'export'], ['b-import', 'import'], ['b-reset', 'reset'], ['b-smoke', 'smoke'], ['b-wet', 'wet'], ['fold', 'fold']]) $(id).textContent = TEXT[k];
$('fold').addEventListener('click', () => document.body.classList.toggle('folded'));
function takeLook(next) { for (const k of Object.keys(look)) delete look[k]; Object.assign(look, next); syncSliders(); rebuildStage(); }
$('b-export').addEventListener('click', () => {
  const s = JSON.stringify(look, null, 1); text.value = s;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([s], { type: 'application/json' })), download: 'academy-sunset.json' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('b-import').addEventListener('click', () => {
  try { const j = JSON.parse(text.value); if (!j?.sky || !j.sun || !j.tiers || !j.grade) throw new Error('not a look'); takeLook(j); } catch { text.value = TEXT.bad; }
});
$('b-reset').addEventListener('click', async () => takeLook(await loadLook(theme.look)));
let smokeOn = false;
$('b-smoke').addEventListener('click', () => { smokeOn = !smokeOn; $('b-smoke').setAttribute('aria-pressed', smokeOn); });
$('b-wet').setAttribute('aria-pressed', wetOn);
$('b-wet').addEventListener('click', () => { wetOn = !wetOn; placeLook.setWet(wetOn); $('b-wet').setAttribute('aria-pressed', wetOn); });

// ---- the car and the places
const PLACES = [['circle', 'circle'], ['hairpin', 'hairpin'], ['straight', 'straight'], ['wetPad', 'wetPad'], ['above', null]];
const spawnOf = (key) => json.academy.exercises.find((e) => e.key === key)?.spawn ?? { x: 0, z: 0, h: 0 };
let placeNo = 0, carAt = spawnOf('circle');
function placeCar(n) {
  const [, ex] = PLACES[n]; carAt = spawnOf(ex ?? 'circle');
  car.group.position.set(X(carAt.x), groundAt(carAt.x, carAt.z), carAt.z); car.group.rotation.set(0, HEAD(carAt.h), 0, 'YXZ'); car.group.updateMatrix();
}
// the orbit camera: a target, two angles and a distance (drawing axes: x mirrored)
const orbit = { tx: 0, ty: 0.9, tz: 0, az: 0, el: 0.14, dist: 7, fov: 52 };
function goTo(n) {
  placeNo = n; placeCar(n); const [, ex] = PLACES[n];
  if (ex) Object.assign(orbit, { tx: X(carAt.x), ty: 0.9, tz: carAt.z, az: Math.PI - carAt.h + 0.55, el: 0.14, dist: 7, fov: 52 });
  else Object.assign(orbit, { tx: 0, ty: 0, tz: 0, az: Math.PI, el: 1.5, dist: 330, fov: 40 });
  places.forEach((b, i) => b.setAttribute('aria-pressed', i === n));
}
const places = PLACES.map(([name], i) => { const b = Object.assign(document.createElement('button'), { type: 'button', className: 'chip', textContent: TEXT[name], title: TEXT.orbit }); b.addEventListener('click', () => goTo(i)); $('places').append(b); return b; });
const ptr = new Map();
const cv = $('view');
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button }); });
cv.addEventListener('pointerup', (e) => ptr.delete(e.pointerId)); cv.addEventListener('pointercancel', (e) => ptr.delete(e.pointerId));
function pan(dx, dy) {   // moves the target along the camera's right and up
  const k = orbit.dist * 0.0016, rx = Math.cos(orbit.az), rz = -Math.sin(orbit.az);
  orbit.tx -= rx * dx * k; orbit.tz -= rz * dx * k; orbit.ty = clamp(orbit.ty + dy * k, -2, 60);
}
cv.addEventListener('pointermove', (e) => {
  const p = ptr.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  if (ptr.size === 2) {
    const [a, b] = [...ptr.values()], before = Math.hypot(a.x - b.x, a.y - b.y); p.x = e.clientX; p.y = e.clientY;
    const after = Math.hypot(a.x - b.x, a.y - b.y); orbit.dist = clamp(orbit.dist * (before / Math.max(1, after)), 2, 600); pan(dx / 2, dy / 2);
  } else if (p.b === 2 || e.shiftKey) { pan(dx, dy); p.x = e.clientX; p.y = e.clientY; }
  else { orbit.az -= dx * 0.006; orbit.el = clamp(orbit.el + dy * 0.006, -0.05, 1.53); p.x = e.clientX; p.y = e.clientY; }
});
cv.addEventListener('wheel', (e) => { e.preventDefault(); orbit.dist = clamp(orbit.dist * Math.exp(e.deltaY * 0.0012), 2, 600); }, { passive: false });
function placeCamera() {
  const c = Math.cos(orbit.el);
  camera.up.set(0, 1, 0);
  camera.position.set(orbit.tx + orbit.dist * c * Math.sin(orbit.az), orbit.ty + orbit.dist * Math.sin(orbit.el), orbit.tz + orbit.dist * c * Math.cos(orbit.az));
  camera.lookAt(orbit.tx, orbit.ty, orbit.tz);
  if (camera.fov !== orbit.fov) { camera.fov = orbit.fov; camera.updateProjectionMatrix(); }
}

// ---- the loop
rebuildStage(); syncSliders(); goTo(+(params.get('place') ?? 0) || 0);
let last = performance.now(), avg = 16, frames = 0, shown = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; avg += (dt * 1000 - avg) * 0.08; frames++;
  if (smokeOn && frames % 2 === 0) {
    const sh = Math.sin(carAt.h), ch = Math.cos(carAt.h), g = groundAt(carAt.x, carAt.z);
    for (const lx of [0.8, -0.8]) {
      const px = carAt.x + -1.5 * sh - lx * ch, pz = carAt.z + -1.5 * ch + lx * sh;
      stage.smoke.emit(X(px), 0.12 + g, pz, X(-sh * 1.5 + ch * 3.2), -ch * 1.5 - sh * 3.2, 1);   // out of the rear wheels, drifting to the side
    }
  }
  stage.smoke.car.value.set(X(carAt.x), groundAt(carAt.x, carAt.z), carAt.z);
  stage.smoke.update(dt); stage.smoke.sync?.();
  placeCamera(); stage.aimSun(orbit.tx, 0, orbit.tz);
  if (innerWidth !== frame.w || innerHeight !== frame.h) { frame.w = innerWidth; frame.h = innerHeight; stage.resize(); }
  stage.render();
  if (now - shown > 500) { shown = now; const r = renderer.info.render; $('labstats').textContent = `${avg.toFixed(1)} ms · ${r.calls} calls · ${(r.triangles / 1000).toFixed(0)}k tri`; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// for the checking tools
window.__look = { look, stage, orbit, goTo, apply, rebuildStage, takeLook, syncSliders, get frames() { return frames; }, setSmoke(v) { smokeOn = v; }, exportText: () => JSON.stringify(look, null, 1) };
