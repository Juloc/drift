// The drift training place's exercises, made from numbers (pure, no DOM, no clock). Each generator returns one exercise in its OWN frame:
//   { name, cones: [[x, z]...], lines: [polyline...] (paint), clips: [[x, z, r]...] (clipping points), zones: [{ poly, kind, mu }], walls: [{ pts, style }],
//     spawn: { x, z, h }, box: [x0, z0, x1, z1] (everything of it, 3 m round) }
// and `place(ex, x, z, turn)` moves it onto the pad. Angles are the simulation's: heading 0 faces +z and grows towards the car's right; forward is (sin h, cos h).
// Nothing is placed by hand in the page's code: tools/make-academy.mjs lists the exercises with their numbers, the map and the page read the result.

const TAU = Math.PI * 2, r2 = (v) => Math.round(v * 100) / 100;
const MARGIN = 3;

/** A path made of straights and arcs: [['F', length] | ['A', radius, degrees (+ right)]...] from (0, 0) heading +z, points every `step` metres; also its heading at every point. */
export function path(steps, step = 1) {
  const pts = [[0, 0]], hs = [0]; let x = 0, z = 0, h = 0;
  for (const [kind, a, b] of steps) {
    if (kind === 'F') {
      const n = Math.max(1, Math.round(a / step));
      for (let i = 0; i < n; i++) { x += (Math.sin(h) * a) / n; z += (Math.cos(h) * a) / n; pts.push([x, z]); hs.push(h); }
    } else {
      const R = a, turn = (b * Math.PI) / 180, n = Math.max(2, Math.round((Math.abs(turn) * R) / step)), dh = turn / n;
      for (let i = 0; i < n; i++) {   // a chord of the arc per step (exact on the circle)
        const hm = h + dh / 2, c = 2 * R * Math.sin(Math.abs(dh) / 2);
        x += Math.sin(hm) * c; z += Math.cos(hm) * c; h += dh; pts.push([x, z]); hs.push(h);
      }
    }
  }
  return { pts, hs };
}

/** The line offset sideways by `d` metres (+ to the right of the way it goes). */
export const offset = ({ pts, hs }, d) => pts.map(([x, z], i) => [x + Math.cos(hs[i]) * d, z - Math.sin(hs[i]) * d]);

/** Points every `gap` metres along a polyline (the first one included). */
export function along(poly, gap) {
  const out = [poly[0]]; let carry = 0;
  for (let i = 1; i < poly.length; i++) {
    const [x0, z0] = poly[i - 1], [x1, z1] = poly[i], l = Math.hypot(x1 - x0, z1 - z0);
    let at = gap - carry;
    for (; at <= l + 1e-9; at += gap) out.push([x0 + ((x1 - x0) * at) / l, z0 + ((z1 - z0) * at) / l]);
    carry = l - (at - gap);
  }
  return out;
}

const ring = (cx, cz, r, n = 64) => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos((i / n) * TAU) * r, cz + Math.sin((i / n) * TAU) * r]);
const coneRing = (cx, cz, r, gap) => { const n = Math.max(6, Math.round((TAU * r) / gap)); return Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * TAU) * r, cz + Math.sin((i / n) * TAU) * r]); };
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

/** The footprint of everything an exercise has, with a margin. */
export function boxOf(ex) {
  const all = [...ex.cones, ...ex.lines.flat(), ...ex.clips.map((c) => [c[0], c[1]]), ...ex.zones.flatMap((z) => z.poly), ...ex.walls.flatMap((w) => w.pts), [ex.spawn.x, ex.spawn.z]];
  return [Math.min(...all.map((p) => p[0])) - MARGIN, Math.min(...all.map((p) => p[1])) - MARGIN, Math.max(...all.map((p) => p[0])) + MARGIN, Math.max(...all.map((p) => p[1])) + MARGIN].map(r2);
}
const finish = (ex) => ({ ...ex, cones: ex.cones.map(([x, z]) => [r2(x), r2(z)]), box: boxOf(ex) });

