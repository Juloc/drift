// A drawn scene made from a physics map and a theme: the map (data/maps/*.json, the one thing the simulation and the server read) says where the road runs, how wide it is, where walls,
// props and the start line are; the theme (data/scenes/*.json) says how the land around it looks (a mountain inside and a valley outside the loop, a quay with the sea beyond, dunes, snow
// hills), how the road is lifted (the height profile is drawn only: the physics stays flat), which look it wears and what stands along it. Pure maths, no three.js.
import { insidePoly } from './field.js';

const DRAWN = new Set(['container', 'pole', 'crane', 'bollard', 'rock', 'pine']);   // props the world builder knows; hills and dunes are the land's own business

/** The height profile of a closed road as control points [[metres along, height], ...]: `waves` slow swells and a faster one on top, the same at both ends so the loop closes. */
export function closedGrade(length, { amp = 6, waves = 3, phase = 0, flatAt = null } = {}) {
  const n = Math.max(8, Math.round(length / 40)), out = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    let y = amp * (Math.sin(a * waves + phase) * 0.8 + Math.sin(a * waves * 2 + phase * 1.7) * 0.2);
    const f = i / n;
    if (flatAt && Math.min(Math.abs(f - flatAt[0]), Math.abs(f - 1 - flatAt[0]), Math.abs(f + 1 - flatAt[0])) < flatAt[1]) y = 0;   // level where the start grid or the meeting place stands
    out.push([(i / n) * length, Math.round(y * 100) / 100]);
  }
  return out;
}

const bbox = (pts) => ({ x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), z0: Math.min(...pts.map((p) => p[1])), z1: Math.max(...pts.map((p) => p[1])) });

/** @param map the physics map (bounds, centre, halfWidth, loopLength, gates, props)  @param th the theme (see data/scenes/) */
export function sceneFromMap(map, th) {
  const b = bbox(map.bounds), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, M = th.margin ?? 520, area = th.mode === 'area';
  const T = th.terrain ?? {};
  const grade = th.grade ? closedGrade(map.loopLength, th.grade) : [[0, 0], [map.loopLength, 0]];
  const scene = {
    road: { closed: true, ctrl: map.centre, halfWidth: map.halfWidth, bendMin: th.bendMin ?? 0.35, bendSpan: th.bendSpan ?? 40, grade, rails: th.rails, railGap: th.railGap, overPlaza: area, lift: area ? 0.02 : 0 },
    terrain: { mode: th.mode ?? 'road', extent: [b.x0 - M, b.z0 - M, b.x1 + M, b.z1 + M], core: [b.x0 - 50, b.z0 - 50, b.x1 + 50, b.z1 + 50], flat: 1.0, blend: 6, floor: th.floor ?? -50, ...T },
    ridges: { centre: [cx, cz], rings: th.rings },
    props: (map.props ?? []).filter((p) => DRAWN.has(p.type)),
    zones: map.zones ?? [], marks: th.marks ?? [], trees: th.trees ?? [], mist: [],
    startLine: map.gates?.[0] ? { a: map.gates[0].a, b: map.gates[0].b, d: map.gates[0].d } : null,
  };
  if (area) scene.plaza = { pts: map.bounds.map((p) => [...p]), rail: th.rail ?? false, surface: false, lamps: [], benches: [], trees: [] };   // (the ground of the area is the land itself, coloured by the look's `land.gravel`)
  else if (th.plaza) scene.plaza = th.plaza;
  if (th.sea) scene.sea = th.sea;
  if (th.lake) scene.lake = th.lake;
  // low mist banks outside the loop (the side away from the inside), every few hundred metres
  const ring = map.centre, n = ring.length, step = Math.max(1, Math.floor(n / (th.mistCount ?? 7)));
  for (let i = 0; i < n && th.mist !== false; i += step) {
    const p = ring[i], q = ring[(i + 1) % n], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1, r = [dz / l, -dx / l];
    const inside = insidePoly(ring, p[0] + r[0] * 4, p[1] + r[1] * 4) ? 1 : -1, d = 80 + (i % 3) * 30;
    scene.mist.push([Math.round(p[0] - r[0] * inside * d), Math.round(p[1] - r[1] * inside * d), 300, 100]);
  }
  return scene;
}
