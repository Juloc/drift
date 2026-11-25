// The driving model: a 2D "bicycle" car (one front and one rear tyre) with slip angles, a tyre curve that
// falls after its peak (that falling edge is the drift), a friction circle on the rear (throttle costs side
// grip), handbrake, weight shift and a counter-steer assist. Pure functions: no DOM, no three.js, no clock,
// no randomness. Units: metres, seconds, radians; mass is 1, so forces are accelerations.
// Axes: x and z on the ground, heading h = 0 faces +z and grows towards the car's right.
// docs/ARCHITECTURE.md section 1 describes the model; K holds every constant that is not a car's.

export const DT = 1 / 120;
export const G = 9.81;

export const K = {
  a: 1.3, // centre to front axle, m
  b: 1.3, // centre to rear axle, m
  alphaPeak: 0.2, // slip angle of the most grip, rad (about 11 degrees)
  fall: 1.2, // the curve falls from its peak to `slide` over this many peaks
  lockHard: 0.75, // the wheels' mechanical limit, rad; the counter-steer assist may use all of it
  lockMax: 0.55, // largest wheel angle at standstill, rad (times a bit of agility)
  lockSpeed: 40, // lock = max / (1 + (v / lockSpeed)^2)
  steerOn: 4.5, // wheel speed towards the target while the finger is on, rad/s per unit of lock
  steerOff: 9, // wheel speed back to centre when it is let go
  assist: 0.9, // counter-steer: wheel angle added per rad of body slip past the dead zone
  assistW: 0.3, // and per rad/s of yaw rate while sliding (the nose is swinging: catch it)
  assistDead: 0.12, // body slip below which there is no assist, rad
  hbGrip: 0.2, // rear grip while the handbrake is held
  hbBrake: 0.6 * G, // rear braking by the handbrake
  brake: 1.0 * G, // footbrake
  brakeFront: 0.65, // share of the footbrake on the front axle
  rolling: 0.05, // rolling drag, 1/s (a = rolling * v)
  reverse: 0.4, // reverse power, share of forward power
  reverseTop: 10, // m/s
  inertia: 1.0, // yaw inertia = inertia * a * b / agility
  yawDamp: 1.6, // 1/s
  shift: 0.12, // weight shift per g of longitudinal acceleration (share of the weight)
  circle: 1, // how much of the rear's grip the engine's push eats (1 = all of it: a strict friction circle)
  lowSpeed: 3, // below this speed the tyres are blended out (no pivoting on the spot)
};

