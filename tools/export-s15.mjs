// Writes the S15 code model as model files after the rules of docs/CAR-MODELS.md (the proof for the loading path):
//   game/assets/cars/s15-test.glb (phone tier)   game/assets/cars/s15-test-hi.glb (high tier, with the kit)
// Usage: node tools/export-s15.mjs     (Node only, no browser; GLTFExporter needs FileReader, a small stand-in is below)
import fs from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';

globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); this.onload?.(); }); } readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(r).toString('base64'); this.onloadend?.(); this.onload?.(); }); } };
const ctx = { fillRect() {}, createLinearGradient: () => ({ addColorStop() {} }) };
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
const { buildS15 } = await import('../game/view/s15.js');
const { GLTFExporter } = await import('../vendor/three/addons/exporters/GLTFExporter.js');

const slotOfMaterial = (m, mats) => Object.entries(mats).find(([, v]) => v === m)?.[0];

function build(tier, kit) {
  const car = buildS15({ tier, kit, paint: 0xffffff });
  const root = new THREE.Group(); root.name = 'car';
  const named = (slot, geo, vertexColors) => {
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ name: slot, color: 0xffffff, vertexColors }));
    mesh.name = 'body_' + slot; return mesh;
  };
  const wheelPivots = car.wheels.map((w) => w.pivot);
  for (const o of [...car.group.children]) {
    if (!o.isMesh) continue;
    const slot = slotOfMaterial(o.material, car.materials);
    const g = o.geometry.clone();
    if (slot === 'lights') {   // front lamps white/amber, tail lamps red: two slots by the colour of each triangle
      const col = g.attributes.color, idx = g.index.array, front = [], rear = [];
      for (let i = 0; i < idx.length; i += 3) (col.getX(idx[i]) > col.getY(idx[i]) * 2 ? rear : front).push(idx[i], idx[i + 1], idx[i + 2]);
      for (const [slotName, list] of [['light_front', front], ['light_rear', rear]]) {
        if (!list.length) continue;
        const gg = g.clone(); gg.setIndex(list); gg.deleteAttribute('color'); gg.deleteAttribute('uv');
        root.add(named(slotName, gg, false));
      }
      continue;
    }
    if (slot !== 'carbon') g.deleteAttribute('uv');
    root.add(named(slot, g, slot === 'rubber'));
  }
  // wheels: a node at the wheel centre, no rotation, outward = the side it is on (the left ones are turned around in the mesh itself), no camber
  for (const p of wheelPivots) {
    const sx = Math.sign(p.position.x), sz = Math.sign(p.position.z);
    const node = new THREE.Group(); node.name = `wheel_${sz > 0 ? 'f' : 'r'}${sx > 0 ? 'l' : 'r'}`;   // +x is the car's left (front is +z, up is +y)
    node.position.copy(p.position);
    const flip = p.children[0].children[0].children[0];   // camber > spin > flip
    const rubber = flip.children[0], alloy = flip.children[1];
    const turn = new THREE.Matrix4().makeRotationY(sx < 0 ? Math.PI : 0);
    const rg = rubber.geometry.clone().applyMatrix4(turn), ag = alloy.geometry.clone().applyMatrix4(turn);
    rg.deleteAttribute('uv'); ag.deleteAttribute('uv');
    if (tier === 'low') {
      // phone tier: one mesh per wheel, the alloy painted into the vertex colours (a light grey) so that a wheel is one draw call
      const n = ag.attributes.position.count, c = new Float32Array(n * 3).fill(0.72);
      ag.setAttribute('color', new THREE.BufferAttribute(c, 3));
      node.add(named('rubber', mergeGeo([rg, ag]), true));
    } else { node.add(named('rubber', rg, true)); node.add(named('chrome', ag, false)); }
    node.children.forEach((m, i) => { m.name = `${node.name}_${m.material.name}`; });
    root.add(node);
  }
  return { root, car };
}
function mergeGeo(list) {
  const pos = [], nor = [], col = [], idx = []; let base = 0;
  for (const g of list) {
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); col.push(...g.attributes.color.array);
    const ix = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    for (const i of ix) idx.push(i + base); base += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); m.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  m.setIndex(idx); return m;
}

for (const [file, tier, kit] of [['s15-test', 'low', false], ['s15-test-hi', 'high', true]]) {
  const { root } = build(tier, kit);
  const buf = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false });
  fs.mkdirSync('game/assets/cars', { recursive: true });
  fs.writeFileSync(`game/assets/cars/${file}.glb`, Buffer.from(buf));
  console.log(file, (buf.byteLength / 1024).toFixed(0) + ' KB');
}
