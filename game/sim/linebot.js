// A second tiny driver for tests and pictures (not a game feature): it follows a line of points (a race loop or an open road),
// slows down before a bend, throws the tail out there with a short pull of the handbrake and holds the slide with throttle
// and counter-steer. It keeps its own place along the line. `dial: true` and a longer `kickTime` are for the model on a surface (physics.js stepSurface),
// where the pedal sets the angle; the defaults drive the flat model as before.
import { bodySlip, speedOf } from './physics.js';

const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/** Returns a driver `(t, s) => controls` for the line `pts` ([x, z] points); `closed` = the line is a loop. Distances in metres. */
export function lineBot(pts, { closed = true, speed = 17, corner = 13, kick = 0.5, hold = 0.5, gain = 2.2, look = 8, kickTime = 0.22, dial = false, counter = 1.1, inside = 0, cap = 9 } = {}) {
  const n = pts.length;
  let len = 0;
  for (let i = 1; i < n; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const per = len / (n - 1), ahead = (m) => Math.max(1, Math.round(m / per));
  const at = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.min(n - 1, Math.max(0, i))]);
  const heading = (i) => { const a = at(i), b = at(i + 1); return Math.atan2(b[0] - a[0], b[1] - a[1]); };
  let idx = -1, kickLeft = 0;
  return (t, s, dt = 1 / 120) => {
    if (idx < 0) { let best = Infinity; for (let i = 0; i < n; i++) { const d = Math.hypot(pts[i][0] - s.x, pts[i][1] - s.z); if (d < best) { best = d; idx = i; } } }
    for (let k = 0; k < 4 && Math.hypot(at(idx + 1)[0] - s.x, at(idx + 1)[1] - s.z) < Math.hypot(at(idx)[0] - s.x, at(idx)[1] - s.z) + 0.5; k++) idx = closed ? (idx + 1) % n : Math.min(n - 1, idx + 1);
    const bendNow = wrap(heading(idx + ahead(14)) - heading(idx));     // how much the road turns over the next 14 m
    const bendSoon = wrap(heading(idx + ahead(48)) - heading(idx + ahead(14)));
    // the point the bot steers at; `inside` metres towards the inside of a bend (a slide runs wide: the line is taken tighter)
    const tgt0 = at(idx + ahead(look)), turn = bendNow + bendSoon, hT = heading(idx + ahead(look)), off = inside * Math.max(-1, Math.min(1, turn / 0.6));
    const tgt = [tgt0[0] + Math.cos(hT) * off, tgt0[1] - Math.sin(hT) * off];
    const err = wrap(Math.atan2(tgt[0] - s.x, tgt[1] - s.z) - s.h);
    const sp = speedOf(s), slip = bodySlip(s), sliding = Math.abs(slip) > 0.15;
    if (kickLeft <= 0 && Math.abs(bendNow) > kick && sp > corner * 0.8 && !sliding) kickLeft = kickTime;
    kickLeft -= dt;
    const want = Math.abs(bendSoon) > kick || Math.abs(bendNow) > kick ? corner : speed;
    // (`dial`: while the handbrake is pulled the wheel is turned fully into the bend, so the tail really comes round)
    const steer = dial && kickLeft > 0 ? Math.sign(bendNow) : Math.max(-1, Math.min(1, err * gain + (sliding ? -slip * counter : 0)));
    const wide = Math.abs(slip) > hold;
    // `dial` (the tyre of the surface model: the pedal sets the angle): in a bend the gas follows the angle (more under `hold`, less over it); out of the bend it eases off so the rear catches
    const inBend = Math.abs(bendNow) > kick * 0.5 || Math.abs(bendSoon) > kick;
    // (`cap`: in the slide the car is not let faster than `cap` times the corner speed, or it runs wide)
    const slideGas = dial ? (inBend ? Math.max(0.35, Math.min(sp > corner * cap ? 0.55 : 1, 0.9 + (hold - Math.abs(slip)) * 2.5)) : 0.45) : wide ? 0.3 : 1;
    return {
      steer,
      throttle: sliding ? slideGas : sp < want ? 1 : 0.15,
      brake: !sliding && sp > want + 2 ? 1 : 0,
      handbrake: kickLeft > 0 ? 1 : 0,
    };
  };
}