/** A fresh car at rest. */
export function makeCar(x = 0, z = 0, h = 0) {
  return { x, z, h, vx: 0, vz: 0, w: 0, steer: 0, slide: 0, ax: 0, hit: 0 };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Forward speed, sideways speed (to the right) in the car's frame. */
export function bodyVelocity(s) {
  const sn = Math.sin(s.h), cs = Math.cos(s.h);
  return { vf: s.vx * sn + s.vz * cs, vr: s.vx * cs - s.vz * sn };
}
export const speedOf = (s) => Math.hypot(s.vx, s.vz);
/** Body slip angle: angle between where the car points and where it goes (positive: it goes to the right of its nose). */
export function bodySlip(s) {
  const { vf, vr } = bodyVelocity(s);
  return vf > 0.5 ? Math.atan2(vr, vf) : 0;
}

/** The tyre curve: rises linearly to 1 at u = 1, then falls to `slide` and stays there. */
export function tyreCurve(u, slide) {
  if (u <= 1) return u;
  return 1 - (1 - slide) * smooth((u - 1) / K.fall);
}

/**
 * One step. `car` = { power, top, grip, slide, agility }; `input` = { steer -1..1, throttle 0..1, brake 0..1,
 * handbrake 0|1 }; `mu` = grip of the ground (1 = asphalt). Returns the next state (the old one is not changed).
 */
export function step(s, input, car, mu = 1, dt = DT) {
  const { a, b } = K;
  const sn = Math.sin(s.h), cs = Math.cos(s.h);
  const vf = s.vx * sn + s.vz * cs;
  const vr = s.vx * cs - s.vz * sn;
  const av = Math.abs(vf);
  const dir = vf >= 0 ? 1 : -1;
  const speed = Math.hypot(s.vx, s.vz);
  const lowK = clamp(speed / K.lowSpeed, 0, 1);

  // --- the steering wheel
  const lock = (K.lockMax * Math.min(1.25, car.agility)) / (1 + (av / K.lockSpeed) ** 2);
  const beta = vf > 0.5 ? Math.atan2(vr, vf) : 0;
  const over = Math.max(0, Math.abs(beta) - K.assistDead);
  const assistOn = smooth((av - 3) / 5);
  const assist = (Math.sign(beta) * over * K.assist - smooth(over / 0.1) * K.assistW * s.w) * assistOn;
  const target = clamp(clamp(input.steer, -1, 1) * lock + assist, -K.lockHard, K.lockHard);
  const rate = (Math.abs(target) > Math.abs(s.steer) && Math.sign(target) * Math.sign(s.steer) >= 0 ? K.steerOn : K.steerOff) * K.lockHard * 0.8;
  const steer = clamp(target, s.steer - rate * dt, s.steer + rate * dt);

  // --- longitudinal: drive, brakes, drag (positive = forward)
  const throttle = clamp(input.throttle, 0, 1);
  const brake = clamp(input.brake, 0, 1);
  let drive = 0;
  if (throttle > 0) drive = throttle * car.power * Math.max(0, 1 - (speed / car.top) ** 2);
  let reverse = 0;
  if (brake > 0.05 && vf < 0.5 && throttle === 0) reverse = -brake * K.reverse * car.power * Math.max(0, 1 - (vf / -K.reverseTop) ** 2);
  const brakeTotal = brake * K.brake; // always against the motion
  const hb = input.handbrake ? 1 : 0;
  const stopCap = av / dt; // a brake never turns a car round
  const brakeFront = Math.min(brakeTotal * K.brakeFront, stopCap * 0.5);
  const brakeRear = Math.min(brakeTotal * (1 - K.brakeFront) + hb * K.hbBrake, stopCap * 0.5);
  const driveRear = drive + reverse;
  const rolling = -K.rolling * vf;
  const axLong = driveRear - dir * (brakeFront + brakeRear) + rolling;

  // --- weight shift: braking loads the front, accelerating the rear
  const shiftR = clamp(0.5 + K.shift * (driveRear - dir * brakeTotal) / G, 0.35, 0.65);
  const loadR = shiftR, loadF = 1 - shiftR;

  // --- tyres
  const slideEff = Math.min(1, car.slide + (1 - car.slide) * (1 - mu) * 1.2);
  const gripF = car.grip * mu * G * loadF;
  const gripR = car.grip * mu * G * loadR * (hb ? K.hbGrip : 1);
  const fxR = Math.abs(driveRear - dir * brakeRear);
  const circle = Math.sqrt(Math.max(0, 1 - (K.circle * fxR / Math.max(1e-6, car.grip * mu * G * loadR)) ** 2));
  const vden = Math.max(av, 2);
  const alphaF = Math.atan2(vr + a * s.w, vden) - steer * dir;
  const alphaR = Math.atan2(vr - b * s.w, vden);
  const fF = -Math.sign(alphaF) * gripF * tyreCurve(Math.abs(alphaF) / K.alphaPeak, slideEff) * lowK;
  const fR = -Math.sign(alphaR) * gripR * circle * tyreCurve(Math.abs(alphaR) / K.alphaPeak, slideEff) * lowK;
  // at a crawl the tyres are blended out; a little viscous drag keeps a stopped car from creeping sideways
  const ay = fF + fR - vr * 4 * (1 - lowK);

  // --- yaw
  const inertia = (K.inertia * a * b) / car.agility;
  const wDot = (a * fF - b * fR) / inertia - s.w * (K.yawDamp + 2 * (1 - lowK));

  // --- integrate (semi-implicit Euler): velocities first, then positions
  const ax = axLong;
  let vx = s.vx + (sn * ax + cs * ay) * dt;
  let vz = s.vz + (cs * ax - sn * ay) * dt;
  const w = s.w + wDot * dt;
  // a stopped car with no pedal stays stopped
  if (throttle === 0 && brake === 0 && Math.hypot(vx, vz) < 0.15) { vx = 0; vz = 0; }
  const h = s.h + w * dt;
  const x = s.x + vx * dt;
  const z = s.z + vz * dt;

  // how far the rear is sliding, 0..1 (for smoke, sound and score)
  const sl = clamp((Math.abs(alphaR) / K.alphaPeak - 0.6) / 1.4, 0, 1) * (speed > 3 ? 1 : 0);
  return { x, z, h, vx, vz, w, steer, slide: sl, ax: axLong, hit: 0 };
}

/** Angle between the nose and the direction of travel, 0..PI, also when going backwards (a spin shows as > 1.9). */
export function turnedAngle(s) {
  const { vf, vr } = bodyVelocity(s);
  return speedOf(s) < 3 ? 0 : Math.atan2(Math.abs(vr), vf);
}
