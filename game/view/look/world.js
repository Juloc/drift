// Builds a scene of a look (game/data/probe-sunset.json with game/data/looks/sunset.json): the land, layered mountains, a river with
// a bridge, the road with its lines, the plaza, guardrails, chevron signs, reflector posts, trees and rocks. Soft and painted, not
// faceted: smooth normals and colour gradients. Everything static is merged into one mesh with vertex colours (one draw call), one
// unlit mesh for things that glow (one more; the bloom of the high tier makes them shine) and the water (one more, with the sun's glint).
// Shapes come from the scene, colours and how many trees from the look, so another scene or another look needs no new code.
import * as THREE from '../../../vendor/three/three.module.js';
import { mergeGeometries } from '../../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { Builder, glow, trs } from '../../core/build.js';
import { makeGlow } from '../../core/materials.js';
import { mulberry32, noise2, smoothstep } from '../../core/rng.js';
import { X } from '../space.js';
import { makeField, bends, pointAt, insidePoly, distToPoly } from './field.js';

const C = (hex) => new THREE.Color(hex);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

/** A grid of rows x cols vertices from fn(r, c) -> [x, y, z, THREE.Color] (drawing space), two triangles per cell. */
function gridGeo(rows, cols, fn, { alternate = false } = {}) {
  const pos = new Float32Array(rows * cols * 3), col = new Float32Array(rows * cols * 3), idx = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const [x, y, z, k] = fn(r, c), i = (r * cols + c) * 3;
    pos[i] = x; pos[i + 1] = y; pos[i + 2] = z; col[i] = k.r; col[i + 1] = k.g; col[i + 2] = k.b;
  }
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = r * cols + c, b = a + 1, cc = a + cols, d = cc + 1;
    if (alternate && (r + c) & 1) idx.push(a, cc, d, a, d, b); else idx.push(a, cc, b, b, cc, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** Turn all triangles round when the first one faces away from want(firstCorner); then normals. */
function orient(g, want) {
  const p = g.attributes.position, ix = g.index.array;
  _a.fromBufferAttribute(p, ix[0]); _b.fromBufferAttribute(p, ix[1]).sub(_a); _c.fromBufferAttribute(p, ix[2]).sub(_a);
  if (_b.cross(_c).dot(want(_a)) < 0) for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  g.computeVertexNormals();
  return g;
}
const UP = () => new THREE.Vector3(0, 1, 0);

export function buildWorld(scene, look, tierName = 'high') {
  const tier = look.tiers[tierName], lite = tierName !== 'high';
  const f = makeField(scene, { cell: tier.cell });
  const S = new Builder({ seed: 5, jitter: 0.02, wobble: 0, bake: false });
  const G = new Builder({ seed: 6, jitter: 0, wobble: 0, bake: false });
  S.lite = lite;
  const rnd = mulberry32(17);
  const lampHeads = [];
  // the side of the road the valley is on (+1 = right of the direction of travel) and how far the land falls there
  const right = (d) => [d[1], -d[0]];
  const sideInfo = f.road.map((p, i) => {
    const r = right(f.info.dir[i]), hr = f.base(p[0] + r[0] * 16, p[1] + r[1] * 16), hl = f.base(p[0] - r[0] * 16, p[1] - r[1] * 16);
    return { valley: hr < hl ? 1 : -1, drop: Math.min(hr, hl), rise: Math.max(hr, hl) };
  });
  const onPlaza = (x, z) => insidePoly(scene.plaza.pts, x, z);

  land(S, f, scene, look, tier);
  ridges(S, scene, look, tier);
  const water = river(f, scene, look);
  bridge(S, f, scene, look, lite);
  road(S, f, look, onPlaza);
  plaza(S, G, f, scene, look, lite, lampHeads);
  roadside(S, G, f, look, tier, sideInfo, onPlaza);
  trees(S, f, scene, look, tier, rnd, lite);
  rocks(S, f, look, tier, rnd, sideInfo, lite);

  const group = new THREE.Group();
  const solid = new THREE.Mesh(S.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  solid.receiveShadow = true;
  const lights = new THREE.Mesh(G.build(), makeGlow());
  group.add(solid, lights, water);
  return { group, field: f, lampHeads, triangles: (solid.geometry.index.count + lights.geometry.index.count + water.geometry.index.count) / 3 };
}

// ---------------------------------------------------------------- the land: a grid over the extent, fine near the road (the core), coarser
// further out (the lines spread out step by step, so there are no cracks), coloured by height, slope and closeness to road and river
/** Grid lines from a0 to a1: `cell` apart inside [c0, c1], growing by a quarter per line outside it up to `far`. */
export function axisLines(a0, a1, c0, c1, cell, far) {
  const core = [];
  for (let v = Math.max(a0, c0); v < Math.min(a1, c1); v += cell) core.push(v);
  core.push(Math.min(a1, c1));
  const lo = [], hi = [];
  for (let v = core[0], st = cell; v > a0;) { st = Math.min(far, st * 1.25); v = Math.max(a0, v - st); lo.unshift(v); }
  for (let v = core[core.length - 1], st = cell; v < a1;) { st = Math.min(far, st * 1.25); v = Math.min(a1, v + st); hi.push(v); }
  return [...lo, ...core, ...hi];
}

function land(S, f, scene, look, tier) {
  const L = look.land, [x0, z0, x1, z1] = scene.terrain.extent, [cx0, cz0, cx1, cz1] = scene.terrain.core ?? scene.terrain.extent;
  const xs = axisLines(x0, x1, cx0, cx1, tier.cell, tier.far ?? tier.cell), zs = axisLines(z0, z1, cz0, cz1, tier.cell, tier.far ?? tier.cell);
  const nx = xs.length, nz = zs.length;
  const H = new Float32Array(nx * nz), E = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { E[j * nx + i] = f.edge(xs[i], zs[j]); H[j * nx + i] = f.height(xs[i], zs[j]); }
  const valley = C(L.valley), mid = C(L.mid), high = C(L.high), warm = C(L.warm), cool = C(L.cool), rock = C(L.rock), rockDark = C(L.rockDark), gravel = C(L.gravel), sand = C(L.sand);
  const ry = scene.river.y, k = new THREE.Color(), r = new THREE.Color();
  const g = gridGeo(nz, nx, (j, i) => {
    const x = xs[i], z = zs[j], h = H[j * nx + i], e = E[j * nx + i];
    const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(nz - 1, j + 1);
    const slope = Math.hypot((H[j * nx + i1] - H[j * nx + i0]) / (xs[i1] - xs[i0]), (H[j1 * nx + i] - H[j0 * nx + i]) / (zs[j1] - zs[j0]));
    const t = smoothstep(ry, 110, h);
    k.copy(valley).lerp(mid, smoothstep(0, 0.42, t)).lerp(high, smoothstep(0.5, 1, t));
    const n = noise2(x / 45, z / 45);
    k.lerp(n > 0 ? warm : cool, Math.abs(n) * 0.55);
    r.copy(rock).lerp(rockDark, 0.5 + 0.5 * noise2(x / 13, z / 13));
    k.lerp(r, smoothstep(0.55, 1.1, slope));
    k.lerp(gravel, 1 - smoothstep(1.5, 4.5, e));
    k.lerp(sand, smoothstep(ry + 4, ry + 0.8, h));
    // a little irregularity in the grid away from the road, so the facets do not look like a chessboard
    const cw = Math.min(xs[i1] - xs[i0], zs[j1] - zs[j0]) / 2, jit = e > f.shelf + cw * 2 ? cw * 0.28 : 0;
    const jx = jit * noise2(x * 0.71, z * 0.37), jz = jit * noise2(x * 0.43 + 9, z * 0.83);
    return [X(x + jx), h, z + jz, k];
  }, { alternate: true });
  S.add(orient(g, UP), null, { keepColors: true, jitter: 0, wobble: 0 });
}

// ---------------------------------------------------------------- mountains far away: rings of jagged ridges, each layer lighter and hazier
function ridges(S, scene, look, tier) {
  const [cx, cz] = scene.ridges.centre, sky = C(look.sky.glow), haze = C(look.fog.colour);
  scene.ridges.rings.forEach(([rad, h0, h1], k) => {
    const base = C(look.ridges[k]), rim = base.clone().lerp(sky, 0.3), skirt = base.clone().lerp(haze, 0.45), n = tier.ridge;
    // a gap in the nearer rings where the valley runs out to the lake far away (the notch of the scene)
    const N = scene.ridges.notch, na = N ? Math.atan2(N.z - cz, N.x - cx) : 0;
    const open = (a) => { if (!N || k >= N.rings) return 0; let d = Math.abs(a - na) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d; return 1 - smoothstep(N.width * 0.5, N.width, d); };
    const lower = (a, h) => (N ? h + (N.floor - h) * open(a) : h);
    const peak0 = (a) => { const v = 1 - Math.abs(noise2(Math.cos(a) * 2.6 + k * 11, Math.sin(a) * 2.6 - k * 5)); const w = noise2(a * 9 + k * 3, k * 7) * 0.5 + 0.5; return h0 + (h1 - h0) * (v * v * 0.8 + w * 0.2); };
    const peak = (a) => lower(a, peak0(a));
    const mid = base.clone().lerp(skirt, 0.5);
    const rows = [[-300, (a) => lower(a, -150), skirt], [-150, (a) => lower(a, peak0(a) * 0.15 + noise2(a * 31, k) * 12 - 30), mid], [-70, (a) => lower(a, peak0(a) * 0.5 + noise2(a * 23, k) * 10), base], [25, peak, rim]];
    const g = gridGeo(rows.length, n + 1, (row, c) => {
      const a = ((c % n) / n) * Math.PI * 2 + k * 0.37, [dr, hf, colour] = rows[row];
      const rr = rad + dr + (row === 1 || row === 2 ? noise2(a * 17 + row, k + 3) * 18 : 0);
      return [X(cx + Math.cos(a) * rr), hf(a), cz + Math.sin(a) * rr, colour];
    });
    S.add(orient(g, (p) => new THREE.Vector3(X(cx) - p.x, 0, cz - p.z)), null, { keepColors: true, jitter: 0, wobble: 0 });
  });
}

// ---------------------------------------------------------------- the river (unlit, so it keeps the sky's colours) and the bridge
function river(f, scene, look) {
  const R = scene.river, W = look.water, [x0] = scene.terrain.extent, x1 = Math.min(scene.terrain.extent[2], R.x1 ?? Infinity), deep = C(W.deep), light = C(W.light), k = new THREE.Color();
  const n = Math.ceil((x1 - x0) / 10) + 1;
  const geos = [gridGeo(n, 5, (r, c) => {
    const x = x0 + (r / (n - 1)) * (x1 - x0), z = f.riverZ(x) + (c - 2) * R.width * 0.25;
    k.copy(deep).lerp(light, c === 2 ? 0.6 + 0.2 * noise2(x / 40, 3) : c === 1 || c === 3 ? 0.4 : 0.1);
    return [X(x), R.y, z, k];
  })];
  // the lake: rings of an ellipse, lighter towards the middle
  const K = scene.lake;
  if (K) geos.push(gridGeo(8, 49, (r, c) => {
    const q = 1 - r / 7, a = (c / 48) * Math.PI * 2;
    k.copy(deep).lerp(light, 0.15 + (1 - q) * 0.55);
    return [X(K.x + Math.cos(a) * K.rx * q), K.y, K.z + Math.sin(a) * K.rz * q, k];
  }));
  const g = mergeGeometries(geos.map((x) => orient(x, UP)));
  // the sky's colours in the water (emissive) and the low sun as a long glint (a sharp specular highlight)
  const m = new THREE.MeshPhongMaterial({ vertexColors: true, color: 0x9a8fc0, emissive: new THREE.Color(W.light).multiplyScalar(W.glow ?? 0.35), specular: new THREE.Color(W.glint).multiplyScalar(2.2), shininess: 140 });
  return new THREE.Mesh(g, m);
}

function bridge(S, f, scene, look, lite) {
  const B = scene.bridge, stone = C(look.bridge.stone), shade = C(look.bridge.shade);
  const alongX = B.axis === 'x', zc = B.z ?? f.riverZ(B.x), bottom = (scene.lake?.y ?? scene.river.y) - 8, Hh = B.deck - bottom, span = B.length / B.spans, p = 1.8, r = span / 2 - p, spring = Math.max(2, Hh - 3.2 - r);
  const shape = new THREE.Shape();
  shape.moveTo(-span / 2, 0); shape.lineTo(span / 2, 0); shape.lineTo(span / 2, Hh); shape.lineTo(-span / 2, Hh); shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-r, 0); hole.lineTo(-r, spring); hole.absarc(0, spring, r, Math.PI, 0, true); hole.lineTo(r, 0); hole.closePath();
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: B.width, bevelEnabled: false, curveSegments: lite ? 5 : 9 }).translate(0, 0, -B.width / 2);
  for (let k = 0; k < B.spans; k++) {
    const o = (k - (B.spans - 1) / 2) * span;
    S.add(geo, k % 2 ? stone : shade.clone().lerp(stone, 0.6), { m: alongX ? trs(X(B.x + o), bottom, zc, 0, 0, 0) : trs(X(B.x), bottom, zc + o, 0, Math.PI / 2, 0), jitter: 0.02 });
  }
  const ry = alongX ? Math.PI / 2 : 0;
  S.box(B.width + 0.8, 1.0, B.length + 4, X(B.x), B.deck + 0.5, zc, stone, { r: 0, ry });
  for (const s of [-1, 1]) S.box(0.5, 1.1, B.length + 4, X(B.x) + (alongX ? 0 : s * (B.width / 2 + 0.15)), B.deck + 1.5, zc + (alongX ? s * (B.width / 2 + 0.15) : 0), shade, { r: 0, ry });
}

