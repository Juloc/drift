// A driver for a road of the track system (game/sim/track.js) and the model on its surface (physics.js stepSurface): for pictures, checks and the demo, not a game feature.
// It knows where it is on the road (`surfaceAt`: metres along, metres beside the centre) and where the hairpins are. On the runs it follows the centre line and brakes in
// time; into a hairpin it pulls the handbrake with the wheel turned in, then HOLDS the slide the way a person does on this model: the wheel stays into the bend, the pedal
// sets the angle, and when the car runs wide it gets more wheel and more gas (a deeper, slower slide turns tighter); out of the bend it lets the rear catch.
// `drift: false` makes it a clean driver (no handbrake, slow enough to grip): the pair is what tools/drivecheck.mjs sends down a road.
import { bodySlip, speedOf } from './physics.js';
import { surfaceAt, frameAt } from './track.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The bends a driver treats as hairpins: tighter than 40 m and turning more than 100 degrees ({ from, apex, to, right } in metres along the road). */
export function hairpinsOf(T) {
  const list = [];
  for (let i = 0; i < T.n; ) {
    if (Math.abs(T.k[i]) <= 1 / 40) { i++; continue; }
    let j = i, turn = 0; while (j < T.n && Math.abs(T.k[j]) > 1 / 60) { turn += T.k[j] * T.ds; j++; }
    if (Math.abs(turn) > 1.75) list.push({ from: i * T.ds, apex: ((i + j) / 2) * T.ds, to: (j - 1) * T.ds, right: turn > 0 });
    i = j + 1;
  }
  return list;
}

// a car that turns slowly (little agility: the Bruno, the Ox) needs a longer pull of the handbrake and more wheel to bring its tail round
const heavy = (car) => (car?.agility ?? 1) < 0.9;

/**
 * Returns `(t, state, dt) => controls` for the road `T`. Options: `drift` (throw the tail out in hairpins), `speed` on the runs and `entry` into a hairpin (m/s),
 * `angle` the slip angle to hold (rad), `kick` seconds of handbrake, `clean` the speed a clean driver takes a hairpin with, `car` the car's numbers (a heavy one gets a longer kick).
 */
