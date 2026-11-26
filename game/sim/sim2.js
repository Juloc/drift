// The driving simulation, second model ("sim2"): a real car. Four wheels that each spin on their own; a tyre whose force comes from its slip (along and
// across together, falling after the peak, warmer = different grip); a body on four springs with dampers, anti-roll bars and bump stops, so the weight moves
// with real timing (heave, pitch, roll) and a crest or a kerb is felt; camber, toe and Ackermann; an engine with a torque curve and a flywheel, a clutch that
// slips, a gearbox, a limited-slip differential, brakes with a balance, a handbrake, drag and lift. Nothing is faked for the drift: the car slides because
// the rear tyres are past their peak. "Arcade" is the same car with helpers (ASSISTS), never another model.
// Pure: no DOM, no clock, no randomness, no allocation in step(). Units: metres, seconds, radians, kilograms, newtons.
// Axes as in the game: x and z on the ground, heading h = 0 faces +z and grows towards the car's right. In the car: "lon" forward, "lat" to the right;
// yaw rate w > 0 turns the nose right; pitch > 0 is nose up; roll > 0 leans to the right. Wheels: 0 front left, 1 front right, 2 rear left, 3 rear right.
// Left out on purpose (little feel for much cost): tyre relaxation length, brake fade, fuel weight, chassis and driveshaft flex, tyre wear.

export const DT = 1 / 120;
export const SUB = 4;   // inner steps per step (wheels, engine and springs are fast)
export const G = 9.81;
const VMIN = 1.5;       // m/s, the floor under the slip's divisor (keeps the tyre calm at a crawl)
const RPM = 30 / Math.PI;

/** Solves the tyre curve's stiffness so that its peak sits at a normalised slip of 1. `T` = { C, E, kp, tp, mu, kMu }. */
export function makeTyre(T) {
  const target = Math.tan(Math.PI / (2 * T.C));
  let lo = 0.05, hi = 60;
  for (let i = 0; i < 60; i++) { const B = (lo + hi) / 2; if (B - T.E * (B - Math.atan(B)) < target) lo = B; else hi = B; }
  return { ...T, B: (lo + hi) / 2 };
}

/** The AE86 as it left the factory (Toyota's numbers where known), with a driver. Every number is a part you could change in a garage. */
export const AE86 = {
  name: 'AE86 (stock)',
  mass: 1010, ixx: 360, iyy: 1300, izz: 1380, wheelbase: 2.4, a: 1.13, b: 1.27, track: 1.35, cgH: 0.5,
  // suspension, per wheel: spring and damper at the wheel (N/m, N s/m in bump and rebound), anti-roll bar (N per m of left-right difference), travel to the bump stop
  springF: 18000, springR: 21000, bumpF: 1500, reboundF: 2500, bumpR: 1300, reboundR: 2200, arbF: 19000, arbR: 3500, travel: 0.075, stop: 180000,
  rollCentreF: 0.06, rollCentreR: 0.22,     // m: struts in front, a live axle behind
  camberF: -0.012, camberR: 0, camberGainF: 0.3, camberGainR: 1, toeF: 0, toeR: 0.002, ackermann: 0.6,   // rad; gain = share of the body's roll the links take back (a live axle: all of it)
  wheelR: 0.29, wheelI: 0.9, cdA: 0.68, clA: 0.2, crr: 0.015,
  brakeTorque: 3300, brakeFront: 0.66, handbrake: 2400,
  lock: 0.66, steerRate: 2.6, steerBack: 4.5,   // rad at the wheels (38 degrees), rad/s
  engine: {
    idle: 900, limit: 7700, cut: 0.05, inertia: 0.13, power: 0.9, lag: 0.05,   // power 0.9: the curve is the brochure's gross figure, 0.9 of it reaches the flywheel in the car
    curve: [[500, 70], [1000, 95], [2000, 118], [3000, 128], [4000, 137], [5200, 149], [6000, 145], [6600, 139], [7200, 128], [7700, 116], [8200, 90]],   // rpm, Nm (96 kW at 6600)
    drag: [18, 0.0055],     // closed throttle: Nm + Nm per rpm
  },
  gears: [3.587, 2.022, 1.384, 1.0, 0.861], reverse: 3.484, final: 4.3, eff: 0.88,
  clutch: 320,              // Nm it can carry
  diff: { preload: 30, lock: 0.9 },   // holds preload + lock x the axle's torque before the rear wheels may differ (0, 0 = open; 9999 = welded)
  tyreF: makeTyre({ C: 1.4, E: 0.1, kp: 0.11, tp: 0.15, mu: 1.0, kMu: 0.12 }),
  tyreR: makeTyre({ C: 1.4, E: 0.1, kp: 0.11, tp: 0.15, mu: 1.0, kMu: 0.12 }),
};

