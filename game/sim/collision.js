// Collisions between cars as rectangles, and between a car and the walls: rigid bodies in 2D with an impulse that also turns the car (angular impulse), friction along the
// wall, and damage from how hard the hit was. Pure functions, no DOM, no clock. The older circle test of sim/map.js (`collide`) stays for the code that was built on it
// (the relay's checks and the bots); the game uses this one.
//
// A car is a rectangle LENGTH x WIDTH around its position (x, z), turned by the heading h (0 faces +z and grows towards the car's right): forward f = (sin h, cos h), right
// q = (cos h, -sin h). A point at a forward and b right of the centre moves, for a yaw rate w, with w * (a q - b f); an impulse J at that point changes w by (a q.J - b f.J) / I.
// The mass is 1 for a wall contact (it drops out against a fixed wall) and relative for two cars (data/cars.json `mass` / REF_MASS); the inertia is that of a plate: m * (L^2 + W^2) / 12.

export const BODY = { length: 4.4, width: 1.9, restitution: 0.12, wallFriction: 0.9, carFriction: 0.2, maxJump: 40 };
const INERTIA = (BODY.length ** 2 + BODY.width ** 2) / 12;   // per unit of mass: a body of mass m has m * INERTIA
/** The reference mass (kg) the game's relative masses are measured against: a car of 1200 kg has mass 1. */
export const REF_MASS = 1200;

const axes = (h) => ({ fx: Math.sin(h), fz: Math.cos(h), qx: Math.cos(h), qz: -Math.sin(h) });

/** The four corners of a car's rectangle. */
export function corners(s, body = BODY) {
  const { fx, fz, qx, qz } = axes(s.h), hl = body.length / 2, hw = body.width / 2;
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [s.x + a * hl * fx + b * hw * qx, s.z + a * hl * fz + b * hw * qz]);
}

/** The velocity of the point `p` of a body `s` (its own motion plus its turning). */
function velocityAt(s, p) {
  const rx = p[0] - s.x, rz = p[1] - s.z, { fx, fz, qx, qz } = axes(s.h);
  const a = rx * fx + rz * fz, b = rx * qx + rz * qz;   // forward and right offsets
  return [s.vx + s.w * (a * qx - b * fx), s.vz + s.w * (a * qz - b * fz)];
}

/** P(r) . d: how much of the direction d turns the body when pushed at the point p (the lever arm). */
function lever(s, p, dx, dz) {
  const rx = p[0] - s.x, rz = p[1] - s.z, { fx, fz, qx, qz } = axes(s.h);
  const a = rx * fx + rz * fz, b = rx * qx + rz * qz;
  return a * (qx * dx + qz * dz) - b * (fx * dx + fz * dz);
}

/** The impulse j (> 0 pushes the bodies apart along n) and friction for a contact between `a` and `b` (b = null: a fixed wall); returns the impulses and the approach speed. */
function contactImpulse(a, b, p, n, mu, e, ma = 1, mb = 1) {
  const va = velocityAt(a, p), vb = b ? velocityAt(b, p) : [0, 0];
  const rvx = va[0] - vb[0], rvz = va[1] - vb[1];
  const vn = rvx * n[0] + rvz * n[1];
  if (vn >= 0) return null;   // already moving apart
  const la = lever(a, p, n[0], n[1]), lb = b ? lever(b, p, n[0], n[1]) : 0;
  const j = (-(1 + e) * vn) / (1 / ma + (b ? 1 / mb : 0) + (la * la) / (ma * INERTIA) + (lb * lb) / (mb * INERTIA));
  // friction along the surface: opposes the sliding, at most mu times the normal impulse
  const tx = -n[1], tz = n[0], vt = rvx * tx + rvz * tz;
  const lat = lever(a, p, tx, tz), lbt = b ? lever(b, p, tx, tz) : 0;
  const jtFull = -vt / (1 / ma + (b ? 1 / mb : 0) + (lat * lat) / (ma * INERTIA) + (lbt * lbt) / (mb * INERTIA));
  const jt = Math.max(-mu * j, Math.min(mu * j, jtFull));
  return { j, jt, tx, tz, approach: -vn };
}

function apply(s, n, p, j, jt, tx, tz, sign, m = 1) {
  const Jx = sign * (j * n[0] + jt * tx), Jz = sign * (j * n[1] + jt * tz);   // the impulse; the velocity changes by J / m
  // a safety stop only: no contact gives a car a jump of more than maxJump m/s (a car at rest hit by the fastest car gets about 24 m/s, which the relay believes: its limit is 1.15 x top speed + 2)
  const dv = Math.hypot(Jx, Jz) / m, k = dv > BODY.maxJump ? BODY.maxJump / dv : 1;
  s.vx += (Jx / m) * k; s.vz += (Jz / m) * k;
  s.w += (lever(s, p, Jx, Jz) / (m * INERTIA)) * k;
}

// ---------- a car and the walls

/**
 * The contact point on the side of a rectangle that is deepest along n (dir -1: the lowest corners, +1: the highest): the corner, or the middle of an edge when two corners
 * are equally deep (a flat face against a wall touches along the whole face, so a straight hit must not turn the car).
 */
