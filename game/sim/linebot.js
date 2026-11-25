// A second tiny driver for tests and pictures (not a game feature): it follows a line of points (a race loop or an open road),
// slows down before a bend, throws the tail out there with a short pull of the handbrake and holds the slide with throttle
// and counter-steer. It keeps its own place along the line.
import { bodySlip, speedOf } from './physics.js';

const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/** Returns a driver `(t, s) => controls` for the line `pts` ([x, z] points); `closed` = the line is a loop. Distances in metres. */
export function lineBot(pts, { closed = true, speed = 17, corner = 13, kick = 0.5, hold = 0.5, gain = 2.2, look = 8 } = {}) {
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
    const tgt = at(idx + ahead(look));
    const err = wrap(Math.atan2(tgt[0] - s.x, tgt[1] - s.z) - s.h);
    const bendNow = wrap(heading(idx + ahead(14)) - heading(idx));     // how much the road turns over the next 14 m
    const bendSoon = wrap(heading(idx + ahead(48)) - heading(idx + ahead(14)));
    const sp = speedOf(s), slip = bodySlip(s), sliding = Math.abs(slip) > 0.15;
    if (kickLeft <= 0 && Math.abs(bendNow) > kick && sp > corner * 0.8 && !sliding) kickLeft = 0.22;
    kickLeft -= dt;
    const want = Math.abs(bendSoon) > kick || Math.abs(bendNow) > kick ? corner : speed;
    const steer = Math.max(-1, Math.min(1, err * gain + (sliding ? -slip * 1.1 : 0)));
    const wide = Math.abs(slip) > hold;
    return {
      steer,
      throttle: sliding ? (wide ? 0.3 : 1) : sp < want ? 1 : 0.15,
      brake: !sliding && sp > want + 2 ? 1 : 0,
      handbrake: kickLeft > 0 ? 1 : 0,
    };
  };
}
