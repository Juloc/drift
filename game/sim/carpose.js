// The car standing on the road's surface (design: drift-mockups/DESIGN-PHYSIK-STRECKE.md, slice 4): the chassis rests on its four wheel points, its pitch and roll
// come from the surface under them (gently damped, with a limit on how fast they turn), its height puts the wheels on the surface. The body's own motion from the
// forces (diving when braking, leaning in a bend) is kept apart (`dive`, `lean`): it tilts the body, never the wheels, so the wheels stay on the road.
// Pure and without three.js: the game, the other drivers and the checking tools in Node use the same numbers.
//
// Axes are the simulation's: x and z on the plan, forward = (sin h, cos h), right = (cos h, -sin h). Wheel points are given in the MODEL's axes (x to the left,
// z forwards, as docs/CAR-MODELS.md and fleet.dims): [front-left, front-right, rear-left, rear-right], each [x, z].
// `surface(x, z, out)` fills out.y and out.gx, out.gz (the gradient); track.js's surfaceAt does, and `heightSurface` makes one from a height function.
// The pose's angles: `pitch` nose up, `roll` the left side up (radians). For three.js (order 'YXZ'): rotation.x = -pitch, rotation.z = roll.

/** The four wheel points from fleet.dims (the model's tyres when known, else the older two numbers). */
export function wheelPoints(dims) {
  if (dims?.wheels?.length === 4) return dims.wheels.map((w) => [w.x, w.z]);
  const x = dims?.wheelX ?? 0.8, zr = -(dims?.wheelZ ?? 1.27), zf = dims?.wheelZF ?? -zr;
  return [[x, zf], [-x, zf], [x, zr], [-x, zr]];
}

/** A surface from a height function alone (the gradient by central differences over 25 cm). */
export function heightSurface(heightAt, e = 0.25) {
  return (x, z, out = {}) => {
    out.y = heightAt(x, z);
    out.gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
    out.gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    return out;
  };
}

export const POSE = {
  follow: 30,      // per second: how fast pitch and roll follow the surface (a time constant of 33 ms: over the tightest crest the track allows, R 80 m at
                   // 30 m/s, the wheels lag the surface by 1.5 cm; a seam or a stair in an older height field is spread over a few frames)
  maxRate: 0.6,    // rad per second: the most the chassis turns (34 degrees per second; a step in the ground is taken over a moment, not in one frame)
  bodyFollow: 7,   // per second: the body's dive and lean follow the forces this fast (the springs and dampers)
  dive: 0.004, diveMax: 0.05,     // rad of nose down per m/s^2 of braking
  lean: 0.0035, leanMax: 0.08,    // rad of lean per m/s^2 across (yaw rate times speed)
};

/** A new pose; the first `settle` puts it on the surface at once. */
export function makePose() {
  return { ready: false, x: 0, y: 0, z: 0, h: 0, pitch: 0, roll: 0, dive: 0, lean: 0, rate: [0, 0],
    wheels: Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0, gx: 0, gz: 0 })) };
}

const _s = { y: 0, gx: 0, gz: 0 };
/** Where wheel `i` of the posed chassis is: { x, z } on the plan and its height `y` (the chassis's own point, not the surface's). */
export function wheelOf(p, W, i, out = {}) {
  const [lx, lz] = W[i], sp = Math.sin(p.pitch), cp = Math.cos(p.pitch), sr = Math.sin(p.roll), cr = Math.cos(p.roll);
  const f = lz * cp - lx * sr * sp, l = lx * cr, s = Math.sin(p.h), c = Math.cos(p.h);
  out.x = p.x + f * s - l * c; out.z = p.z + f * c + l * s; out.y = p.y + lz * sp + lx * sr * cp;
  return out;
}

/**
 * Puts the chassis on the surface for the car at (x, z) heading h, after `dt` seconds. W = wheelPoints(dims).
 * o (optional, the body's motion): { ax: acceleration along the car in m/s^2, side: acceleration across in m/s^2 (yaw rate times speed) }.
 */
export function settle(p, surface, x, z, h, W, dt, o = {}) {
  if (p.ready && Math.hypot(x - p.x, z - p.z) > 6) p.ready = false;   // a jump (a reset, another start place): stand there at once
  p.x = x; p.z = z; p.h = h;
  // the surface under each wheel, where the wheel is with the present angles (on a slope the wheel is a little nearer on the plan); the first time twice,
  // so that the snapped angles are measured where the wheels then are
  const hs = [0, 0, 0, 0], first = !p.ready;
  for (let pass = 0; pass < (first ? 2 : 1); pass++) {
  for (let i = 0; i < 4; i++) {
    const w = p.wheels[i]; wheelOf(p, W, i, w);
    surface(w.x, w.z, _s); w.y = _s.y; w.gx = _s.gx; w.gz = _s.gz; hs[i] = _s.y;
  }
  // the plane through them: the front against the rear, the left against the right
  const zf = (W[0][1] + W[1][1]) / 2, zr = (W[2][1] + W[3][1]) / 2, xl = (W[0][0] + W[2][0]) / 2, xr = (W[1][0] + W[3][0]) / 2;
  const sinP = Math.max(-0.9, Math.min(0.9, ((hs[0] + hs[1]) / 2 - (hs[2] + hs[3]) / 2) / (zf - zr)));
  const pitchT = Math.asin(sinP);
  const roll = Math.asin(Math.max(-0.9, Math.min(0.9, ((hs[0] + hs[2]) / 2 - (hs[1] + hs[3]) / 2) / ((xl - xr) * Math.cos(pitchT)))));
  if (first) { p.pitch = pitchT; p.roll = roll; p.ready = true; continue; }
  if (dt > 0) {
    const k = 1 - Math.exp(-POSE.follow * dt), m = POSE.maxRate * dt;
    const dp = Math.max(-m, Math.min(m, (pitchT - p.pitch) * k)), dr = Math.max(-m, Math.min(m, (roll - p.roll) * k));
    p.pitch += dp; p.roll += dr; p.rate[0] = dp / dt; p.rate[1] = dr / dt;
  }
  }
  // the height: the drawn wheels on average on the surface (with the angles as drawn)
  const sp = Math.sin(p.pitch), sr = Math.sin(p.roll), cp = Math.cos(p.pitch);
  let a = 0; for (let i = 0; i < 4; i++) a += hs[i] - (W[i][1] * sp + W[i][0] * sr * cp); p.y = a / 4;
  // the body: dive and lean from the forces, softly
  if (dt > 0) {
    const kb = 1 - Math.exp(-POSE.bodyFollow * dt);
    const diveT = Math.max(-POSE.diveMax, Math.min(POSE.diveMax, -(o.ax ?? 0) * POSE.dive));
    const leanT = Math.max(-POSE.leanMax, Math.min(POSE.leanMax, -(o.side ?? 0) * POSE.lean));
    p.dive += (diveT - p.dive) * kb; p.lean += (leanT - p.lean) * kb;
  }
  return p;
}

/** How far each drawn wheel is from the surface under it (metres, signed: above is positive). For tests and the drive check. */
export function wheelGaps(p, surface, W) {
  const w = {}, gaps = [];
  for (let i = 0; i < 4; i++) { wheelOf(p, W, i, w); gaps.push(w.y - surface(w.x, w.z, _s).y); }
  return gaps;
}