function deepest(cs, n, dir) {
  let best = dir < 0 ? Infinity : -Infinity;
  for (const c of cs) { const d = c[0] * n[0] + c[1] * n[1]; best = dir < 0 ? Math.min(best, d) : Math.max(best, d); }
  const near = cs.filter((c) => Math.abs(c[0] * n[0] + c[1] * n[1] - best) < 0.04);
  return [near.reduce((a, c) => a + c[0], 0) / near.length, near.reduce((a, c) => a + c[1], 0) / near.length];
}

/** Overlap of a car's rectangle with a thin wall segment (SAT): { depth, n (from the wall to the car), contact } or null. */
function boxSegment(s, ax, az, bx, bz, body) {
  const { fx, fz, qx, qz } = axes(s.h), hl = body.length / 2, hw = body.width / 2;
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  if (len < 1e-9) return null;
  const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;   // along the wall and its normal
  let best = null;
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  for (const [axx, azz, kind] of [[nx, nz, 'wall'], [ux, uz, 'along'], [fx, fz, 'f'], [qx, qz, 'q']]) {
    const pc = s.x * axx + s.z * azz, r = hl * Math.abs(fx * axx + fz * azz) + hw * Math.abs(qx * axx + qz * azz);
    const sm = mx * axx + mz * azz, sr = (Math.abs(dx * axx + dz * azz)) / 2;
    const overlap = r + sr - Math.abs(pc - sm);
    if (overlap <= 0) return null;
    if (!best || overlap < best.depth) { const sign = pc - sm >= 0 ? 1 : -1; best = { depth: overlap, n: [axx * sign, azz * sign], kind }; }
  }
  // the contact point: the corner that is deepest against the wall, or the end of the wall that pokes into the car's side
  if (best.kind === 'wall') {
    best.contact = deepest(corners(s, body), best.n, -1);
  } else {
    const da = Math.hypot(ax - s.x, az - s.z), db = Math.hypot(bx - s.x, bz - s.z);
    best.contact = da < db ? [ax, az] : [bx, bz];
  }
  return best;
}

/** Overlap of a car's rectangle with a round obstacle. */
function boxCircle(s, ox, oz, r, body) {
  const { fx, fz, qx, qz } = axes(s.h), hl = body.length / 2, hw = body.width / 2;
  const rx = ox - s.x, rz = oz - s.z;
  const lf = Math.max(-hl, Math.min(hl, rx * fx + rz * fz)), lq = Math.max(-hw, Math.min(hw, rx * qx + rz * qz));
  const px = s.x + lf * fx + lq * qx, pz = s.z + lf * fz + lq * qz;   // the point of the rectangle nearest to the circle's centre
  const dx = px - ox, dz = pz - oz, d = Math.hypot(dx, dz);
  if (d >= r) return null;
  if (d < 1e-6) { const l = Math.hypot(s.x - ox, s.z - oz) || 1; return { depth: r, n: [(s.x - ox) / l, (s.z - oz) / l], contact: [px, pz] }; }   // the centre is inside the car: push out along the line to the car's centre
  return { depth: r - d, n: [dx / d, dz / d], contact: [px, pz] };
}

/**
 * Push a car out of walls and obstacles and give it the impulse: the part of the speed into the wall is thrown back by the restitution, the car turns by where it was hit,
 * and the sliding along the wall is braked by friction. Returns the new state and `hit` = the approach speed of the hardest contact (m/s, 0 = none), and `impact` = the same
 * for the damage. The old state is not changed.
 */
export function collideBody(map, state, body = BODY) {
  const s = { ...state };
  let hit = 0;
  for (let pass = 0; pass < 3; pass++) {
    let any = false;
    const touch = (c) => {
      if (!c) return;
      any = true;
      s.x += c.n[0] * c.depth; s.z += c.n[1] * c.depth;
      const im = contactImpulse(s, null, c.contact, c.n, body.wallFriction, body.restitution);
      if (im) { apply(s, c.n, c.contact, im.j, im.jt, im.tx, im.tz, 1); hit = Math.max(hit, im.approach); }
    };
    const sg = map.segs;
    for (let i = 0; i < sg.length; i += 4) {
      // a cheap test first: the car is about 5 m across, a wall further away than that cannot touch
      const ax = sg[i], az = sg[i + 1], bx = sg[i + 2], bz = sg[i + 3];
      if (Math.min(ax, bx) - 3.5 > s.x || Math.max(ax, bx) + 3.5 < s.x || Math.min(az, bz) - 3.5 > s.z || Math.max(az, bz) + 3.5 < s.z) continue;
      touch(boxSegment(s, ax, az, bx, bz, body));
    }
    for (const o of map.obstacles) {
      if (Math.abs(o.x - s.x) > o.r + 3.5 || Math.abs(o.z - s.z) > o.r + 3.5) continue;
      touch(boxCircle(s, o.x, o.z, o.r, body));
    }
    if (!any) break;
  }
  return { ...state, x: s.x, z: s.z, vx: s.vx, vz: s.vz, w: s.w, hit };
}

