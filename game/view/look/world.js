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
import { sunDirection } from './sky.js';
import { makeFoliage } from './foliage.js';

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
  // look.models (high tier only): places for model files instead of code shapes; the stage loads the files and fills them (stage.js, addModels)
  S.models = look.models ?? null;   // (the lantern model only on the high tier: see stoneLantern; the rocks on every tier, fewer on the phone)
  S.slots = {};
  S.slot = (kind, x, y, z, ry, sx, sy = sx, sz = sx, n = null) => { const v = new THREE.Vector3(x, y, z); if (S.top) v.applyMatrix4(S.top); (S.slots[kind] ??= []).push([v.x, v.y, v.z, ry, sx, sy, sz, n]); };   // `n`: the ground's normal (drawing axes): the rock leans with the ground   // in world space (the builder may be lifted, as on the plaza)
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
  // the far mountains: unlit when the look says so (`farUnlit`), so each layer keeps its own colour (lighter and rosier with distance,
  // as in the mockup) instead of lying dark in its own shade against the low sun
  const Far = new Builder({ seed: 8, jitter: 0, wobble: 0, bake: false });
  ridges(look.farUnlit ? Far : S, scene, look, tier);
  const water = river(f, scene, look);
  if (scene.bridge) bridge(S, f, scene, look, lite);
  // the road has its own mesh: a slightly glossy material that shines in the low sun (the page gives it the sky as reflection)
  const Rb = new Builder({ seed: 7, jitter: 0, wobble: 0, bake: false });
  Rb.lite = lite;
  road(Rb, f, look, onPlaza, mulberry32(23), lite, scene);
  zones(Rb, f, scene, look);
  const pools = [];   // warm pools of light on the ground under the lamps and lanterns: [x, y, z, radius] in drawing space
  if (scene.plaza) plaza(S, G, f, scene, look, lite, lampHeads, pools);
  roadside(S, G, f, look, tier, sideInfo, onPlaza, scene, nearPlaza, lampHeads, pools);
  trees(S, f, scene, look, tier, rnd, lite);
  // no loose boulders where a hairpin has its own set (scene.road.bendSets): the wall is there
  const sets = scene.road.bendSets ? bends(f.info, { min: f.bendMin, span: f.bendSpan }).filter((b) => Math.abs(b.turn) > 1).map((b) => pointAt(f.road, f.info, b.s + 15)) : [];
  const nearSet = (x, z) => sets.some((p) => Math.hypot(p.x - x, p.z - z) < 38);
  rockFace(S, f, look, tier, sideInfo, lite, nearSet);
  rocks(S, f, look, tier, rnd, sideInfo, lite, nearSet);
  details(S, G, f, scene, look, tier, mulberry32(29), lite, sideInfo, onPlaza);
  if (scene.road.lamps) roadLamps(S, G, f, scene, look, sideInfo, lampHeads, pools);
  if (scene.props) props(S, G, f, scene, look, lite, lampHeads);

  const group = new THREE.Group();
  // facets as in the mockup (land, trees, rocks, mountains): flat shading with the soft colour gradients; the road and the cars stay smooth
  const solid = new THREE.Mesh(S.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: look.facets !== false }));
  solid.receiveShadow = false;   // three's VSM shadow pass draws every receiver again: with the land and the trees (about 450 k triangles) as receivers the frame cost twice the world; only the road and the car receive the car's shadow
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
      diffuseColor.rgb *= 1.0 + tone;
      // props (posts, lanterns, trees) within 3 m of the camera and above the ground it looks over dissolve in a fine dither: no black pole in front of the lens; the ground itself stays
      float dcam = distance(vLandPos, cameraPosition);
      if (dcam < 3.0 && vLandPos.y > cameraPosition.y - 0.9 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) > smoothstep(0.8, 3.0, dcam)) discard;`);
  };
  const lights = new THREE.Mesh(G.build(), makeGlow());
  const far = Far.count ? new THREE.Mesh(Far.build(), new THREE.MeshBasicMaterial({ vertexColors: true })) : null;
  const roadMesh = new THREE.Mesh(Rb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: look.road.roughness ?? 0.5, metalness: 0, envMapIntensity: look.road.sheen ?? 0.8 }));
  roadMesh.receiveShadow = look.road.receiveShadow !== false;   // off: the shadow pass skips the long road (the car's own contact shadow sits under it)
  // the grain of the asphalt: fine speckles and coarse blotches from the world position (no texture file)
  roadMesh.material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRoadPos;').replace('#include <project_vertex>', '#include <project_vertex>\nvRoadPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vRoadPos;
      float rh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float rn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rh(i), rh(i + vec2(1, 0)), f.x), mix(rh(i + vec2(0, 1)), rh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float grain = rh(floor(vRoadPos.xz * 22.0)) * 0.55 + rn(vRoadPos.xz * 3.0) * 0.3 + rn(vRoadPos.xz * 0.35) * 0.45;
      diffuseColor.rgb *= ${(1 - (look.road.grain ?? 0.32) * 0.7).toFixed(3)} + grain * ${(look.road.grain ?? 0.32).toFixed(3)};`);   // look.road.grain: how strong
  };
  group.add(solid, lights, roadMesh);
  const foliage = makeFoliage(f, scene, look, tier, mulberry32(61), (S.slots.rocks ?? []).map((r) => [-r[0], r[2], r[4]]));   // grass and low plants beside the road (view/look/foliage.js; none on the phone)
  if (foliage) group.add(foliage);
  const poolMesh = lightPools(pools, look, f);
  if (poolMesh) group.add(poolMesh);
  if (water) group.add(water);
  if (far) group.add(far);
  return { group, field: f, lampHeads, slots: S.slots, road: roadMesh, triangles: [solid, lights, water, roadMesh, far].filter(Boolean).reduce((n, m) => n + m.geometry.index.count / 3, 0) };
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
    // look.land.moss + `mossReach` (metres): a carpet of moss and low plants beside the road, green-violet with lighter and darker patches, fading out over the reach: the slopes the
    // camera sees are not bare violet (on every tier: it is only a colour). Not on steep rock, not under water.
    if (L.moss && L.mossReach) {
      const patch = noise2(x / 6 + 2, z / 6 - 3) * 0.5 + noise2(x / 2.3, z / 2.3 + 7) * 0.25, mk = C(L.moss).lerp(cool, 0.35 + 0.3 * noise2(x / 11, z / 11));
      mk.multiplyScalar(0.8 + 0.5 * patch);
      k.lerp(mk, (L.mossMix ?? 0.8) * (1 - smoothstep(L.mossReach * 0.35, L.mossReach, e)) * (1 - smoothstep(0.55, 0.9, slope)) * smoothstep(0.4, 1.5, e));
    }
    k.lerp(sand, smoothstep(ry + 4, ry + 0.8, h));
    // a little irregularity in the grid away from the road, so the facets do not look like a chessboard
    const cw = Math.min(xs[i1] - xs[i0], zs[j1] - zs[j0]) / 2, jit = e > f.shelf + cw * 2 ? cw * 0.28 : 0;
    const jx = jit * noise2(x * 0.71, z * 0.37), jz = jit * noise2(x * 0.43 + 9, z * 0.83);
    return [X(x + jx), h + Y[j * nx + i], z + jz, k];   // colours by the height relative to the road, the shape absolute
  }, { alternate: true });
  S.add(orient(g, UP), null, { keepColors: true, jitter: 0, wobble: 0 });
}

