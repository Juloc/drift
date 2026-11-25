// Writes the four other maps (harbour at night, mountain pass, desert, winter track) and game/data/maps.json from compact descriptions.
// Run: node tools/make-maps.mjs   (the car park is made by tools/make-map.mjs). The JSON files are committed; this is how they were made.
// Physics is flat; hills and the like are only drawn. A check at the end stops the script when something stands where a car must drive.
import { writeFileSync } from 'node:fs';
import { rect, spline, round, loopLength, offsetLoop, makeGates, makeGrid, mulberry, distToLoop, bbox } from './maplib.mjs';

const out = (file, map) => writeFileSync(new URL(`../game/data/maps/${file}`, import.meta.url), JSON.stringify(map) + '\n');
const wob = (a, b, wobbles, n, ph = 1) => Array.from({ length: n }, (_, k) => { const t = (2 * Math.PI * k) / n, f = 1 + wobbles[0] * Math.sin(3 * t + ph) + wobbles[1] * Math.cos(2 * t + 2 * ph); return [round(a * f * Math.cos(t)), round(b * f * Math.sin(t))]; });
const maps = [];

/** Everything every map has in common: sampled loop, gates, grid, length, then the checks. */
function finish(id, file, name, laps, m, centreCtrl, { per = 8, gateHalf = 18, halfWidth, gridSide = 4 }) {
  const sampled = spline(centreCtrl, per).map((p) => p.map(round));
  // the start line goes where the road is straightest over the next 65 m (the grid stands there): try the straightest places first
  const ahead = Math.round(65 / (loopLength(sampled) / sampled.length)) + 2;
  const bends = sampled.map((_, i) => {
    let bend = 0, prev = null;
    for (let k = -2; k <= ahead; k++) { const a = sampled[(i + k + sampled.length) % sampled.length], c = sampled[(i + k + 1 + sampled.length) % sampled.length], h = Math.atan2(c[0] - a[0], c[1] - a[1]); if (prev !== null) { let d = Math.abs(h - prev); if (d > Math.PI) d = 2 * Math.PI - d; bend += d; } prev = h; }
    return [bend, i];
  }).sort((p, q) => p[0] - q[0]);
  const b = bbox(m.bounds);
  const clear = (map, x, z, margin, what, soft = false) => {
    const fail = (why) => { if (soft) return false; throw new Error(`${name}: ${what} at ${x}, ${z} ${why}`); };
    if (x < b.x0 + 3 || x > b.x1 - 3 || z < b.z0 + 3 || z > b.z1 - 3) return fail('is outside the bounds');
    for (const o of map.obstacles ?? []) if (Math.hypot(o.x - x, o.z - z) < o.r + margin) return fail('is in an obstacle');
    for (const w of [{ pts: map.bounds, closed: true }, ...(map.walls ?? [])]) for (let i = 0; i < w.pts.length - (w.closed === false ? 1 : 0); i++) {
      const p = w.pts[i], q = w.pts[(i + 1) % w.pts.length], dx = q[0] - p[0], dz = q[1] - p[1], l2 = dx * dx + dz * dz;
      const t = l2 ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / l2)) : 0;
      if (Math.hypot(x - (p[0] + dx * t), z - (p[1] + dz * t)) < margin) return fail('is too close to a wall');
    }
    return true;
  };
  let map = null;
  for (const [, start] of bends) {
    const { gates, centre, length } = makeGates(sampled, 8, gateHalf, start);
    const candidate = { id, name, laps, ...m, centre, halfWidth, loopLength: round(length), gates, grid: makeGrid(gates[0], gridSide) };
    if (candidate.grid.every((g) => clear(candidate, g.x, g.z, 2.5, 'a grid slot', true))) { map = candidate; break; }
  }
  if (!map) throw new Error(`${name}: no place for the grid along the loop`);
  for (const p of map.centre) clear(map, p[0], p[1], 4, 'the loop');
  maps.push({ id, file, name, laps });
  out(file, map);
  console.log(`${name}: loop ${map.loopLength} m, ${map.centre.length} points, ${map.walls?.length ?? 0} walls, ${map.obstacles?.length ?? 0} obstacles, ${map.props.length} props`);
  return map;
}

