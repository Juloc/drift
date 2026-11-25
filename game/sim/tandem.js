// Tandem drifting, as pure logic (the server judges it from the poses; a C# port in src/Drift/Race/Tandem.cs reads the same vectors, tests/vectors/tandem.json).
// Two cars are in tandem while both drift the same way, close together, pointing the same way. The closer and the more alike, the higher the quality q (0..1);
// a chain of tandem seconds earns a bonus multiplier (to x2) and bonus points on top of the normal drift points. The one ahead along the travel direction leads.
// Pose fields as the wire has them: x, z (m), h (heading, 0 faces +z), vf (forward speed m/s), beta (body slip rad, positive = goes to the right of the nose).

export const TANDEM = {
  maxGap: 10,        // m between the centres: further apart is no tandem
  idealGap: 4,       // m: at this distance or closer the proximity quality is 1
  maxHeading: 0.45,  // rad: how far the two travel directions may differ
  maxSlipDiff: 0.4,  // rad: how far the two slip angles may differ
  minSlip: 0.26,     // rad: both must drift (the same limit as the drift score)
  minSpeed: 8,       // m/s
  minQuality: 0.05,
  side: 1,           // m: closer than this along the travel direction = side by side, nobody leads
  rate: 0.35,        // bonus points per second = rate * speed * degrees^0.8 * (multiplier - 1)
  exponent: 0.8,
  maxPointsPerSecond: 1500,
  grace: 1,          // s: a break shorter than this does not end the chain
  smooth: 3,         // 1/s: how fast the shown quality follows
  maxMult: 2,
};

const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * The state of two cars at one moment: is it a tandem, how good, and who leads.
 * Returns { active, q, gap, role: [roleOfA, roleOfB] } with roles 'lead' | 'chase' | 'side' (null when not active).
 */
export function tandemPair(a, b) {
  const gap = Math.hypot(b.x - a.x, b.z - a.z);
  const none = { active: false, q: 0, gap, role: [null, null] };
  if (gap > TANDEM.maxGap) return none;
  const drifting = (c) => Math.abs(c.beta) > TANDEM.minSlip && Math.abs(c.vf) > TANDEM.minSpeed;
  if (!drifting(a) || !drifting(b) || Math.sign(a.beta) !== Math.sign(b.beta)) return none;
  const da = a.h + a.beta, db = b.h + b.beta;   // the direction each car travels in
  const dDir = angDiff(da, db), dSlip = Math.abs(a.beta - b.beta);
  if (dDir > TANDEM.maxHeading || dSlip > TANDEM.maxSlipDiff) return none;
  const qp = clamp((TANDEM.maxGap - gap) / (TANDEM.maxGap - TANDEM.idealGap), 0, 1);
  const qa = clamp(1 - Math.max(dDir / TANDEM.maxHeading, dSlip / TANDEM.maxSlipDiff), 0, 1);
  const q = qp * (0.4 + 0.6 * qa);
  if (q < TANDEM.minQuality) return none;
  // along the mean travel direction: positive = b is ahead of a
  const mx = Math.sin(da) + Math.sin(db), mz = Math.cos(da) + Math.cos(db), ml = Math.hypot(mx, mz) || 1;
  const along = ((b.x - a.x) * mx + (b.z - a.z) * mz) / ml;
  const role = Math.abs(along) < TANDEM.side ? ['side', 'side'] : along > 0 ? ['chase', 'lead'] : ['lead', 'chase'];
  return { active: true, q, gap, role };
}

export function newTandem() {
  return { active: false, q: 0, mult: 1, chainTime: 0, grace: 0, pending: 0, banked: 0, best: 0, role: null, event: null };
}

/**
 * Advance one car's tandem chain by dt. `obs` = null (no partner now) or { q, role, speed, slip } (the partner pair's quality, this car's role, speed and slip).
 * `event` is { type: 'bank', points } for one step when a chain ends.
 */
export function tandemStep(st, obs, dt) {
  let { q, mult, chainTime, grace, pending, banked, best } = st, event = null, role = st.role;
  if (obs) {
    q += (obs.q - q) * Math.min(1, dt * TANDEM.smooth);
    if (chainTime === 0) q = obs.q;
    chainTime += dt; grace = TANDEM.grace; role = obs.role;
    mult = Math.min(TANDEM.maxMult, 1 + 0.5 * q + Math.min(0.5, chainTime * 0.05));
    const deg = Math.abs(obs.slip) * (180 / Math.PI);
    pending += Math.min(TANDEM.maxPointsPerSecond, TANDEM.rate * Math.abs(obs.speed) * Math.pow(deg, TANDEM.exponent) * (mult - 1)) * dt;
  } else if (chainTime > 0) {
    grace -= dt;
    if (grace <= 0) {
      if (pending > 0) { event = { type: 'bank', points: Math.round(pending) }; banked += pending; best = Math.max(best, pending); }
      pending = 0; mult = 1; chainTime = 0; grace = 0; q = 0; role = null;
    }
  }
  return { active: !!obs, q, mult, chainTime, grace, pending, banked, best, role, event };
}