// ---------------------------------------------------------------- mountains far away: rings of jagged ridges, each layer lighter and hazier
function volcanoes(S, scene, look) {
  // big lone cones far away (scene.volcanoes: [x, z, radius, height, layer]): a crater on top, the layer's colour, a lighter rim on the sun's side
  const haze = C(look.fog.colour);
  for (const [x, z, r, h, k] of scene.volcanoes ?? []) {
    // air between: the farther layer the more of the haze; a lighter crater rim (snow or bare rock, look.volcano.rim) at the top
    const V = look.volcano ?? {}, vh = C(V.hazeColour ?? look.fog.colour), base = C(look.ridges[Math.min(look.ridges.length - 1, k ?? 0)]).lerp(vh, V.haze ?? 0.35), top = base.clone().lerp(C(V.rim ?? '#ffffff'), V.rimMix ?? 0.15);
    // a lathe with concave flanks (wide skirt, steep upper cone, a small crater): soft, not a sharp-edged cone
    const prof = []; for (let j = 0; j <= 10; j++) { const t = j / 10; prof.push(new THREE.Vector2(r * (0.1 + 0.9 * Math.pow(1 - t, 1.8)), t * h)); }
    const g = new THREE.LatheGeometry(prof, 40);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const t = p.getY(i) / h, a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, p.getY(i) + noise2(a * 3 + x, t * 4) * h * 0.035 * (1 - t)); c.copy(base).lerp(top, smoothstep(0.78, 0.97, t)).lerp(haze, (1 - t) * 0.45); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    S.add(g, null, { m: trs(X(x), -h * 0.1, z), keepColors: true, jitter: 0, wobble: 0 });
    // a thin dark plume drifting off the crater of the highest one (look.volcano.plume: colour)
    if (V.plume && h === Math.max(...scene.volcanoes.map((q) => q[3]))) for (let p2 = 0; p2 < 7; p2++) { const t = p2 / 6, pr = r * (0.05 + t * 0.07); S.ball(pr, X(x + t * r * 0.45), h * 0.9 + t * h * 0.35, z, C(V.plume).lerp(haze, t * 0.6), { detail: 1, sy: 0.45, jitter: 0 }); }
  }
}

function ridges(S, scene, look, tier) {
  if (scene.volcanoes) volcanoes(S, scene, look);
  if (!scene.ridges) return;
  const [cx, cz] = scene.ridges.centre, sky = C(look.sky.glow), haze = C(look.fog.colour);
  scene.ridges.rings.forEach(([rad, h0, h1], k) => {
    const base = C(look.ridges[k]), rim = base.clone().lerp(sky, 0.3), skirt = base.clone().lerp(haze, 0.45), n = tier.ridge;
    // a gap in the nearer rings where the valley runs out to the lake far away (the notch of the scene)
    const N = scene.ridges.notch, na = N ? Math.atan2(N.z - cz, N.x - cx) : 0;
    const open = (a) => { if (!N || k >= N.rings) return 0; let d = Math.abs(a - na) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d; return 1 - smoothstep(N.width * 0.5, N.width, d); };
    const lower = (a, h) => (N ? h + (N.floor - h) * open(a) : h);
    const sharp = scene.ridges.sharp ?? 2.6;   // how many peaks round the ring (higher: more, steeper peaks)
    const peak0 = (a) => { const v = 1 - Math.abs(noise2(Math.cos(a) * sharp + k * 11, Math.sin(a) * sharp - k * 5)); const w = noise2(a * 9 + k * 3, k * 7) * 0.5 + 0.5; return h0 + (h1 - h0) * (v * v * v * 0.85 + w * 0.15); };
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
    return [X(x), f.waterY(x, z, R.y), z, k];   // heights in the scene are relative to the road's height nearby (absolute on a hillside)
  })] : [];
  // a sea (a harbour): one sheet over the whole extent at a fixed level, lighter towards the middle of the picture
  if (scene.sea) { const [a0, b0, a1, b1] = scene.terrain.extent; geos.push(gridGeo(5, 5, (r, c) => { const x = a0 + (c / 4) * (a1 - a0), z = b0 + (r / 4) * (b1 - b0); k.copy(deep).lerp(light, 0.2 + 0.25 * noise2(x / 120, z / 120)); return [X(x), scene.sea.y, z, k]; })); }
  // the lake: rings of an ellipse, lighter towards the middle
  const K = scene.lake, ky = K ? f.waterY(K.x, K.z, K.y) : 0;
  if (K) geos.push(gridGeo(10, 97, (r, c) => {
    const q = 1 - r / 9, a = (c / 96) * Math.PI * 2;
    // the sky in the water: bright and orange on the side towards the sun, darker towards the viewer, and a path of light to the sun
    const sd = look.sun?.dir ?? [0, 0, -1], sl = Math.hypot(sd[0], sd[2]) || 1, ux = Math.cos(a) * q, uz = Math.sin(a) * q;
    const along = (ux * sd[0] + uz * sd[2]) / sl, across = Math.abs(ux * sd[2] - uz * sd[0]) / sl;
    k.copy(deep).lerp(light, Math.min(1, 0.12 + 0.5 * smoothstep(-0.6, 1, along) + 0.45 * (1 - smoothstep(0.02, 0.14, across)) * smoothstep(-0.2, 0.9, along)));
    return [X(K.x + Math.cos(a) * K.rx * q), ky, K.z + Math.sin(a) * K.rz * q, k];
  }));
  if (!geos.length) return null;
  const g = mergeGeometries(geos.map((x) => orient(x, UP)));
  if (W.mirror) return new THREE.Mesh(g, mirrorWater(look));
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

/**
 * The height the road's surface has at road point `i`, `o` metres to the right of its centre line. On a map built with the track system (field.surfaceRoad) that is the surface the
 * car drives on (centre height plus side tilt: the same function as the physics, so the drawn road and the car agree); else the centre height of the grade.
 */
const baseY = (f, p, rv, o, i) => (f.surfaceRoad ? f.groundY(p[0] + rv[0] * o, p[1] + rv[1] * o) : f.roadYs[i]);

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
      return [X(p[0] + rv[0] * o), (c ? yb : ya) + baseY(f, p, rv, o, i), p[1] + rv[1] * o, typeof colour === 'function' ? colour(i, c) : colour];
    });
    S.add(orient(g, UP), null, { keepColors: true, jitter: 0, wobble: 0 });
  }
}

/** A ribbon along the road through lateral offsets `offs` (metres, + = right), coloured per road point and column, at the road's drawn height. */
function ribbon(S, f, offs, colour, { y = 0.02, keep = () => true, dy = () => 0, shift = () => 0 } = {}) {
  const right = (d) => [d[1], -d[0]], runs = [], H = f.info.head, n = f.road.length;
  // a lite builder (the phone) takes every second point where the road runs nearly straight; in the bends every point stays
  // (on a map with the track system also where the road's side tilt changes: the surface bends there and the drawn road must follow it)
  const tilt = (i) => { const rv = right(f.info.dir[i]), p = f.road[i], w = f.hw; return baseY(f, p, rv, w, i) - baseY(f, p, rv, -w, i); };
  const fine = (i) => !S.lite || i % 2 === 0 || i === n - 1 || Math.abs(Math.atan2(Math.sin(H[Math.min(n - 1, i + 1)] - H[Math.max(0, i - 1)]), Math.cos(H[Math.min(n - 1, i + 1)] - H[Math.max(0, i - 1)]))) > 0.06 || (f.surfaceRoad && Math.abs(tilt(Math.min(n - 1, i + 1)) - tilt(Math.max(0, i - 1))) > 0.03);
  for (let i = 0; i < n; i++) if (keep(i) && fine(i)) { const last = runs.at(-1)?.at(-1); if (last === undefined || !(i === last + 1 || (i === last + 2 && keep(last + 1)))) runs.push([i]); else runs[runs.length - 1].push(i); }
  for (const run of runs) {
    if (run.length < 2) continue;
    const g = gridGeo(run.length, offs.length, (r, c) => {
      const i = run[r], p = f.road[i], rv = right(f.info.dir[i]), o = offs[c] + shift(i);
      return [X(p[0] + rv[0] * o), y + (f.lift ?? 0) + dy(i, c) + baseY(f, p, rv, o, i), p[1] + rv[1] * o, colour(i, c, o)];
    });
    S.add(orient(g, UP), null, { keepColors: true, jitter: 0, wobble: 0 });
  }
}