/** Moves an exercise onto the pad: turned by `turn` radians (+ to the right, about its own origin), then put at (x, z). */
export function place(ex, x, z, turn = 0) {
  const c = Math.cos(turn), s = Math.sin(turn), P = ([px, pz]) => [r2(x + px * c + pz * s), r2(z - px * s + pz * c)];
  const out = {
    ...ex, cones: ex.cones.map(P), lines: ex.lines.map((l) => l.map(P)), clips: ex.clips.map(([px, pz, r]) => [...P([px, pz]), r]),
    zones: ex.zones.map((zn) => ({ ...zn, poly: zn.poly.map(P) })), walls: ex.walls.map((w) => ({ ...w, pts: w.pts.map(P) })),
    spawn: { ...(() => { const [sx, sz] = P([ex.spawn.x, ex.spawn.z]); return { x: sx, z: sz }; })(), h: Math.round((ex.spawn.h + turn) * 1e4) / 1e4 },
  };
  return { ...out, box: boxOf(out) };
}

const base = (name) => ({ name, cones: [], lines: [], clips: [], zones: [], walls: [], spawn: { x: 0, z: 0, h: 0 } });

/** A cone island on the inner radius (a cone every `gap` m), painted rings on the others; `dir` +1 or -1 is the way round (the start faces that way). */
export function circle({ radii = [12, 18, 25], gap = 2.5, dir = 1 } = {}) {
  const ex = base('circle');
  ex.cones = coneRing(0, 0, radii[0], gap);
  ex.lines = radii.slice(1).map((r) => ring(0, 0, r));
  const mid = radii.at(-1) > radii[0] ? radii.at(-1) : radii[0] + 8;   // the start on the outer ring: 13 m from the cones
  ex.spawn = { x: mid, z: 0, h: dir > 0 ? 0 : Math.PI };   // at (r, 0) the car goes along +z (counter-clockwise seen from above) or -z
  return finish(ex);
}

/** Two cone islands (radius `r`, a cone every `gap2`) `gap` m apart and a painted eight round them (two rings that cross in the middle). */
export function eight({ r = 10, gap = 34, lane = 8, gap2 = 2.5 } = {}) {
  const ex = base('eight'), R = r + lane, a = gap / 2;
  const left = coneRing(-a, 0, r, gap2);
  ex.cones = [...left, ...left.map(([x, z]) => [-x, z])];   // the right island is the left one mirrored
  ex.lines = [ring(-a, 0, R), ring(a, 0, R)];
  const zc = -Math.sqrt(Math.max(0, R * R - a * a));   // where the rings cross (south one); the car starts there along the right ring's tangent
  ex.spawn = { x: 0, z: zc, h: Math.atan2(-zc, -a) };
  return finish(ex);
}

/** Cones on a line with changing gaps (`spacing` repeats, scaled so the line is `length` long), a start and an end gate of two cones. */
export function slalom({ length = 120, cones = 9, spacing = [12, 15, 18], gate = 4 } = {}) {
  const ex = base('slalom'), gaps = Array.from({ length: cones - 1 }, (_, i) => spacing[i % spacing.length]), k = length / gaps.reduce((a, b) => a + b, 0);
  let z = 0; ex.cones.push([0, 0]);
  for (const g of gaps) { z += g * k; ex.cones.push([0, z]); }
  for (const zz of [-10, length + 10]) ex.cones.push([-gate, zz], [gate, zz]);
  ex.lines = [[[0, -10], [0, length + 10]]];
  ex.spawn = { x: 0, z: -22, h: 0 };
  return finish(ex);
}

/** A lane of cones in and out of a 180 degree bend (to the right), clipping points at the apex on the inside and at the exit on the outside. */
export function hairpin({ radius = 12, width = 9, approach = 60, gap = 6 } = {}) {
  const ex = base('hairpin'), P = path([['F', approach], ['A', radius, 180], ['F', approach]]), w2 = width / 2;
  for (const d of [-w2, w2]) ex.cones.push(...along(offset(P, d), d < 0 ? gap : gap * 0.8));
  ex.lines = [P.pts.filter((_, i) => i % 3 === 0)];
  const cx = radius, cz = approach, at = (deg, rr) => [cx - Math.cos((deg * Math.PI) / 180) * rr, cz + Math.sin((deg * Math.PI) / 180) * rr];   // a point of the bend, deg 0 = where it starts
  ex.clips = [[...at(90, radius - w2 + 1.5), 1.5], [...at(160, radius + w2 - 1.5), 1.5]];
  ex.spawn = { x: 0, z: -12, h: 0 };
  return finish(ex);
}

