// Writes game/data/maps/01-car-park.json from a compact description. Run: node tools/make-map.mjs
// The JSON is committed; this script is how it was made (and how the loop's centre line is sampled).
import { writeFileSync } from 'node:fs';

import { rect, spline, round } from './maplib.mjs';
const centre = spline([[0, -42], [42, -42], [70, -26], [74, 4], [60, 36], [16, 44], [-30, 38], [-62, 18], [-74, -8], [-52, -34]], 8).map((p) => p.map(round));
let length = 0;
for (let i = 0; i < centre.length; i++) { const a = centre[i], b = centre[(i + 1) % centre.length]; length += Math.hypot(b[0] - a[0], b[1] - a[1]); }

// gates across the track at equal distances along the loop; gate 0 is the start and finish line at centre[0].
// A gate is a segment 16 m either side of the centre line; a lap is every gate once, in order, in the direction of travel.
const GATES = 8, GATE_HALF = 16;
const gates = [];
{
  const cum = [0];
  for (let i = 0; i < centre.length; i++) { const a = centre[i], b = centre[(i + 1) % centre.length]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  for (let g = 0; g < GATES; g++) {
    const want = (length * g) / GATES;
    let i = 0; while (i < centre.length - 1 && cum[i + 1] <= want) i++;
    const a = centre[i], b = centre[(i + 1) % centre.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t = (want - cum[i]) / len, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len; // travel direction; the gate stands across it
    gates.push({ a: [round(x - dz * GATE_HALF), round(z + dx * GATE_HALF)], b: [round(x + dz * GATE_HALF), round(z - dx * GATE_HALF)], d: [round(dx * 1000) / 1000, round(dz * 1000) / 1000] });
  }
}

const poles = [];
for (const x of [-90, -45, 0, 45, 90]) for (const z of [-62, 62]) poles.push({ x, z, r: 0.5 });
const planters = [{ x: -96, z: 0, r: 2.5 }, { x: 96, z: 0, r: 2.5 }, { x: 0, z: -66, r: 2.2 }];

const map = {
  id: 0,
  name: 'Car park',
  laps: 3,
  ground: 'asphalt',
  bounds: rect(0, 0, 220, 150),
  walls: [
    { pts: rect(0, 0, 80, 24), closed: true }, // the big central island
    { pts: rect(-72, -56, 18, 8), closed: true },
    { pts: rect(72, 56, 18, 8), closed: true },
  ],
  obstacles: [...poles, ...planters],
  zones: [{ kind: 'wet', x: -34, z: 40, r: 8 }, { kind: 'wet', x: 38, z: -42, r: 8 }],
  centre,
  halfWidth: 10,
  loopLength: round(length),
  lobbySpawn: { x: 0, z: 40, h: Math.PI / 2 },
  // the grid stands AFTER the start line (cars drive away from it and meet it again at the end of the first lap): a standing start, no run-up
  gates,
  grid: Array.from({ length: 8 }, (_, i) => ({ x: round(30 - 8 * Math.floor(i / 2)), z: -42 + (i % 2 ? 4 : -4), h: Math.PI / 2 })),
  sky: { top: 0x8fc7ee, horizon: 0xd9ecf5, ground: 0x7d8189 },
  props: [
    { type: 'bays', x0: -100, z0: -72, x1: -80, z1: -20, pitch: 4.5, axis: 'x' },
    { type: 'bays', x0: 80, z0: 20, x1: 100, z1: 72, pitch: 4.5, axis: 'x' },
    { type: 'bays', x0: -100, z0: 20, x1: -80, z1: 72, pitch: 4.5, axis: 'x' },
    { type: 'bays', x0: 80, z0: -72, x1: 100, z1: -20, pitch: 4.5, axis: 'x' },
    ...poles.map((p) => ({ type: 'pole', x: p.x, z: p.z })),
    ...planters.map((p) => ({ type: 'planter', x: p.x, z: p.z, r: p.r })),
  ],
};
writeFileSync(new URL('../game/data/maps/01-car-park.json', import.meta.url), JSON.stringify(map) + '\n');
console.log('wrote map: loop length', map.loopLength, 'm,', centre.length, 'centre points');
