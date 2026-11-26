// The tyres as numbers (pure; game/view/sound.js turns them into WebAudio): four layers from one noise.
//   roll   the tyres rolling on asphalt: a low rumble that grows with the speed
//   hiss   a little slip (turning in, a light slide): a soft hiss high up
//   squeal the drift: a tone between 500 and 1500 Hz (noise through narrow band-passes, its pitch wobbling a little), louder with the
//          slip, the speed and the load; it sinks as the angle grows
//   scrub  a big angle: lower and rougher, the tyre scrubbing sideways more than squealing
// `slide` is the simulation's slip of the rear (0..1, sim/physics.js), `speed` in m/s, `throttle` 0..1.
const clamp = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

export function tyreLayers(slide, speed, throttle = 0) {
  const v = Math.abs(speed), s = clamp(slide), moving = smooth(1, 6, v), fast = clamp(v / 30);
  const roll = 0.22 * fast ** 1.3;
  const hiss = 0.3 * moving * smooth(0.02, 0.15, s) * (1 - smooth(0.3, 0.55, s));
  const sq = smooth(0.22, 0.6, s), big = smooth(0.6, 0.95, s);
  const squeal = 0.85 * sq * moving * (0.65 + 0.35 * clamp(throttle)) * (1 - 0.45 * big);
  const scrub = 0.7 * big * moving;
  return {
    roll, rollF: 160 + 14 * v,   // a low-pass over the noise
    hiss, hissF: 3200,
    squeal, squealF: Math.max(500, Math.min(1500, 1250 - 520 * sq - 150 * big + 6 * v)),   // the tone sinks as the slip grows
    scrub, scrubF: 420 + 4 * v,
  };
}