function road(S, f, look, onPlaza, rnd, lite, scene) {
  const R = look.road, hw = f.hw, asphalt = C(R.asphalt), light = C(R.asphaltLight), track = C(R.track ?? R.asphalt).multiplyScalar(0.8), k = new THREE.Color(), gravel = C(look.land.gravel), grass = C(look.land.cool);
  const off = (i) => !onPlaza(f.road[i][0], f.road[i][1]), lift = f.lift;
  // asphalt in columns: lighter in the middle and at the edges, darker where the wheels run (two tracks per lane), patchy along the road
  const cols = lite || R.columns === 'few' ? [-hw, -3.6, -1.4, 1.4, 3.6, hw] : R.columns === 'mid' ? [-hw, -4.2, -3.6, -1.4, 0, 1.4, 3.6, 4.2, hw] : [-hw, -4.4, -3.6, -2.8, -1.4, -0.6, 0.6, 1.4, 2.8, 3.6, 4.4, hw];   // look.road.columns
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
  if (scene.road.centreLine !== false) for (let d = 4; d < f.info.length - 4; d += 7.5) {   // (the touge has white edge lines only)
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
    const p = pointAt(f.road, f.info, d), ry = Math.atan2(X(p.dir[0]), p.dir[1]), r = [p.dir[1], -p.dir[0]], o = (rnd() - 0.5) * hw * 1.4, y = (f.surfaceRoad ? f.groundY(p.x + r[0] * o, p.z + r[1] * o) : f.roadY(d)) + 0.03 + lift;   // (on the track system's road: on its tilted surface, not at the height of the centre line)
    if (rnd() < 0.5) {
      const pw = 1.2 + rnd() * 2, pl = 1.5 + rnd() * 3, turn = (rnd() - 0.5) * 0.2;
      if (f.surfaceRoad) {   // laid on the tilted surface: a strip of the road's own net (a flat box would stand 6 cm over its high side)
        const i0 = Math.round(d / (f.info.length / (f.road.length - 1)));
        ribbon(S, f, [o - pw / 2, o + pw / 2], () => patch.clone(), { y: 0.03, keep: (i) => i >= i0 && i <= i0 + 2 });
      } else S.box(pw, 0.01, pl, X(p.x + r[0] * o), y, p.z + r[1] * o, patch, { r: 0, jitter: 0, ry: ry + turn });
    }
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
function plaza(S, G, f, scene, look, lite, lampHeads, pools = []) {
  const P = scene.plaza, R = look.road, pts = P.pts, rnd = mulberry32(41);
  // the plaza is flat at the height of the road where it starts (on a hillside that is not 0): everything of it is drawn on that level.
  // (The road's first point, not the height under a corner of the plaza: near a hairpin that is the road's lower leg, 14 m further down.)
  const gp = f.roadYs[0];
  S.push(trs(0, gp, 0, 0, 0, 0)); G.push(trs(0, gp, 0, 0, 0, 0));
  // scene.plaza.slabs (metres): the floor in stone slabs, each a little lighter or darker, with lighter joints between them (the joints are the floor below)
  if (P.slabs && P.surface !== false) {
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]), n = P.slabs, gap = 0.09, base = C(R.plaza), k = new THREE.Color();
    for (let x = Math.min(...xs); x < Math.max(...xs); x += n) for (let z = Math.min(...zs); z < Math.max(...zs); z += n) {
      if (![[x, z], [x + n, z], [x, z + n], [x + n, z + n]].every(([a, b]) => insidePoly(pts, a, b))) continue;
      k.copy(base).multiplyScalar(0.78 + rnd() * 0.3).lerp(C(R.asphaltLight), 0.2 * noise2(x / 15, z / 15) + 0.15);
      S.box(n - gap, 0.03, n - gap, X(x + n / 2), 0.03, z + n / 2, k.clone(), { r: 0, jitter: 0 });
    }
  }
  if (P.surface !== false) {
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
  const pos = [], col = [], base = P.slabs ? C(R.plaza).lerp(C(R.kerb), 0.35) : C(R.plaza), k = new THREE.Color();   // under slabs: the light joints
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
    // scene.plaza.edges: where the land beyond rises a bank of soft rocks, moss and cherry bushes; where it falls stone lanterns with their light
    if (P.edges && !roadHere) {
      const rise = f.base(mx + nx * out * 10, mz + nz * out * 10) > 1.5, L2 = look.land;
      for (let d = 2; d < len - 1; d += rise ? (lite ? 4 : 2.6) : 14) {
        const bx = p[0] + (dx / len) * d, bz = p[1] + (dz / len) * d;
        if (Math.hypot(bx - start[0], bz - start[1]) < 12) continue;   // the way out to the road stays clear
        if (rise) {
          const o = 1.6 + rnd() * 1.2, x = bx + nx * out * o, z = bz + nz * out * o, r = 0.8 + rnd() * 0.7;
          S.ball(r, X(x), r * 0.5, z, C(L2.rock).lerp(C(L2.rockDark), rnd() * 0.6), { detail: 1, sx: 1.3, sy: 0.9, sz: 1.0, ry: rnd() * 3 });
          if (rnd() < 0.5) S.ball(r * 0.6, X(x), r * 1.0, z, C(L2.high).lerp(C(L2.moss ?? '#6f8a5c'), 0.6), { detail: 1, sx: 1.3, sy: 0.45, sz: 1.1 });
          if (rnd() < 0.35) bush(S, look, x - nx * out * 1.4, 0, z - nz * out * 1.4, 0.8 + rnd() * 0.3, rnd, lite);
        } else {
          const x = bx - nx * out * 0.9, z = bz - nz * out * 0.9;
          stoneLantern(S, G, look, x, 0, z, ry, 0.95); lampHeads.push([X(x), gp + 1.75, z, 1.5]); pools.push([X(x), gp, z, 4.5]);   // halos and pools are in world space
        }
      }
    }
  }
  // scene.plaza.gateLights: a stone lantern on each side of the torii where the road leaves, lighting its pillars from below
  for (const m of P.gateLights ? scene.marks ?? [] : []) if (m.type === 'gate') for (const sd of [-1, 1]) {
    const w = (m.width ?? 2.6) / 2 + 1.4, ry = m.ry ?? 0, x = m.x + Math.cos(ry) * sd * w, z = m.z - Math.sin(ry) * sd * w;
    const gy = f.height(x, z); stoneLantern(S, G, look, x, gy - gp, z, ry, 1.1, true); lampHeads.push([X(x), gy + 2.0, z, 1.8]); pools.push([X(x), gy, z, 6]);   // inside the plaza's lift
  }
  const L = look.lamp;
  for (const [x, z] of P.lamps ?? []) {
    S.cyl(0.11, 0.16, 6.2, X(x), 3.1, z, C(L.pole), { seg: 6 });
    S.box(0.18, 0.18, 1.6, X(x), 6.2, z - 0.7, C(L.pole), { r: 0 });
    G.box(0.5, 0.06, 0.32, X(x), 6.08, z - 1.35, glow(L.light, 2.2), { r: 0 });
    lampHeads.push([X(x), gp + 6.0, z - 1.35]);
    if (L.pool) pools.push([X(x), gp, z - 1.35, L.pool]);
  }
  for (const [x, z, h] of P.benches ?? []) {
    S.box(2.0, 0.08, 0.5, X(x), 0.48, z, C('#8a6a5e'), { r: 0, ry: -h });
    S.box(2.0, 0.42, 0.07, X(x), 0.75, z + Math.cos(h) * -0.24, C('#8a6a5e'), { r: 0, ry: -h });
    for (const s of [-0.8, 0.8]) S.box(0.08, 0.46, 0.45, X(x + s), 0.23, z, C(look.rail.post), { r: 0, ry: -h });
  }
  S.pop(); G.pop();
  for (const [x, z, kind] of P.trees ?? []) (kind === 'pine' ? pine : cherry)(S, look, x, f.height(x, z), z, 9 + (x % 3), mulberry32(Math.abs(x * 31 + z)), lite);
}

