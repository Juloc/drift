// Zone scoring, as in a competition (docs/FOCUS.md): along the track stand clipping points, each with a zone round it. A drift through a zone pays a bonus for the angle and the speed, more
// the closer the car came to the point itself (the line), and a clean clip (within 1.5 m) pays half as much again. Each point pays once per run. The bonus is added to the pending
// points of the drift chain, so it is multiplied by the chain and lost with it on a hit or a spin. Pure functions, no state of the page.

export const ZONE = { radius: 9, clip: 1.5, clipFactor: 1.5, minSlip: 0.26, minSpeed: 8, rate: 50 };

/** One state per run: for each clipping point whether it paid already and the best pass through it so far. */
export const newZones = (clips) => ({ clips, paid: clips.map(() => false), best: clips.map(() => null) });

/**
 * One simulation step. `car` = { x, z, slip (rad), speed (m/s) }. Returns { state, bonus, event }: a clipping point pays when the car leaves its zone after a drift through it
 * (event = { id, points, clean, dist, deg, kmh }), the bonus is 0 in every other step.
 */
export function zoneStep(zs, car) {
  let bonus = 0, event = null;
  const best = zs.best.slice(), paid = zs.paid.slice();
  zs.clips.forEach((c, i) => {
    if (paid[i]) return;
    const d = Math.hypot(car.x - c.x, car.z - c.z), r = c.r ?? ZONE.radius, drifting = Math.abs(car.slip) > ZONE.minSlip && car.speed > ZONE.minSpeed;
    if (d <= r) {
      if (drifting) { const deg = Math.abs(car.slip) * (180 / Math.PI), kmh = car.speed * 3.6, q = 1 - d / r, value = (kmh / 10) * (deg / 10) * ZONE.rate * q; if (!best[i] || value > best[i].value) best[i] = { value, dist: Math.min(d, best[i]?.dist ?? Infinity), deg, kmh }; else best[i] = { ...best[i], dist: Math.min(d, best[i].dist) }; }
    } else if (best[i]) {
      const b = best[i], clean = b.dist <= ZONE.clip, points = Math.round(b.value * (clean ? ZONE.clipFactor : 1));
      paid[i] = true; bonus += points; event = { id: i, points, clean, dist: b.dist, deg: b.deg, kmh: b.kmh };
    }
  });
  return { state: { clips: zs.clips, paid, best }, bonus, event };
}
