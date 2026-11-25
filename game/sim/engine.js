// The engine and tyre sound as numbers (pure, so it can be tested without a browser; game/view/sound.js turns them into WebAudio).
// A virtual gearbox gives revs from the speed: in each gear the revs rise from the shift-down point to the limit, then the box shifts up and they fall.
// Every car has its own character (idle, limit, number of cylinders, gears, a sub-octave, a turbo), so the five do not sound alike.

/** One entry per car id of data/cars.json. `cyl` sets the firing frequency (cylinders / 2 firings per revolution); `sub` the weight of the octave below; `grit` the roughness. */
export const ENGINES = [
  { name: 'Dart',   idle: 1000, max: 7400, cyl: 4, gears: 5, sub: 0.45, grit: 0.35, turbo: false, tone: 1400 },   // a lively four
  { name: 'AE86',   idle: 1200, max: 8200, cyl: 3, gears: 5, sub: 0.25, grit: 0.55, turbo: false, tone: 2000 },   // a small, buzzy three
  { name: 'Bruno',  idle: 700,  max: 5600, cyl: 8, gears: 4, sub: 0.75, grit: 0.30, turbo: false, tone: 800 },    // a low V8
  { name: 'Marlin', idle: 900,  max: 7000, cyl: 6, gears: 5, sub: 0.55, grit: 0.15, turbo: false, tone: 1700 },   // a smooth six
  { name: 'Ox',     idle: 750,  max: 4300, cyl: 4, gears: 4, sub: 0.60, grit: 0.60, turbo: true,  tone: 900 },    // a heavy turbo diesel
];

/** The gear for a speed (m/s) and the revs in it. The top speed is the car's; gear n tops out at (n + 1) / gears of it (the first gears are short). */
export function revs(speed, top, eng, previousGear = 1) {
  const v = Math.max(0, Math.abs(speed));
  const per = top / eng.gears;
  let gear = Math.min(eng.gears, Math.max(1, Math.floor(v / per) + 1));
  // a little hysteresis: stay in the lower gear until the revs are 4 % over the limit's share (no hunting at a shift point)
  if (gear > previousGear && v < previousGear * per * 1.04) gear = previousGear;
  const lo = (gear - 1) * per * 0.55, hi = gear * per;   // the revs in a gear run from lo (just after the shift) to hi (the limit)
  const share = Math.min(1, Math.max(0, (v - lo) / Math.max(1e-6, hi - lo)));
  return { gear, rpm: eng.idle + share * (eng.max - eng.idle) };
}

/** The firing frequency in Hz for revs: cylinders / 2 firings per revolution. */
export const firing = (rpm, eng) => (rpm / 60) * (eng.cyl / 2);

/** How loud the engine is for a throttle 0..1 and the revs (an engine at idle is quiet, under load at the limit it is loud). */
export const engineGain = (throttle, rpm, eng) => 0.18 + 0.5 * Math.min(1, Math.max(0, throttle)) * 0.7 + 0.25 * ((rpm - eng.idle) / (eng.max - eng.idle));

/** The tyres' squeal from how far the rear slides (0..1, the physics' `slide`) and the speed: nothing under 0.25, loud in a full slide; the pitch rises a little with speed. */
export function squeal(slide, speed) {
  const s = Math.min(1, Math.max(0, (slide - 0.25) / 0.6)) * Math.min(1, Math.max(0, (Math.abs(speed) - 3) / 10));
  return { gain: s * s * 0.5 + s * 0.1, freq: 900 + 600 * s + 12 * Math.abs(speed) };
}

/** The turbo's whistle follows the throttle being closed or opened: gain 0..1 from the change of throttle and the revs (the whistle comes when the throttle is lifted at high revs). */
export function turboWhistle(throttle, previousThrottle, rpm, eng) {
  if (!eng.turbo) return 0;
  const lift = Math.max(0, previousThrottle - throttle);
  return Math.min(1, lift * 8) * Math.min(1, Math.max(0, (rpm - eng.idle) / (eng.max - eng.idle)));
}

/**
 * The cars that get a voice: the nearest `max` to the listener, nearest first, with a gain by distance (1 at 0 m falling to 0 at `range` m) and a pan by the side the
 * car is on (-1 to 1; the listener looks along `heading`). Cars out of range get none.
 * @param {{x:number,z:number,heading?:number}} listener @param {{id:number,x:number,z:number}[]} cars
 */
export function nearest(listener, cars, max = 4, range = 70) {
  const sn = Math.sin(listener.heading ?? 0), cs = Math.cos(listener.heading ?? 0);
  return cars
    .map((c) => {
      const dx = c.x - listener.x, dz = c.z - listener.z, d = Math.hypot(dx, dz);
      const right = dx * cs - dz * sn;   // to the listener's right (the sim's heading grows to the right)
      const g = d >= range ? 0 : 1 / (1 + d / 10) ** 1.6 * (1 - d / range);
      return { car: c, d, gain: g, pan: Math.max(-1, Math.min(1, right / 30)) };
    })
    .filter((v) => v.gain > 0.01)
    .sort((a, b) => a.d - b.d)
    .slice(0, max);
}