// ---------------------------------------------------------------- 1 harbour at night: wet quay, containers, lamps, water beyond
{
  const ctrl = [[0, -78], [48, -78], [95, -66], [138, -42], [152, -4], [140, 38], [96, 64], [30, 74], [-40, 72], [-100, 60], [-142, 26], [-150, -20], [-122, -58], [-62, -76]];
  const containers = [rect(0, 2, 90, 26), rect(-92, 0, 22, 14), rect(92, 6, 22, 14)];
  const rnd = mulberry(5);
  const palette = [0xc0392b, 0x2e86c1, 0xd4a017, 0x229954, 0x7d3c98, 0xe67e22];
  const props = [];
  for (const r of containers) { const [x0, z0] = r[0], [x1, z1] = r[2]; for (let x = x0 + 6; x < x1; x += 12) for (let z = z0 + 3; z < z1; z += 6.6) props.push({ type: 'container', x: round(x), z: round(z), w: 11, d: 6, color: palette[Math.floor(rnd() * palette.length)], levels: 1 + Math.floor(rnd() * 3) }); }
  for (let x = -150; x <= 150; x += 50) { props.push({ type: 'pole', x, z: -100 }); props.push({ type: 'pole', x, z: 100 }); }
  props.push({ type: 'crane', x: -110, z: -101, ry: 0 }, { type: 'crane', x: 60, z: 101, ry: 3.14159 });
  for (let x = -165; x <= 165; x += 15) props.push({ type: 'bollard', x, z: -104 }, { type: 'bollard', x, z: 104 });
  const obstacles = props.filter((p) => p.type === 'pole').map((p) => ({ x: p.x, z: p.z, r: 0.5 }));
  finish(1, '02-harbour.json', 'Harbour at night', 3, {
    ground: 'wet', bounds: rect(0, 0, 340, 210),
    walls: containers.map((pts) => ({ pts, closed: true, style: 'container' })), obstacles, zones: [],
    road: { kind: 'wet', halfWidth: 12 },
    theme: { outside: 0x1d2f4a, ground: 0x5b6580, road: 0x48506a, kerb: 0x7d8696, stripe: 0xe8c34a, dash: 0xe8e2c0 },
    light: { hemi: 1.9, sun: 1.5, hemiSky: 0x93b0ea, hemiGround: 0x4a5370, sunColour: 0xb9ccff, lamps: true },
    sky: { top: 0x070d1f, horizon: 0x1b2a46, ground: 0x1d2f4a }, props,
  }, ctrl, { halfWidth: 12 });
}

// ---------------------------------------------------------------- 2 mountain pass: a narrow switchback road between rails and a rock wall
{
  // two switchback runs (sines, so the hairpins are bends of about 14 m radius, not kinks) joined by two big half circles
  const half = 56, amp = 22, L = 3 * half, cz = -2.5, R = 72.5;
  const north = Array.from({ length: 25 }, (_, k) => { const x = -L + (k * 2 * L) / 24; return [x, -75 + amp * Math.sin((Math.PI * x) / half)]; });
  const south = Array.from({ length: 25 }, (_, k) => { const x = L - (k * 2 * L) / 24; return [x, 70 + amp * Math.sin((Math.PI * x) / half)]; });
  const arc = (cx, from, to) => Array.from({ length: 7 }, (_, k) => { const a = from + ((to - from) * (k + 1)) / 8; return [cx + R * Math.cos(a), cz + R * Math.sin(a)]; });
  const ctrl = [...north, ...arc(L, -Math.PI / 2, Math.PI / 2), ...south, ...arc(-L, Math.PI / 2, (3 * Math.PI) / 2)].map((p) => p.map(round));
  const sampled = spline(ctrl, 6).map((p) => p.map(round));
  const a = offsetLoop(sampled, 6.5).map((p) => p.map(round)), b = offsetLoop(sampled, -6.5).map((p) => p.map(round));
  const area = (poly) => Math.abs(poly.reduce((s, p, i) => s + (p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1]), 0) / 2);
  const [outer, inner] = area(a) > area(b) ? [a, b] : [b, a];
  const bb = bbox(outer);
  const rnd = mulberry(9);
  const props = [];
  for (let k = 0; k < 26; k++) {
    for (let tries = 0; tries < 30; tries++) {
      const x = bb.x0 - 30 + rnd() * (bb.x1 - bb.x0 + 60), z = bb.z0 - 30 + rnd() * (bb.z1 - bb.z0 + 60);
      if (distToLoop(sampled, x, z) < 30) continue;
      props.push({ type: 'hill', x: round(x), z: round(z), r: round(16 + rnd() * 22), h: round(10 + rnd() * 22), color: rnd() < 0.5 ? 0x5f8a56 : 0x7a8a6a });
      break;
    }
  }
  finish(2, '03-mountain.json', 'Mountain pass', 2, {
    ground: 'grass', bounds: rect(0, 0, (bb.x1 - bb.x0) + 50, (bb.z1 - bb.z0) + 50),
    walls: [{ pts: outer, closed: true, style: 'rock' }, { pts: inner, closed: true, style: 'rail' }], obstacles: [], zones: [],
    road: { kind: 'asphalt', halfWidth: 5 },
    theme: { outside: 0x6f9a5a, ground: 0x6f9a5a, road: 0x4c4f58, kerb: 0xcfcfc8, stripe: 0xf0c24a, dash: 0xf2efe6 },
    light: { hemi: 1.5, sun: 2.8 },
    sky: { top: 0x7fb5e8, horizon: 0xdfeaf2, ground: 0x6f9a5a }, props,
  }, ctrl, { per: 6, gateHalf: 14, halfWidth: 5, gridSide: 2.2 });
}

