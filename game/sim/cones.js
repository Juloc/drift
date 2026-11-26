// Soft cones (a map's `cones`: [{ x, z, what }], drawn and knocked over, never a wall): a car that touches one knocks it down and loses points, so a missed line costs
// points, not the car. Pure data and arithmetic; the page draws the cones and shows the count. Used on the practice ground (07-practice.json).
export const CONE_R = 0.3, CAR_R = 1.1, PENALTY = 50;

/** The state of a round of cones: which are down, and where each fell (the direction the car was going). */
export const newCones = (cones) => ({ down: cones.map(() => null), hits: 0, points: 0 });

/**
 * One step of the car at (x, z) with velocity (vx, vz): returns the state with the cones the car touches knocked down (a new object when something fell, else the same).
 * A cone that is down stays down until `newCones`. `event` carries the indexes that fell in this step.
 */
export function coneStep(cs, cones, x, z, vx, vz) {
  let next = null; const fell = [], reach = (CONE_R + CAR_R) ** 2;
  for (let i = 0; i < cones.length; i++) {
    if (cs.down[i]) continue;
    const dx = cones[i].x - x, dz = cones[i].z - z;
    if (dx * dx + dz * dz > reach) continue;
    next ??= { ...cs, down: cs.down.slice() };
    const sp = Math.hypot(vx, vz) || 1;
    next.down[i] = { dx: vx / sp, dz: vz / sp, v: Math.min(1, sp / 10) };   // it falls the way the car goes, further when the car is fast
    next.hits++; next.points -= PENALTY; fell.push(i);
  }
  return next ? { ...next, event: fell } : cs;
}
