// The look of a paved place (the drift training place at the harbour): asphalt that is not one colour (worn lanes, patches, rubber rings where cars
// circle, a wet zone with puddles that mirror the sky), red and white barriers, the sea towards the low sun with a quay, harbour cranes, containers, a
// ship and a lighthouse as the backdrop, a grandstand with banners, palms, floodlights that glow (no real lights). Everything from the map's data and the
// look's colours; a handful of draw calls (merged and instanced). Simulation axes in, drawing axes out (x mirrored, view/space.js).
import * as THREE from '../../../vendor/three/three.module.js';
import { mergeGeometries } from '../../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { X } from '../space.js';

const C = (c) => new THREE.Color(c);
const rnd = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

/** A box with a colour per vertex, moved and turned (about the up axis), for merging. */
function box(w, h, d, x, y, z, colour, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  const c = C(colour), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** The asphalt of the place: one plane, its colour and shine worked out in the shader from the place on the ground. */
function asphalt(json, look, env, y) {
  const A = json.academy, P = A.pad, L = look.place ?? {}, m = 30;
  const geo = new THREE.PlaneGeometry(P.x1 - P.x0 + 2 * m, P.z1 - P.z0 + 2 * m, 1, 1).rotateX(-Math.PI / 2);
  geo.translate(X((P.x0 + P.x1) / 2), y, (P.z0 + P.z1) / 2);
  const rings = [];
  for (const e of A.exercises) {   // where cars circle: between the painted rings of the circle, round the two islands of the eight
    const cx = (e.box[0] + e.box[2]) / 2, cz = (e.box[1] + e.box[3]) / 2;
    if (e.key === 'circle') for (const r of [15, 21.5]) rings.push(new THREE.Vector3(X(cx), cz, r));
    if (e.key === 'eight') for (const dx of [-17, 17]) rings.push(new THREE.Vector3(X(cx + dx), cz, 13.5));
    if (e.key === 'free') rings.push(new THREE.Vector3(X(cx), cz, 9));
  }
  while (rings.length < 10) rings.push(new THREE.Vector3(0, 0, -1));
  const wet = A.zones.find((z) => z.kind === 'wet'), wx = wet ? wet.poly.map((p) => X(p[0])) : [0, 0], wz = wet ? wet.poly.map((p) => p[1]) : [0, 0];
  const uniforms = {
    uWet: { value: 1 }, uWetRect: { value: new THREE.Vector4(Math.min(...wx), Math.min(...wz), Math.max(...wx), Math.max(...wz)) },
    uRings: { value: rings.slice(0, 10) }, uDamp: { value: L.damp ?? 0.35 }, uRubber: { value: C(L.rubber ?? '#16151a') }, uPatch: { value: C(L.patch ?? '#2a2a31') },
  };
  const mat = new THREE.MeshStandardMaterial({ color: C(L.asphalt ?? '#4b4850'), roughness: 0.82, metalness: 0, envMap: env, envMapIntensity: L.mirror ?? 1.1 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWp; uniform float uWet, uDamp; uniform vec4 uWetRect; uniform vec3 uRings[10]; uniform vec3 uRubber, uPatch;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { return vn(p) * 0.5 + vn(p * 2.03 + 7.1) * 0.3 + vn(p * 4.1 + 3.7) * 0.2; }
      float wetness;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 q = vWp.xz;
      float big = fbm(q * 0.035), mid = fbm(q * 0.21 + 11.0), fine = vn(q * 6.0);
      diffuseColor.rgb *= 0.9 + 0.18 * big + 0.08 * (mid - 0.5) + 0.05 * (fine - 0.5);          // worn and fresher asphalt in large soft areas, a fine grain
      vec2 cell = floor(q / vec2(7.0, 4.0)); float pr = h21(cell);                                 // a few repair patches: darker rectangles with soft edges
      vec2 cf = fract(q / vec2(7.0, 4.0)); float rep = step(0.93, pr) * smoothstep(0.0, 0.06, cf.x) * smoothstep(1.0, 0.94, cf.x) * smoothstep(0.0, 0.1, cf.y) * smoothstep(1.0, 0.9, cf.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, uPatch, rep * 0.55);
      float rubber = 0.0;                                                                          // rubber where cars circle: a dark band round each ring, broken up
      for (int i = 0; i < 10; i++) { if (uRings[i].z > 0.0) { float d = abs(distance(q, uRings[i].xy) - uRings[i].z); rubber = max(rubber, exp(-d * d / 3.2) * (0.35 + 0.65 * fbm(q * 0.6 + float(i)))); } }
      diffuseColor.rgb = mix(diffuseColor.rgb, uRubber, rubber * 0.6);
      vec2 e = min(q - uWetRect.xy, uWetRect.zw - q); float inWet = smoothstep(-0.6, 1.4, min(e.x, e.y) + (mid - 0.5) * 2.5) * uWet;   // the watered pad, with a frayed edge
      float puddle = smoothstep(0.5, 0.62, fbm(q * 0.11 + 31.0));                                    // standing water in the hollows
      wetness = max(inWet * (0.6 + 0.4 * puddle), uDamp * smoothstep(0.42, 0.7, big) * 0.6);          // and a damp sheen in the low places of the whole pad
      diffuseColor.rgb *= mix(1.0, 0.68, wetness);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor - 0.12 * rubber, 0.05, wetness);');
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true; mesh.name = 'place:asphalt';
  return { mesh, uniforms };
}

/** Red and white barriers all round the pad: one instanced mesh of a tapered block. */
function barriers(json, look, y) {
  const P = json.academy.pad, L = look.place ?? {}, step = 2.06, at = [];
  const edge = (ax, az, bx, bz) => { const n = Math.floor(Math.hypot(bx - ax, bz - az) / step), ry = -Math.atan2(bz - az, X(bx) - X(ax)); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; at.push([X(ax + (bx - ax) * t), az + (bz - az) * t, ry]); } };
  edge(P.x0, P.z0, P.x1, P.z0); edge(P.x1, P.z0, P.x1, P.z1); edge(P.x1, P.z1, P.x0, P.z1); edge(P.x0, P.z1, P.x0, P.z0);
  const g = new THREE.BoxGeometry(2, 0.85, 0.62, 1, 2, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + 0.425) / 0.85; p.setZ(i, p.getZ(i) * (1 - 0.55 * t * t)); p.setX(i, p.getX(i) * (1 - 0.04 * t)); }   // wide foot, narrow top
  g.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0xffffff }), at.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const red = C(L.barrierRed ?? '#d8363c'), white = C(L.barrierWhite ?? '#efe6de');
  at.forEach(([x, z, ry], i) => { mesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, y + 0.425, z), q.setFromAxisAngle(up, ry), new THREE.Vector3(1, 1, 1))); mesh.setColorAt(i, col.copy(i % 2 ? white : red)); });
  mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.castShadow = true; mesh.name = 'place:barriers';
  return mesh;
}