/** The same car set up for drifting: a little more power, stiffer and lower, more lock, a 2-way differential, front camber. */
export const AE86_DRIFT = {
  ...AE86, name: 'AE86 (drift set-up)', cgH: 0.46,
  springF: 52000, springR: 40000, bumpF: 3200, reboundF: 5200, bumpR: 2600, reboundR: 4300, arbF: 20000, arbR: 5000, travel: 0.06,
  camberF: -0.055, toeF: -0.002, lock: 0.87, ackermann: 0.3,
  engine: { ...AE86.engine, power: 1.2, inertia: 0.105, limit: 8000 },
  diff: { preload: 90, lock: 2.4 },
  tyreF: makeTyre({ C: 1.4, E: 0.1, kp: 0.11, tp: 0.15, mu: 1.04, kMu: 0.12 }),
  tyreR: makeTyre({ C: 1.4, E: 0.1, kp: 0.11, tp: 0.15, mu: 1.0, kMu: 0.12 }),
};

/** Helpers. Every number is 0 (off) to 1 (full) unless said. The same car drives under all of them. */
export const ASSISTS = {
  // arcade: the wheels point where the car goes by themselves and the keys ask for a slip angle around that (`alpha`, rad at speed: just under the tyre's
  // peak, so a full key never scrubs the fronts; full lock only at a crawl), a key comes in over a quarter second, the brakes do not lock, a hand on the
  // yaw, tyres that forgive
  arcade: { caster: 1.0, alpha: 0.135, rangeV: 6, keyRate: 4, abs: 1, tc: 0, spinCap: 2.5, stability: 1, betaMax: 0.85, grip: 1.06, forgive: 1, autoGear: 1, autoClutch: 1, hold: 1 },
  sport:  { caster: 0.85, alpha: 0.17, rangeV: 8, keyRate: 4, abs: 1, tc: 0, spinCap: 0, stability: 0.35, betaMax: 1.0, grip: 1.0, forgive: 0.4, autoGear: 1, autoClutch: 1, hold: 1 },
  // sim: the wheels still self-centre as a real rack does when you loosen your grip; a key can over-drive the front tyres; nothing else helps
  sim:    { caster: 0.55, alpha: 0.32, rangeV: 10, keyRate: 3, abs: 0, tc: 0, spinCap: 0, stability: 0, betaMax: 1.2, grip: 1.0, forgive: 0, autoGear: 1, autoClutch: 1, hold: 1 },
};

const ZERO4 = new Float64Array(4);
/** The ground: grip (`mu`, or `muW` per wheel), the slope's pull on the plan (`ax`, `az`, m/s^2), the road's height under each wheel and how fast it changes. */
export const FLAT = { mu: 1, muW: null, ax: 0, az: 0, yW: ZERO4, yWv: ZERO4 };

