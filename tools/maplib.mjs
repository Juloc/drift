// Shared helpers of the map scripts (tools/make-map.mjs and tools/make-maps.mjs): shapes, splines, offsets, gates, grids, random numbers.
export const round = (v) => Math.round(v * 100) / 100;
export const rect = (cx, cz, w, h) => [[cx - w / 2, cz - h / 2], [cx + w / 2, cz - h / 2], [cx + w / 2, cz + h / 2], [cx - w / 2, cz + h / 2]];

/** Closed Catmull-Rom spline through control points, `per` samples per segment. */
export function spline(ctrl, per) {
  const out = [];
  const n = ctrl.length;
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i + n - 1) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  return out;
}

export function loopLength(centre) {
  let length = 0;
  for (let i = 0; i < centre.length; i++) { const a = centre[i], b = centre[(i + 1) % centre.length]; length += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return length;
}

/** Unit direction of travel at each point of a closed loop. */
export function tangents(centre) {
  return centre.map((p, i) => { const a = centre[(i + centre.length - 1) % centre.length], b = centre[(i + 1) % centre.length]; const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; });
}

/** The loop moved sideways by d (positive: to the right of the direction of travel, which is (dz, -dx)... in x, z terms). */
export function offsetLoop(centre, d) {
  const t = tangents(centre);
  return centre.map((p, i) => [p[0] + t[i][1] * d, p[1] - t[i][0] * d]);
}

/** `count` gates across the loop at equal distances; gate 0 stands at centre[start]. A gate is a segment `half` metres either side of the line. */
export function makeGates(centre, count, half, start = 0) {
  const c = start ? [...centre.slice(start), ...centre.slice(0, start)] : centre;
  const length = loopLength(c), cum = [0];
  for (let i = 0; i < c.length; i++) { const a = c[i], b = c[(i + 1) % c.length]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const gates = [];
  for (let g = 0; g < count; g++) {
    const want = (length * g) / count;
    let i = 0; while (i < c.length - 1 && cum[i + 1] <= want) i++;
    const a = c[i], b = c[(i + 1) % c.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t = (want - cum[i]) / len, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    gates.push({ a: [round(x - dz * half), round(z + dx * half)], b: [round(x + dz * half), round(z - dx * half)], d: [Math.round(dx * 1000) / 1000, Math.round(dz * 1000) / 1000] });
  }
  return { gates, centre: c, length };
}

/** Eight slots in four rows AFTER gate 0 (front row 30 m past the line, rows 8 m apart, 4 m either side of the line), looking along the track. */
export function makeGrid(gate0, lateral = 4) {
  const [dx, dz] = gate0.d, cx = (gate0.a[0] + gate0.b[0]) / 2, cz = (gate0.a[1] + gate0.b[1]) / 2, h = Math.atan2(dx, dz);
  return Array.from({ length: 8 }, (_, i) => {
    const s = 30 - 8 * Math.floor(i / 2), side = i % 2 ? lateral : -lateral;
    return { x: round(cx + dx * s + dz * side), z: round(cz + dz * s - dx * side), h };
  });
}

export function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** Shortest distance from (x, z) to the closed loop. */
export function distToLoop(centre, x, z) {
  let best = Infinity;
  for (let i = 0; i < centre.length; i++) {
    const a = centre[i], b = centre[(i + 1) % centre.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)));
  }
  return best;
}

export const bbox = (pts) => ({ x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), z0: Math.min(...pts.map((p) => p[1])), z1: Math.max(...pts.map((p) => p[1])) });