// ---------------------------------------------------------------- the road: asphalt, shoulders, white edge lines, yellow centre dashes
function strip(S, f, a, b, ya, yb, colour, keep = () => true) {
  const right = (d) => [d[1], -d[0]];
  const idx = f.road.map((_, i) => i).filter((i) => keep(i));
  if (idx.length < 2) return;
  // split into runs of consecutive kept points
  const runs = [];
  for (const i of idx) { if (!runs.length || i !== runs[runs.length - 1].at(-1) + 1) runs.push([i]); else runs[runs.length - 1].push(i); }
  for (const run of runs) {
    if (run.length < 2) continue;
    const g = gridGeo(run.length, 2, (r, c) => {
      const i = run[r], p = f.road[i], rv = right(f.info.dir[i]), o = c ? b : a;
      return [X(p[0] + rv[0] * o), c ? yb : ya, p[1] + rv[1] * o, typeof colour === 'function' ? colour(i, c) : colour];
    });
    S.add(orient(g, UP), null, { keepColors: true, jitter: 0, wobble: 0 });
  }
}

function road(S, f, look, onPlaza) {
  const R = look.road, hw = f.hw, asphalt = C(R.asphalt), light = C(R.asphaltLight), k = new THREE.Color(), gravel = C(look.land.gravel);
  const off = (i) => !onPlaza(f.road[i][0], f.road[i][1]);
  strip(S, f, -hw, hw, 0.02, 0.02, (i) => k.copy(asphalt).lerp(light, 0.5 + 0.5 * noise2(f.info.s[i] / 9, 1)).clone());
  strip(S, f, hw, hw + 2.6, 0.0, -0.25, gravel, off);
  strip(S, f, -hw - 2.6, -hw, -0.25, 0.0, gravel, off);
  const edge = C(R.edge), centre = C(R.centre);
  for (const s of [-1, 1]) strip(S, f, s * (hw - 0.45) - 0.08, s * (hw - 0.45) + 0.08, 0.04, 0.04, edge, off);
  for (let d = 4; d < f.info.length - 4; d += 7.5) {
    const p = pointAt(f.road, f.info, d), q = pointAt(f.road, f.info, d + 3);
    if (onPlaza(p.x, p.z)) continue;
    const dx = q.x - p.x, dz = q.z - p.z;
    S.box(0.16, 0.02, 3, X((p.x + q.x) / 2), 0.045, (p.z + q.z) / 2, centre, { r: 0, jitter: 0, ry: Math.atan2(X(dx), dz) });
  }
}