// ---------- two cars

/** Overlap of two cars' rectangles (SAT on the four face axes): { depth, n (from b to a), contact } or null. */
export function overlapCars(a, b, body = BODY) {
  const hl = body.length / 2, hw = body.width / 2, dx = a.x - b.x, dz = a.z - b.z;
  if (dx * dx + dz * dz > (hl * hl + hw * hw) * 4) return null;   // too far apart to touch
  const A = axes(a.h), B = axes(b.h);
  let best = null;
  for (const [axx, azz] of [[A.fx, A.fz], [A.qx, A.qz], [B.fx, B.fz], [B.qx, B.qz]]) {
    const ra = hl * Math.abs(A.fx * axx + A.fz * azz) + hw * Math.abs(A.qx * axx + A.qz * azz);
    const rb = hl * Math.abs(B.fx * axx + B.fz * azz) + hw * Math.abs(B.qx * axx + B.qz * azz);
    const d = dx * axx + dz * azz, overlap = ra + rb - Math.abs(d);
    if (overlap <= 0) return null;
    if (!best || overlap < best.depth) { const sign = d >= 0 ? 1 : -1; best = { depth: overlap, n: [axx * sign, azz * sign] }; }
  }
  // the contact: midway between the corner of a that is deepest into b and the corner of b that is deepest into a
  const pa = deepest(corners(a, body), best.n, -1), pb = deepest(corners(b, body), best.n, 1);
  best.contact = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
  return best;
}

/**
 * Resolve the contact of two cars; `ma` and `mb` are their masses relative to REF_MASS (default 1: equal masses; a heavy car is thrown about less and throws the light one more). `applyA` / `applyB` say which of the two gets the result: the game of one player moves only its own car (the other one's state
 * is what the network says about it), and the other player's game does the same from its side, so that both agree about what happened. Returns { a, b, hit } with new states
 * (b is unchanged when it does not apply) and `hit` = the approach speed (0 = no contact).
 */
export function collideCars(a, b, { applyA = true, applyB = true, body = BODY, ma = 1, mb = 1 } = {}) {
  const c = overlapCars(a, b, body);
  if (!c) return { a, b, hit: 0 };
  const sa = { ...a }, sb = { ...b };
  // the impulse is worked out from both bodies' velocities at the contact in any case (so both games get the same number) and applied to those that apply, with the lever arms of
  // the positions as they were before anybody moved out
  const im = contactImpulse({ ...a }, { ...b }, c.contact, c.n, body.carFriction, body.restitution, ma, mb);
  if (im) {
    if (applyA) apply(sa, c.n, c.contact, im.j, im.jt, im.tx, im.tz, 1, ma);
    if (applyB) apply(sb, c.n, c.contact, im.j, im.jt, im.tx, im.tz, -1, mb);
  }
  // positions: each one that applies moves out by its share (everything when it is the only one, half when both move)
  const both = applyA && applyB;
  const shareA = applyA ? (both ? 0.5 : 1) : 0, shareB = applyB ? (both ? 0.5 : 1) : 0;
  sa.x += c.n[0] * c.depth * shareA; sa.z += c.n[1] * c.depth * shareA;
  sb.x -= c.n[0] * c.depth * shareB; sb.z -= c.n[1] * c.depth * shareB;
  if (!im) return { a: sa, b: sb, hit: 0 };
  return { a: sa, b: sb, hit: im.approach };
}

// ---------- damage

export const DAMAGE = {
  softLimit: 3,        // m/s: a bump under this does nothing
  perMs: 1 / 30,       // damage per m/s of approach speed above the limit (a 10 m/s hit = 0.23, a 25 m/s hit = 0.73)
  maxPerHit: 0.6,
  powerLoss: 0.25,     // at full damage the car has 25 % less power ...
  topLoss: 0.10,       // ... and 10 % less top speed (a small loss: the damage is for the look, mostly)
  healPerSecond: 0.004,// slowly better by itself when nothing is hit (full repair after about 4 minutes); R repairs at once
  healAfter: 6,        // s without a hit before it starts
};

/** The damage a hit of this approach speed adds (0..maxPerHit). */
export const damageOf = (approach) => Math.min(DAMAGE.maxPerHit, Math.max(0, (approach - DAMAGE.softLimit) * DAMAGE.perMs));

/** The new damage level (0..1) after a step of dt seconds: a hit adds, otherwise it heals after a pause. `since` = seconds since the last hit. */
export function damageStep(level, approach, since, dt) {
  if (approach > 0) return Math.min(1, level + damageOf(approach));
  return since > DAMAGE.healAfter ? Math.max(0, level - DAMAGE.healPerSecond * dt) : level;
}

/** The car's numbers with damage (a new object; no damage changes nothing). */
export function damaged(car, level) {
  return level > 0 ? { ...car, power: car.power * (1 - DAMAGE.powerLoss * level), top: car.top * (1 - DAMAGE.topLoss * level) } : car;
}
