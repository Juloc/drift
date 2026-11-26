// The car on the surface, measured on a test drive (Node, no browser): a sample road from game/sim/track.js (two hairpins, grades up to the limit, banked
// bends), driven by the line bot (throws the tail out in the bends) with the game's flat physics; every frame the chassis is settled on the surface
// (game/sim/carpose.js) and measured against the limits of the design (DESIGN-PHYSIK-STRECKE.md 4.2).
// Usage: node tools/posecheck.mjs [car id = 1] [fps = 60]   Prints one JSON line; exit 1 when a limit is broken.
import { readFileSync } from 'node:fs';
import { buildTrack, surfaceAt, checkTrack } from '../game/sim/track.js';
import { step, makeCar, bodySlip, bodyVelocity, speedOf, DT } from '../game/sim/physics.js';
import { lineBot } from '../game/sim/linebot.js';
import { makePose, settle, wheelGaps, wheelPoints } from '../game/sim/carpose.js';

/** The sample road: out of a plaza, down a run, a left hairpin, a run back, a right hairpin, a last run; about 30 m lower at the end. */
export function sampleTrack() {
  const ctrl = [{ x: 0, z: 0, y: 60 }, { x: 0, z: 40 }, { x: 0, z: 160, y: 50 }];
  for (let a = 1; a <= 8; a++) { const t = (a / 8) * Math.PI; ctrl.push({ x: -22 + 22 * Math.cos(t), z: 160 + 22 * Math.sin(t) }); }
  ctrl.push({ x: -44, z: 60, y: 41 }, { x: -44, z: 20 });
  for (let a = 1; a <= 8; a++) { const t = (a / 8) * Math.PI; ctrl.push({ x: -66 + 22 * Math.cos(t), z: 20 - 22 * Math.sin(t) }); }
  ctrl.push({ x: -88, z: 100 }, { x: -88, z: 200, y: 30 });
  return buildTrack({ ctrl, plaza: { pts: [[-20, -30], [20, -30], [20, 0], [-20, 0]] } });
}

/** Drives the sample road once and returns the worst numbers. */
export function poseDrive({ carIndex = 1, fps = 60, T = sampleTrack(), dims = { wheelX: 0.70, wheelZ: 1.19, wheelZF: 1.21 }, botOpts = { speed: 22, corner: 11 } } = {}) {
  const cars = JSON.parse(readFileSync(new URL('../game/data/cars.json', import.meta.url), 'utf8')).cars, car = cars.find((c) => c.id === carIndex) ?? cars[0];
  const pts = Array.from({ length: T.n }, (_, i) => [T.x[i], T.z[i]]);
  const bot = lineBot(pts, { closed: false, kick: 0.25, look: 14, hold: 0.55, ...botOpts });
  const surf = (x, z, o) => surfaceAt(T, x, z, o), W = wheelPoints(dims), pose = makePose();
  let s = makeCar(T.x[2], T.z[2], Math.atan2(T.x[3] - T.x[2], T.z[3] - T.z[2])), t = 0;
  const per = Math.round(1 / fps / DT), dt = per * DT, worst = { gap: 0, gapAt: 0, pitchRate: 0, rollRate: 0, step: 0, slip: 0, pitch: 0, roll: 0, off: 0 };
  let last = null, frames = 0;
  while (t < 90) {
    for (let k = 0; k < per; k++) { s = step(s, bot(t, s, DT), car); t += DT; }
    const vf = bodyVelocity(s).vf;
    settle(pose, surf, s.x, s.z, s.h, W, dt, { ax: s.ax, side: s.w * vf });
    frames++;
    const g = Math.max(...wheelGaps(pose, surf, W).map(Math.abs)), at = surfaceAt(T, s.x, s.z);
    if (g > worst.gap) { worst.gap = g; worst.gapAt = Math.round(at.s); }
    if (at.kind !== 'road') worst.off++;
    worst.pitchRate = Math.max(worst.pitchRate, Math.abs(pose.rate[0])); worst.rollRate = Math.max(worst.rollRate, Math.abs(pose.rate[1]));
    worst.pitch = Math.max(worst.pitch, Math.abs(pose.pitch)); worst.roll = Math.max(worst.roll, Math.abs(pose.roll));
    worst.slip = Math.max(worst.slip, Math.abs(bodySlip(s)));
    if (last) { const d = Math.hypot(s.x - last.x, s.z - last.z); worst.step = Math.max(worst.step, Math.abs(pose.y - last.y) - (0.13 * d + 0.001)); }
    last = { x: s.x, z: s.z, y: pose.y };
    if (at.s > T.len - 15) break;
  }
  const deg = (r) => +((r * 180) / Math.PI).toFixed(1);
  return { car: car.name, fps, bot: botOpts, track: { len: Math.round(T.len), drop: +(T.y[0] - T.y[T.n - 1]).toFixed(1), ok: checkTrack(T).ok }, seconds: +t.toFixed(1), frames,
    endS: Math.round(surfaceAt(T, s.x, s.z).s), kmhEnd: Math.round(speedOf(s) * 3.6), maxSlipDeg: deg(worst.slip),
    wheelGapCm: +(worst.gap * 100).toFixed(2), wheelGapAtS: worst.gapAt, pitchRateDegS: deg(worst.pitchRate), rollRateDegS: deg(worst.rollRate),
    maxPitchDeg: deg(worst.pitch), maxRollDeg: deg(worst.roll), heightStepOverMm: +(Math.max(0, worst.step) * 1000).toFixed(2), framesOffRoad: worst.off };
}

export const LIMITS = { wheelGapCm: 3, pitchRateDegS: 40, rollRateDegS: 40, heightStepOverMm: 0 };

/**
 * The drive for one car with the touge's bot numbers, slower when the bot leaves the road with that car: the sample road has no walls, and off it the surface
 * is the land's (the height of the nearest branch's edge), which is not what is checked here.
 */
export function poseDriveOnRoad(o = {}) {
  let r;
  for (const botOpts of [{ speed: 22, corner: 11 }, { speed: 20, corner: 9 }, { speed: 18, corner: 8 }, { speed: 16, corner: 7 }]) { r = poseDrive({ ...o, botOpts }); if (!r.framesOffRoad) break; }
  return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = poseDriveOnRoad({ carIndex: +(process.argv[2] ?? 1), fps: +(process.argv[3] ?? 60) });
  const broken = Object.entries(LIMITS).filter(([k, v]) => r[k] > v).map(([k]) => k);
  console.log(JSON.stringify({ ...r, broken }));
  process.exit(broken.length ? 1 : 0);
}