export function trackBot(T, { car = null, drift = true, speed = 26, entry = 15, angle = 0.6, kick = heavy(car) ? 0.35 : 0.2, kickSteer = heavy(car) ? 0.8 : 0.6, inSteer = 0.5, wideSteer = 0.14, early = 4, aimIn = 1.5, slideSpeed = 11.5, fastBy = 1.2, speedGain = 0.25, clean = 9.5, look = 11, mu = 1, corner = 0.7, decel = 7 } = {}) {
  const pins = hairpinsOf(T), q = {};
  // on a ground with less grip every speed of a hairpin shrinks like the speed a bend takes: with the root of the grip
  const slow = Math.sqrt(mu); entry *= slow; slideSpeed *= slow; clean *= slow;
  // the speed every place of the road takes with grip: what the bend allows (`corner` of the tyres' grip on this ground: car.grip * mu * g), never more than `speed`, and
  // reached by braking in time (a pass backwards with the bot's braking). The hairpins keep their own speeds (`entry`, `clean`: the phases below), so they are left out here.
  const n = T.n, vT = new Float64Array(n), aLat = corner * (car?.grip ?? 1) * mu * 9.81, aBrake = decel * mu;
  for (let i = 0; i < n; i++) vT[i] = Math.min(speed, Math.sqrt(aLat / Math.max(1e-6, Math.abs(T.k[i]))));
  for (const p of pins) for (let i = Math.max(0, Math.floor(p.from / T.ds)); i <= Math.min(n - 1, Math.ceil(p.to / T.ds)); i++) vT[i] = speed;
  for (let lap = 0; lap < (T.closed ? 2 : 1); lap++) { for (let i = n - 2; i >= 0; i--) vT[i] = Math.min(vT[i], Math.sqrt(vT[i + 1] ** 2 + 2 * aBrake * T.ds)); if (T.closed) vT[n - 1] = vT[0]; }
  const vAt = (s) => vT[clamp(Math.ceil(s / T.ds), 0, n - 1)];
  let phase = 'run', pin = null, kickLeft = 0, done = -1, still = 0, back = 0;
  return (t, s, dt = 1 / 120) => {
    surfaceAt(T, s.x, s.z, q);
    const sp = speedOf(s), slip = bodySlip(s), along = q.s, lat = q.kind === 'plaza' ? 0 : q.lat;
    // stuck against something (stopped for a second): back off for a moment with the wheel the other way, then drive on
    still = sp < 0.6 && t > 3 ? still + dt : 0;
    if (still > 1) { back = 1.4; still = 0; phase = 'run'; }
    if (back > 0) { back -= dt; if (pin) done = Math.max(done, pins.indexOf(pin)); return { steer: -Math.sign(lat || 1) * 0.0 + (lat > 0 ? 1 : -1) * 0.6, throttle: 0, brake: 1, handbrake: 0 }; }
    const next = pins.find((p, i) => i > done && p.to > along) ?? null;
    // follow the centre line: steer at a point a little ahead
    const aim = frameAt(T, Math.min(T.len, along + look + sp * 0.25), 0), err = wrap(Math.atan2(aim.x - s.x, aim.z - s.z) - s.h);
    const follow = clamp(err * 2.4 - (Math.abs(slip) > 0.12 ? slip * 0.9 : 0), -1, 1);
    const vIn = drift ? entry : clean, toBend = next ? next.from - along : Infinity;
    // brake so that the entry speed is reached a few metres before the bend (7 m/s^2, less than the tyres give)
    const mustBrake = next && sp > vIn && toBend - early - 2 < (sp * sp - vIn * vIn) / (2 * aBrake);
    if (phase === 'run') {
      if (drift && next && toBend < early && sp > vIn * 0.75) { phase = 'slide'; pin = next; kickLeft = kick; }
      else if (!drift && next && toBend < 0) { phase = 'grip'; pin = next; }
    }
    if (phase === 'grip') {
      if (along > pin.to) { phase = 'run'; done = pins.indexOf(pin); }
      const v = drift ? clean + 1.5 : clean;   // (a slide that ended early: the rest of the bend is driven with grip, a little quicker than the clean driver)
      return { steer: follow, throttle: sp < v ? 0.7 : 0.1, brake: sp > v + 1.5 ? 0.6 : 0, handbrake: 0 };
    }
    if (phase === 'slide') {
      kickLeft -= dt;
      const dirn = pin.right ? 1 : -1, wide = -lat * dirn + aimIn;   // metres towards the outside of the line it wants (`aimIn` metres inside the centre)
      if (along > pin.to - 6 || (kickLeft < -0.6 && Math.abs(slip) < 0.1)) { phase = 'catch'; }
      if (kickLeft > 0) return { steer: dirn * kickSteer, throttle: 0.5, brake: 0, handbrake: 1 };
      if (Math.abs(slip) > 1.05) return { steer: follow, throttle: 0.3, brake: 0, handbrake: 0 };   // too far round: let it come back
      // the nose is held `angle` into the bend from the road's direction (and a little more when the car is wide), by the wheel: turned in while the nose lags,
      // turned against it when the nose runs ahead (that is the counter-steer). The pedal holds the slide alive and the speed down to what the bend takes
      const road = frameAt(T, Math.min(T.len, along + 4), 0).head, want = road + dirn * (angle + clamp(wide * wideSteer, -0.25, 0.3));
      const steer = clamp(wrap(want - s.h) * 2.6 - s.w * 0.25 + T.k[Math.min(T.n - 1, Math.round(along / T.ds))] * 6, -1, 1);
      const fast = sp > slideSpeed + fastBy, gas = clamp(0.8 + (angle - Math.abs(slip)) * 1.6 - (sp - slideSpeed) * speedGain, 0.3, 1);
      return { steer, throttle: fast ? Math.min(gas, 0.45) : gas, brake: 0, handbrake: 0 };
    }
    if (phase === 'catch') {
      if (Math.abs(slip) < 0.12 || along > pin.to + 45) { if (along < pin.to) phase = 'grip'; else { phase = 'run'; done = pins.indexOf(pin); } }
      return { steer: follow, throttle: 0.45, brake: 0, handbrake: 0 };
    }
    if (sp < 2 && t > 2) return { steer: follow, throttle: 0.6, brake: 0, handbrake: 0 };   // stopped somewhere: drive on
    const v = vAt(along + sp * 0.15);   // (a moment ahead: the pedals take that long)
    return { steer: follow, throttle: mustBrake || sp > v ? 0 : sp < v - 1 ? 1 : 0.4, brake: mustBrake ? 0.8 : clamp((sp - v) * 0.6, 0, 0.8), handbrake: 0 };
  };
}