// ---------------------------------------------------------------- the meeting place: surface, bays, kerb, a rail on the valley side, lamps, benches, its own trees
function plaza(S, G, f, scene, look, lite, lampHeads) {
  const P = scene.plaza, R = look.road, pts = P.pts;
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
  const pos = [], col = [], base = C(R.plaza), k = new THREE.Color();
  for (const t of tris) for (const v of t) { const [x, z] = pts[v]; pos.push(X(x), 0.012, z); k.copy(base).lerp(C(R.asphaltLight), 0.3 + 0.3 * noise2(x / 20, z / 20)); col.push(k.r, k.g, k.b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex([...Array(pos.length / 3).keys()]);
  S.add(orient(g, UP), null, { keepColors: true, jitter: 0, wobble: 0 });
  const B = P.bays, white = C(R.bay);
  for (let x = B.x0; x <= B.x1 + 0.01; x += B.pitch) S.box(0.14, 0.02, B.z1 - B.z0, X(x), 0.03, (B.z0 + B.z1) / 2, white, { r: 0, jitter: 0 });
  // kerb round the edge (not where the road leaves) and a guardrail where the land beyond falls away
  // where the road leaves the plaza: the road's point just outside it, nearest to it
  const start = f.road.filter((p) => !insidePoly(pts, p[0], p[1])).reduce((a, p) => (distToPoly(pts, p[0], p[1]) < distToPoly(pts, a[0], a[1]) ? p : a));
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
    const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2, ry = Math.atan2(X(dx), dz);
    const nx = dz / len, nz = -dx / len, out = insidePoly(pts, mx + nx * 2, mz + nz * 2) ? -1 : 1;   // the normal pointing away from the plaza
    const t = ((start[0] - p[0]) * dx + (start[1] - p[1]) * dz) / (len * len);
    const roadHere = t > 0 && t < 1 && Math.abs((start[0] - p[0]) * dz - (start[1] - p[1]) * dx) / len < 3;
    if (!roadHere) S.box(0.3, 0.16, len, X(mx), 0.08, mz, C(R.kerb), { r: 0, ry });
    const fall = f.base(mx + nx * out * 14, mz + nz * out * 14) < -2;
    if (P.rail && fall && !roadHere) railRun(S, G, look, [[p[0] + nx * out * 0.7, p[1] + nz * out * 0.7], [q[0] + nx * out * 0.7, q[1] + nz * out * 0.7]], 4, lite);
  }
  const L = look.lamp;
  for (const [x, z] of P.lamps) {
    S.cyl(0.11, 0.16, 6.2, X(x), 3.1, z, C(L.pole), { seg: 6 });
    S.box(0.18, 0.18, 1.6, X(x), 6.2, z - 0.7, C(L.pole), { r: 0 });
    G.box(0.5, 0.06, 0.32, X(x), 6.08, z - 1.35, glow(L.light, 2.2), { r: 0 });
    lampHeads.push([X(x), 6.0, z - 1.35]);
  }
  for (const [x, z, h] of P.benches) {
    S.box(2.0, 0.08, 0.5, X(x), 0.48, z, C('#8a6a5e'), { r: 0, ry: -h });
    S.box(2.0, 0.42, 0.07, X(x), 0.75, z + Math.cos(h) * -0.24, C('#8a6a5e'), { r: 0, ry: -h });
    for (const s of [-0.8, 0.8]) S.box(0.08, 0.46, 0.45, X(x + s), 0.23, z, C(look.rail.post), { r: 0, ry: -h });
  }
  for (const [x, z, kind] of P.trees) (kind === 'pine' ? pine : cherry)(S, look, x, f.height(x, z), z, 9 + (x % 3), mulberry32(Math.abs(x * 31 + z)), lite);
}

// a guardrail (W-beam on posts) along a polyline in simulation axes
function railRun(S, G, look, line, every, lite) {
  const R = look.rail, beam = C(R.beam), light = C(R.beamLight), post = C(R.post);
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    const ry = Math.atan2(X(dx), dz);
    S.box(0.08, 0.2, len + 0.05, X((ax + bx) / 2), 0.62, (az + bz) / 2, beam, { r: 0, ry, jitter: 0 });
    S.box(0.1, 0.12, len + 0.05, X((ax + bx) / 2), 0.78, (az + bz) / 2, light, { r: 0, ry, jitter: 0 });
    for (let d = (every - acc) % every; d < len; d += every) {
      const t = d / len, px = X(ax + dx * t), pz = az + dz * t;
      S.box(0.13, lite ? 0.9 : 1.0, 0.13, px, lite ? 0.45 : 0.4, pz, post, { r: 0, ry });
      G.reflectors = ((G.reflectors ?? 0) + 1) % 3;   // an amber reflector on every third post
      if (G.reflectors === 0) G.box(0.16, 0.1, 0.16, px, 0.94, pz, glow(R.reflector, 2.4), { r: 0, ry });
    }
    acc = (acc + len) % every;
  }
}