// a guardrail (W-beam on posts) along a polyline in simulation axes
function railRun(S, G, look, line0, every, lite, yAt = () => 0) {
  const R = look.rail, beam = C(R.beam), light = C(R.beamLight), post = C(R.post);
  // fewer, longer beam pieces where the line is nearly straight (a 2 km road with rails on both sides is otherwise tens of thousands of triangles)
  const tol = lite ? 0.06 : 0.025, maxLen = lite ? 14 : 8, line = [line0[0]];
  for (let i = 1; i < line0.length - 1; i++) {
    const a = line[line.length - 1], b = line0[i], c = line0[i + 1];
    const h1 = Math.atan2(b[0] - a[0], b[1] - a[1]), h2 = Math.atan2(c[0] - b[0], c[1] - b[1]);
    let d = Math.abs(h2 - h1); if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > tol || Math.hypot(c[0] - a[0], c[1] - a[1]) > maxLen || Math.abs(yAt(c[0], c[1]) - yAt(a[0], a[1])) > 0.8) line.push(b);
  }
  line.push(line0[line0.length - 1]);
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    const ry = Math.atan2(X(dx), dz), ya = yAt(ax, az), yb = yAt(bx, bz), ym = (ya + yb) / 2, rx = -Math.atan2(yb - ya, len);
    if (lite) S.box(0.1, 0.28, len + 0.05, X((ax + bx) / 2), 0.56 + ym, (az + bz) / 2, beam.clone().lerp(light, 0.5), { r: 0, ry, rx, jitter: 0 });   // the phone: one beam
    else {
      S.box(0.08, 0.2, len + 0.05, X((ax + bx) / 2), 0.52 + ym, (az + bz) / 2, beam, { r: 0, ry, rx, jitter: 0 });   // a W-beam at 0.75 m, as on real roads
      S.box(0.1, 0.1, len + 0.05, X((ax + bx) / 2), 0.66 + ym, (az + bz) / 2, light, { r: 0, ry, rx, jitter: 0 });
    }
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
function roadside(S, G, f, look, tier, sideInfo, onPlaza, scene, nearPlaza = () => false, lampHeads = [], pools = []) {
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
    const r = right(p.dir), s = -si.valley, x = p.x + r[0] * s * (hw + 1.1), z = p.z + r[1] * s * (hw + 1.1), ry = Math.atan2(X(p.dir[0]), p.dir[1]), y = f.surfaceRoad ? f.groundY(x, z) : f.roadY(d);
    S.box(0.12, 1.4, 0.12, X(x), 0.3 + y, z, white, { r: 0, ry });
    S.box(0.13, 0.14, 0.13, X(x), 0.8 + y, z, band, { r: 0, ry });
    G.box(0.07, 0.1, 0.03, X(x), 0.8 + y, z - p.dir[1] * 0.07, refl, { r: 0, ry });
  }
  // chevrons: three pink boards with a white arrow on the outside of each bend, facing the driver coming from the plaza
  const Cv = look.chevron, board = C(Cv.board), post = C(Cv.post);
  const pts = [[-0.17, 0.26], [0.0, 0.26], [0.19, 0], [0.0, -0.26], [-0.17, -0.26], [0.02, 0]], hot = glow(Cv.arrow, Cv.glow ?? 2.2);
  // look.chevron.count: two arrows (default) or three smaller ones side by side, as on the mockup's boards
  const three = Cv.count === 3, arrows = three ? [-0.52, 0, 0.52] : [-0.38, 0.32], ak = three ? 1.25 : 1.5;
  for (const b of bends(f.info, { min: f.bendMin, span: f.bendSpan })) {
    const out = b.turn > 0 ? -1 : 1, mirror = b.turn > 0 ? 1 : -1;
    for (const ds of [-11, 0, 11]) {
      const p = pointAt(f.road, f.info, b.s + ds), r = right(p.dir), o = hw + 1.7;
      const x = p.x + r[0] * out * o, z = p.z + r[1] * out * o;
      // the board's front (+z of its own) looks back along the road, towards the driver
      S.push(trs(X(x), f.surfaceRoad ? f.groundY(x, z) : f.roadY(b.s + ds), z, 0, Math.atan2(-X(p.dir[0]), -p.dir[1]), 0));
      for (const sx of [-0.55, 0.55]) S.box(0.09, 3.2, 0.09, sx, 0.1, -0.07, post, { r: 0 });
      S.box(1.9, 1.0, 0.08, 0, 1.6, 0, board, { r: 0.06, jitter: 0 });
      // the glowing chevrons are in the unlit mesh, placed through the same transform
      G.push(S.top.clone());
      for (const ox of arrows) G.prism(pts.map(([a, c]) => [a * ak * mirror, c * ak]), 0.03, ox * mirror, 1.6, 0.055, hot, { bevel: 0, jitter: 0 });
      G.pop();
      S.pop();
    }
    // look.lantern.bends: a stone lantern on the inside of every bend and one at its exit on the outside (between the road and the rail, where the
    // chase camera looks), each with a warm pool of light round it
    if (scene.road.bendSets && Math.abs(b.turn) > 1) { bendSet(S, G, f, look, b, lampHeads, pools, tier.cell > 8); continue; }
    if (look.lantern?.bends) for (const [ds, sd, o] of [[0, -out, hw + 2.4], [20, out, hw + 0.95]]) {
      const p = pointAt(f.road, f.info, b.s + ds), r = right(p.dir), side = sd;
      const x = p.x + r[0] * side * o, z = p.z + r[1] * side * o, y = Math.max(f.height(x, z), f.roadY(b.s + ds) - 0.2), k = look.lantern.size ?? 1.1;
      if (onPlaza(x, z)) continue;
      stoneLantern(S, G, look, x, y, z, Math.atan2(X(p.dir[0]), p.dir[1]), k);
      lampHeads.push([X(x), y + 1.85 * k, z, look.lantern.halo ?? 1.6]);
      pools.push([X(x), y, z, look.lantern.pool ?? 5]);
    }
  }
}