// ---------------------------------------------------------------- 3 desert: broad loop on sand, an asphalt patch at the start, rocks
{
  const ctrl = wob(230, 125, [0.10, 0.07], 18);
  const sampled = spline(ctrl, 8);
  const rnd = mulberry(21);
  const obstacles = [], props = [];
  for (let k = 0; k < 160 && obstacles.length < 34; k++) {
    const x = (rnd() - 0.5) * 520, z = (rnd() - 0.5) * 300;
    if (distToLoop(sampled, x, z) < 18) continue;
    const r = round(1.8 + rnd() * 2.4);
    obstacles.push({ x: round(x), z: round(z), r }); props.push({ type: 'rock', x: round(x), z: round(z), r, color: rnd() < 0.5 ? 0x9b8a72 : 0xb59e7f });
  }
  for (let k = 0; k < 14; k++) { const side = k % 2 ? 1 : -1; props.push({ type: 'dune', x: round(side * (300 + rnd() * 60)), z: round((rnd() - 0.5) * 340), r: round(24 + rnd() * 26), h: round(8 + rnd() * 10), color: 0xe0bc72 }); }
  for (let k = 0; k < 8; k++) props.push({ type: 'dune', x: round((rnd() - 0.5) * 520), z: round((k % 2 ? 1 : -1) * (200 + rnd() * 40)), r: round(24 + rnd() * 26), h: round(8 + rnd() * 10), color: 0xe0bc72 });
  finish(3, '04-desert.json', 'Desert', 2, {
    ground: 'sand', bounds: rect(0, 0, 560, 340),
    walls: [], obstacles, zones: [{ kind: 'asphalt', x0: 215, z0: -40, x1: 290, z1: 60 }],
    road: { kind: 'sand', halfWidth: 12 },
    theme: { outside: 0xe2c07a, ground: 0xe8c887, road: 0xcfa95f, kerb: 0xd9b46b, stripe: 0xd24a3d, dash: 0xf5ecd0 },
    light: { hemi: 1.6, sun: 3.0 },
    sky: { top: 0x7ec0ee, horizon: 0xf3dfb0, ground: 0xe2c07a }, props,
  }, ctrl, { gateHalf: 22, halfWidth: 12 });
}

// ---------------------------------------------------------------- 4 winter track: snow, ice patches, pines, snow banks
{
  const ctrl = wob(160, 90, [0.09, 0.06], 16, 2);
  const sampled = spline(ctrl, 8).map((p) => p.map(round));
  const rnd = mulberry(33);
  const obstacles = [], props = [];
  for (let k = 0; k < 400 && obstacles.length < 70; k++) {
    const x = (rnd() - 0.5) * 340, z = (rnd() - 0.5) * 210;
    if (distToLoop(sampled, x, z) < 17) continue;
    obstacles.push({ x: round(x), z: round(z), r: 0.9 }); props.push({ type: 'pine', x: round(x), z: round(z), h: round(5 + rnd() * 4) });
  }
  const iceAt = [0.22, 0.52, 0.8].map((f) => sampled[Math.floor(sampled.length * f)]);
  finish(4, '05-winter.json', 'Winter track', 3, {
    ground: 'snow', bounds: rect(0, 0, 380, 240),
    walls: [], obstacles, zones: iceAt.map((p) => ({ kind: 'ice', x: p[0], z: p[1], r: 16 })),
    road: { kind: 'snow', halfWidth: 11 },
    theme: { outside: 0xf2f6fa, ground: 0xe9eef4, road: 0xd3dce6, kerb: 0xffffff, stripe: 0x3a7de0, dash: 0x7a8fa6 },
    light: { hemi: 1.8, sun: 2.3, hemiSky: 0xdbe8ff, hemiGround: 0xf0f4fa },
    sky: { top: 0xa9bfd6, horizon: 0xdfe8f1, ground: 0xf2f6fa }, props,
  }, ctrl, { gateHalf: 20, halfWidth: 11 });
}

// the list of maps (the car park is 0 and also the lobby)
writeFileSync(new URL('../game/data/maps.json', import.meta.url), JSON.stringify({ maps: [{ id: 0, file: '01-car-park.json', name: 'Car park', laps: 3, lobby: true }, ...maps] }) + '\n');
console.log('wrote maps.json with', maps.length + 1, 'maps');
