// Map queries as pure functions: what the ground is under a car, and walls and obstacles that push it back.
// A map is plain data (game/data/maps/*.json, read by the browser now and by the server later):
//   bounds    outer polygon [[x,z],...]   (closed, the car must stay inside: it becomes walls)
//   walls     [{ pts: [[x,z],...], closed }]  solid polylines and islands
//   obstacles [{ x, z, r }]               round solid things (poles, planters)
//   zones     [{ kind, x, z, r } or { kind, x0, z0, x1, z1 }]  ground other than `ground`, first match wins
//   road      { kind, halfWidth }: the ground within halfWidth of `centre` (the loop) is `kind`, not `ground`
//   ground    kind of the ground everywhere else

export const SURFACES = {
  asphalt: { mu: 1.0 },
  wet: { mu: 0.9 },
  sand: { mu: 0.8 },
  grass: { mu: 0.7 },
  snow: { mu: 0.6 },
  ice: { mu: 0.4 },
};

export const CAR_RADIUS = 1.0;

/** Turn the JSON into what the queries need (flat list of wall segments). */
export function prepareMap(json) {
  const segs = [];
  const addLine = (pts, closed) => {
    const n = pts.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      segs.push(p[0], p[1], q[0], q[1]);
    }
  };
  addLine(json.bounds, true);
  for (const w of json.walls ?? []) addLine(w.pts, w.closed !== false);
  const roadSegs = [];
  if (json.road && json.centre) for (let i = 0; i < json.centre.length; i++) { const p = json.centre[i], q = json.centre[(i + 1) % json.centre.length]; roadSegs.push(p[0], p[1], q[0], q[1]); }
  return { ...json, segs: Float64Array.from(segs), roadSegs: Float64Array.from(roadSegs), obstacles: json.obstacles ?? [], zones: json.zones ?? [] };
}

/** Ground kind and grip at a point. */
export function surfaceAt(map, x, z) {
  for (const zn of map.zones) {
    const hit = zn.r !== undefined ? (x - zn.x) ** 2 + (z - zn.z) ** 2 <= zn.r * zn.r : x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1;
    if (hit) return { kind: zn.kind, mu: SURFACES[zn.kind].mu };
  }
  if (map.road && onRoad(map, x, z)) return { kind: map.road.kind, mu: SURFACES[map.road.kind].mu };
  return { kind: map.ground, mu: SURFACES[map.ground].mu };
}

const _r = [0, 0];
/** Is the point within the road's half width of the loop? */
function onRoad(map, x, z) {
  const sg = map.roadSegs, r2 = map.road.halfWidth * map.road.halfWidth;
  for (let i = 0; i < sg.length; i += 4) if (closest(x, z, sg[i], sg[i + 1], sg[i + 2], sg[i + 3], _r) <= r2) return true;
  return false;
}

/** Closest point on a segment to p, written into out, returns squared distance. */
function closest(px, pz, x1, z1, x2, z2, out) {
  const dx = x2 - x1, dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - x1) * dx + (pz - z1) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  out[0] = x1 + dx * t;
  out[1] = z1 + dz * t;
  return (px - out[0]) ** 2 + (pz - out[1]) ** 2;
}

const _c = [0, 0];

/**
 * Push a car (a circle) out of walls and obstacles. Returns a new state and `hit` = the speed (m/s) with which it
 * met the hardest obstacle (0 = nothing). The normal part of the velocity is reflected at 25 %, the sliding part keeps
 * 90 %, and the car's spin is reduced a little.
 */
export function collide(map, s, radius = CAR_RADIUS) {
  let { x, z, vx, vz, w } = s;
  let hit = 0;
  const r2 = radius * radius;
  const push = (nx, nz, depth) => {
    x += nx * depth;
    z += nz * depth;
    const vn = vx * nx + vz * nz;
    if (vn < 0) {
      const tx = vx - vn * nx, tz = vz - vn * nz;
      vx = tx * 0.9 - vn * 0.25 * nx;
      vz = tz * 0.9 - vn * 0.25 * nz;
      w *= 0.8;
      if (-vn > hit) hit = -vn;
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    const sg = map.segs;
    for (let i = 0; i < sg.length; i += 4) {
      const d2 = closest(x, z, sg[i], sg[i + 1], sg[i + 2], sg[i + 3], _c);
      if (d2 < r2) {
        const d = Math.sqrt(d2);
        let nx, nz;
        if (d > 1e-6) { nx = (x - _c[0]) / d; nz = (z - _c[1]) / d; }
        else { // exactly on the wall: use the segment's own normal
          const ex = sg[i + 2] - sg[i], ez = sg[i + 3] - sg[i + 1], el = Math.hypot(ex, ez) || 1;
          nx = -ez / el; nz = ex / el;
        }
        push(nx, nz, radius - d);
      }
    }
    for (const o of map.obstacles) {
      const dx = x - o.x, dz = z - o.z, rr = o.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 1e-6;
        push(dx / d, dz / d, rr - d);
      }
    }
  }
  return { ...s, x, z, vx, vz, w, hit };
}

/** Is the point inside a polygon (even-odd)? */
export function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
