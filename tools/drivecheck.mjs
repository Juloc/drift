// The test drive (design: DESIGN-PHYSIK-STRECKE.md 4.2): in Node with the pure simulation, two drivers go down the whole road of a map with every car, on the model the
// game drives with the hills switched on (physics.js on the road's surface): a clean one and one that drifts every hairpin (game/sim/trackbot.js). Every step is
// measured: wall contacts, the angle in each hairpin, the wheel load, the height against the surface, the car's four wheel points and how fast the body pitches and
// rolls (game/sim/carpose.js), and the chase camera riding along (game/view/camera.js with a camera that is only numbers): how hard it moves up and down, how fast it
// tilts, how close it comes to the road. Prints a table, writes docs/screenshots/drivecheck/<map>.txt, exits with 1 when a limit is broken.
// Usage: node tools/drivecheck.mjs [game/data/maps/06-touge.json] [--cars=0,1,2,3,4] [--out=docs/screenshots/drivecheck]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { step, makeCar, speedOf, bodySlip, bodyVelocity, DT } from '../game/sim/physics.js';
import { prepareMap, surfaceAt as groundAt, SURFACES } from '../game/sim/map.js';
import { collideBody } from '../game/sim/collision.js';
import { surfaceAt } from '../game/sim/track.js';
import { trackBot, hairpinsOf } from '../game/sim/trackbot.js';
import { makePose, settle, wheelGaps, wheelPoints } from '../game/sim/carpose.js';
import { LookChase } from '../game/view/camera.js';
import { sceneFromMap } from '../game/view/look/mapscene.js';
import { makeField } from '../game/view/look/field.js';

export const LIMITS = { hits: 0, minDriftDeg: 20, loadClean: [0.6, 1.5], loadDrift: [0.4, 1.8], heightStepMm: 0, wheelGapCm: 3, bodyRateDegS: 40, camAccel: 4, camPitchDegS: 25, camClearance: 0.8, blockedShare: 0 };
const deg = (r) => (r * 180) / Math.PI;

