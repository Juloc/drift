// The pure maths of a drawn landscape (no three.js, testable in node): an open road sampled from control points, the
// distance of a point to the ground the cars drive on (road and plaza), and the height and kind of the land around it.
// The cars drive on flat ground at y = 0; the land rises above the road on the uphill side (a cut with rock faces) and
// falls away on the other (an embankment), following a height profile across the valley. Coordinates are the simulation's.
import { noise2, smoothstep } from '../../core/rng.js';

/** Points along an open Catmull-Rom curve through `ctrl`, about `step` metres apart. */
export function sampleOpen(ctrl, step = 2) {
  const out = [], n = ctrl.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(n - 1, i + 2)];
    const k = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  out.push([...ctrl[n - 1]]);
  return out;
}

/** Points along a closed Catmull-Rom curve through `ctrl`, about `step` metres apart; the first point is repeated at the end (so the loop is a polyline that ends where it began). */
export function sampleClosed(ctrl, step = 2) {
  const out = [], n = ctrl.length;
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i + n - 1) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
    const k = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  out.push([...out[0]]);
  return out;
}

/** Along a polyline: cumulative length, unit direction of travel and the heading (simulation's: atan2(dx, dz)) at each point. `closed`: the last point is the first again, and the ends look across the seam. */
export function pathInfo(pts, closed = false) {
  const n = pts.length, s = [0], dir = [], head = [];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  for (let i = 0; i < n; i++) {
    const a = closed && i === 0 ? pts[n - 2] : pts[Math.max(0, i - 1)], b = closed && i === n - 1 ? pts[1] : pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    dir.push([dx / l, dz / l]); head.push(Math.atan2(dx, dz));
  }
  return { s, dir, head, length: s[n - 1] };
}

/** The point and direction at distance `d` along a polyline with its pathInfo. */
export function pointAt(pts, info, d) {
  let i = 0;
  while (i < pts.length - 2 && info.s[i + 1] < d) i++;
  const t = Math.max(0, Math.min(1, (d - info.s[i]) / ((info.s[i + 1] - info.s[i]) || 1)));
  const a = pts[i], b = pts[i + 1];
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dir: info.dir[i], i };
}

const flat = new WeakMap(), rings = new WeakMap();
/** Distance from a point to a polyline (open), to which side of it the point lies (+1 = the right of the direction of travel), and the nearest segment and where on it (0..1). */
export function distToPath(pts, x, z) {
  let a = flat.get(pts);
  if (!a) flat.set(pts, (a = Float64Array.from(pts.flat())));
  let best = Infinity, side = 1, seg = 0, along = 0;
  for (let i = 0; i < a.length - 2; i += 2) {
    const ax = a[i], az = a[i + 1], dx = a[i + 2] - ax, dz = a[i + 3] - az;
    // cheap reject: the segment's box is farther away than the best so far
    if ((x < ax - best && x < ax + dx - best) || (x > ax + best && x > ax + dx + best) || (z < az - best && z < az + dz - best) || (z > az + best && z > az + dz + best)) continue;
    const l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const ex = x - ax - dx * t, ez = z - az - dz * t, d = Math.sqrt(ex * ex + ez * ez);
    if (d < best) { best = d; side = (x - ax) * dz - (z - az) * dx < 0 ? -1 : 1; seg = i / 2; along = t; }
  }
  return { d: best, side, seg, t: along };
}

export function insidePoly(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** Distance to a closed polygon's edge, 0 inside. */
export function distToPoly(poly, x, z) {
  if (insidePoly(poly, x, z)) return 0;
  let ring = rings.get(poly);
  if (!ring) rings.set(poly, (ring = [...poly, poly[0]]));
  return distToPath(ring, x, z).d;
}

/** Smooth interpolation through [[z, h], ...] sorted by z (Catmull-Rom, flat beyond the ends). */
export function profileAt(profile, z) {
  const n = profile.length;
  if (z <= profile[0][0]) return profile[0][1];
  if (z >= profile[n - 1][0]) return profile[n - 1][1];
  let i = 0;
  while (profile[i + 1][0] < z) i++;
  const [z1, h1] = profile[i], [z2, h2] = profile[i + 1];
  const h0 = profile[Math.max(0, i - 1)][1], h3 = profile[Math.min(n - 1, i + 2)][1];
  const t = (z - z1) / (z2 - z1), t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * h1 + (-h0 + h2) * t + (2 * h0 - 5 * h1 + 4 * h2 - h3) * t2 + (-h0 + 3 * h1 - 3 * h2 + h3) * t3);
}

/**
 * The land of a scene (see game/data/probe-sunset.json). `cell` is the size of the drawn grid: the flat shelf around the road
 * is made wide enough that no triangle of that size can lift the land over the road's edge.
 */
