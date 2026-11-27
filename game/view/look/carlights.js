// A car's lights: the tail lamps glow a deep red with a soft halo and shine brighter on the brake (and throw a little red on the road), the head lamps
// glow warm with a halo each and throw a beam on the road ahead. `carLights(model, { flats })` dresses a car model whose lamp parts carry `lamp_rear` and
// `lamp_front` in their material's name (the game's car files do) and returns `{ set({ brake, head }), dispose() }`; it is also kept at `model.userData.lights`.
// The halos are flat pictures: they go into `flats` (out of the ambient occlusion's shape pass). The car's nose is +z, its left +x.
import * as THREE from '../../../vendor/three/three.module.js';

let haloTex = null;
function halo() { if (haloTex) return haloTex; const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 1, 64, 64, 63); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); haloTex = new THREE.CanvasTexture(c); return haloTex; }

export function carLights(model, { flats = [], beam = true } = {}) {
  const rear = [], front = [], boxR = new THREE.Box3(), boxF = new THREE.Box3(), inv = new THREE.Matrix4(); model.updateWorldMatrix(true, true); inv.copy(model.matrixWorld).invert();
  model.traverse((o) => { if (!o.isMesh) return; const name = o.material.name || '';
    if (/lamp_rear/.test(name)) { o.material = o.material.clone(); o.material.color = new THREE.Color(0.4, 0.0, 0.02); o.material.emissive = new THREE.Color(1, 0.0, 0.04); rear.push(o.material); boxR.union(new THREE.Box3().setFromObject(o).applyMatrix4(inv)); }
    if (/lamp_front/.test(name)) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(1, 0.86, 0.62); o.material.emissiveMap = o.material.map; front.push(o.material); boxF.union(new THREE.Box3().setFromObject(o).applyMatrix4(inv)); } });
  const sprite = (col) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo(), color: col, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true })); s.renderOrder = 4; model.add(s); flats.push(s); return s; };
  const side = (box) => Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) * 0.74, mid = (box) => (box.min.y + box.max.y) / 2;
  const tails = rear.length ? [1, -1].map((sgn) => { const s = sprite(new THREE.Color(1, 0.04, 0.03)); s.position.set(sgn * side(boxR), mid(boxR), boxR.min.z - 0.03); return s; }) : [];
  const heads = front.length ? [1, -1].map((sgn) => { const s = sprite(new THREE.Color(1, 0.88, 0.66)); s.position.set(sgn * side(boxF), mid(boxF), boxF.max.z + 0.03); return s; }) : [];
  const spill = rear.length ? new THREE.PointLight(new THREE.Color(1, 0.05, 0.03), 0, 5, 1.6) : null; if (spill) { spill.position.set(0, 0.5, boxR.min.z - 0.5); model.add(spill); }
  let spot = null; if (beam && front.length) { spot = new THREE.SpotLight(new THREE.Color(1, 0.9, 0.72), 0, 38, 0.48, 0.7, 1.4); spot.position.set(0, mid(boxF), boxF.max.z - 0.1); spot.target.position.set(0, -0.6, boxF.max.z + 14); model.add(spot, spot.target); }
  const api = { state: { brake: 0, head: 1 },
    /** `brake` 0..1 (the pedal), `head` 0 or 1 (the head lamps and the tail lamps' own light; off, only the brake shows). */
    set({ brake = api.state.brake, head = api.state.head } = {}) { api.state.brake = brake; api.state.head = head; const tail = 1.3 * head + 1.5 * brake;
      for (const m of rear) m.emissiveIntensity = tail; for (const s of tails) { s.scale.setScalar(0.34 * head + 0.75 * brake + 1e-3); s.material.opacity = Math.min(1, 0.55 * head + 0.75 * brake); }
      if (spill) spill.intensity = 0.25 * head + 1.3 * brake;
      for (const m of front) m.emissiveIntensity = 2.2 * head; for (const s of heads) { s.scale.setScalar(0.62 * head + 1e-3); s.material.opacity = 0.85 * head; } if (spot) spot.intensity = 46 * head; return api; },
    dispose() { for (const s of [...tails, ...heads]) { model.remove(s); s.material.dispose(); } if (spill) model.remove(spill); if (spot) model.remove(spot, spot.target); } };
  model.userData.lights = api; return api.set();
}