/** One drive: `drift` or clean, one car. Returns the worst numbers. */
/** `orbit`: the player has turned the camera round the car by this many radians (the line-of-sight check with the camera turned towards the hill). */
export function drive(map, car, { drift = true, fps = 60, look = null, orbit = 0, cover = null } = {}) {
  const T = map.surface, surf = (x, z, o) => surfaceAt(T, x, z, o), pins = hairpinsOf(T), bot = trackBot(T, { drift, car, mu: SURFACES[map.road?.kind]?.mu ?? 1 }), g = map.grid[0];
  const W = wheelPoints({ wheelX: 0.70, wheelZ: 1.19, wheelZF: 1.21 }), pose = makePose(), q = {};
  // the chase camera with a camera that only keeps numbers (three.js is not needed to know where it is and where it looks)
  const cam = { position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, at: [0, 0, 0], lookAt(x, y, z) { this.at = [x, y, z]; }, fov: 52, updateProjectionMatrix() {} };
  const chase = new LookChase(cam, look ?? { side: 0, look: 14, lookY: 0.5, travel: 0.6, fov: 52, turn: 8, swing: 3, turnDrift: -24 }, (x, z) => surf(x, z, {}).y);
  if (cover) chase.cover = cover; chase.user.yaw = orbit; chase.user.auto = false;
  let s = makeCar(g.x, g.z, g.h), t = 0, hits = 0, lastHit = -9, frames = 0;
  const per = Math.round(1 / fps / DT), dt = per * DT, pin = pins.map(() => 0);
  const w = { load: [9, 0], step: 0, gap: 0, pitchRate: 0, rollRate: 0, camAccel: 0, camPitchRate: 0, camClear: 9, maxKmh: 0, blocked: 0, seen: 0 };
  let prev = null, camY = [], camPitch = null, far = 0;
  chase.snap(s);
  while (t < 400) {
    for (let k = 0; k < per; k++) {
      const before = s; s = collideBody(map, step(s, bot(t, s), car, groundAt(map, s.x, s.z).mu, DT, surf)); t += DT;
      if (s.hit > 1 && t - lastHit > 0.5) { hits++; lastHit = t; }
      w.load[0] = Math.min(w.load[0], s.nLoad); w.load[1] = Math.max(w.load[1], s.nLoad);
      if (before.y !== undefined) w.step = Math.max(w.step, Math.abs(surf(s.x, s.z, {}).y - before.y) - (0.13 * Math.hypot(s.x - before.x, s.z - before.z) + 0.001));
    }
    frames++;
    surfaceAt(T, s.x, s.z, q); w.maxKmh = Math.max(w.maxKmh, speedOf(s) * 3.6);
    for (let i = 0; i < pins.length; i++) if (q.s > pins[i].from - 5 && q.s < pins[i].to + 5) pin[i] = Math.max(pin[i], deg(Math.abs(bodySlip(s))));
    // the car's body on its four wheel points
    settle(pose, surf, s.x, s.z, s.h, W, dt, { ax: s.ax, side: s.w * bodyVelocity(s).vf });
    if (frames > 30 && t - lastHit > 1) { w.gap = Math.max(w.gap, ...wheelGaps(pose, surf, W).map(Math.abs)); w.pitchRate = Math.max(w.pitchRate, Math.abs(pose.rate[0])); w.rollRate = Math.max(w.rollRate, Math.abs(pose.rate[1])); }
    // the camera
    chase.update(s, car.top, dt);
    const c = cam.position, dxz = Math.hypot(cam.at[0] - c.x, cam.at[2] - c.z), pitch = Math.atan2(cam.at[1] - c.y, dxz);
    camY.push(c.y); if (camY.length > 13) camY.shift();
    if (camY.length === 13 && frames > 60) {   // the vertical acceleration as a mean over 0.1 s: from three heights 0.1 s apart
      const a = (camY[12] - 2 * camY[6] + camY[0]) / (6 * dt) ** 2; w.camAccel = Math.max(w.camAccel, Math.abs(a));
    }
    if (camPitch !== null && frames > 60) w.camPitchRate = Math.max(w.camPitchRate, Math.abs(pitch - camPitch) / dt);
    camPitch = pitch;
    // the line of sight from the camera to the car (1 m above the road): blocked when the land is over it at one of 8 points (0.3 m clearance; the camera itself uses 0.6)
    if (cover && frames > 60) { let hit = false; for (let i = 1; i <= 8 && !hit; i++) { const t = i / 9, x = -c.x + (s.x + c.x) * t, z = c.z + (s.z - c.z) * t, y = c.y + (surf(s.x, s.z, {}).y + 1 - c.y) * t; if (cover(x, z) + 0.3 > y) hit = true; } w.seen++; if (hit) w.blocked++; }
    w.camClear = Math.min(w.camClear, c.y - surf(-c.x, c.z, {}).y);   // (the view's x is the simulation's mirrored: view/space.js)
    far = Math.max(far, q.s);
    if (q.s > T.len - 12 || (q.kind === 'plaza' && far > T.len - 60)) break;   // (a road that comes home into its plaza ends at the plaza's edge: inside it there is no distance along the road)
  }
  return { car: car.name, driver: drift ? 'drift' : 'clean', seconds: +t.toFixed(1), finished: q.s > T.len - 12 || (q.kind === 'plaza' && far > T.len - 60), hits, maxKmh: Math.round(w.maxKmh), pins: pin.map((p) => Math.round(p)), load: w.load.map((v) => +v.toFixed(2)),
    heightStepMm: +(Math.max(0, w.step) * 1000).toFixed(1), wheelGapCm: +(w.gap * 100).toFixed(2), pitchRate: +deg(w.pitchRate).toFixed(1), rollRate: +deg(w.rollRate).toFixed(1),
    camAccel: +w.camAccel.toFixed(2), camPitchRate: +deg(w.camPitchRate).toFixed(1), camClear: +w.camClear.toFixed(2), blocked: w.seen ? +(w.blocked / w.seen).toFixed(4) : 0 };
}