export function makeField(scene, { cell = 6 } = {}) {
  const closed = scene.road.closed === true;
  const road = closed ? sampleClosed(scene.road.ctrl, 2) : sampleOpen(scene.road.ctrl, 2), info = pathInfo(road, closed), hw = scene.road.halfWidth;
  const T = scene.terrain, R = scene.river ?? { z: 1e9, width: 0, y: T.floor ?? -50 };   // a scene without a river (a loop, a harbour) still has a floor to measure from
  const plazaPts = scene.plaza?.pts ?? null;
  // which side of a closed road is its inside (+1 = right of the direction of travel): the land rises there ('road' mode) and falls away outside
  const rightOf = (p, d) => [p[0] + d[1], p[1] - d[0]];
  const insideSide = closed ? (insidePoly(road, ...rightOf(road[0], info.dir[0])) ? 1 : -1) : 1;
  // the valley's line: either a gentle wave, or `shift` ([[x, dz], ...]: the profile moved along z with x, so that the valley follows the road)
  const wave = T.mode ? () => 0 : T.shift ? (x) => { const P = T.shift; if (x <= P[0][0]) return P[0][1]; for (let i = 1; i < P.length; i++) if (x <= P[i][0]) return P[i - 1][1] + ((P[i][1] - P[i - 1][1]) * (x - P[i - 1][0])) / (P[i][0] - P[i - 1][0]); return P[P.length - 1][1]; }
    : (x) => T.wave[0] * Math.sin(x / T.wave[1]);
  const riverZ = (x) => R.z + wave(x);
  // the road's visible height along its length (`road.grade`: [[metres along, height], ...]); only drawn: the physics stays flat (2D)
  // `terrain.mode` 'slope': the land is one hillside, its height a profile along `terrain.dir` (downhill, [x, z]); a road that winds down it
  // (switchbacks, hairpins) takes its height from the hillside under it (`road.grade`: 'slope'), so every branch sits in the hill at its own height
  const slopeDir = T.mode === 'slope' ? ((d) => { const l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; })(T.dir ?? [0, -1]) : null;
  const hill = (x, z) => profileAt(T.profile, x * slopeDir[0] + z * slopeDir[1]);
  let G = scene.road.grade ?? [[0, 0]];
  if (scene.road.grade === 'slope') {
    // the hillside's height along the road, smoothed over about 20 m so the road does not follow every bump; the plaza's end stays at its start
    const raw = road.map(([x, z]) => hill(x, z)), k = 10, sm = raw.map((_, i) => { let a = 0, n = 0; for (let j = Math.max(0, i - k); j <= Math.min(raw.length - 1, i + k); j++) { a += raw[j]; n++; } return a / n; });
    G = info.s.map((sv, i) => [sv, sm[i] - (scene.road.cut ?? 0.5)]);
  }
  const roadY = (sAlong) => { if (sAlong <= G[0][0]) return G[0][1]; for (let i = 1; i < G.length; i++) if (sAlong <= G[i][0]) { const k = (sAlong - G[i - 1][0]) / (G[i][0] - G[i - 1][0]); return G[i - 1][1] + (G[i][1] - G[i - 1][1]) * k * k * (3 - 2 * k); } return G[G.length - 1][1]; };
  const roadYs = info.s.map(roadY);
  /** the height of the driving ground under a point (the road's height at its nearest point; the plaza and its surroundings at the road's start) */
  const groundY = (x, z) => { const q = distToPath(road, x, z); return roadY(info.s[q.seg] + (info.s[q.seg + 1] - info.s[q.seg]) * q.t); };
  const shelf = T.flat + cell * 1.45;   // up to here from the edge of the road the land stays just under the road
  /** the land without the road: the valley's profile, gently waving, and some noise that is quiet near the river */
  // `terrain.mode`: 'road' keys the profile by the signed distance to a closed road (inside negative: the land rises there, outside it falls away), 'area' by the distance to the
  // flat driving area (`plaza`: a quay, a desert, a snow field) and 0 inside it; without a mode the profile runs across the valley along z
  const across = T.mode === 'road' ? (x, z) => { const q = distToPath(road, x, z); return q.d * (q.side === insideSide ? -1 : 1); }
    : T.mode === 'area' ? (x, z) => distToPoly(plazaPts, x, z) : (x, z) => z - wave(x);
  const base = (x, z) => {
    if (slopeDir) return slopeBase(x, z);
    const zz = across(x, z), h = profileAt(T.profile, zz);
    const quiet = T.mode ? 1 : smoothstep(R.width * 0.6, R.width * 0.6 + 30, Math.abs(zz - R.z));
    const n = noise2(x / 60, z / 60) * 0.65 + noise2(x / 21, z / 21) * 0.3 + noise2(x / 7, z / 7) * 0.05;
    // the valley floor gets low rolling hills away from the road (they hide nothing: the road's own edge is higher on screen)
    const H = T.hills ?? { amp: 22, from: -20, to: -45, near: 0 };
    const hills = Math.max(0, noise2(x / 130 + 3.1, z / 130 - 1.7)) * H.amp * smoothstep(H.from, H.to, h) * (H.near ? smoothstep(-H.near, -H.near * 2, zz) : 1);
    // no hills round the lake (it must be seen from the road), and the land opens towards it
    const Kq = scene.lake ? Math.hypot((x - scene.lake.x) / scene.lake.rx, (z - scene.lake.z) / scene.lake.rz) : 9;
    let v = h + n * (4 + Math.abs(h) * 0.16) * quiet + hills * quiet * smoothstep(1.3, 3.2, Kq);
    // a lake: the land sinks under the water inside the ellipse, the shore is a little inside its edge
    const K = scene.lake;
    if (K) { const q = Math.hypot((x - K.x) / K.rx, (z - K.z) / K.rz); if (q < 1.4) v = Math.min(v, K.y + 2 + (q - 0.92) * 30 * Math.max(1, q)); }
    return v;
  };
  /** 'slope' mode: the hillside with noise and the lake (heights absolute), as a height relative to the road nearby */
  const slopeBase = (x, z) => {
    let v = hill(x, z);
    const n = noise2(x / 60, z / 60) * 0.65 + noise2(x / 21, z / 21) * 0.3 + noise2(x / 7, z / 7) * 0.05;
    v += n * (T.noise ?? 5);
    const K = scene.lake;
    if (K) { const q = Math.hypot((x - K.x) / K.rx, (z - K.z) / K.rz); if (q < 1.6) v = Math.min(v, K.y - 3 + (q - 0.92) * (T.shore ?? 40) * Math.max(1, q)); }
    // a small island in the lake (lake.island: x, z, r, h)
    const I = K?.island; if (I) { const d = Math.hypot(x - I.x, z - I.z) / I.r; if (d < 1) v = Math.max(v, K.y - 2 + I.h * (1 - d * d)); }
    return v - groundY(x, z);
  };
  /** the height of water: absolute on a hillside ('slope' mode), else relative to the road nearby */
  const waterY = (x, z, y) => (slopeDir ? y : groundY(x, z) + y);
  /** distance to the edge of the ground the cars drive on (0 on it) */
  const edge = plazaPts ? (x, z) => Math.max(0, Math.min(distToPath(road, x, z).d - hw, distToPoly(plazaPts, x, z))) : (x, z) => Math.max(0, distToPath(road, x, z).d - hw);
  const height = (x, z) => groundY(x, z) + relHeight(x, z);
  /** the land's height relative to the driving ground near it */
  const relHeight = (x, z) => {
    const e = edge(x, z);
    // land that falls away may start right at the road's edge (a cliff behind the guardrail: nothing can poke up over the road);
    // land that rises keeps the flat shelf first, wide enough for the grid
    const b = base(x, z);
    if (b < 0 && T.drop) { const k = smoothstep(T.drop[0], T.drop[1], e); return -0.15 * (1 - k) + b * k; }
    if (e < shelf) return -0.15;
    const k = smoothstep(shelf, shelf + T.blend, e);
    return -0.15 * (1 - k) + b * k;
  };
  const slope = (x, z, h = height(x, z)) => Math.hypot(height(x + 1, z) - h, height(x, z + 1) - h);
  /** is a point on water (river or lake)? */
  const onIsland = (x, z) => { const I = scene.lake?.island; return !!I && Math.hypot(x - I.x, z - I.z) < I.r * 0.8; };
  const wet = (x, z, margin = 0) => !onIsland(x, z) && ( (R.width > 0 && Math.abs(z - riverZ(x)) < R.width / 2 + margin && x < (R.x1 ?? Infinity)) || (scene.lake && Math.hypot((x - scene.lake.x) / (scene.lake.rx + margin), (z - scene.lake.z) / (scene.lake.rz + margin)) < 1));
  return { core: T.rocksBox ?? T.core ?? T.extent, onIsland, slope: !!slopeDir, waterY, closed, insideSide, floor: R.y, lift: scene.road.lift ?? 0, road, info, hw, shelf, base, edge, height, relHeight, groundY, roadY, roadYs, slope, riverZ, wave, wet, bendMin: scene.road.bendMin ?? 0.55, bendSpan: scene.road.bendSpan ?? 20, openValley: T.openValley ?? 0 };
}

/** Bends of a road: places where the heading turns by more than `min` rad over `span` metres; the sign is the turn (+ = right). */
export function bends(info, { span = 20, min = 0.55, gap = 30 } = {}) {
  const out = [], n = info.head.length, k = Math.max(1, Math.round(span / 2 / (info.length / (n - 1))));
  const turnAt = (i) => { let d = info.head[Math.min(n - 1, i + k)] - info.head[Math.max(0, i - k)]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  for (let i = k; i < n - k; i++) {
    const t = turnAt(i);
    if (Math.abs(t) < min || Math.abs(t) < Math.abs(turnAt(i - 1)) || Math.abs(t) < Math.abs(turnAt(i + 1))) continue;
    if (out.length && info.s[i] - out[out.length - 1].s < gap) continue;
    out.push({ i, s: info.s[i], turn: t });
  }
  return out;
}
