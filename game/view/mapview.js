// Draws a map from its JSON: ground, road, walls, islands, painted bays, zones (puddles, ice, patches), the loop's dashes and the start line,
// and the props of the map's theme (poles, containers, cranes, hills, rocks, dunes, pines ...). Everything static is merged into two meshes
// (clay and glow): two draw calls. The theme (colours) and the props come from the JSON, so a map is data (tools/make-map.mjs, tools/make-maps.mjs).
import * as THREE from '../../vendor/three/three.module.js';
import { Builder, glow } from '../core/build.js';
import { bakeGroup } from '../core/bake.js';
import { makeClay, makeGlow } from '../core/materials.js';
import { mulberry32 } from '../core/rng.js';
import { X } from './space.js';

const ZONE_COLOUR = { wet: 0x4f6f8e, ice: 0xbfe3f0, asphalt: 0x5d6068, sand: 0xd2ac62, snow: 0xf4f8fb, grass: 0x8fc46a };

export function buildMap(map, { lite = false } = {}) {
  const S = new Builder({ seed: 3, jitter: 0.025, wobble: 0.01, bake: false });
  const G = new Builder({ seed: 4, jitter: 0, wobble: 0, bake: false });
  S.lite = lite;
  const rnd = mulberry32(11);
  const P = (p) => [X(p[0]), p[1]]; // physics point -> drawing point
  const T = { outside: 0x9ccf7a, ground: 0x6b6f78, road: null, kerb: 0xb9b6ae, stripe: 0xd24a3d, dash: 0xf0c24a, ...(map.theme ?? {}) };
  const grass = 0x8fc46a, bush = 0x5fa557, white = 0xf2efe6;

  // the ground: a big slab under everything (grass, sand, snow or water), the slab of the area on top
  S.box(1400, 1, 1400, 0, -0.65, 0, T.outside, { r: 0, wobble: 0, jitter: 0.02 });
  const xs = map.bounds.map((p) => p[0]), zs = map.bounds.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  S.box(x1 - x0, 0.4, z1 - z0, 0, -0.2, (z0 + z1) / 2, T.ground, { r: 0.05, wobble: 0.004, jitter: 0.015 });

  // the road as a ribbon along the loop (where the map has one)
  if (map.road && T.road) {
    const c = map.centre;
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      S.box(map.road.halfWidth * 2, 0.06, len + 0.8, X((a[0] + b[0]) / 2), 0.03, (a[1] + b[1]) / 2, T.road, { r: 0, wobble: 0, jitter: 0.01, ry: Math.atan2(-dx, dz) });
    }
  }

  // a wall along p -> q (drawing points)
  const wall = (p, q, h, t, color) => {
    const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
    S.box(t, h, len + t, (p[0] + q[0]) / 2, h / 2, (p[1] + q[1]) / 2, color, { r: Math.min(0.12, t / 3), ry: Math.atan2(dx, dz) });
  };
  const ring = (pts, h, t, color, closed = true) => { for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) wall(P(pts[i]), P(pts[(i + 1) % pts.length]), h, t, color); };
  ring(map.bounds, 1.0, 1.2, T.kerb);
  ring(map.bounds, 1.2, 0.4, T.stripe); // a stripe on top of the barrier

  // walls and islands
  for (const w of map.walls) {
    const style = w.style ?? 'island';
    if (style === 'rock') ring(w.pts, 3.2, 2.2, 0x7b7468, w.closed !== false);
    else if (style === 'rail') { ring(w.pts, 0.9, 0.35, 0xcfd2d6, w.closed !== false); for (let i = 0; i < w.pts.length; i += 2) { const q = P(w.pts[i]); S.box(0.3, 1.15, 0.3, q[0], 0.57, q[1], 0x6b6f78, { r: 0.02 }); } }
    else {
      const wx = w.pts.map((p) => p[0]), wz = w.pts.map((p) => p[1]);
      const [ax, bx, az, bz] = [Math.min(...wx), Math.max(...wx), Math.min(...wz), Math.max(...wz)];
      const cx = X((ax + bx) / 2), cz = (az + bz) / 2;
      if (style === 'container') { S.box(bx - ax, 0.6, bz - az, cx, 0.3, cz, 0x4a4f5c, { r: 0.1 }); continue; }
      S.box(bx - ax, 0.5, bz - az, cx, 0.25, cz, T.kerb, { r: 0.18, seg: 2 });
      S.box(bx - ax - 1.2, 0.56, bz - az - 1.2, cx, 0.28, cz, grass, { r: 0.2, seg: 2 });
      const n = Math.max(2, Math.round(((bx - ax) * (bz - az)) / 150));
      for (let i = 0; i < n; i++) {
        const bxp = cx + (rnd() - 0.5) * (bx - ax - 4), bzp = cz + (rnd() - 0.5) * (bz - az - 4), r = 0.9 + rnd() * 0.8;
        S.cyl(0.14, 0.18, 1.2, bxp, 1.1, bzp, 0x7a5a3a, { seg: 6 });
        S.ball(r, bxp, 2.2 + r * 0.4, bzp, bush, { detail: lite ? 0 : 1, sy: 0.85 });
      }
    }
  }

  // zones other than the ground: puddles, ice, patches
  for (const z of map.zones) {
    const colour = ZONE_COLOUR[z.kind] ?? 0x888888;
    if (z.r !== undefined) S.cyl(z.r, z.r, 0.04, X(z.x), 0.016, z.z, colour, { seg: 28, jitter: 0, wobble: 0 });
    else S.box(z.x1 - z.x0, 0.05, z.z1 - z.z0, X((z.x0 + z.x1) / 2), 0.02, (z.z0 + z.z1) / 2, colour, { r: 0, wobble: 0, jitter: 0.01 });
  }

  // painted bays
  for (const p of map.props) if (p.type === 'bays') {
    for (let v = p.z0; v <= p.z1 + 0.01; v += p.pitch) S.box(p.x1 - p.x0, 0.03, 0.18, X((p.x0 + p.x1) / 2), 0.02, v, white, { r: 0, wobble: 0, jitter: 0.01 });
    S.box(0.18, 0.03, p.z1 - p.z0, X(p.x0), 0.02, (p.z0 + p.z1) / 2, white, { r: 0, wobble: 0, jitter: 0.01 });
  }

  // the race loop: dashes along the centre line, and the start line
  const c = map.centre;
  let acc = 0;
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    acc += len;
    if (acc >= 7) { acc = 0; S.box(0.35, 0.03, 2.6, X((a[0] + b[0]) / 2), 0.07, (a[1] + b[1]) / 2, T.dash, { r: 0, wobble: 0, jitter: 0, ry: Math.atan2(-(b[0] - a[0]), b[1] - a[1]) }); }
  }
  {
    const a = c[0], b = c[1], ry = Math.atan2(-(b[0] - a[0]), b[1] - a[1]);
    const cells = Math.max(2, Math.min(4, Math.floor((map.halfWidth ?? 8) / 1.4)));
    for (let i = -cells; i < cells; i++) for (let j = 0; j < 2; j++) {
      const ox = i * 1.4 + 0.7, oz = (j - 0.5) * 1.4;
      S.box(1.4, 0.03, 1.4, X(a[0]) + Math.cos(ry) * ox + Math.sin(ry) * oz, 0.08, a[1] - Math.sin(ry) * ox + Math.cos(ry) * oz, (i + j) % 2 ? 0x1c1d22 : white, { r: 0, wobble: 0, jitter: 0, ry });
    }
  }

  // props
  const metal = 0x8c9099;
  for (const p of map.props) {
    switch (p.type) {
      case 'pole':
        S.cyl(0.14, 0.22, 7, X(p.x), 3.5, p.z, metal, { seg: 8 });
        S.box(1.4, 0.16, 0.5, X(p.x), 7.05, p.z, metal, { r: 0.05 });
        G.box(1.1, 0.07, 0.34, X(p.x), 6.93, p.z, glow(0xfff2c8, map.light?.lamps ? 3.2 : 2.2), { r: 0, jitter: 0 });
        break;
      case 'planter':
        S.cyl(p.r, p.r + 0.15, 0.6, X(p.x), 0.3, p.z, T.kerb, { seg: 14 });
        S.cyl(p.r - 0.25, p.r - 0.25, 0.64, X(p.x), 0.32, p.z, 0x6b4a33, { seg: 14 });
        S.ball(p.r * 0.8, X(p.x), 1.5, p.z, bush, { detail: lite ? 0 : 1, sy: 0.9 });
        break;
      case 'container':
        for (let l = 0; l < (p.levels ?? 1); l++) S.box(p.w, 2.5, p.d, X(p.x), 1.25 + l * 2.55, p.z, p.color, { r: 0.05, ry: p.ry ?? 0 });
        break;
      case 'crane':
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.box(0.7, 22, 0.7, X(p.x) + sx * 7, 11, p.z + sz * 5, 0xe08a1e, { r: 0.05 });
        S.box(22, 1.6, 12, X(p.x), 22.5, p.z, 0xe08a1e, { r: 0.1 });
        S.box(4, 3, 4, X(p.x) + 4, 24.8, p.z, 0x4a4f5c, { r: 0.1 });
        S.box(1, 1, 38, X(p.x), 24, p.z + (p.z > 0 ? -22 : 22), 0xe08a1e, { r: 0.05 });
        break;
      case 'bollard': S.cyl(0.35, 0.4, 0.8, X(p.x), 0.4, p.z, 0xd4a017, { seg: 8 }); break;
      case 'hill': S.ball(p.r, X(p.x), 0, p.z, p.color, { detail: lite ? 0 : 1, sy: p.h / p.r }); break;
      case 'dune': S.ball(p.r, X(p.x), 0, p.z, p.color, { detail: lite ? 0 : 1, sy: p.h / p.r }); break;
      case 'rock': S.ball(p.r, X(p.x), p.r * 0.3, p.z, p.color, { detail: lite ? 0 : 1, sy: 0.7 }); break;
      case 'pine':
        S.cyl(0.18, 0.26, 1.4, X(p.x), 0.7, p.z, 0x6b4a33, { seg: 6 });
        for (let k = 0; k < 3; k++) S.cone(1.9 - k * 0.45, p.h * 0.42, X(p.x), 1.2 + k * p.h * 0.26 + p.h * 0.2, p.z, k % 2 ? 0x2f6b4a : 0x3b7d57, { seg: 8 });
        S.cone(0.9, 0.5, X(p.x), 1.4 + p.h * 0.62, p.z, 0xf4f8fb, { seg: 8 }); // snow on the top
        break;
      default: break; // bays are drawn above
    }
  }

  bakeGroup([S], { strength: 0.8 });
  const group = new THREE.Group();
  const solid = new THREE.Mesh(S.build(), makeClay());
  solid.receiveShadow = true;
  const lamps = new THREE.Mesh(G.build(), makeGlow());
  group.add(solid, lamps);
  return group;
}