/** What a drive breaks: a list of texts (empty = fine). The Ox does not have to drift (heavy, little power: it slides on the handbrake only). */
export function broken(r) {
  const L = LIMITS, b = [], load = r.driver === 'drift' ? L.loadDrift : L.loadClean;
  if (!r.finished) b.push('did not reach the end');
  if (r.hits > L.hits) b.push(`${r.hits} wall contact${r.hits > 1 ? 's' : ''}`);
  if (r.driver === 'drift' && r.car !== 'Ox' && Math.min(...r.pins) < L.minDriftDeg) b.push(`a hairpin with only ${Math.min(...r.pins)} degrees of drift`);
  if (r.load[0] < load[0] || r.load[1] > load[1]) b.push(`wheel load ${r.load[0]} to ${r.load[1]} g`);
  if (r.heightStepMm > L.heightStepMm) b.push(`the height jumps by ${r.heightStepMm} mm more than 13 % of the way`);
  if (r.wheelGapCm > L.wheelGapCm) b.push(`a wheel ${r.wheelGapCm} cm off the surface`);
  if (Math.max(r.pitchRate, r.rollRate) > L.bodyRateDegS) b.push(`the body turns ${Math.max(r.pitchRate, r.rollRate)} degrees a second`);
  if (r.camAccel > L.camAccel) b.push(`the camera moves up and down with ${r.camAccel} m/s^2`);
  if (r.camPitchRate > L.camPitchDegS) b.push(`the camera tilts ${r.camPitchRate} degrees a second`);
  if (r.blocked > L.blockedShare) b.push(`the camera cannot see the car in ${(r.blocked * 100).toFixed(1)} % of the pictures`);
  if (r.camClear < L.camClearance) b.push(`the camera comes within ${r.camClear} m of the road`);
  return b;
}

if (process.argv[1]?.endsWith('drivecheck.mjs')) {
  const args = process.argv.slice(2), file = args.find((a) => !a.startsWith('--')) ?? 'game/data/maps/06-touge.json', opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
  const out = opt.out ?? 'docs/screenshots/drivecheck', json = JSON.parse(readFileSync(file, 'utf8')), map = prepareMap(json), cars = JSON.parse(readFileSync('game/data/cars.json', 'utf8')).cars;
  if (!map.surface) { console.log(`${file}: no road of the track system, nothing to drive`); process.exit(0); }
  const look = JSON.parse(readFileSync('game/data/looks/touge-dusk.json', 'utf8')).camera;
  // the land the camera must see over: the look's drawn terrain of this map (view/look/field.js `height`), as in the game
  const sceneName = basename(file, '.json').replace(/^\d+-/, ''), themeFile = `game/data/scenes/${sceneName === 'autumn-course' ? 'autumn' : sceneName}.json`;
  let cover = null; try { cover = makeField(sceneFromMap(json, JSON.parse(readFileSync(themeFile, 'utf8'))), { cell: 8 }).height; } catch { /* no scene: the road's own height only */ }
  const rows = [], lines = [`drive check: ${json.name} (${file}), ${map.surface.len.toFixed(0)} m, ${hairpinsOf(map.surface).length} hairpins, the model on the surface`];
  let fail = false;
  for (const id of (opt.cars ?? '0,1,2,3,4').split(',').map(Number)) for (const drift of [false, true]) {
    const r = drive(map, cars[id], { drift, look, cover }), b = broken(r); rows.push(r); if (b.length) fail = true;
    lines.push(`${b.length ? 'BROKEN' : 'ok    '} ${r.car.padEnd(6)} ${r.driver.padEnd(5)} ${String(r.seconds).padStart(5)} s, top ${r.maxKmh} km/h, hits ${r.hits}, hairpins ${r.pins.join(' ')} deg, load ${r.load[0]}-${r.load[1]} g, wheels ${r.wheelGapCm} cm, body ${r.pitchRate}/${r.rollRate} deg/s, camera ${r.camAccel} m/s^2 sees the car ${((1 - r.blocked) * 100).toFixed(1)} % ${r.camPitchRate} deg/s clear ${r.camClear} m${b.length ? '  <- ' + b.join('; ') : ''}`);
  }
  // the camera turned by the player 90 degrees to either side (into the hill on one of them): the line of sight must hold too (the drift driver, two cars)
  if (cover) for (const orbit of [Math.PI / 2, -Math.PI / 2]) for (const id of [0, 1]) {
    const r = drive(map, cars[id], { drift: true, look, cover, orbit }), b = broken(r).filter((t) => /see the car|within/.test(t)); if (b.length) fail = true;
    lines.push(`${b.length ? 'BROKEN' : 'ok    '} ${r.car.padEnd(6)} camera turned ${orbit > 0 ? '+' : '-'}90 degrees: sees the car ${((1 - r.blocked) * 100).toFixed(1)} %, camera ${r.camClear} m above the road at the lowest${b.length ? '  <- ' + b.join('; ') : ''}`);
  }
  lines.push(fail ? 'DRIVE CHECK FAILED' : 'drive check passed');
  mkdirSync(out, { recursive: true }); writeFileSync(`${out}/${basename(file, '.json').replace(/^\d+-/, '')}.txt`, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  process.exit(fail ? 1 : 0);
}