// ---------------------------------------------------------------- along the road: guardrails on the valley side, reflector posts on the other, chevrons in the bends
function roadside(S, G, f, look, tier, sideInfo, onPlaza) {
  const hw = f.hw, right = (d) => [d[1], -d[0]];
  // guardrail runs: consecutive points where the land on the valley side falls by more than 2.5 m (one rail per side)
  for (const side of [-1, 1]) {
    let run = [];
    const flush = () => { if (run.length > 2) railRun(S, G, look, run, tier.railPost, tier.cell > 5); run = []; };
    f.road.forEach((p, i) => {
      const si = sideInfo[i];
      if (si.valley === side && si.drop < -2.5 && !onPlaza(p[0], p[1])) { const r = right(f.info.dir[i]); run.push([p[0] + r[0] * side * (hw + 1.5), p[1] + r[1] * side * (hw + 1.5)]); }
      else flush();
    });
    flush();
  }
  const P = look.post, white = C(P.white), band = C(P.band), refl = glow(P.reflector, 1.7);
  for (let d = 10; d < f.info.length; d += 22) {
    const p = pointAt(f.road, f.info, d), si = sideInfo[p.i];
    if (onPlaza(p.x, p.z)) continue;
    const r = right(p.dir), s = -si.valley, x = p.x + r[0] * s * (hw + 1.1), z = p.z + r[1] * s * (hw + 1.1), ry = Math.atan2(X(p.dir[0]), p.dir[1]);
    S.box(0.12, 1.0, 0.12, X(x), 0.5, z, white, { r: 0, ry });
    S.box(0.13, 0.14, 0.13, X(x), 0.8, z, band, { r: 0, ry });
    G.box(0.07, 0.1, 0.03, X(x), 0.8, z - p.dir[1] * 0.07, refl, { r: 0, ry });
  }
  // chevrons: three pink boards with a white arrow on the outside of each bend, facing the driver coming from the plaza
  const Cv = look.chevron, board = C(Cv.board), post = C(Cv.post);
  const pts = [[-0.17, 0.26], [0.0, 0.26], [0.19, 0], [0.0, -0.26], [-0.17, -0.26], [0.02, 0]], hot = glow(Cv.arrow, 2.2);
  for (const b of bends(f.info)) {
    const out = b.turn > 0 ? -1 : 1, mirror = b.turn > 0 ? 1 : -1;
    for (const ds of [-11, 0, 11]) {
      const p = pointAt(f.road, f.info, b.s + ds), r = right(p.dir), o = hw + 2.0;
      const x = p.x + r[0] * out * o, z = p.z + r[1] * out * o;
      // the board's front (+z of its own) looks back along the road, towards the driver
      S.push(trs(X(x), 0, z, 0, Math.atan2(-X(p.dir[0]), -p.dir[1]), 0));
      for (const sx of [-0.32, 0.32]) S.box(0.07, 1.5, 0.07, sx, 0.4, -0.06, post, { r: 0 });
      S.box(1.25, 0.7, 0.07, 0, 1.25, 0, board, { r: 0.05, jitter: 0 });
      // the glowing double chevron is in the unlit mesh, placed through the same transform
      G.push(S.top.clone());
      for (const ox of [-0.24, 0.2]) G.prism(pts.map(([a, c]) => [a * mirror, c]), 0.03, ox * mirror, 1.25, 0.05, hot, { bevel: 0, jitter: 0 });
      G.pop();
      S.pop();
    }
  }
}

