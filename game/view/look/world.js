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
  const nearPlaza = scene.plaza && !scene.road.overPlaza && scene.road.railGap ? (x, z) => distToPoly(scene.plaza.pts, x, z) < scene.road.railGap : () => false;   // the rails stay open beside the meeting place
  const onPlaza = scene.plaza && !scene.road.overPlaza ? (x, z) => insidePoly(scene.plaza.pts, x, z) : () => false;   // (`overPlaza`: the road is drawn on top of the flat area, as a track on a quay or a desert)

  land(S, f, scene, look, tier);
  ridges(S, scene, look, tier);
  const water = river(f, scene, look);
  if (scene.bridge) bridge(S, f, scene, look, lite);
  // the road has its own mesh: a slightly glossy material that shines in the low sun (the page gives it the sky as reflection)
  const Rb = new Builder({ seed: 7, jitter: 0, wobble: 0, bake: false });
  road(Rb, f, look, onPlaza, mulberry32(23), lite, scene);
  zones(Rb, f, scene, look);
  if (scene.plaza) plaza(S, G, f, scene, look, lite, lampHeads);
  roadside(S, G, f, look, tier, sideInfo, onPlaza, scene, nearPlaza);
  trees(S, f, scene, look, tier, rnd, lite);
  rocks(S, f, look, tier, rnd, sideInfo, lite);
  details(S, G, f, scene, look, tier, mulberry32(29), lite, sideInfo, onPlaza);
  if (scene.props) props(S, G, f, scene, look, lite, lampHeads);

  const group = new THREE.Group();
  // facets as in the mockup (land, trees, rocks, mountains): flat shading with the soft colour gradients; the road and the cars stay smooth
  const solid = new THREE.Mesh(S.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: look.facets !== false }));
  solid.receiveShadow = true;
  // surfaces, not flat colour: a little colour noise per facet (from its own normal) and soft blotches over the land (from the world position)
  solid.material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLandPos;').replace('#include <project_vertex>', '#include <project_vertex>\nvLandPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vLandPos;
      float lh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float ln(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(lh(i), lh(i + vec3(1, 0, 0)), f.x), mix(lh(i + vec3(0, 1, 0)), lh(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(lh(i + vec3(0, 0, 1)), lh(i + vec3(1, 0, 1)), f.x), mix(lh(i + vec3(0, 1, 1)), lh(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 facet = normalize(cross(dFdx(vLandPos), dFdy(vLandPos)));
      float tone = (lh(floor(facet * 23.0) + floor(vLandPos * 0.25)) - 0.5) * ${(look.surface?.facet ?? 0.12).toFixed(3)}
        + (ln(vLandPos * 0.08) - 0.5) * ${(look.surface?.blotch ?? 0.2).toFixed(3)} + (ln(vLandPos * 1.3) - 0.5) * ${(look.surface?.grain ?? 0.08).toFixed(3)};
      diffuseColor.rgb *= 1.0 + tone;`);
  };
  const lights = new THREE.Mesh(G.build(), makeGlow());
  const roadMesh = new THREE.Mesh(Rb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: look.road.roughness ?? 0.5, metalness: 0, envMapIntensity: look.road.sheen ?? 0.8 }));
  roadMesh.receiveShadow = true;
  // the grain of the asphalt: fine speckles and coarse blotches from the world position (no texture file)
  roadMesh.material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRoadPos;').replace('#include <project_vertex>', '#include <project_vertex>\nvRoadPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vRoadPos;
      float rh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float rn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rh(i), rh(i + vec2(1, 0)), f.x), mix(rh(i + vec2(0, 1)), rh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float grain = rh(floor(vRoadPos.xz * 22.0)) * 0.55 + rn(vRoadPos.xz * 3.0) * 0.3 + rn(vRoadPos.xz * 0.35) * 0.45;
      diffuseColor.rgb *= 0.78 + grain * 0.32;`);
  };
  group.add(solid, lights, roadMesh);
  if (water) group.add(water);
  return { group, field: f, lampHeads, road: roadMesh, triangles: [solid, lights, water, roadMesh].filter(Boolean).reduce((n, m) => n + m.geometry.index.count / 3, 0) };
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
  const H = new Float32Array(nx * nz), E = new Float32Array(nx * nz), Y = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { E[j * nx + i] = f.edge(xs[i], zs[j]); H[j * nx + i] = f.relHeight(xs[i], zs[j]); Y[j * nx + i] = f.groundY(xs[i], zs[j]); }
  const valley = C(L.valley), mid = C(L.mid), high = C(L.high), warm = C(L.warm), cool = C(L.cool), rock = C(L.rock), rockDark = C(L.rockDark), gravel = C(L.gravel), sand = C(L.sand);
  const ry = f.floor, k = new THREE.Color(), r = new THREE.Color();
  const g = gridGeo(nz, nx, (j, i) => {
    const x = xs[i], z = zs[j], h = H[j * nx + i], e = E[j * nx + i];
    const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(nz - 1, j + 1);
    const slope = Math.hypot((H[j * nx + i1] - H[j * nx + i0]) / (xs[i1] - xs[i0]), (H[j1 * nx + i] - H[j0 * nx + i]) / (zs[j1] - zs[j0]));
    const t = smoothstep(ry, 110, h);
    k.copy(valley).lerp(mid, smoothstep(0, 0.42, t)).lerp(high, smoothstep(0.5, 1, t));
    const n = noise2(x / 45, z / 45);
    k.lerp(n > 0 ? warm : cool, Math.abs(n) * 0.55);
    r.copy(rock).lerp(rockDark, 0.5 + 0.5 * noise2(x / 13, z / 13));
    k.lerp(r, smoothstep(0.75, 1.3, slope) * (0.55 + 0.45 * Math.max(0, noise2(x / 9 + 5, z / 9))));   // rock shows in patches on steep ground
    // the ground of the driving area (and the strip beside the road): `groundVar` > 0 lets it vary in patches (a sand field, a snow field, a quay) instead of one flat colour
    if (L.groundVar) { const gv = gravel.clone().lerp(noise2(x / 23 + 4, z / 23) > 0 ? warm : cool, Math.abs(noise2(x / 17, z / 17 + 8)) * L.groundVar); k.lerp(gv, 1 - smoothstep(1.5, 4.5, e)); }
    else k.lerp(gravel, 1 - smoothstep(1.5, 4.5, e));
    k.lerp(sand, smoothstep(ry + 4, ry + 0.8, h));
    // a little irregularity in the grid away from the road, so the facets do not look like a chessboard
    const cw = Math.min(xs[i1] - xs[i0], zs[j1] - zs[j0]) / 2, jit = e > f.shelf + cw * 2 ? cw * 0.28 : 0;
    const jx = jit * noise2(x * 0.71, z * 0.37), jz = jit * noise2(x * 0.43 + 9, z * 0.83);
    return [X(x + jx), h + Y[j * nx + i], z + jz, k];   // colours by the height relative to the road, the shape absolute
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
    const peak0 = (a) => { const v = 1 - Math.abs(noise2(Math.cos(a) * 2.6 + k * 11, Math.sin(a) * 2.6 - k * 5)); const w = noise2(a * 9 + k * 3, k * 7) * 0.5 + 0.5; return h0 + (h1 - h0) * (v * v * v * 0.85 + w * 0.15); };
    const peak = (a) => lower(a, peak0(a));
    const mid = base.clone().lerp(skirt, 0.5);
    const rows = [[-300, (a) => lower(a, -320), skirt], [-150, (a) => lower(a, peak0(a) * 0.15 + noise2(a * 31, k) * 12 - 120), mid], [-70, (a) => lower(a, peak0(a) * 0.5 + noise2(a * 23, k) * 10), base], [25, peak, rim]];
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
  const R = scene.river, W = look.water, [x0] = scene.terrain.extent, x1 = R ? Math.min(scene.terrain.extent[2], R.x1 ?? Infinity) : 0, deep = C(W?.deep ?? '#000000'), light = C(W?.light ?? '#000000'), k = new THREE.Color();
  const n = R ? Math.ceil((x1 - x0) / 10) + 1 : 0;
  const geos = R ? [gridGeo(n, 5, (r, c) => {
    const x = x0 + (r / (n - 1)) * (x1 - x0), z = f.riverZ(x) + (c - 2) * R.width * 0.25;
    k.copy(deep).lerp(light, c === 2 ? 0.6 + 0.2 * noise2(x / 40, 3) : c === 1 || c === 3 ? 0.4 : 0.1);
    return [X(x), f.groundY(x, z) + R.y, z, k];   // heights in the scene are relative to the road's height nearby
  })] : [];
  // a sea (a harbour): one sheet over the whole extent at a fixed level, lighter towards the middle of the picture
  if (scene.sea) { const [a0, b0, a1, b1] = scene.terrain.extent; geos.push(gridGeo(5, 5, (r, c) => { const x = a0 + (c / 4) * (a1 - a0), z = b0 + (r / 4) * (b1 - b0); k.copy(deep).lerp(light, 0.2 + 0.25 * noise2(x / 120, z / 120)); return [X(x), scene.sea.y, z, k]; })); }
  // the lake: rings of an ellipse, lighter towards the middle
  const K = scene.lake, ky = K ? f.groundY(K.x, K.z) + K.y : 0;
  if (K) geos.push(gridGeo(8, 49, (r, c) => {
    const q = 1 - r / 7, a = (c / 48) * Math.PI * 2;
    k.copy(deep).lerp(light, 0.15 + (1 - q) * 0.55);
    return [X(K.x + Math.cos(a) * K.rx * q), ky, K.z + Math.sin(a) * K.rz * q, k];
  }));
  if (!geos.length) return null;
  const g = mergeGeometries(geos.map((x) => orient(x, UP)));
  // the sky's colours in the water (emissive) and the low sun as a long glint (a sharp specular highlight)
  const m = new THREE.MeshPhongMaterial({ vertexColors: true, color: 0x9a8fc0, emissive: new THREE.Color(W.light).multiplyScalar(W.glow ?? 0.35), specular: new THREE.Color(W.glint).multiplyScalar(2.2), shininess: 140 });
  return new THREE.Mesh(g, m);
}

function bridge(S, f, scene, look, lite) {
  const B = scene.bridge, stone = C(look.bridge.stone), shade = C(look.bridge.shade);
  const alongX = B.axis === 'x', zc = B.z ?? f.riverZ(B.x), gy = f.groundY(B.x, zc), bottom = gy + (scene.lake?.y ?? scene.river.y) - 8, deck = gy + B.deck, Hh = deck - bottom, span = B.length / B.spans, p = 1.8, r = span / 2 - p, spring = Math.max(2, Hh - 3.2 - r);
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
  S.box(B.width + 0.8, 1.0, B.length + 4, X(B.x), deck + 0.5, zc, stone, { r: 0, ry });
  for (const s of [-1, 1]) S.box(0.5, 1.1, B.length + 4, X(B.x) + (alongX ? 0 : s * (B.width / 2 + 0.15)), deck + 1.5, zc + (alongX ? s * (B.width / 2 + 0.15) : 0), shade, { r: 0, ry });
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
      return [X(p[0] + rv[0] * o), (c ? yb : ya) + f.roadYs[i], p[1] + rv[1] * o, typeof colour === 'function' ? colour(i, c) : colour];
    });
    S.add(orient(g, UP), null, { keepColors: true, jitter: 0, wobble: 0 });
  }
}

/** A ribbon along the road through lateral offsets `offs` (metres, + = right), coloured per road point and column, at the road's drawn height. */
function ribbon(S, f, offs, colour, { y = 0.02, keep = () => true, dy = () => 0, shift = () => 0 } = {}) {
  const right = (d) => [d[1], -d[0]], runs = [];
  for (let i = 0; i < f.road.length; i++) if (keep(i)) { if (!runs.length || i !== runs[runs.length - 1].at(-1) + 1) runs.push([i]); else runs[runs.length - 1].push(i); }
  for (const run of runs) {
    if (run.length < 2) continue;
    const g = gridGeo(run.length, offs.length, (r, c) => {
      const i = run[r], p = f.road[i], rv = right(f.info.dir[i]), o = offs[c] + shift(i);
      return [X(p[0] + rv[0] * o), y + (f.lift ?? 0) + dy(i, c) + f.roadYs[i], p[1] + rv[1] * o, colour(i, c, o)];
    });
    S.add(orient(g, UP), null, { keepColors: true, jitter: 0, wobble: 0 });
  }
}

function road(S, f, look, onPlaza, rnd, lite, scene) {
  const R = look.road, hw = f.hw, asphalt = C(R.asphalt), light = C(R.asphaltLight), track = C(R.track ?? R.asphalt).multiplyScalar(0.8), k = new THREE.Color(), gravel = C(look.land.gravel), grass = C(look.land.cool);
  const off = (i) => !onPlaza(f.road[i][0], f.road[i][1]), lift = f.lift;
  // asphalt in columns: lighter in the middle and at the edges, darker where the wheels run (two tracks per lane), patchy along the road
  const cols = lite ? [-hw, -3.6, -1.4, 1.4, 3.6, hw] : [-hw, -4.4, -3.6, -2.8, -1.4, -0.6, 0.6, 1.4, 2.8, 3.6, 4.4, hw];
  const tracks = [-3.6, -1.4, 1.4, 3.6];
  ribbon(S, f, cols, (i, c, o) => {
    const near = Math.min(...tracks.map((t) => Math.abs(o - t)));
    k.copy(asphalt).lerp(light, 0.35 + 0.35 * noise2(f.info.s[i] / 9, o * 0.7));
    k.lerp(track, (1 - Math.min(1, near / 0.9)) * 0.7);
    if (Math.abs(o) > hw - 0.3) k.lerp(gravel, 0.35);   // the worn, broken edge of the asphalt
    return k.clone();
  });
  // shoulders: gravel at the asphalt, grass further out (not a hard edge)
  if (R.shoulder !== false) ribbon(S, f, [hw - 0.05, hw + 0.9, hw + 2.6], (i, c) => (c === 0 ? gravel.clone().multiplyScalar(0.9) : c === 1 ? gravel.clone().lerp(grass, 0.35) : grass.clone().lerp(gravel, 0.25)), { y: 0.0, dy: (i, c) => (c === 2 ? -0.25 : c === 1 ? -0.06 : 0), keep: off });
  if (R.shoulder !== false) ribbon(S, f, [-hw - 2.6, -hw - 0.9, -hw + 0.05], (i, c) => (c === 2 ? gravel.clone().multiplyScalar(0.9) : c === 1 ? gravel.clone().lerp(grass, 0.35) : grass.clone().lerp(gravel, 0.25)), { y: 0.0, dy: (i, c) => (c === 0 ? -0.25 : c === 1 ? -0.06 : 0), keep: off });
  // edge lines, worn: broken into pieces, some fainter
  const edge = C(R.edge), centre = C(R.centre), ew = (R.edgeWidth ?? 0.16) / 2;
  for (const sd of [-1, 1]) ribbon(S, f, [sd * (hw - 0.45) - ew, sd * (hw - 0.45) + ew], (i) => k.copy(edge).lerp(asphalt, Math.max(0, noise2(f.info.s[i] / 3, sd * 5)) * 0.8).clone(),
    { y: 0.04, keep: (i) => off(i) && noise2(f.info.s[i] / 1.7, sd * 9) > -0.55 });
  // centre dashes with worn gaps
  for (let d = 4; d < f.info.length - 4; d += 7.5) {
    const p = pointAt(f.road, f.info, d), q = pointAt(f.road, f.info, d + 3);
    if (onPlaza(p.x, p.z)) continue;
    const dx = q.x - p.x, dz = q.z - p.z, y0 = f.roadY(d), y1 = f.roadY(d + 3), worn = noise2(d / 11, 2);
    S.box(0.16, 0.02, 3 * (worn > 0.3 ? 0.6 : 1), X((p.x + q.x) / 2), 0.045 + lift + (y0 + y1) / 2, (p.z + q.z) / 2, k.copy(centre).lerp(asphalt, Math.max(0, worn) * 0.5).clone(), { r: 0, jitter: 0, ry: Math.atan2(X(dx), dz), rx: -Math.atan2(y1 - y0, 3) });
  }
  // the start line: two rows of black and white squares across the road at the first gate
  if (scene.startLine) {
    const { a, b, d } = scene.startLine, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, r = [d[1], -d[0]], ry = Math.atan2(X(d[0]), d[1]), y = f.groundY(mx, mz) + 0.05 + lift, sq = 0.6;
    for (let row = 0; row < 2; row++) for (let c = 0, n = Math.floor((hw * 2) / sq); c < n; c++) {
      const o = -hw + sq * (c + 0.5), x = mx + r[0] * o + d[0] * (row - 0.5) * sq, z = mz + r[1] * o + d[1] * (row - 0.5) * sq;
      S.box(sq, 0.012, sq, X(x), y, z, (c + row) % 2 ? C('#f6f1ee') : C('#18141c'), { r: 0, jitter: 0, ry });
    }
  }
  // patches (darker rectangles of newer asphalt) and cracks (thin dark lines)
  const patch = C(R.asphalt).multiplyScalar(0.78), crack = C(R.asphalt).multiplyScalar(0.55);
  for (let d = 30; d < f.info.length - 10; d += lite ? 41 : 17) {
    const p = pointAt(f.road, f.info, d), ry = Math.atan2(X(p.dir[0]), p.dir[1]), r = [p.dir[1], -p.dir[0]], o = (rnd() - 0.5) * hw * 1.4, y = f.roadY(d) + 0.03 + lift;
    if (rnd() < 0.5) S.box(1.2 + rnd() * 2, 0.01, 1.5 + rnd() * 3, X(p.x + r[0] * o), y, p.z + r[1] * o, patch, { r: 0, jitter: 0.02, ry: ry + (rnd() - 0.5) * 0.2 });
    else for (let c = 0, cx = p.x + r[0] * o, cz = p.z + r[1] * o, a = ry + (rnd() - 0.5) * 2; c < 4; c++) {
      const len = 0.6 + rnd() * 0.9, nx = cx + Math.sin(a) * len, nz = cz + Math.cos(a) * len;
      S.box(0.05, 0.01, len, X((cx + nx) / 2), y + 0.002, (cz + nz) / 2, crack, { r: 0, jitter: 0, ry: Math.atan2(X(nx - cx), nz - cz) });
      cx = nx; cz = nz; a += (rnd() - 0.5) * 1.2;
    }
  }
  // old tyre marks: many dark curved stripes through the bends (where everybody drifts), on top of the asphalt
  const mark = C(look.skid.colour);
  for (const b of bends(f.info, { min: f.bendMin, span: f.bendSpan })) for (let m = 0; m < (lite ? 4 : 10); m++) {
    const s0 = b.s - 22 + rnd() * 10, s1 = s0 + 26 + rnd() * 20, o0 = (rnd() - 0.5) * hw * 1.3, bow = (rnd() - 0.3) * 2.5 * Math.sign(-b.turn), w = 0.18 + rnd() * 0.1;
    const i0 = Math.max(0, Math.round(s0 / (f.info.length / (f.road.length - 1)))), i1 = Math.min(f.road.length - 1, Math.round(s1 / (f.info.length / (f.road.length - 1))));
    const span = Math.max(1, i1 - i0), tone = 0.35 + 0.3 * rnd();
    // a pair of curved stripes (both rear wheels) that swing out towards the outside of the bend in the middle
    for (const pair of [-0.75, 0.75]) ribbon(S, f, [-w, w], () => k.copy(asphalt).lerp(mark, tone).clone(), {
      y: 0.032 + m * 0.0005, keep: (i) => i >= i0 && i <= i1, shift: (i) => o0 + pair + bow * Math.sin(((i - i0) / span) * Math.PI) });
  }
}

// ---------------------------------------------------------------- patches of another ground on the driving area (ice, wet, an asphalt patch): flat shapes on the glossy road mesh
function zones(S, f, scene, look) {
  const Z = look.zone ?? {}, def = { ice: '#4a6ea8', wet: '#262e48', asphalt: '#3c3440', sand: '#d6a866', snow: '#e8eef8' };
  for (const z of scene.zones ?? []) {
    const colour = C(Z[z.kind] ?? def[z.kind] ?? '#555555'), k = new THREE.Color(), y = 0.028 + (f.lift ?? 0) + (z.kind === 'ice' ? 0.004 : 0);
    if (z.r !== undefined) {
      const n = 28, g = gridGeo(2, n + 1, (r, c) => { const a = (c / n) * Math.PI * 2, rr = z.r * (r ? 1 : 0.0); k.copy(colour).lerp(C('#ffffff'), r ? 0 : 0.18); return [X(z.x + Math.cos(a) * rr), y + f.groundY(z.x, z.z), z.z + Math.sin(a) * rr, k]; });
      S.add(orient(g, UP), null, { keepColors: true, jitter: 0, wobble: 0 });
    } else {
      const g = gridGeo(2, 2, (r, c) => [X(c ? z.x1 : z.x0), y + f.groundY((z.x0 + z.x1) / 2, (z.z0 + z.z1) / 2), r ? z.z1 : z.z0, colour]);
      S.add(orient(g, UP), null, { keepColors: true, jitter: 0, wobble: 0 });
    }
  }
}

// ---------------------------------------------------------------- the meeting place: surface, bays, kerb, a rail on the valley side, lamps, benches, its own trees
function plaza(S, G, f, scene, look, lite, lampHeads) {
  const P = scene.plaza, R = look.road, pts = P.pts;
  if (P.surface !== false) {
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
  const pos = [], col = [], base = C(R.plaza), k = new THREE.Color();
  for (const t of tris) for (const v of t) { const [x, z] = pts[v]; pos.push(X(x), 0.012, z); k.copy(base).lerp(C(R.asphaltLight), 0.3 + 0.3 * noise2(x / 20, z / 20)); col.push(k.r, k.g, k.b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex([...Array(pos.length / 3).keys()]);
  S.add(orient(g, UP), null, { keepColors: true, jitter: 0, wobble: 0 });
  }
  const B = P.bays, white = C(R.bay);
  if (B) for (let x = B.x0; x <= B.x1 + 0.01; x += B.pitch) S.box(0.14, 0.02, B.z1 - B.z0, X(x), 0.03, (B.z0 + B.z1) / 2, white, { r: 0, jitter: 0 });
  // kerb round the edge (not where the road leaves) and a guardrail where the land beyond falls away
  // where the road leaves the plaza: the road's point just outside it, nearest to it
  const outside = f.road.filter((p) => !insidePoly(pts, p[0], p[1])), start = outside.length ? outside.reduce((a, p) => (distToPoly(pts, p[0], p[1]) < distToPoly(pts, a[0], a[1]) ? p : a)) : [1e9, 1e9];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
    const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2, ry = Math.atan2(X(dx), dz);
    const nx = dz / len, nz = -dx / len, out = insidePoly(pts, mx + nx * 2, mz + nz * 2) ? -1 : 1;   // the normal pointing away from the plaza
    const t = ((start[0] - p[0]) * dx + (start[1] - p[1]) * dz) / (len * len);
    const roadHere = t > 0 && t < 1 && Math.abs((start[0] - p[0]) * dz - (start[1] - p[1]) * dx) / len < 3;
    if (!roadHere && P.wall && !(Math.abs(nz) > 0.9 && mz > 30)) S.box(0.5, P.wall, len, X(mx), P.wall / 2, mz, C(look.bridge?.stone ?? R.kerb), { r: 0.04, ry });   // a low stone wall where the plaza meets the slope (not on the side of the road)
    else if (!roadHere && P.kerb !== false) S.box(0.3, 0.16, len, X(mx), 0.08, mz, C(R.kerb), { r: 0, ry });
    const fall = f.base(mx + nx * out * 14, mz + nz * out * 14) < -2;
    if (P.rail && fall && !roadHere) railRun(S, G, look, [[p[0] + nx * out * 0.7, p[1] + nz * out * 0.7], [q[0] + nx * out * 0.7, q[1] + nz * out * 0.7]], 4, lite);
  }
  const L = look.lamp;
  for (const [x, z] of P.lamps ?? []) {
    S.cyl(0.11, 0.16, 6.2, X(x), 3.1, z, C(L.pole), { seg: 6 });
    S.box(0.18, 0.18, 1.6, X(x), 6.2, z - 0.7, C(L.pole), { r: 0 });
    G.box(0.5, 0.06, 0.32, X(x), 6.08, z - 1.35, glow(L.light, 2.2), { r: 0 });
    lampHeads.push([X(x), 6.0, z - 1.35]);
  }
  for (const [x, z, h] of P.benches ?? []) {
    S.box(2.0, 0.08, 0.5, X(x), 0.48, z, C('#8a6a5e'), { r: 0, ry: -h });
    S.box(2.0, 0.42, 0.07, X(x), 0.75, z + Math.cos(h) * -0.24, C('#8a6a5e'), { r: 0, ry: -h });
    for (const s of [-0.8, 0.8]) S.box(0.08, 0.46, 0.45, X(x + s), 0.23, z, C(look.rail.post), { r: 0, ry: -h });
  }
  for (const [x, z, kind] of P.trees ?? []) (kind === 'pine' ? pine : cherry)(S, look, x, f.height(x, z), z, 9 + (x % 3), mulberry32(Math.abs(x * 31 + z)), lite);
}

// a guardrail (W-beam on posts) along a polyline in simulation axes
function railRun(S, G, look, line, every, lite, yAt = () => 0) {
  const R = look.rail, beam = C(R.beam), light = C(R.beamLight), post = C(R.post);
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    const ry = Math.atan2(X(dx), dz), ya = yAt(ax, az), yb = yAt(bx, bz), ym = (ya + yb) / 2, rx = -Math.atan2(yb - ya, len);
    S.box(0.08, 0.2, len + 0.05, X((ax + bx) / 2), 0.52 + ym, (az + bz) / 2, beam, { r: 0, ry, rx, jitter: 0 });   // a W-beam at 0.75 m, as on real roads
    S.box(0.1, 0.1, len + 0.05, X((ax + bx) / 2), 0.66 + ym, (az + bz) / 2, light, { r: 0, ry, rx, jitter: 0 });
    for (let d = (every - acc) % every; d < len; d += every) {
      const t = d / len, px = X(ax + dx * t), pz = az + dz * t, py = ya + (yb - ya) * t;
      S.box(0.13, 3.0, 0.13, px, -0.75 + py, pz, post, { r: 0, ry });   // long posts: on a cliff edge the land below may already fall away
      G.reflectors = ((G.reflectors ?? 0) + 1) % 3;   // an amber reflector on every third post
      if (G.reflectors === 0) G.box(0.16, 0.1, 0.16, px, 0.8 + py, pz, glow(R.reflector, 2.4), { r: 0, ry });
    }
    acc = (acc + len) % every;
  }
}

// ---------------------------------------------------------------- along the road: guardrails on the valley side, reflector posts on the other, chevrons in the bends
function roadside(S, G, f, look, tier, sideInfo, onPlaza, scene, nearPlaza = () => false) {
  const hw = f.hw, right = (d) => [d[1], -d[0]];
  // guardrail runs: consecutive points where the land on the valley side falls by more than 2.5 m (one rail per side)
  for (const side of [-1, 1]) {
    let run = [];
    const flush = () => { if (run.length > 2) railRun(S, G, look, run, tier.railPost, tier.cell > 5, f.groundY); run = []; };
    f.road.forEach((p, i) => {
      const si = sideInfo[i];
      if (((si.valley === side && si.drop < -2.5) || scene.road.rails === 'both') && !onPlaza(p[0], p[1]) && !nearPlaza(p[0], p[1])) { const r = right(f.info.dir[i]); run.push([p[0] + r[0] * side * (hw + 1.5), p[1] + r[1] * side * (hw + 1.5)]); }
      else flush();
    });
    flush();
  }
  const P = look.post, white = C(P.white), band = C(P.band), refl = glow(P.reflector, 1.7);
  for (let d = 10; d < f.info.length; d += 22) {
    const p = pointAt(f.road, f.info, d), si = sideInfo[p.i];
    if (onPlaza(p.x, p.z)) continue;
    const r = right(p.dir), s = -si.valley, x = p.x + r[0] * s * (hw + 1.1), z = p.z + r[1] * s * (hw + 1.1), ry = Math.atan2(X(p.dir[0]), p.dir[1]), y = f.roadY(d);
    S.box(0.12, 1.4, 0.12, X(x), 0.3 + y, z, white, { r: 0, ry });
    S.box(0.13, 0.14, 0.13, X(x), 0.8 + y, z, band, { r: 0, ry });
    G.box(0.07, 0.1, 0.03, X(x), 0.8 + y, z - p.dir[1] * 0.07, refl, { r: 0, ry });
  }
  // chevrons: three pink boards with a white arrow on the outside of each bend, facing the driver coming from the plaza
  const Cv = look.chevron, board = C(Cv.board), post = C(Cv.post);
  const pts = [[-0.17, 0.26], [0.0, 0.26], [0.19, 0], [0.0, -0.26], [-0.17, -0.26], [0.02, 0]], hot = glow(Cv.arrow, 2.2);
  for (const b of bends(f.info, { min: f.bendMin, span: f.bendSpan })) {
    const out = b.turn > 0 ? -1 : 1, mirror = b.turn > 0 ? 1 : -1;
    for (const ds of [-11, 0, 11]) {
      const p = pointAt(f.road, f.info, b.s + ds), r = right(p.dir), o = hw + 1.7;
      const x = p.x + r[0] * out * o, z = p.z + r[1] * out * o;
      // the board's front (+z of its own) looks back along the road, towards the driver
      S.push(trs(X(x), f.roadY(b.s + ds), z, 0, Math.atan2(-X(p.dir[0]), -p.dir[1]), 0));
      for (const sx of [-0.55, 0.55]) S.box(0.09, 3.2, 0.09, sx, 0.1, -0.07, post, { r: 0 });
      S.box(1.9, 1.0, 0.08, 0, 1.6, 0, board, { r: 0.06, jitter: 0 });
      // the glowing double chevron is in the unlit mesh, placed through the same transform
      G.push(S.top.clone());
      for (const ox of [-0.38, 0.32]) G.prism(pts.map(([a, c]) => [a * 1.5 * mirror, c * 1.5]), 0.03, ox * mirror, 1.6, 0.055, hot, { bevel: 0, jitter: 0 });
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
  (S.cherries ??= []).push([x, z, s]);   // remembered for the petals under it
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
  // the view to the lake stays open: no trees on its shores
  const K = scene.lake, nearLake = (x, z) => !!K && Math.hypot((x - K.x) / K.rx, (z - K.z) / K.rz) < 1.9;
  const [x0, z0, x1, z1] = scene.terrain.extent, ry = f.floor;
  const [cx0, cz0, cx1, cz1] = scene.terrain.core ?? scene.terrain.extent;
  // `near`: only within 45 m of the road or the plaza (the frame of every picture), else anywhere (half of them near the core)
  const place = (count, kind, near) => {
    let made = 0;
    for (let tries = 0; tries < count * 14 && made < count; tries++) {
      const inCore = near || rnd() < 0.5;
      const x = inCore ? cx0 - 60 + rnd() * (cx1 - cx0 + 120) : x0 + rnd() * (x1 - x0), z = inCore ? cz0 - 60 + rnd() * (cz1 - cz0 + 120) : z0 + rnd() * (z1 - z0);
      const e = f.edge(x, z);
      if (e < f.shelf + 1.5 || (near && e > 45)) continue;
      const rel = f.relHeight(x, z), y = rel + f.groundY(x, z);
      // the valley side stays open near the road (the view down to the river), trees there only further out
      if (f.base(x, z) < -2 && e < (f.openValley ?? 0)) continue;
      if (rel < ry + 2 || f.slope(x, z, y) > 0.85) continue;
      if (f.wet(x, z, 4) || nearLake(x, z)) continue;
      // away from the road, cherries stay low by the river and pines thin out on the valley floor
      if (!near && kind === 'cherry' && rel > ry + 14 && rnd() > 0.1) continue;
      if (kind === 'pine' && rel < ry + 3 && rnd() > 0.35) continue;
      const h = kind === 'pine' ? 7 + rnd() * 8 : 8 + rnd() * 4;
      (kind === 'pine' ? pine : cherry)(S, look, x, y - 0.3, z, h, rnd, lite);
      made++;
      // pines grow in groups: a few more of different sizes round the first
      if (kind === 'pine') for (let g = 0, n = 2 + Math.floor(rnd() * 5); g < n && made < count; g++) {
        const a = rnd() * 6.3, d = 4 + rnd() * 9, gx = x + Math.cos(a) * d, gz = z + Math.sin(a) * d;
        if (f.edge(gx, gz) < f.shelf + 1.5 || f.wet(gx, gz, 4)) continue;
        const gr = f.relHeight(gx, gz), gy = gr + f.groundY(gx, gz);
        if (gr < ry + 2 || f.slope(gx, gz, gy) > 0.85 || (f.base(gx, gz) < -2 && f.edge(gx, gz) < (f.openValley ?? 0))) continue;
        pine(S, look, gx, gy - 0.3, gz, h * (0.45 + rnd() * 0.7), rnd, lite);
        made++;
      }
    }
  };
  // trees the scene places itself (they frame the pictures the same way on every tier)
  for (const [x, z, kind, size] of scene.trees ?? []) (kind === 'pine' ? pine : cherry)(S, look, x, f.height(x, z) - 0.3, z, size ?? (kind === 'pine' ? 13 : 11), mulberry32(Math.abs(x * 7 + z * 13)), lite);
  place(tier.nearCherries ?? 0, 'cherry', true);
  place(tier.nearPines ?? 0, 'pine', true);
  place(tier.cherries, 'cherry', false);
  place(tier.pines, 'pine', false);
  // a carpet of far trees on the valley floor and the far slope: single cones, cheap, in clumps (from far they read as forest)
  const P = look.pine;
  for (let n = 0, tries = 0; n < (tier.carpet ?? 0) && tries < (tier.carpet ?? 0) * 6; tries++) {
    const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0), e = f.edge(x, z);
    if (e < 120 || f.wet(x, z, 6) || nearLake(x, z) || noise2(x / 90, z / 90) < -0.1) continue;
    const rel = f.relHeight(x, z), y = rel + f.groundY(x, z);
    if (rel < ry + 3 || f.slope(x, z, y) > 0.9) continue;
    for (let g = 0, m = 3 + Math.floor(rnd() * 6); g < m; g++, n++) {
      const gx = x + (rnd() - 0.5) * 22, gz = z + (rnd() - 0.5) * 22, h = 7 + rnd() * 9, gy = f.height(gx, gz);
      S.cone(h * 0.28, h, X(gx), gy + h * 0.45, gz, C(P.dark).lerp(C(P.mid), rnd() * 0.6), { seg: 5, ry: rnd() * 3 });
    }
  }
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
    const [x0, z0, x1, z1] = f.core, x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
    if (f.edge(x, z) < f.shelf + 3) continue;
    if (f.slope(x, z) < 0.55) continue;
    boulder(x, z, 1.2 + rnd() * 1.8); n++;
  }
}

// ---------------------------------------------------------------- the small things: grass tufts and stones at the roadside, bushes, petals under the
// cherry trees, power poles with sagging wires along the slope, a stone lantern and a small shrine gate by the plaza
const TRI = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, -0.35, 0.5, 0, -0.2, 0, 0, 0.45], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3)); return g; })();