// ---------------------------------------------------------------- trees: dark faceted pines everywhere, pink cherry trees near the road and the river
function pine(S, look, x, y, z, h, rnd, lite) {
  // look.pine.shape: { layers, width, tier } for a narrower, taller cedar (defaults: the round pine)
  const P = look.pine, Sh = P.shape ?? {}, layers = lite ? Math.max(3, (Sh.layers ?? 4) - 2) : Sh.layers ?? 4, wide = Sh.width ?? 0.3, tierH = Sh.tier ?? 0.36;
  S.cyl(0.18 * h / 9, 0.3 * h / 9, h * 0.3, X(x), y + h * 0.15, z, C(P.trunk), { seg: 6 });
  for (let l = 0; l < layers; l++) {
    const t = l / (layers - 1), r = h * (wide - t * wide * 0.6), ch = h * tierH;
    const colour = C(P.dark).lerp(C(P.mid), t).lerp(C(P.top), t * t * 0.7);
    S.cone(r, ch, X(x), y + h * (0.24 + t * (0.86 - tierH)) + ch / 2, z, colour, { seg: lite ? 7 : 10, ry: rnd() * 3 });
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
  // scene.terrain.sight (drop per metre): below the road a tree's top stays under the line of sight from the road down into the valley, so the lake
  // shows over the forest; the tallest a tree may be at (x, z) (Infinity above the road or without it)
  const sight = scene.terrain.sight, capH = (x, z, e, rel) => (sight == null || rel > -1 ? Infinity : -rel + 1.2 - e * sight);
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
      const cap = capH(x, z, e, rel), h = Math.min(cap, kind === 'pine' ? 7 + rnd() * 8 : 8 + rnd() * 4);
      if (h < 4) continue;
      (kind === 'pine' ? pine : cherry)(S, look, x, y - 0.3, z, h, rnd, lite);
      made++;
      // pines grow in groups: a few more of different sizes round the first
      if (kind === 'pine') for (let g = 0, n = 2 + Math.floor(rnd() * 5); g < n && made < count; g++) {
        const a = rnd() * 6.3, d = 4 + rnd() * 9, gx = x + Math.cos(a) * d, gz = z + Math.sin(a) * d;
        if (f.edge(gx, gz) < f.shelf + 1.5 || f.wet(gx, gz, 4)) continue;
        const gr = f.relHeight(gx, gz), gy = gr + f.groundY(gx, gz);
        if (gr < ry + 2 || f.slope(gx, gz, gy) > 0.85 || (f.base(gx, gz) < -2 && f.edge(gx, gz) < (f.openValley ?? 0))) continue;
        const gh = Math.min(capH(gx, gz, f.edge(gx, gz), gr), h * (0.45 + rnd() * 0.7));
        if (gh < 3) continue;
        pine(S, look, gx, gy - 0.3, gz, gh, rnd, lite);
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
  // trees on the lake's island
  const I = scene.lake?.island;
  if (I) for (let n = 0; n < (lite ? 8 : 20); n++) { const a = rnd() * 6.3, d = Math.sqrt(rnd()) * I.r * 0.7, x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, h = 6 + rnd() * 6; S.cone(h * 0.3, h, X(x), f.height(x, z) + h * 0.45, z, C(look.pine.dark).lerp(C(look.pine.mid), rnd() * 0.6), { seg: 6, ry: rnd() * 3 }); }
  // a carpet of far trees on the valley floor and the far slope: single cones, cheap, in clumps (from far they read as forest)
  const P = look.pine;
  for (let n = 0, tries = 0; n < (tier.carpet ?? 0) && tries < (tier.carpet ?? 0) * 6; tries++) {
    // scene.terrain.forest [x0, z0, x1, z1]: where the carpet goes (the hillside between road and lake that the camera sees), else the whole land
    const FB = scene.terrain.forest ?? [x0, z0, x1, z1];
    const x = FB[0] + rnd() * (FB[2] - FB[0]), z = FB[1] + rnd() * (FB[3] - FB[1]), e = f.edge(x, z);
    if (e < (tier.carpetNear ?? 120) || f.wet(x, z, 6) || nearLake(x, z) || noise2(x / 90, z / 90) < -0.1) continue;
    const rel = f.relHeight(x, z), y = rel + f.groundY(x, z);
    if (rel < ry + 3 || f.slope(x, z, y) > 0.9) continue;
    for (let g = 0, m = 3 + Math.floor(rnd() * 6); g < m; g++, n++) {
      const gx = x + (rnd() - 0.5) * 22, gz = z + (rnd() - 0.5) * 22, gy = f.height(gx, gz), h = Math.min(7 + rnd() * 9, capH(gx, gz, f.edge(gx, gz), gy - f.groundY(gx, gz)));
      if (h < 3) continue;
      S.cone(h * 0.28, h, X(gx), gy + h * 0.45, gz, C(P.dark).lerp(C(P.mid), rnd() * 0.6), { seg: 5, ry: rnd() * 3 });
    }
  }
}

// ---------------------------------------------------------------- rocks: faceted boulders at the foot of the cut and on steep slopes
/**
 * A closed rock face on the uphill side of the road (look.rockFace): where the road is cut into the hill, a faceted band of grey-violet rock stands from just beside the
 * road's shoulder up the slope, 2 to 5 m high with a batter and noise, rock lighter high up, a mossy ledge on top. One net along the road (about 10 triangles a road point),
 * part of the world mesh: no extra draw call. The rock models (rocks()) stand in front of it as accents. Not where a hairpin has its own set (`clear`), not on the plaza.
 */
function rockFace(S, f, look, tier, sideInfo, lite, clear) {
  const F = look.rockFace; if (!F) return;
  const L = look.land, hw = f.hw, rows = lite ? 2 : 3, step = lite ? 3 : 2, rockC = C(L.rock), darkC = C(L.rockDark), mossC = C(L.moss ?? '#7a9a62').lerp(C(L.high), 0.35), k = new THREE.Color();
  const right = (d) => [d[1], -d[0]];
  const ok = (i) => { const si = sideInfo[i], p = f.road[i]; return si.rise >= (F.minRise ?? 3.5) && f.info.s[i] > 40 && f.edge(p[0], p[1]) === 0 && !clear(p[0], p[1]); };
  const n = f.road.length; let i = 0;
  while (i < n) {
    if (!ok(i)) { i++; continue; }
    // a run of road points on the same cut side (at most 8 points, so each net stays small)
    const run = [i], side = -sideInfo[i].valley; let j = i + step;
    while (j < n && run.length < 8 && ok(j) && -sideInfo[j].valley === side) { run.push(j); j += step; }
    i = j - (step > 1 ? 0 : 1);
    if (run.length < 2) { i = Math.max(i, run[0] + 1); continue; }
    const g = gridGeo(run.length, rows + 2, (r, c) => {
      const ii = run[r], p = f.road[ii], rv = right(f.info.dir[ii]), s0 = f.info.s[ii];
      const hFace = (F.height ?? 3.4) * (0.7 + 0.6 * noise2(s0 / 41, 3)) + 0.8 * noise2(s0 / 9, 8);
      const kk = Math.min(c, rows) / rows, o = hw + (F.gap ?? 1.0) + kk * (F.batter ?? 1.3) + (c > rows ? 1.1 : 0) + (noise2(s0 / 5 + c, 4) - 0.5) * 0.7;
      const px = p[0] + rv[0] * side * o, pz = p[1] + rv[1] * side * o, yb = f.height(p[0] + rv[0] * side * (hw + (F.gap ?? 1.0)), p[1] + rv[1] * side * (hw + (F.gap ?? 1.0))) - 0.35;
      const y = yb + kk * hFace + (c > rows ? 0.05 : 0) + (c > 0 && c <= rows ? (noise2(s0 / 3.1 + c * 2.3, 6) - 0.5) * 0.7 : 0);
      const tone = noise2(s0 / 6 + c * 1.7, 11);
      // strata and blotches: a band of lighter and darker rock across the face (the rock reads as layered, not as a smooth bank), darker at the foot, moss patches higher up and on the ledge
      const strata = noise2(s0 / 7 + c * 2.9, 17) - 0.5;
      k.copy(rockC).lerp(darkC, Math.min(1, 0.45 * (1 - kk) + 0.5 * tone)).multiplyScalar(0.62 + 0.5 * kk + 0.5 * strata);
      if (c >= rows - 1) k.lerp(mossC, c > rows ? 0.9 : 0.25 + 0.7 * tone);
      return [X(px), y, pz, k.clone()];
    });
    const mid = f.road[run[run.length >> 1]], rvm = right(f.info.dir[run[run.length >> 1]]);
    orient(g, () => new THREE.Vector3(X(-rvm[0] * side), 0.15, -rvm[1] * side));   // the face looks at the road
    S.add(g, null, { keepColors: true, jitter: 0, wobble: 0 });
  }
}

function rocks(S, f, look, tier, rnd, sideInfo, lite, clear = () => false) {
  const L = look.land, right = (d) => [d[1], -d[0]];
  // the normal of the ground at a point (drawing axes: x mirrored)
  const normalAt = (x, z) => { const hx = f.height(x - 1, z) - f.height(x + 1, z), hz = f.height(x, z - 1) - f.height(x, z + 1), l = Math.hypot(hx, 2, hz); return [-hx / l, 2 / l, hz / l]; };
  // the rock model (look.models.rocks; a cluster of painted rocks, 1 m high): sunk into the ground by a third, leaning with the slope; big ones (2 to 4 m) at the foot of the cut in
  // groups of two or three, small ones on the slope; never within 1.5 m of the road's edge; the phone has half of them
  const modelRock = (x, z, r) => {
    if (f.edge(x, z) < 1.5 || (lite && rnd() < 0.5)) return;
    const big = r > 1.8, h = (big ? 2 + r : 0.5 + r * 0.45) * (0.85 + rnd() * 0.3), sink = 0.28 + rnd() * 0.17;
    const put = (px, pz, hh) => { const y = f.height(px, pz); S.slot('rocks', X(px), y - hh * sink, pz, rnd() * 6.3, hh * (0.9 + rnd() * 0.3), hh, hh * (0.9 + rnd() * 0.3), normalAt(px, pz)); };
    put(x, z, h);
    if (big) for (let k = 0, m = 1 + Math.floor(rnd() * 2); k < m; k++) { const a = rnd() * 6.3, d = h * (0.6 + rnd() * 0.5); if (f.edge(x + Math.cos(a) * d, z + Math.sin(a) * d) >= 1.5) put(x + Math.cos(a) * d, z + Math.sin(a) * d, h * (0.45 + rnd() * 0.3)); }
  };
  const boulder = (x, z, r) => {
    if (clear(x, z)) return;
    if (S.models?.rocks) return modelRock(x, z, r);
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

/** A torii: two red pillars, a tie beam and a black-capped top beam, `w` wide and `hh` high, facing along ry. */
function torii(S, look, x, y, z, ry, w = 2.6, hh = 3.2) {
  const red = C(look.lantern?.gate ?? '#c8423f'), k = hh / 3.2;
  S.push(trs(X(x), y, z, 0, ry, 0));
  for (const sx of [-w / 2, w / 2]) { S.cyl(0.14 * k, 0.17 * k, hh, sx, hh / 2, 0, red, { seg: 8 }); S.cyl(0.24 * k, 0.24 * k, 0.3 * k, sx, 0.15 * k, 0, C('#2e2428'), { seg: 8 }); }
  S.box(w + 1.0 * k, 0.22 * k, 0.3 * k, 0, 2.75 * k, 0, red, { r: 0.03 });
  S.box(w + 1.6 * k, 0.2 * k, 0.36 * k, 0, 3.25 * k, 0, C('#2e2428'), { r: 0.03 });
  S.box(w + 1.4 * k, 0.16 * k, 0.32 * k, 0, 3.1 * k, 0, red, { r: 0.02 });
  S.box(0.18 * k, 0.5 * k, 0.2 * k, 0, 3.0 * k, 0, red, { r: 0 });
  S.pop();
}

/** A low cherry bush: a few soft pink balls, lighter on top (no trunk). */
function bush(S, look, x, y, z, r, rnd, lite) {
  const P = look.cherry, light = C(P.blossom[3]), dark = C(P.blossom[2]);
  for (let k = 0, n = lite ? 3 : 5; k < n; k++) {
    const a = rnd() * 6.3, d = k ? r * (0.5 + rnd() * 0.4) : 0, up = k ? rnd() : 1, rr = r * (k ? 0.5 + rnd() * 0.25 : 0.75);
    S.ball(rr, X(x + Math.cos(a) * d), y + rr * 0.8 + up * r * 0.3, z + Math.sin(a) * d, C(P.blossom[Math.floor(rnd() * 2)]).lerp(up > 0.5 ? light : dark, 0.4), { detail: lite ? 0 : 1, sy: 0.8 });
  }
}

/** A lantern on a post (the road's warm lights in the mockup): a dark post, a box with glowing glass, a small roof; `h` high. */
function postLantern(S, G, look, x, y, z, ry, h = 2.8) {
  const pole = C(look.lamp.pole);
  S.cyl(0.07, 0.09, h, X(x), y + h / 2, z, pole, { seg: 6 });
  S.box(0.42, 0.5, 0.42, X(x), y + h + 0.25, z, pole, { r: 0.02, ry });
  G.box(0.34, 0.38, 0.44, X(x), y + h + 0.25, z, glow(look.lamp.light, look.lantern?.glow ?? 2.4), { r: 0, ry });
  G.box(0.44, 0.38, 0.34, X(x), y + h + 0.25, z, glow(look.lamp.light, look.lantern?.glow ?? 2.4), { r: 0, ry });
  S.cone(0.42, 0.3, X(x), y + h + 0.65, z, pole, { seg: 4, ry: ry + Math.PI / 4 });
}

/**
 * The set of a hairpin as in the mockup (scene.road.bendSets; bends sharper than |turn| 1): on the outside a rock wall in soft stacked
 * boulders with moss on top, a red torii at the top of a stone stair in a gap of the wall, stone lanterns, cherry bushes and a lantern
 * on a post; on the inside a small island behind a kerb with mossy rocks, a stone lantern and a bush. Every light leaves a warm pool.
 */
function bendSet(S, G, f, look, b, lampHeads, pools, lite) {
  const rnd = mulberry32(Math.round(b.s * 7)), hw = f.hw, out = b.turn > 0 ? -1 : 1, right = (d) => [d[1], -d[0]], L = look.land;
  // a place at `ds` metres from the apex, `o` metres out from the road's middle on `side`: x, z, the ground there, the road's height, the road's heading
  const at = (ds, o, side) => { const p = pointAt(f.road, f.info, b.s + ds), r = right(p.dir), x = p.x + r[0] * side * o, z = p.z + r[1] * side * o, ry = f.surfaceRoad ? f.groundY(x, z) : f.roadY(b.s + ds);
    return { x, z, y: Math.max(f.height(x, z), ry - 0.15), road: ry, ry: Math.atan2(X(p.dir[0]), p.dir[1]), face: Math.atan2(-X(r[0] * side), -r[1] * side) }; };
  const light = (q, h, pool, halo) => { lampHeads.push([X(q.x), q.y + h, q.z, halo]); pools.push([X(q.x), q.road, q.z, pool]); };
  const rock = () => C(L.rock).lerp(C(L.rockDark), rnd() * 0.6), moss = () => C(L.high).lerp(C(look.land.moss ?? '#6f8a5c'), 0.5 + rnd() * 0.5);
  // the outside right after the apex is what the chase camera has on its left (further on the outside lies straight ahead, the view into
  // the valley stays open): there the rock wall, with a gap for the stair up to the torii
  const stairAt = 4.5;
  for (let ds = 1; ds < 9; ds += lite ? 5 : 2.8) {
    if (Math.abs(ds - stairAt) < 1.8) continue;
    const q = at(ds, hw + 3.2 + rnd() * 0.6, out), r = 0.9 + rnd() * 0.5;
    if (S.models?.rocks) { S.slot('rocks', X(q.x), q.y - 0.15, q.z, rnd() * 6.3, r * 2.3, r * 2.3 * 1.35); continue; }   // the painted rocks with moss (one cluster for the stack)
    if (S.models?.rocks) {   // the rock model: a wall of sunk, leaning clusters (the moss is in its paint)
      const hh = 1.8 + r * 1.6, nrm = [Math.sin(rnd() * 6.3) * 0.12, 1, Math.cos(rnd() * 6.3) * 0.12]; S.slot('rocks', X(q.x), q.y - hh * 0.3, q.z, rnd() * 6.3, hh * 1.1, hh, hh * 1.1, nrm); continue;
    }
    S.ball(r, X(q.x), q.y + r * 0.8, q.z, rock(), { detail: lite ? 0 : 1, sx: 1.2, sy: 1.3, sz: 0.9, ry: rnd() * 3 });
    // a second boulder on top (on the ground of the first, set back a little) and moss on the highest one
    let topX = q.x, topZ = q.z, topY = q.y + r * 1.75, topR = r;
    if (!lite) { const q2 = at(ds + 0.6, hw + 3.8, out), r2 = r * 0.8; S.ball(r2, X(q2.x), q.y + r * 1.5 + r2 * 0.6, q2.z, rock(), { detail: 1, sx: 1.2, sy: 1.2, sz: 0.9, ry: rnd() * 3 }); topX = q2.x; topZ = q2.z; topY = q.y + r * 1.5 + r2 * 1.95; topR = r2; }
    if (rnd() < 0.6) S.ball(topR * 0.55, X(topX), topY - topR * 0.12, topZ, moss(), { detail: 1, sx: 1.2, sy: 0.45, sz: 1.0 });   // moss and grass on the ledges
  }
  // the stair up through the gap and the torii at its top
  const steps = 6;
  for (let k = 0; k < steps; k++) { const q = at(stairAt, hw + 2.6 + k * 0.55, out); S.box(2.4, 0.36, 0.6, X(q.x), q.road + 0.18 + k * 0.36, q.z, C(look.lantern.stone).lerp(C(L.rockDark), 0.2 + (k % 2) * 0.15), { r: 0.04, ry: q.face }); }
  const top = at(stairAt, hw + 2.6 + steps * 0.55 + 0.4, out);
  torii(S, look, top.x, top.road + steps * 0.36, top.z, top.face, 2.2, 3.4);
  // stone lanterns in front of the wall, a lantern on a post, cherry bushes
  for (const ds of [1.5, 8.5]) { const q = at(ds, hw + 1.7, out); stoneLantern(S, G, look, q.x, q.road, q.z, q.ry, 1.0, true); light(q, 1.85, 5, 1.6); }
  { const q = at(12, hw + 0.9, out); postLantern(S, G, look, q.x, q.road, q.z, q.ry); light(q, 3.05, 6, 2.0); }
  for (const [ds, o] of [[0, hw + 2.3], [7, hw + 2.3], [10.5, hw + 2.2]]) { const q = at(ds, o, out); bush(S, look, q.x, q.road, q.z, 0.8 + rnd() * 0.3, rnd, lite); }
  // the inside: a kerb, mossy rocks, a stone lantern and a bush on a small island
  for (let ds = -10; ds < 16; ds += 1.6) { const q = at(ds, hw + 0.35, -out); S.box(0.3, 0.22, 1.7, X(q.x), q.road + 0.11, q.z, C(look.road.kerb), { r: 0.04, ry: q.ry }); }
  for (const [ds, o, r] of [[0, hw + 3.4, 1.3], [7, hw + 4.4, 1.0], [-6, hw + 3.8, 0.9]]) { const q = at(ds, o, -out); if (S.models?.rocks) { if (!lite || ds === 0) S.slot('rocks', X(q.x), q.road - r * 0.35, q.z, rnd() * 6.3, r * 1.9, r * 1.5, r * 1.9); continue; } if (S.models?.rocks) { S.slot('rocks', X(q.x), q.road - 0.1, q.z, rnd() * 6.3, r * 1.8); continue; } S.ball(r, X(q.x), q.road + r * 0.45, q.z, rock(), { detail: 1, sy: 0.75, ry: rnd() * 3 }); S.ball(r * 0.6, X(q.x), q.road + r * 1.05, q.z, moss(), { detail: 1, sx: 1.2, sy: 0.4, sz: 1.2 }); }
  { const q = at(4, hw + 2.2, -out); stoneLantern(S, G, look, q.x, q.road, q.z, q.ry, 1.05, true); light(q, 1.95, 5, 1.6); }
  { const q = at(-2, hw + 2.0, -out); bush(S, look, q.x, q.road, q.z, 1.0, rnd, lite); }
}

/** A stone lantern (tōrō): plinth, shaft, the light box with a warm window, a pyramid roof; `k` scales it. */
function stoneLantern(S, G, look, x, y, z, ry, k = 1, model = false) {
  const stoneC = C(look.lantern?.stone ?? '#b7a8a6');
  if (model && S.models?.lantern && !S.lite) {   // the model (where the camera comes close: the hairpins, the torii on the plaza) (1 m high in its file) at the height of ours; its open window gets our warm light
    S.slot('lantern', X(x), y, z, ry, 2.7 * k);
    G.box(0.42 * k, 0.32 * k, 0.42 * k, X(x), y + 1.62 * k, z, glow(look.lamp.light, look.lantern?.glow ?? 2.4), { r: 0, ry });
    return;
  }
  S.box(0.9 * k, 0.3 * k, 0.9 * k, X(x), y + 0.15 * k, z, stoneC, { r: 0.04, ry });
  S.cyl(0.16 * k, 0.2 * k, 1.2 * k, X(x), y + 0.9 * k, z, stoneC, { seg: 6 });
  S.box(0.75 * k, 0.15 * k, 0.75 * k, X(x), y + 1.55 * k, z, stoneC, { r: 0.03, ry });
  S.box(0.5 * k, 0.45 * k, 0.5 * k, X(x), y + 1.85 * k, z, stoneC.clone().multiplyScalar(0.9), { r: 0.02, ry });
  G.box(0.36 * k, 0.3 * k, 0.52 * k, X(x), y + 1.85 * k, z, glow(look.lamp.light, look.lantern?.glow ?? 2.4), { r: 0, ry });
  G.box(0.52 * k, 0.3 * k, 0.36 * k, X(x), y + 1.85 * k, z, glow(look.lamp.light, look.lantern?.glow ?? 2.4), { r: 0, ry });
  S.cone(0.75 * k, 0.45 * k, X(x), y + 2.3 * k, z, stoneC, { seg: 4, ry: ry + Math.PI / 4 });
  S.ball(0.12 * k, X(x), y + 2.6 * k, z, stoneC, { detail: 0 });
}

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
      stoneLantern(S, G, look, m.x, y, m.z, ry);
    } else if (m.type === 'clip') {   // a clipping point of the zone scoring: a low white guide post with a dark band and a glowing pink reflector, as along a mountain road
      S.box(0.14, 0.95, 0.14, X(m.x), y + 0.475, m.z, C('#f4efee'), { r: 0.02, jitter: 0 });
      S.box(0.15, 0.14, 0.15, X(m.x), y + 0.7, m.z, C('#2b2630'), { r: 0.02, jitter: 0 });
      G.box(0.13, 0.3, 0.155, X(m.x), y + 0.8, m.z, glow(look.chevron?.arrow ?? '#ff5a96', 4), { r: 0, jitter: 0 });   // seen from every side, as bright as the chevrons
    } else if (m.type === 'gate') {
      torii(S, look, m.x, y, m.z, ry, m.width ?? 2.6, m.height ?? 3.2);
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

// ---------------------------------------------------------------- street lamps along the road (scene.road.lamps: metres apart), on the uphill side, the arm over the road
function roadLamps(S, G, f, scene, look, sideInfo, lampHeads, pools = []) {
  const L = look.lamp, pole = C(L.pole), every = scene.road.lamps, hgt = L.height ?? 7, right = (d) => [d[1], -d[0]];
  for (let d = every * 0.5; d < f.info.length - 5; d += every) {
    const p = pointAt(f.road, f.info, d), si = sideInfo[p.i], side = -si.valley, r = right(p.dir), o = f.hw + 0.9;
    const x = p.x + r[0] * side * o, z = p.z + r[1] * side * o, y = f.surfaceRoad ? f.groundY(x, z) : f.roadY(d), hx = p.x + r[0] * side * (f.hw - 1.4), hz = p.z + r[1] * side * (f.hw - 1.4);
    S.cyl(0.09, 0.13, hgt, X(x), y + hgt / 2, z, pole, { seg: 6 });
    const len = Math.hypot(hx - x, hz - z);
    S.box(0.1, 0.1, len, X((x + hx) / 2), y + hgt, (z + hz) / 2, pole, { r: 0, ry: Math.atan2(X(hx - x), hz - z) });
    G.box(0.42, 0.08, 0.26, X(hx), y + hgt - 0.08, hz, glow(L.light, 2.4), { r: 0, ry: Math.atan2(X(p.dir[0]), p.dir[1]) });
    lampHeads.push([X(hx), y + hgt - 0.2, hz]);
    if (L.pool) pools.push([X(hx), y, hz, L.pool]);   // look.lamp.pool: the radius of the light on the road under the lamp
  }
}

/** The warm pools of light on the ground (one mesh of flat quads with a soft round glow, added on top; nothing is lit for real). */
function lightPools(pools, look, f) {
  // lights that are close together do not add up to one bright blotch: two pools closer than 0.7 times the bigger radius become one round pool (the centre between them,
  // the bigger radius plus half the distance), never a rectangle
  const kept = [];
  for (const q of [...pools].sort((a, b) => b[3] - a[3])) {
    const hit = kept.find((k) => Math.hypot(k[0] - q[0], k[2] - q[2]) < 0.7 * k[3]);
    if (!hit) { kept.push([...q]); continue; }
    const d = Math.hypot(hit[0] - q[0], hit[2] - q[2]);
    hit[0] = (hit[0] + q[0]) / 2; hit[2] = (hit[2] + q[2]) / 2; hit[3] += d / 2;
  }
  if (!kept.length) return null;
  // each pool is a small net laid on the ground (the road is banked and climbs: a flat square would float over it or sink into it)
  const N = 8, pos = [], uv = [], idx = [];
  kept.forEach(([x, y, z, r], n) => {
    const base = pos.length / 3;
    for (let b = 0; b <= N; b++) for (let a = 0; a <= N; a++) {
      const u = (a / N) * 2 - 1, v = (b / N) * 2 - 1, px = x + u * r, pz = z + v * r, h = f ? f.height(X(px), pz) : y;
      pos.push(px, (Math.abs(h - y) < 3 ? h : y) + 0.04, pz); uv.push((u + 1) / 2, (v + 1) / 2);
    }
    for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) { const i0 = base + b * (N + 1) + a, i1 = i0 + 1, i2 = i0 + N + 1, i3 = i2 + 1; idx.push(i0, i2, i1, i1, i2, i3); }
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x2 = c.getContext('2d'), gr = x2.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.45)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.1)'); gr.addColorStop(0.9, 'rgba(255,255,255,0)');   // nothing is left at the net's edge: no square
  x2.fillStyle = gr; x2.fillRect(0, 0, 64, 64);
  const m = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: C(look.lamp.light).multiplyScalar(look.lamp.poolGlow ?? 0.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 2;
  return mesh;
}

/**
 * Water that mirrors the sky (look.water.mirror): the sky's gradient seen along the reflected view ray, so the far water shows the
 * bright horizon band and the near water the deep sky above; ripples stretched along the view make the bright part fall in vertical
 * streaks. Mixed with the dark water colour by a Fresnel term. One draw call, no extra pass.
 */
function mirrorWater(look) {
  const s = look.sky, W = look.water;
  return new THREE.ShaderMaterial({
    uniforms: { uTop: { value: C(s.top) }, uMid: { value: C(s.mid) }, uHorizon: { value: C(s.horizon).multiplyScalar(W.band ?? 1.4) }, uDeep: { value: C(W.deep) }, uMidH: { value: W.bandWidth ?? s.midHeight ?? 0.2 }, uStreak: { value: W.streak ?? 1 },   // water.bandWidth: how far up the reflected sky the horizon band reaches
      // water.path: the bright streaked lane of the low sun's glow on the water, under the sun (strength, width in 1 - cos of the bearing, colour)
      uSun: { value: sunDirection(look) }, uPath: { value: W.path ?? 0 }, uPathW: { value: W.pathWidth ?? 0.02 }, uPathC: { value: C(W.pathColour ?? s.horizon) } },
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHorizon, uDeep, uSun, uPathC; uniform float uMidH, uStreak, uPath, uPathW; varying vec3 vW;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n1(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec3 V = normalize(vW - cameraPosition);
        // ripples: a normal tilted by noise that is long along the view and short across it (vertical streaks on screen)
        vec2 fw = normalize(V.xz + 1e-4), side = vec2(-fw.y, fw.x);
        vec2 q = vec2(dot(vW.xz, side) * 0.25, dot(vW.xz, fw) * 0.012);
        float n = n1(q) * 0.65 + n1(q * 2.7 + 3.1) * 0.35;
        vec3 N = normalize(vec3(side.x * (n - 0.5) * 0.08 * uStreak, 1.0, side.y * (n - 0.5) * 0.08 * uStreak));
        vec3 R = reflect(V, N);
        float e = max(R.y, 0.0);
        vec3 sky = e < uMidH ? mix(uHorizon, uMid, smoothstep(0.0, uMidH, e)) : mix(uMid, uTop, smoothstep(uMidH, 0.8, e));
        float fres = 0.15 + 0.85 * pow(1.0 - max(dot(-V, N), 0.0), 4.0);
        vec3 c = mix(uDeep, sky, fres);
        // the lane of the sunset on the water: where the view's bearing meets the sun's, broken into vertical streaks by the ripples
        float a = dot(fw, normalize(uSun.xz + 1e-4));
        float lane = exp(-(1.0 - a) / uPathW) * (1.0 - smoothstep(0.05, 0.45, e));
        float st = smoothstep(0.3, 0.7, n1(vec2(dot(vW.xz, side) * 0.35, dot(vW.xz, fw) * 0.004)));
        c += uPathC * uPath * lane * (0.25 + 0.75 * st);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