// ---------------------------------------------------------------- trees: dark faceted pines everywhere, pink cherry trees near the road and the river
function pine(S, look, x, y, z, h, rnd, lite) {
  const P = look.pine, layers = lite ? 3 : 4;
  S.cyl(0.18 * h / 9, 0.3 * h / 9, h * 0.3, X(x), y + h * 0.15, z, C(P.trunk), { seg: 6 });
  for (let l = 0; l < layers; l++) {
    const t = l / (layers - 1), r = h * (0.3 - t * 0.17), ch = h * 0.36;
    const colour = C(P.dark).lerp(C(P.mid), t).lerp(C(P.top), t * t * 0.7);
    S.cone(r, ch, X(x), y + h * (0.24 + t * 0.5) + ch / 2, z, colour, { seg: lite ? 7 : 10, ry: rnd() * 3 });
  }
}
/** A cherry tree: a short trunk with two branches and a soft cloud of blossom (round blobs, lighter on top). */
function cherry(S, look, x, y, z, h, rnd, lite) {
  const P = look.cherry, s = h / 9, trunk = C(P.trunk);
  S.cyl(0.16 * s, 0.28 * s, 3.4 * s, X(x), y + 1.7 * s, z, trunk, { seg: 6 });
  for (const a of [rnd() * 6, rnd() * 6]) S.cyl(0.08 * s, 0.13 * s, 2.2 * s, X(x + Math.cos(a) * 0.5 * s), y + 3.6 * s, z + Math.sin(a) * 0.5 * s, trunk, { seg: 5, rz: Math.cos(a) * 0.6, rx: Math.sin(a) * 0.6 });
  const n = lite ? 3 : 5, dark = C(P.blossom[2]), light = C(P.blossom[3]);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd(), up = k === 0 ? 1 : rnd(), d = k === 0 ? 0 : (1.3 + rnd() * 0.7) * s, r = (k === 0 ? 2.4 : 1.5 + rnd() * 0.7) * s;
    const colour = C(P.blossom[Math.floor(rnd() * 2)]).lerp(up > 0.6 ? light : dark, 0.35);
    S.ball(r, X(x + Math.cos(a) * d), y + (4.6 + up * 1.3) * s, z + Math.sin(a) * d, colour, { detail: lite ? 0 : 1, sx: 1, sy: 0.85, sz: 1 });
  }
}