/** A palm: a leaning trunk of a few rings and a crown of drooping fronds (one geometry, colours per vertex). */
function palmGeometry(r, trunk, frond, tip) {
  const parts = [], h = 7 + r() * 3, lean = (r() - 0.5) * 1.6, n = 6;
  for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, x0 = lean * t0 * t0, x1 = lean * t1 * t1, g = new THREE.CylinderGeometry(0.2 - 0.06 * t1, 0.24 - 0.06 * t0, h / n + 0.05, 6, 1).toNonIndexed(); g.rotateZ(-Math.atan2(x1 - x0, h / n)); g.translate((x0 + x1) / 2, h * (t0 + t1) / 2, 0); parts.push(tint(g, C(trunk).multiplyScalar(0.85 + 0.3 * (i % 2)))); }
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + r() * 0.4, len = 3.2 + r() * 1.2, pts = [], seg = 5;
    for (let j = 0; j <= seg; j++) { const t = j / seg; pts.push([t * len, 0.55 * Math.sin(t * 2.0) - 1.9 * t * t, 0.5 * Math.sin(t * Math.PI) * (1 - 0.3 * t)]); }
    const pos = [], col = [], cf = C(frond), ct = C(tip);
    for (let j = 0; j < seg; j++) { const [x0, y0, w0] = pts[j], [x1, y1, w1] = pts[j + 1]; const quad = [[x0, y0, -w0], [x1, y1, -w1], [x1, y1, w1], [x0, y0, -w0], [x1, y1, w1], [x0, y0, w0]]; for (const v of quad) { pos.push(v[0], v[1], v[2]); const c = cf.clone().lerp(ct, v[0] / len); col.push(c.r, c.g, c.b); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    g.rotateY(a); g.translate(lean, h, 0); parts.push(g);
  }
  return mergeGeometries(parts);
}
function tint(g, c) { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }

/**
 * Builds the place's look. `groundY`: the ground's drawn height. Returns { group, setWet(on), lampHeads: [[x, y, z, size]...] }.
 * The sea lies towards negative z (where the look's sun stands), the grandstand on the other side.
 */