function details(S, G, f, scene, look, tier, rnd, lite, sideInfo, onPlaza) {
  const D = tier.details ?? {}, L = look.land, right = (d) => [d[1], -d[0]], hw = f.hw;
  const grassA = C(L.cool), grassB = C(L.warm), dry = C(L.high), stone = C(L.gravel), rock = C(L.rockDark);
  const at = (x, z) => f.height(x, z);
  // tufts and stones in the strip beside the asphalt (both sides, inside the guardrail on the valley side)
  for (let n = 0; n < (D.tufts ?? 0); n++) {
    const p = pointAt(f.road, f.info, 12 + rnd() * (f.info.length - 14)), side = rnd() < 0.5 ? -1 : 1, si = sideInfo[p.i];
    if (onPlaza(p.x, p.z)) continue;
    const reach = si.valley === side ? 1.3 : 6, o = hw + 0.2 + rnd() * reach, r = right(p.dir), x = p.x + r[0] * side * o, z = p.z + r[1] * side * o, y = Math.max(at(x, z), f.roadY(f.info.s[p.i]) - 0.25);
    const colour = grassA.clone().lerp(rnd() < 0.5 ? grassB : dry, rnd() * 0.6);
    for (let b = 0; b < 3; b++) S.cone(0.06 + rnd() * 0.05, 0.35 + rnd() * 0.35, X(x + (rnd() - 0.5) * 0.3), y + 0.15, z + (rnd() - 0.5) * 0.3, colour, { seg: 3, rx: (rnd() - 0.5) * 0.6, rz: (rnd() - 0.5) * 0.6, ry: rnd() * 3 });
  }
  for (let n = 0; n < (D.stones ?? 0); n++) {
    const p = pointAt(f.road, f.info, 12 + rnd() * (f.info.length - 14)), side = rnd() < 0.5 ? -1 : 1, si = sideInfo[p.i];
    if (onPlaza(p.x, p.z)) continue;
    const o = hw + 0.3 + rnd() * (si.valley === side ? 1.1 : 4), r = right(p.dir), x = p.x + r[0] * side * o, z = p.z + r[1] * side * o, rad = 0.08 + rnd() * 0.25;
    S.ball(rad, X(x), Math.max(at(x, z), f.roadY(f.info.s[p.i]) - 0.25) + rad * 0.3, z, stone.clone().lerp(rock, rnd()), { detail: 0, sy: 0.6, ry: rnd() * 3 });
  }
  // bushes on the uphill side, in small clusters
  for (let n = 0; n < (D.bushes ?? 0); n++) {
    const p = pointAt(f.road, f.info, 12 + rnd() * (f.info.length - 14)), si = sideInfo[p.i], side = -si.valley;
    if (onPlaza(p.x, p.z)) continue;
    const o = hw + 2.5 + rnd() * 14, r = right(p.dir), x = p.x + r[0] * side * o, z = p.z + r[1] * side * o;
    if (f.slope(x, z) > 0.9) continue;
    for (let b = 0, m = 1 + Math.floor(rnd() * 3); b < m; b++) {
      const bx = x + (rnd() - 0.5) * 2.2, bz = z + (rnd() - 0.5) * 2.2, rad = 0.5 + rnd() * 0.7;
      S.ball(rad, X(bx), at(bx, bz) + rad * 0.5, bz, grassA.clone().multiplyScalar(0.75).lerp(rnd() < 0.3 ? C(look.cherry.blossom[0]) : grassB, rnd() * 0.35), { detail: lite ? 0 : 1, sy: 0.75, ry: rnd() * 3 });
    }
  }
  // petals under the cherry trees: little flat pink triangles on the ground
  const petals = look.cherry.blossom.map(C);
  for (const [cx, cz, sc] of S.cherries ?? []) for (let n = 0; n < (D.petals ?? 0); n++) {
    const a = rnd() * 6.3, d = Math.sqrt(rnd()) * 4.5 * sc, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    S.add(TRI, petals[Math.floor(rnd() * petals.length)].clone().lerp(C('#ffffff'), rnd() * 0.3), { m: trs(X(x), at(x, z) + 0.05, z, 0, rnd() * 6.3, 0, 0.18 + rnd() * 0.12), jitter: 0, wobble: 0 });
  }
  // power poles on the uphill side, wires sagging between them
  const wood = C(look.pole?.wood ?? '#5b4140'), wire = C(look.pole?.wire ?? '#2c2430');
  if (D.poles) {
    const tops = [];
    for (let d = 40; d < f.info.length - 10; d += D.poles) {
      const p = pointAt(f.road, f.info, d), si = sideInfo[p.i], side = -si.valley, r = right(p.dir), x = p.x + r[0] * side * (hw + 6), z = p.z + r[1] * side * (hw + 6), y = at(x, z), ry = Math.atan2(X(p.dir[0]), p.dir[1]);
      S.cyl(0.13, 0.18, 9, X(x), y + 4.5, z, wood, { seg: 6 });
      S.box(2.2, 0.14, 0.14, X(x), y + 8.4, z, wood, { r: 0, ry: ry + Math.PI / 2 });
      tops.push([x, y + 8.5, z, ry]);
    }
    for (let i = 0; i < tops.length - 1; i++) for (const w of [-0.9, 0, 0.9]) {
      const [ax, ay, az, ar] = tops[i], [bx, by, bz, br] = tops[i + 1], sa = [Math.cos(ar) * w, -Math.sin(ar) * w], sb = [Math.cos(br) * w, -Math.sin(br) * w];
      const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => [ax + sa[0] + (bx + sb[0] - ax - sa[0]) * t, ay + (by - ay) * t - Math.sin(Math.PI * t) * 1.1, az + sa[1] + (bz + sb[1] - az - sa[1]) * t]);
      for (let k = 0; k < pts.length - 1; k++) {
        const [x1, y1, z1] = pts[k], [x2, y2, z2] = pts[k + 1], len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
        S.box(0.035, 0.035, len, X((x1 + x2) / 2), (y1 + y2) / 2, (z1 + z2) / 2, wire, { r: 0, jitter: 0, ry: Math.atan2(X(x2 - x1), z2 - z1), rx: -Math.atan2(y2 - y1, Math.hypot(x2 - x1, z2 - z1)) });
      }
    }
  }
  // a stone lantern and a small shrine gate where the road leaves the plaza (the place to recognise)
  for (const m of scene.marks ?? []) {
    const y = at(m.x, m.z), stoneC = C(look.lantern?.stone ?? '#b7a8a6'), red = C(look.lantern?.gate ?? '#c8423f'), ry = m.ry ?? 0;
    if (m.type === 'lantern') {
      S.box(0.9, 0.3, 0.9, X(m.x), y + 0.15, m.z, stoneC, { r: 0.04, ry });
      S.cyl(0.16, 0.2, 1.2, X(m.x), y + 0.9, m.z, stoneC, { seg: 6 });
      S.box(0.75, 0.15, 0.75, X(m.x), y + 1.55, m.z, stoneC, { r: 0.03, ry });
      S.box(0.5, 0.45, 0.5, X(m.x), y + 1.85, m.z, stoneC.clone().multiplyScalar(0.9), { r: 0.02, ry });
      G.box(0.36, 0.3, 0.52, X(m.x), y + 1.85, m.z, glow(look.lamp.light, 2.4), { r: 0, ry });
      S.cone(0.75, 0.45, X(m.x), y + 2.3, m.z, stoneC, { seg: 4, ry: ry + Math.PI / 4 });
      S.ball(0.12, X(m.x), y + 2.6, m.z, stoneC, { detail: 0 });
    } else if (m.type === 'gate') {
      S.push(trs(X(m.x), y, m.z, 0, ry, 0));
      for (const sx of [-1.3, 1.3]) S.cyl(0.14, 0.17, 3.2, sx, 1.6, 0, red, { seg: 8 });
      S.box(3.6, 0.22, 0.3, 0, 2.75, 0, red, { r: 0.03 });
      S.box(4.2, 0.2, 0.36, 0, 3.25, 0, C('#2e2428'), { r: 0.03, rz: 0 });
      S.box(0.18, 0.5, 0.2, 0, 3.0, 0, red, { r: 0 });
      S.pop();
    }
  }
}