function trees(S, f, scene, look, tier, rnd, lite) {
  const [x0, z0, x1, z1] = scene.terrain.extent, B = scene.bridge, ry = scene.river.y;
  const [cx0, cz0, cx1, cz1] = scene.terrain.core ?? scene.terrain.extent;
  // `near`: only within 45 m of the road or the plaza (the frame of every picture), else anywhere (half of them near the core)
  const place = (count, kind, near) => {
    let made = 0;
    for (let tries = 0; tries < count * 14 && made < count; tries++) {
      const inCore = near || rnd() < 0.5;
      const x = inCore ? cx0 - 60 + rnd() * (cx1 - cx0 + 120) : x0 + rnd() * (x1 - x0), z = inCore ? cz0 - 60 + rnd() * (cz1 - cz0 + 120) : z0 + rnd() * (z1 - z0);
      const e = f.edge(x, z);
      if (e < f.shelf + 1.5 || (near && e > 45)) continue;
      const y = f.height(x, z);
      if (y < ry + 2 || f.slope(x, z, y) > 0.85) continue;
      if (f.wet(x, z, 4)) continue;
      // away from the road, cherries stay low by the river and pines thin out on the valley floor
      if (!near && kind === 'cherry' && y > ry + 14 && rnd() > 0.1) continue;
      if (kind === 'pine' && y < ry + 8 && rnd() > 0.35) continue;
      const h = kind === 'pine' ? 7 + rnd() * 8 : 8 + rnd() * 4;
      (kind === 'pine' ? pine : cherry)(S, look, x, y - 0.3, z, h, rnd, lite);
      made++;
    }
  };
  // trees the scene places itself (they frame the pictures the same way on every tier)
  for (const [x, z, kind] of scene.trees ?? []) (kind === 'pine' ? pine : cherry)(S, look, x, f.height(x, z) - 0.3, z, kind === 'pine' ? 13 : 11, mulberry32(Math.abs(x * 7 + z * 13)), lite);
  place(tier.nearCherries ?? 0, 'cherry', true);
  place(tier.nearPines ?? 0, 'pine', true);
  place(tier.cherries, 'cherry', false);
  place(tier.pines, 'pine', false);
}