/** A fresh car at rest, in first gear, engine at idle. */
export function makeCar(x = 0, z = 0, h = 0) {
  return {
    x, z, h, vx: 0, vz: 0, w: 0, steer: 0, key: 0,
    y: 0, vy: 0, pitch: 0, pitchV: 0, roll: 0, rollV: 0,   // the body on its springs: height over its rest, nose up, lean to the right
    wheel: new Float64Array(4), we: 900 / RPM, gear: 1, engage: 0, shiftT: 0, shiftTo: 0, sinceShift: 9, revT: 0, cutT: 0, tAxle: 0,
    thr: 0, thrE: 0, brk: 0, hb: 0, flonF: 0, flatF: 0, flatR: 0,
    // read-outs for the drawing, the sound and the checks (written every step)
    rpm: 900, load: 0, limiter: 0, shifted: 0, speed: 0, beta: 0, alon: 0, alat: 0,
    kappa: new Float64Array(4), tanA: new Float64Array(4), fz: new Float64Array(4), sn: new Float64Array(4), slip: new Float64Array(4), heat: new Float64Array(4), temp: new Float64Array(4).fill(30),
    comp: new Float64Array(4), fxw: new Float64Array(4), fyw: new Float64Array(4),
    slide: 0, ax: 0, hit: 0,   // the old model's names, kept for the pages that read them
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const _f = { fx: 0, fy: 0, s: 0 };
const _k = new Float64Array(4), _bi = new Float64Array(4), _fx0 = new Float64Array(4), _fy0 = new Float64Array(4), _w0 = new Float64Array(4), _jb = new Float64Array(4), _tb = new Float64Array(4), _mu = new Float64Array(4);
const _fs = new Float64Array(4), _cd = new Float64Array(4), _sd = new Float64Array(4);
const PX = new Float64Array(4), PY = new Float64Array(4);

/** The tyre: force along and across from the slip ratio and the tangent of the slip angle, under load `fz` with grip `mu`. Writes _f. */
function tyre(T, kappa, tanA, fz, mu, forgive) {
  const sx = kappa / T.kp, sy = tanA / T.tp, s = Math.hypot(sx, sy);
  _f.s = s;
  if (s < 1e-9 || fz <= 0) { _f.fx = 0; _f.fy = 0; return; }
  const x = T.B * s;
  let D = Math.sin(T.C * Math.atan(x - T.E * (x - Math.atan(x))));
  if (forgive > 0 && s > 1) D += (1 - D) * 0.55 * forgive;   // a forgiving tyre loses less after its peak
  // direction: by the normalised slip up to the peak, the true sliding direction once it slides
  let dx = sx / s, dy = sy / s;
  if (s > 1) { const hp = Math.hypot(kappa, tanA), t = clamp(s - 1, 0, 1); dx += (kappa / hp - dx) * t; dy += (tanA / hp - dy) * t; const n = Math.hypot(dx, dy); dx /= n; dy /= n; }
  const F = mu * fz * D;
  _f.fx = F * dx; _f.fy = -F * dy;
}

/** Grip of the tread by its temperature (deg C): a cold tyre a little less, an overheated one clearly less. */
export const tempGrip = (t) => 1 - 0.04 * clamp((60 - t) / 30, 0, 1) - 0.12 * clamp((t - 140) / 140, 0, 1);

/** The engine's torque at full throttle, Nm. */
export function torqueAt(E, rpm) {
  const c = E.curve;
  if (rpm <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) if (rpm <= c[i][0]) { const t = (rpm - c[i - 1][0]) / (c[i][0] - c[i - 1][0]); return c[i - 1][1] + (c[i][1] - c[i - 1][1]) * t; }
  return Math.max(0, c[c.length - 1][1] - (rpm - c[c.length - 1][0]) * 0.2);
}

const ratioOf = (car, gear) => (gear > 0 ? car.gears[gear - 1] : gear < 0 ? -car.reverse : 0) * car.final;

/**
 * One step. `input` = { throttle 0..1, brake 0..1, steer -1..1, handbrake 0..1, clutch 0..1 (pedal down), up, down (gear buttons, true for one step) }.
 * `A` = one of ASSISTS (or your own). `env` = the ground (see FLAT).
 */
export function step(s, input, car, A = ASSISTS.arcade, env = FLAT, dt = DT) {
  s.shifted = 0;
  controls(s, input, car, A, dt);
  const h = dt / SUB;
  for (let i = 0; i < SUB; i++) sub(s, car, A, env, h);
  // standstill: a parked car stays parked
  if (A.hold && s.thr < 0.02 && Math.hypot(s.vx, s.vz) < 0.06 && Math.abs(s.w) < 0.05) { s.vx = 0; s.vz = 0; s.w = 0; s.wheel[0] = s.wheel[1] = 0; if (s.engage < 0.05) s.wheel[2] = s.wheel[3] = 0; }
  // read-outs
  const sn = Math.sin(s.h), cs = Math.cos(s.h), vlon = s.vx * sn + s.vz * cs, vlat = s.vx * cs - s.vz * sn;
  s.speed = Math.hypot(s.vx, s.vz);
  s.beta = s.speed > 1 ? Math.atan2(vlat, Math.abs(vlon)) : 0;
  s.rpm = s.we * RPM;
  s.slide = clamp(Math.max(s.sn[2], s.sn[3]) - 0.8, 0, 1); s.ax = s.alon;
  for (let i = 0; i < 4; i++) s.temp[i] += dt * (s.heat[i] / 450 - (s.temp[i] - 30) / 4);   // the tread's surface: heats with the sliding power (20 kW held: about 210 deg C), cools in about 4 s
  return s;
}

/** Steering, gearbox, clutch and pedals for this step (the driver and the helpers). */
function controls(s, input, car, A, dt) {
  const E = car.engine, sn = Math.sin(s.h), cs = Math.cos(s.h), vlon = s.vx * sn + s.vz * cs, vlat = s.vx * cs - s.vz * sn, speed = Math.hypot(s.vx, s.vz);
  let thr = clamp(input.throttle || 0, 0, 1), brk = clamp(input.brake || 0, 0, 1);
  // reverse as in the game: holding the brake at a stand selects reverse, then the brake is the throttle and the throttle the brake
  if (s.gear >= 0 && speed < 0.4 && brk > 0.5 && thr < 0.05) { s.revT += dt; if (s.revT > 0.35) { s.gear = -1; s.revT = 0; } } else if (s.gear >= 0) s.revT = 0;
  if (s.gear < 0) { if (thr > 0.05 && vlon > -0.5) { s.gear = 1; } else { const t = thr; thr = brk; brk = t; } }

  // --- steering: the wheels' free angle is where the front axle is going (caster); the driver steers around a share of it
  const fade = clamp((vlon - 1.5) / 3, 0, 1);
  const free = fade > 0 ? Math.atan2(vlat + s.w * car.a, Math.max(vlon, 0.5)) * fade : 0;
  const range = A.alpha + (car.lock - A.alpha) / (1 + (speed / A.rangeV) ** 2);
  // a key is all or nothing: it comes in over a moment (`keyRate` per second) and goes out twice as fast; a stick or a wheel (input.analog) is taken as it is
  const key = clamp(input.steer || 0, -1, 1);
  if (input.analog) s.key = key; else { const kr = (Math.abs(key) < Math.abs(s.key) || key * s.key < 0 ? 2 : 1) * A.keyRate * dt; s.key += clamp(key - s.key, -kr, kr); }
  const target = clamp(A.caster * free + s.key * range, -car.lock, car.lock);
  const rate = (Math.abs(target) < Math.abs(s.steer) ? car.steerBack : car.steerRate) * dt;
  s.steer += clamp(target - s.steer, -rate, rate);

  // --- gearbox
  s.sinceShift += dt;
  const rpm = s.we * RPM, R = car.wheelR;
  const ground = (g) => Math.abs((vlon / R) * ratioOf(car, g)) * RPM;   // the revs the road asks for in a gear
  const sliding = Math.max(s.sn[2], s.sn[3]) > 1.3;
  if (s.shiftT > 0) {
    s.shiftT -= dt;
    if (s.shiftTo !== 0 && s.shiftT <= 0.12) { s.gear = s.shiftTo; s.shiftTo = 0; s.shifted = 1; }
  } else if (s.gear > 0) {
    let to = 0;
    if (input.up && s.gear < car.gears.length) to = s.gear + 1;
    else if (input.down && s.gear > 1 && ground(s.gear - 1) < E.limit) to = s.gear - 1;
    else if (A.autoGear && !input.manual && s.sinceShift > 0.6) {
      const gNow = ground(s.gear);
      if (s.gear < car.gears.length && (gNow > E.limit - 500 || (rpm > E.limit - 350 && !sliding && thr > 0.3))) to = s.gear + 1;
      else if (s.gear > 1 && (!sliding || gNow < 2200) && ground(s.gear - 1) < (thr > 0.8 ? 6300 : brk > 0.2 ? 5600 : 3400) && gNow < (thr > 0.8 ? 4300 : 3000)) to = s.gear - 1;   // no kick-down in the middle of a slide
    }
    if (to) { s.shiftTo = to; s.shiftT = 0.24; s.sinceShift = 0; }
  }
  const shifting = s.shiftT > 0;

  // --- clutch: the pedal, the shift, and (helper) the launch and the stop without stalling
  let want = 1 - clamp(input.clutch || 0, 0, 1);
  if (shifting) want = s.shiftT > 0.12 ? 0 : Math.min(want, 1 - s.shiftT / 0.12);
  if (A.autoClutch && s.gear !== 0) {
    const g = ground(s.gear);
    // pulling away: the clutch bites where a driver would let it in for that much throttle (a floored pedal lets the revs rise to 4500 first and then
    // dumps it: that is the burnout start); it slips until the road has caught up with those revs; with no pedal it opens before the engine stalls
    const bite = 1100 + thr * thr * 3400;
    if (thr > 0.05) { if (g < bite + 1300) want = Math.min(want, clamp((rpm - bite) / 1300, 0, 1)); } else if (g < 1500) want = Math.min(want, clamp((g - 800) / 500, 0, 1));
  }
  s.engage = want < s.engage ? want : Math.min(want, s.engage + dt * 9);

  // --- pedals and their helpers
  if (shifting && s.shiftT > 0.1) thr = 0;
  const kr = Math.max(s.kappa[2], s.kappa[3]);
  if (A.tc > 0 && kr > 0.14) thr *= 1 - A.tc * clamp((kr - 0.14) / 0.2, 0, 1);
  if (A.spinCap > 0 && kr > A.spinCap && speed > 6) thr *= clamp(1 - (kr - A.spinCap) / 0.8, 0.35, 1);   // arcade, once rolling: the rear may spin, but not run away
  if (A.hold && thr < 0.02 && speed < 0.3 && s.gear >= 0 && brk < 0.3) brk = 0.3;            // held on a hill with no pedal
  s.thr = thr; s.brk = brk; s.hb = clamp(input.handbrake || 0, 0, 1);
}

/** One inner step: springs, tyres, wheels, engine, clutch, differential, the body. */
function sub(s, car, A, env, h) {
  const E = car.engine, m = car.mass, R = car.wheelR, L = car.wheelbase, ht = car.track / 2;
  const sn = Math.sin(s.h), cs = Math.cos(s.h), vlon = s.vx * sn + s.vz * cs, vlat = s.vx * cs - s.vz * sn;
  const speed = Math.hypot(s.vx, s.vz);
  PX[0] = PX[1] = car.a; PX[2] = PX[3] = -car.b; PY[0] = PY[2] = -ht; PY[1] = PY[3] = ht;

  // --- suspension: each spring's travel from the body's height, pitch and roll over the road under that wheel; then the wheel loads
  const W = m * G, f0 = (W * car.b) / L / 2, r0 = (W * car.a) / L / 2;
  for (let i = 0; i < 4; i++) {
    const front = i < 2, k = front ? car.springF : car.springR, c0 = (front ? f0 : r0) / k;
    const c = c0 + env.yW[i] - (s.y + PX[i] * s.pitch - PY[i] * s.roll), cv = env.yWv[i] - (s.vy + PX[i] * s.pitchV - PY[i] * s.rollV);
    s.comp[i] = c;
    let F = k * c + (cv > 0 ? (front ? car.bumpF : car.bumpR) : (front ? car.reboundF : car.reboundR)) * cv;
    if (c > c0 + car.travel) F += car.stop * (c - c0 - car.travel);
    _fs[i] = F;
  }
  { const af = car.arbF * (s.comp[0] - s.comp[1]), ar = car.arbR * (s.comp[2] - s.comp[3]); _fs[0] += af; _fs[1] -= af; _fs[2] += ar; _fs[3] -= ar; }
  for (let i = 0; i < 4; i++) if (_fs[i] < 0 || s.comp[i] < 0) _fs[i] = 0;   // a hanging wheel pulls nothing
  // the part of the sideways force that goes through the links (roll centres), straight into the wheel loads
  const gF = (s.flatF * car.rollCentreF) / car.track, gR = (s.flatR * car.rollCentreR) / car.track;
  s.fz[0] = Math.max(0, _fs[0] + gF); s.fz[1] = Math.max(0, _fs[1] - gF); s.fz[2] = Math.max(0, _fs[2] + gR); s.fz[3] = Math.max(0, _fs[3] - gR);

  // --- tyres: slip and force of each wheel, and how its force along changes with its spin (for a stable wheel)
  const tanD = Math.tan(s.steer);
  for (let i = 0; i < 4; i++) {
    const front = i < 2, T = front ? car.tyreF : car.tyreR, side = i % 2 ? 1 : -1;
    // this wheel's own angle: Ackermann (the inner wheel turns more), toe
    let d = front ? car.toeF * -side : car.toeR * -side;   // toe-in > 0: the wheel points towards the car's middle
    if (front) d += (1 - car.ackermann) * s.steer + car.ackermann * Math.atan((L * tanD) / (L - side * ht * tanD));
    const cd = Math.cos(d), sd = Math.sin(d); _cd[i] = cd; _sd[i] = sd;
    const bl = vlon - s.w * PY[i], bt = vlat + s.w * PX[i], cl = bl * cd + bt * sd, ct = -bl * sd + bt * cd;
    const den = Math.max(Math.abs(cl), VMIN), kappa = (s.wheel[i] * R - cl) / den, tanA = ct / den;
    // camber: the wheel's lean against the road; it grips best leaning a little into its sideways force
    const lean = (front ? car.camberF : car.camberR) * side + s.roll * (1 - (front ? car.camberGainF : car.camberGainR)), into = lean * (tanA > 0 ? -1 : 1);   // lean to the right; negative camber leans a wheel towards the car
    const z0 = front ? f0 : r0;
    const mu = (env.muW ? env.muW[i] : env.mu) * T.mu * A.grip * tempGrip(s.temp[i]) * clamp(1 - T.kMu * (s.fz[i] / z0 - 1), 0.6, 1.15) * clamp(1 - 6 * (into - 0.035) ** 2, 0.9, 1);
    tyre(T, kappa + 0.002, tanA, s.fz[i], mu, A.forgive); const fx1 = _f.fx;
    tyre(T, kappa, tanA, s.fz[i], mu, A.forgive);
    _fx0[i] = _f.fx; _fy0[i] = _f.fy; _mu[i] = mu;
    _k[i] = Math.max(0, ((fx1 - _f.fx) / 0.002) * (R / den));   // dFx / d(spin)
    _bi[i] = h / (car.wheelI * (1 + (h * _k[i] * R) / car.wheelI));   // what a torque does to the spin in this step (the tyre's answer inside)
    _w0[i] = s.wheel[i];
    s.kappa[i] = kappa; s.tanA[i] = tanA; s.sn[i] = _f.s; s.slip[i] = Math.hypot(s.wheel[i] * R - cl, ct);
  }

  // --- engine: torque from the pedal (a little late, the intake), the limiter cuts the fuel, an idle governor
  const rpm = s.we * RPM;
  s.thrE += (s.thr - s.thrE) * Math.min(1, h / E.lag);
  if (rpm > E.limit) s.cutT = E.cut;
  const cut = s.cutT > 0; if (cut) s.cutT -= h;
  const idle = rpm < E.idle * 1.3 ? clamp(((E.idle - rpm) / E.idle) * 4 + 0.07, 0, 0.6) : 0;
  const pedal = cut ? 0 : Math.max(s.thrE, idle);
  const te = pedal * torqueAt(E, rpm) * E.power - (1 - pedal) * (E.drag[0] + E.drag[1] * rpm);
  s.load = cut ? 0 : pedal; s.limiter = cut ? 1 : 0;
  let we = s.we + (h * te) / E.inertia;

  // --- wheels free of each other first, then the parts that tie them together, each as far as it can hold: brakes, differential, clutch
  for (let i = 0; i < 4; i++) {
    s.wheel[i] += _bi[i] * (-_fx0[i] * R);
    let tb = s.brk * car.brakeTorque * (i < 2 ? car.brakeFront : 1 - car.brakeFront) * 0.5;
    if (A.abs > 0 && s.kappa[i] < -0.16 && Math.abs(vlon) > 2) tb *= 0.25;
    if (i >= 2) tb += s.hb * car.handbrake * 0.5;
    _tb[i] = tb + car.crr * s.fz[i] * R; _jb[i] = 0;
  }
  const r = ratioOf(car, s.gear), cap = car.clutch * s.engage, lockCap = car.diff.preload + car.diff.lock * Math.abs(s.tAxle);
  let jd = 0, jc = 0;
  for (let it = 0; it < 3; it++) {
    for (let i = 0; i < 4; i++) { const want = clamp(_jb[i] - s.wheel[i] / _bi[i], -_tb[i], _tb[i]); s.wheel[i] += _bi[i] * (want - _jb[i]); _jb[i] = want; }
    { const want = clamp(jd + (s.wheel[3] - s.wheel[2]) / (_bi[2] + _bi[3]), -lockCap, lockCap); s.wheel[2] += _bi[2] * (want - jd); s.wheel[3] -= _bi[3] * (want - jd); jd = want; }
    if (r !== 0 && cap > 0) {
      const win = (r * (s.wheel[2] + s.wheel[3])) / 2, kk = h / E.inertia + (r * r * car.eff * (_bi[2] + _bi[3])) / 4;
      const want = clamp(jc + (we - win) / kk, -cap, cap), d = want - jc;
      we -= (h * d) / E.inertia; s.wheel[2] += (_bi[2] * d * r * car.eff) / 2; s.wheel[3] += (_bi[3] * d * r * car.eff) / 2; jc = want;
    }
  }
  s.tAxle = jc * r * car.eff;
  s.we = Math.max(we, 450 / RPM);

  // --- the body: every tyre's force (as the wheel ended up), drag and lift, the slope
  let flon = 0, flat = 0, mz = 0, latF = 0, latR = 0;
  for (let i = 0; i < 4; i++) {
    let fx = _fx0[i] + _k[i] * (s.wheel[i] - _w0[i]), fy = _fy0[i];
    const lim = _mu[i] * s.fz[i], mag = Math.hypot(fx, fy); if (mag > lim && mag > 0) { fx *= lim / mag; fy *= lim / mag; }
    s.fxw[i] = fx; s.fyw[i] = fy; s.heat[i] = Math.hypot(fx, fy) * s.slip[i];
    const bx = fx * _cd[i] - fy * _sd[i], by = fx * _sd[i] + fy * _cd[i];
    flon += bx; flat += by; mz += PX[i] * by - PY[i] * bx;
    if (i < 2) latF += by; else latR += by;
  }
  s.flonF = flon; s.flatF = latF; s.flatR = latR;
  const q = 0.6 * speed, drag = q * car.cdA;   // 0.5 * 1.2 kg/m^3 * v; times v below
  const alon = flon / m, alat = flat / m;
  s.alon = alon; s.alat = alat;
  // helper: a hand on the yaw when the angle runs away (arcade), never a different grip
  if (A.stability > 0 && speed > 4) {
    const beta = Math.atan2(vlat, Math.abs(vlon)), over = Math.abs(beta) - A.betaMax;
    if (over > 0) mz += A.stability * car.izz * (Math.sign(beta) * over * 14 - s.w * 3.5 * clamp(over * 4, 0, 1));
  }
  // the body on its springs: heave, pitch (nose up when the tyres push forward), roll (away from the sideways force, around the roll centres)
  const lift = q * speed * car.clA;
  s.vy += ((_fs[0] + _fs[1] + _fs[2] + _fs[3] + lift) / m - G) * h;
  s.pitchV += ((car.a * (_fs[0] + _fs[1]) - car.b * (_fs[2] + _fs[3]) + flon * car.cgH) / car.iyy) * h;
  s.rollV += ((ht * (_fs[0] + _fs[2] - _fs[1] - _fs[3]) - latF * (car.cgH - car.rollCentreF) - latR * (car.cgH - car.rollCentreR)) / car.ixx) * h;
  s.y += s.vy * h; s.pitch += s.pitchV * h; s.roll += s.rollV * h;
  // on the plan
  s.vx += (alon * sn + alat * cs + env.ax - (drag * s.vx) / m) * h;
  s.vz += (alon * cs - alat * sn + env.az - (drag * s.vz) / m) * h;
  s.w += (mz / car.izz) * h;
  s.x += s.vx * h; s.z += s.vz * h; s.h += s.w * h;
}

/**
 * How loud wheel `i` squeals, 0..1: a tyre howls when it works at and past its peak (not below three quarters of it) and its tread slides over the road
 * at walking pace or more; a lightly loaded wheel is quieter. Brisk driving is silent, the limit sings, a slide screams.
 */
export function squealOf(s, car, i) {
  const z0 = (car.mass * G * (i < 2 ? car.b : car.a)) / car.wheelbase / 2;
  return clamp((s.sn[i] - 0.75) / 0.6, 0, 1) * clamp((s.slip[i] - 0.4) / 3.5, 0, 1) * clamp(s.fz[i] / z0, 0, 1.3) / 1.3;
}

/**
 * How much wheel `i` smokes, 0..1: rubber smokes when the tread is hot (over about 105 deg C, so only after a moment of hard sliding) and the sliding
 * power is high (over 6 kW at that wheel, so the lightly loaded inner wheel of a drift smokes too; 32 kW is a full burnout). A brisk bend, ABS braking and a short chirp give none; a locked wheel, a held drift
 * and a burnout do.
 */
export function smokeOf(s, i) {
  return clamp((s.temp[i] - 105) / 60, 0, 1) * clamp((s.heat[i] - 6000) / 26000, 0, 1) ** 0.7;
}