// ---------------------------------------------------------------- things a scene lists itself (from the physics map's props): containers, lamp poles, a crane, bollards, rocks, pines
function props(S, G, f, scene, look, lite, lampHeads) {
  const Pr = look.props ?? {}, tint = Pr.tint ? C(Pr.tint) : null, tintBy = Pr.tintBy ?? 0, rnd = mulberry32(41);
  const metal = C(Pr.metal ?? '#5c6070'), L = look.lamp;
  const paint = (hex) => { const c = C(hex); if (tint) c.lerp(tint, tintBy); return c; };
  for (const p of scene.props) {
    const y = f.height(p.x, p.z);
    if (p.type === 'container') {
      const c = paint(p.color), h = 2.6;
      for (let l = 0; l < (p.levels ?? 1); l++) {
        S.box(p.w, h, p.d, X(p.x), y + h / 2 + l * h, p.z, c.clone().multiplyScalar(0.85 + 0.15 * ((l + p.x) % 2)), { r: 0.04, jitter: 0.02 });
        S.box(p.w + 0.1, 0.12, p.d + 0.1, X(p.x), y + h + l * h, p.z, c.clone().multiplyScalar(0.7), { r: 0, jitter: 0 });   // the darker roof edge
      }
    } else if (p.type === 'pole') {
      S.cyl(0.14, 0.2, 9, X(p.x), y + 4.5, p.z, metal, { seg: 6 });
      S.box(1.7, 0.16, 0.16, X(p.x), y + 8.8, p.z, metal, { r: 0 });
      if (L && p.lamp !== false) { for (const s of [-0.7, 0.7]) G.box(0.5, 0.08, 0.34, X(p.x) + s, y + 8.65, p.z, glow(L.light, 2.4), { r: 0 }); lampHeads.push([X(p.x), y + 8.6, p.z]); }
    } else if (p.type === 'crane') {
      const ry = p.ry ?? 0, c = paint('#d4a017');
      S.push(trs(X(p.x), y, p.z, 0, ry, 0));
      for (const sx of [-9, 9]) for (const sz of [-4, 4]) S.box(0.9, 24, 0.9, sx, 12, sz, c.clone().multiplyScalar(0.8), { r: 0, jitter: 0.01 });
      S.box(24, 1.6, 12, 0, 24.4, 0, c, { r: 0.02 });
      S.box(50, 1.2, 2.4, 0, 26.2, 0, c.clone().multiplyScalar(0.9), { r: 0 });
      S.box(1.6, 3.4, 1.6, 8, 22.2, 0, metal, { r: 0 });
      G.box(0.5, 0.3, 0.5, 8, 26.4, 0, glow('#ff4a3a', 2.4), { r: 0 });
      S.pop();
    } else if (p.type === 'bollard') {
      S.cyl(0.18, 0.22, 0.6, X(p.x), y + 0.3, p.z, metal, { seg: 6 });
    } else if (p.type === 'rock') {
      const r = (p.r ?? 2) * 1.15, k = C(look.land.rock).lerp(C(look.land.rockDark), rnd() * 0.7);
      S.ball(r, X(p.x), y + r * 0.35, p.z, k, { detail: lite ? 0 : 1, sx: 0.9 + rnd() * 0.3, sy: 0.75 + rnd() * 0.25, sz: 0.9 + rnd() * 0.3, ry: rnd() * 3, rx: rnd() * 0.25 });
    } else if (p.type === 'pine') {
      pine(S, look, p.x, y - 0.2, p.z, (p.h ?? 7) * 1.5, rnd, lite);
    }
  }
}