export function buildPlaceLook(json, look, env, groundY = () => 0, tierName = 'high') {
  const group = new THREE.Group(), A = json.academy, P = A.pad, y0 = groundY(0, 0), L = look.place ?? {}, r = rnd(4711), lite = tierName === 'low';
  group.name = 'place';
  const road = asphalt(json, look, env, y0 + 0.035); group.add(road.mesh);
  group.add(barriers(json, look, y0));

  const parts = [], lampHeads = [], flat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const cx = (P.x0 + P.x1) / 2, zs = P.z0 - 14, zn = P.z1 + 12;   // the sea side (south, towards the sun) and the stand side
  // --- the quay: a concrete apron to the water with bollards, then the sea
  parts.push(box(P.x1 - P.x0 + 90, 1.6, 26, X(cx), y0 - 0.8 + 0.01, P.z0 - 15, L.concrete ?? '#b9a79c'));
  for (let x = P.x0 - 30; x <= P.x1 + 30; x += 14) parts.push(box(0.7, 0.9, 0.7, X(x), y0 + 0.45, P.z0 - 26.5, '#3a3840'));
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 3000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: C(L.sea ?? '#3c4a7c'), roughness: 0.16, metalness: 0.0, envMap: env, envMapIntensity: 1.5 }));
  sea.position.set(X(cx), y0 - 2.2, P.z0 - 28 - 1500); sea.name = 'place:sea'; group.add(sea);
  // --- containers stacked on the quay (colours of the look), instanced
  const cols = (L.containers ?? ['#c8503c', '#3c6a9a', '#d8a23c', '#4c8a7a', '#b84a6a', '#e6dcd0']).map(C), boxes = [];
  for (let x = P.x0 + 6; x < P.x1 - 60; x += 13.2) { if (r() < 0.25) continue; const hgt = 1 + Math.floor(r() * 3); for (let k = 0; k < hgt; k++) boxes.push([X(x + (r() - 0.5) * 0.4), y0 + 1.3 + k * 2.62, zs - 5 + (k ? (r() - 0.5) * 0.3 : 0), Math.floor(r() * cols.length)]); }
  const cont = new THREE.InstancedMesh(new THREE.BoxGeometry(12.2, 2.6, 2.44), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), boxes.length), m4 = new THREE.Matrix4(), col = new THREE.Color();
  boxes.forEach(([x, y, z, c], i) => { cont.setMatrixAt(i, m4.makeTranslation(x, y, z)); cont.setColorAt(i, col.copy(cols[c]).multiplyScalar(0.85 + r() * 0.2)); });
  cont.instanceMatrix.needsUpdate = true; if (cont.instanceColor) cont.instanceColor.needsUpdate = true; cont.castShadow = true; cont.name = 'place:containers'; group.add(cont);
  // --- harbour cranes on the quay to one side (tall gantries with a boom over the water), a ship and a lighthouse out at sea
  const steel = L.crane ?? '#5a5f96';
  for (const [x, s] of [[P.x1 - 40, 1], [P.x1 - 4, 1.1], [P.x1 + 36, 0.95]]) {
    const gx = X(x), gz = zs - 4;
    for (const [dx, dz] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) parts.push(box(1.1, 30 * s, 1.1, gx + dx, y0 + 15 * s, gz + dz, steel));
    parts.push(box(16, 1.4, 12, gx, y0 + 30 * s, gz, steel), box(3, 3, 46 * s, gx, y0 + 33 * s, gz - 12 * s, steel), box(5, 4, 6, gx, y0 + 27 * s, gz - 2, '#e8e2d8'));
    parts.push(box(0.5, 20 * s, 0.5, gx, y0 + 43 * s, gz + 3, steel), box(1.2, 1.2, 14 * s, gx, y0 + 35.5 * s, gz + 9 * s, steel));
  }
  const sx = X(P.x0 + 70), sz = P.z0 - 190;   // the ship
  parts.push(box(120, 9, 20, sx, y0 + 2.2, sz, L.hull ?? '#2c3050'), box(120, 1.2, 20.4, sx, y0 - 0.9, sz, '#a8443c'), box(16, 16, 14, sx + 46, y0 + 14, sz, '#ece4da'), box(4, 6, 4, sx + 46, y0 + 25, sz, '#d85a3c'));
  for (let i = 0; i < 9; i++) for (let k = 0; k < 2 + (i % 3); k++) parts.push(box(11, 2.6, 16, sx - 50 + i * 10.4, y0 + 8 + k * 2.7, sz, cols[(i * 7 + k * 3) % cols.length].getStyle()));
  const lx = X(P.x1 + 210), lz = P.z0 - 330;   // the lighthouse on its rock
  parts.push(tint(new THREE.CylinderGeometry(22, 34, 9, 7).toNonIndexed().translate(lx, y0 + 1.5, lz), C(L.rock ?? '#6a6478')), tint(new THREE.CylinderGeometry(3.2, 4.6, 26, 10).toNonIndexed().translate(lx, y0 + 19, lz), C('#f0e8e0')));
  parts.push(tint(new THREE.CylinderGeometry(3.4, 3.4, 2.2, 10).toNonIndexed().translate(lx, y0 + 26, lz), C('#d8363c')), tint(new THREE.ConeGeometry(3.6, 4, 10).toNonIndexed().translate(lx, y0 + 37, lz), C('#d8363c')));
  lampHeads.push([lx, y0 + 33.5, lz, 9]);
  // --- the grandstand on the land side: steps, a roof on pillars, banners along the front
  const gsx = X(cx - 55), gw = 70;
  for (let k = 0; k < 6; k++) parts.push(box(gw, 0.9, 1.9, gsx, y0 + 1.2 + k * 0.9, zn + 4 + k * 1.9, k % 2 ? '#8a8494' : '#9a94a4'));
  parts.push(box(gw + 2, 2.2, 0.5, gsx, y0 + 1.1, zn + 2.6, L.banner ?? '#3c3466'), box(gw + 6, 0.5, 15, gsx, y0 + 11, zn + 9, '#d8cfc8'), box(gw + 6, 1.6, 0.4, gsx, y0 + 10.2, zn + 1.6, L.accent ?? '#e8457a'));
  for (let x = -gw / 2; x <= gw / 2; x += gw / 5) parts.push(box(0.5, 10, 0.5, gsx + x, y0 + 6, zn + 15.5, '#6a6474'), box(0.4, 10.5, 0.4, gsx + x, y0 + 5.6, zn + 2.2, '#6a6474'));
  for (let i = 0; i < (lite ? 60 : 220); i++) { const k = Math.floor(r() * 6); parts.push(box(0.45, 0.75, 0.4, gsx + (r() - 0.5) * (gw - 2), y0 + 2.05 + k * 0.9, zn + 4.2 + k * 1.9, ['#e8c8a8', '#d86a6a', '#6a8ad8', '#e8e0d0', '#f0a04a', '#7a6ab8'][Math.floor(r() * 6)])); }
  for (const x of [-gw / 2 - 5, gw / 2 + 5]) { parts.push(box(0.25, 9, 0.25, gsx + x, y0 + 4.5, zn + 2, '#d8d0c8'), box(0.08, 6.5, 2.2, gsx + x, y0 + 5.6, zn + 3.1, L.accent ?? '#e8457a')); }   // tall flags
  // --- floodlights: masts round the pad with a glowing head (the look's lamp colour, bright enough for the bloom), no real lights
  const glow = C(look.lamp?.light ?? '#ffe0b0').multiplyScalar(6).getStyle();
  for (const [x, z] of [[P.x0 + 20, zn], [cx, zn], [P.x1 - 20, zn], [P.x0 - 8, 0], [P.x1 + 8, 0], [P.x0 + 40, zs + 6], [P.x1 - 90, zs + 6]]) {
    parts.push(box(0.5, 20, 0.5, X(x), y0 + 10, z, '#4a4856'), box(4.2, 1.6, 0.5, X(x), y0 + 20.6, z, '#3a3846'));
    lampHeads.push([X(x), y0 + 20.6, z, 3.4]);
  }
  const props = new THREE.Mesh(mergeGeometries(parts.map((g) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!g.attributes.normal) g.computeVertexNormals(); return g; })), flat);
  props.castShadow = true; props.name = 'place:props'; group.add(props);
  // the glowing parts: lamp heads and the lighthouse's lantern, unlit and bright (the bloom makes them shine)
  const lit = new THREE.Mesh(mergeGeometries(lampHeads.map(([x, y, z, s]) => new THREE.BoxGeometry(s * 1.1, s * 0.3, 0.3).translate(x, y - 0.5, z))), new THREE.MeshBasicMaterial({ color: C(glow) }));
  lit.name = 'place:lamps'; group.add(lit);
  // --- palms along the land side and the ends (a few shapes, many places)
  const palmMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), spots = [];
  for (let x = P.x0 - 12; x <= P.x1 + 12; x += 15 + r() * 9) spots.push([x, zn + 20 + r() * 6]);
  for (let z = P.z0 + 10; z <= P.z1; z += 22 + r() * 10) { spots.push([P.x0 - 12 - r() * 5, z]); spots.push([P.x1 + 12 + r() * 5, z]); }
  for (let i = 0; i < 6; i++) spots.push([cx - 100 + r() * 90, zn + 1 + r() * 2]);
  for (let v = 0; v < 3; v++) {
    const mine = spots.filter((_, i) => i % 3 === v), mesh = new THREE.InstancedMesh(palmGeometry(r, L.palmTrunk ?? '#7a5c4a', L.palm ?? '#3f7a52', L.palmTip ?? '#8fb45c'), palmMat, mine.length), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    mine.forEach(([x, z], i) => { const s = 0.85 + r() * 0.5; mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(X(x), groundY(x, z), z), q.setFromAxisAngle(up, r() * 6.28), new THREE.Vector3(s, s, s))); });
    mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = true; mesh.name = 'place:palms'; group.add(mesh);
  }
  return { group, lampHeads, setWet(on) { road.uniforms.uWet.value = on ? 1 : 0; } };
}