/** A lane through left-right-left (`bends` arcs of `angle` degrees, alternating, the first to the left) with straights before and after. */
export function sBends({ radius = 22, bends = 3, width = 9, angle = 70, lead = 25, gap = 6 } = {}) {
  const ex = base('sBends'), steps = [['F', lead]];
  for (let i = 0; i < bends; i++) steps.push(['A', radius, i % 2 ? angle : -angle]);
  steps.push(['F', lead]);
  const P = path(steps), w2 = width / 2;
  for (const d of [-w2, w2]) ex.cones.push(...along(offset(P, d), gap));
  ex.lines = [P.pts.filter((_, i) => i % 3 === 0)];
  ex.spawn = { x: 0, z: -12, h: 0 };
  return finish(ex);
}

/** A bend (to the right) along a concrete wall on its outside; a clipping zone `zoneWidth` wide along the wall, a clipping point inside, a lane of cones on the inside. */
export function wallBend({ radius = 30, angle = 110, width = 9, lead = 30, zoneWidth = 1.5, wallGap = 3, gap = 6 } = {}) {
  const ex = base('wallBend'), P = path([['F', lead], ['A', radius, angle], ['F', lead]]), w2 = width / 2;
  ex.cones = along(offset(P, w2), gap);
  const wallLine = offset(P, -(w2 + wallGap)), zoneIn = offset(P, -(w2 + wallGap - zoneWidth));
  ex.walls = [{ pts: wallLine.filter((_, i) => i % 3 === 0 || i === wallLine.length - 1), style: 'wall' }];
  ex.zones = [{ poly: [...wallLine, ...zoneIn.slice().reverse()], kind: 'clip', mu: null }];
  const k = P.pts.findIndex((_, i) => i > lead && Math.abs(P.hs[i] - (angle * Math.PI) / 360) < 0.02);   // the middle of the bend
  const mid = P.pts[k] ?? P.pts[Math.floor(P.pts.length / 2)], hm = P.hs[k] ?? 0;
  ex.clips = [[mid[0] + Math.cos(hm) * (w2 - 1.5), mid[1] - Math.sin(hm) * (w2 - 1.5), 1.5]];
  ex.lines = [P.pts.filter((_, i) => i % 3 === 0)];
  ex.spawn = { x: 0, z: -12, h: 0 };
  return finish(ex);
}

/** A square zone with its own grip (a wet pad): `mu` is what every wheel on it gets; the car starts south of it, facing it. */
export function wetPad({ size = 50, mu = 0.55 } = {}) {
  const ex = base('wetPad'), s = size / 2;
  ex.zones = [{ poly: rect(-s, -s, s, s), kind: 'wet', mu }];
  ex.lines = [[...rect(-s, -s, s, s), [-s, -s]]];
  ex.spawn = { x: 0, z: -s - 18, h: 0 };
  return finish(ex);
}

/** A straight with a start line, a mark every `every` m and a braking box at the end. */
export function straight({ length = 220, every = 50, box = [10, 20] } = {}) {
  const ex = base('straight');
  ex.lines.push([[-5, 0], [5, 0]]);
  for (let z = every; z < length; z += every) ex.lines.push([[-2, z], [2, z]]);
  const z0 = length - box[1] - 5;
  ex.lines.push([[0, 0], [0, length]], [...rect(-box[0] / 2, z0, box[0] / 2, z0 + box[1]), [-box[0] / 2, z0]]);
  ex.zones = [{ poly: rect(-box[0] / 2, z0, box[0] / 2, z0 + box[1]), kind: 'brake', mu: null }];
  ex.spawn = { x: 0, z: -12, h: 0 };
  return finish(ex);
}

export const GENERATORS = { circle, eight, slalom, hairpin, sBends, wallBend, wetPad, straight };

/** Is (x, z) inside the polygon? */
export function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** The grip under a point: the lowest `mu` of the zones that have one and hold the point (1 = asphalt); `wet: false` switches the wet zones off. */
export function gripAt(zones, x, z, wet = true) {
  let mu = 1;
  for (const zn of zones) if (zn.mu != null && (wet || zn.kind !== 'wet') && inPoly(zn.poly, x, z)) mu = Math.min(mu, zn.mu);
  return mu;
}

/** Per wheel: writes the grip under each wheel's contact point into `muW` (`wheels`: [[x, z]...] in the world); returns it. */
export function gripPerWheel(zones, wheels, muW, wet = true) {
  for (let i = 0; i < wheels.length; i++) muW[i] = gripAt(zones, wheels[i][0], wheels[i][1], wet);
  return muW;
}