// ---------------------------------------------------------------- rocks: faceted boulders at the foot of the cut and on steep slopes
function rocks(S, f, look, tier, rnd, sideInfo, lite) {
  const L = look.land, right = (d) => [d[1], -d[0]];
  const boulder = (x, z, r) => {
    const y = f.height(x, z);
    S.ball(r, X(x), y + r * 0.25, z, C(L.rock).lerp(C(L.rockDark), rnd() * 0.7), { detail: lite ? 0 : 1, sx: 0.8 + rnd() * 0.5, sy: 0.55 + rnd() * 0.3, sz: 0.8 + rnd() * 0.5, ry: rnd() * 3, rx: rnd() * 0.3 });
  };
  let n = 0;
  for (let d = 30; d < f.info.length && n < tier.rocks / 2; d += 9) {
    const p = pointAt(f.road, f.info, d), si = sideInfo[p.i];
    if (si.rise < 4 || rnd() < 0.35) continue;
    const r = right(p.dir), s = -si.valley, o = f.hw + f.shelf + rnd() * 2.5;
    boulder(p.x + r[0] * s * o, p.z + r[1] * s * o, 1.0 + rnd() * 1.6); n++;
  }
  for (let tries = 0; tries < tier.rocks * 30 && n < tier.rocks; tries++) {
    const [x0, z0, x1, z1] = [-180, -300, 380, 200], x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
    if (f.edge(x, z) < f.shelf + 3) continue;
    if (f.slope(x, z) < 0.55) continue;
    boulder(x, z, 1.2 + rnd() * 1.8); n++;
  }
}
