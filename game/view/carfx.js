// What a model car gets besides its file: an underbody (frame, axles, drive shaft, exhaust pipe in rough strokes), a contact
// shadow in the car's own shape, a pool of headlight on the road ahead, brake lights that brighten when braking, underglow as
// two light strips along the sills, and flames with a flash at the exhaust when the throttle is lifted or the box shifts up.
// The pops are announced as one event per pop, `car.pop` on window ({ kind: 'lift'|'shift', strength 0..1, x, y, z }), so that the
// sound fires at the same moment as the picture. No canvas in Node: the textures are made only where a document exists.
import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { revs } from '../sim/engine.js';

/** Measures a car group made by prepareCar: its box (car axes: x left, y up, z front) and the wheel centres. */
export function measure(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const box = new THREE.Box3(), v = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh || o.userData.fx) return;
    const p = o.geometry.attributes.position, m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(m));
  });
  const wheels = [];
  group.traverse((o) => { if (/^wheel_..(_pivot)?$/.test(o.name)) wheels.push(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))); });
  const zs = wheels.map((w) => w.z), xs = wheels.map((w) => Math.abs(w.x));
  const front = wheels.length ? Math.max(...zs) : 1.3, rear = wheels.length ? Math.min(...zs) : -1.3;
  const halfTrack = wheels.length ? Math.min(...xs) : 0.75, radius = wheels.length ? wheels[0].y : 0.32;
  return { box, front, rear, halfTrack, radius };
}

/** A soft shape drawn on a canvas (null in Node). */
function canvasTexture(w, h, draw) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const shadowTexture = () => canvasTexture(128, 256, (x, w, h) => {
  // the footprint of a car: a rounded rectangle, darkest in the middle and under the four wheels, soft at the edges
  const blur = (r, a, cx, cy, sx, sy) => { const g = x.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.save(); x.translate(cx, cy); x.scale(sx, sy); x.fillStyle = g; x.fillRect(-r, -r, 2 * r, 2 * r); x.restore(); };
  blur(w * 0.5, 0.75, w / 2, h / 2, 0.9, 1.9);
  for (const sx of [0.22, 0.78]) for (const sy of [0.24, 0.76]) blur(w * 0.16, 0.5, w * sx, h * sy, 1, 1.4);
});
const poolTexture = () => canvasTexture(128, 256, (x, w, h) => {
  // two long lobes of light ahead of the lamps, brightest near the car (the bottom of the picture), fading far ahead
  for (const cx of [0.34, 0.66]) {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, w * 0.42); g.addColorStop(0, 'rgba(255,240,215,0.9)'); g.addColorStop(1, 'rgba(255,240,215,0)');
    x.save(); x.translate(w * cx, h * 0.62); x.scale(0.9, 2.3); x.fillStyle = g; x.fillRect(-w, -w, 2 * w, 2 * w); x.restore();
  }
  const fade = x.createLinearGradient(0, 0, 0, h); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.5, 'rgba(0,0,0,0)');
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = fade; x.fillRect(0, 0, w, h);
});
const flameTexture = () => canvasTexture(64, 128, (x, w, h) => {
  // seen from the side: a blue-white core at the pipe (bottom) turning orange and fading towards the tip (top)
  const g = x.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, 'rgba(200,220,255,1)'); g.addColorStop(0.15, 'rgba(255,230,160,1)'); g.addColorStop(0.5, 'rgba(255,140,40,0.85)'); g.addColorStop(1, 'rgba(255,60,10,0)');
  x.fillStyle = g; x.beginPath(); x.moveTo(w * 0.5, 0); x.quadraticCurveTo(w * 1.02, h * 0.55, w * 0.62, h); x.lineTo(w * 0.38, h); x.quadraticCurveTo(-w * 0.02, h * 0.55, w * 0.5, 0); x.fill();
});
const glowTexture = () => canvasTexture(64, 64, (x, w) => {
  const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, w);
});
const stripTexture = () => canvasTexture(64, 16, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
});

const flat = (geo) => geo.rotateX(-Math.PI / 2);
const tag = (o) => { o.userData.fx = true; o.traverse((c) => { c.userData.fx = true; }); return o; };

/**
 * The parts every copy of a car shares (put on the template once, before the copies are made): underbody, contact shadow,
 * headlight pool. `spec` = cars.json's `fx` ({ exhaust: [[x, y, z]], pool: 0..1 }).
 */
export function dressCar(group, spec = {}, { lite = false } = {}) {
  const m = measure(group), { box } = m;
  const len = box.max.z - box.min.z, half = Math.max(0.3, m.halfTrack - 0.14);
  // underbody: a dark floor pan between the wheels, two axles, a drive shaft to the rear axle (rear-wheel drive), a differential, the exhaust pipe
  const tip = new THREE.Vector3(...(spec.exhaust?.[0] ?? [0.4, 0.3, box.min.z + 0.08]));
  const parts = [
    new THREE.BoxGeometry(half * 2, 0.035, len - 0.6).translate(0, 0.17, (box.max.z + box.min.z) / 2),
    new THREE.CylinderGeometry(0.035, 0.035, m.halfTrack * 2 - 0.25, 8).rotateZ(Math.PI / 2).translate(0, m.radius, m.front),
    new THREE.CylinderGeometry(0.04, 0.04, m.halfTrack * 2 - 0.25, 8).rotateZ(Math.PI / 2).translate(0, m.radius, m.rear),
    new THREE.BoxGeometry(0.28, 0.2, 0.26).translate(0, m.radius, m.rear),
    new THREE.CylinderGeometry(0.03, 0.03, m.front - m.rear - 0.4, 8).rotateX(Math.PI / 2).translate(0, 0.21, (m.front + m.rear) / 2),
  ];
  const from = new THREE.Vector3(tip.x * 0.4, 0.2, m.front - 0.3), dir = new THREE.Vector3().subVectors(tip, from);
  const pipe = new THREE.CylinderGeometry(0.03, 0.03, dir.length(), 8).translate(0, dir.length() / 2, 0);
  pipe.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())).translate(from.x, from.y, from.z);
  parts.push(pipe, new THREE.BoxGeometry(0.3, 0.16, 0.5).translate(tip.x * 0.8, 0.2, m.rear - 0.2));   // the silencer
  const under = new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ name: 'fx_underbody', color: 0x1a1b1e, roughness: 0.75, metalness: 0.35 }));
  under.name = 'fx_underbody'; under.castShadow = false;
  // contact shadow: the car's own footprint, a little bigger than the body, lying on the road
  const shadowMap = shadowTexture();
  const shadow = new THREE.Mesh(flat(new THREE.PlaneGeometry(box.max.x - box.min.x + 0.7, len + 0.9)), new THREE.MeshBasicMaterial({ name: 'fx_shadow', color: 0xffffff, map: shadowMap, transparent: true, opacity: 0.85, depthWrite: false }));   // black pixels, the shape in their alpha
  shadow.position.set(0, 0.012, (box.max.z + box.min.z) / 2); shadow.renderOrder = 1; shadow.name = 'fx_shadow';
  // headlight pool on the road ahead
  const poolMap = poolTexture();
  const pool = new THREE.Mesh(flat(new THREE.PlaneGeometry(3.4, 9)), new THREE.MeshBasicMaterial({ name: 'fx_pool', color: new THREE.Color(1, 0.94, 0.82).multiplyScalar(spec.pool ?? 0.55), map: poolMap, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.position.set(0, 0.02, box.max.z + 4.3); pool.renderOrder = 2; pool.name = 'fx_pool';
  const fx = new THREE.Group(); fx.name = 'fx'; fx.add(under, shadow, pool);
  group.add(tag(fx));
  return m;
}

/**
 * The parts and the behaviour of one car (call for each spawned copy): brake lights, flames and flash, underglow strips.
 * @returns {{ update(dt, s): void, setGlow(hue|null): void }} s = { throttle, brake, speed (m/s), top (m/s), engine, lamps (0..1) }
 */
export function carFx(car, spec = {}, { lite = false, announce = false } = {}) {
  const m = measure(car.group), { box } = m;
  // brake lights: this car's own copies of the glowing rear lamps
  const brakeMats = new Map();
  car.group.traverse((o) => {
    if (!o.isMesh) return;
    const own = (mat) => {
      if (!/^lamp_rear_/i.test(mat?.name ?? '')) return mat;
      if (!brakeMats.has(mat)) { const c = mat.clone(); c.userData.base = mat.emissiveIntensity; brakeMats.set(mat, c); }
      return brakeMats.get(mat);
    };
    o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
  });
  // flames: two crossed planes along the pipe (backwards), plus a round flash at the tip; a point light on the high tier
  const tips = (spec.exhaust ?? [[0.4, 0.3, box.min.z + 0.08]]).map((p) => new THREE.Vector3(...p));
  const flameMat = new THREE.MeshBasicMaterial({ name: 'fx_flame', map: flameTexture(), color: new THREE.Color(1, 1, 1).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const flashMat = new THREE.SpriteMaterial({ name: 'fx_flash', map: glowTexture(), color: new THREE.Color(1, 0.62, 0.25).multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const flames = tips.map((tip) => {
    const g = new THREE.Group(); g.position.copy(tip);
    const plane = new THREE.PlaneGeometry(0.22, 0.7).translate(0, 0.35, 0).rotateX(-Math.PI / 2);   // points along -z (backwards)
    g.add(new THREE.Mesh(plane, flameMat), new THREE.Mesh(plane.clone().rotateZ(Math.PI / 2), flameMat));
    const flash = new THREE.Sprite(flashMat); flash.scale.setScalar(0.7); g.add(flash);
    g.visible = false; g.userData.flash = flash;
    return g;
  });
  // the flash's light stays in the scene at 0 when idle (a light that comes and goes would recompile every material)
  const lights = lite ? [] : tips.map((tip) => { const l = new THREE.PointLight(0xff8a3a, 0, 6, 2); l.position.copy(tip).add(new THREE.Vector3(0, 0, -0.3)); return l; });
  // underglow: two thin light strips under the sills and a long soft glow on the road beside each
  const stripMat = new THREE.MeshBasicMaterial({ name: 'fx_glow_strip', color: 0xffffff, toneMapped: false });
  const groundMat = new THREE.MeshBasicMaterial({ name: 'fx_glow_ground', map: stripTexture(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Group(); glow.name = 'fx_glow';
  const sideX = Math.max(0.4, m.halfTrack - 0.02), glowLen = Math.max(1, m.front - m.rear - 0.75);
  for (const s of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, glowLen), stripMat); strip.position.set(s * sideX, 0.16, (m.front + m.rear) / 2);
    const ground = new THREE.Mesh(flat(new THREE.PlaneGeometry(0.9, glowLen + 0.6)), groundMat); ground.position.set(s * (sideX + 0.15), 0.015, (m.front + m.rear) / 2);
    glow.add(strip, ground);
  }
  glow.visible = false;
  const fxg = new THREE.Group(); fxg.name = 'fx_live'; fxg.add(...flames, ...lights, glow);
  car.group.add(tag(fxg));

  // pops: after a lift of the throttle (a short burst) and at an upshift under throttle (one)
  let hiThrottleFor = 0, gear = 1, queue = [], life = 0, strength = 0;
  const fire = (kind, s) => {
    life = 0.09 + 0.05 * s; strength = s;
    for (const f of flames) { f.visible = true; f.rotation.z = Math.random() * Math.PI; }
    if (announce && typeof window !== 'undefined') {
      const p = new THREE.Vector3().copy(tips[0]).applyMatrix4(car.group.matrixWorld);
      window.dispatchEvent(new CustomEvent('car.pop', { detail: { kind, strength: s, x: p.x, y: p.y, z: p.z } }));
    }
  };
  return {
    flames, glow, brakeMats,
    /** Fires one pop now (for pictures and tests). */
    pop(kind = 'lift', strength = 1, hold = 0) { fire(kind, strength); if (hold) life = hold; },
    setGlow(hue) {
      glow.visible = hue !== null && hue !== undefined;
      if (glow.visible) { const c = new THREE.Color().setHSL(hue / 24, 1, 0.55); stripMat.color.copy(c).multiplyScalar(2.2); groundMat.color.copy(c).multiplyScalar(0.9); }
    },
    update(dt, s) {
      for (const mat of brakeMats.values()) mat.emissiveIntensity = mat.userData.base * (s.brake > 0.1 ? 2.8 : 1);
      // the gear of the engine sound (game/sim/engine.js): an upshift with the foot down pops once
      if (s.engine && s.top) {
        const g = revs(s.speed, s.top, s.engine, gear).gear;
        if (g > gear && s.throttle > 0.6 && s.speed > 6) queue.push({ t: 0.03, kind: 'shift', s: 0.7 });
        gear = g;
      }
      if (s.throttle > 0.6) hiThrottleFor += dt;
      else {
        if (s.throttle < 0.15 && hiThrottleFor > 0.4 && s.speed > 8) {   // a lift: two to four pops, 60 to 140 ms apart
          let t = 0.02; const n = 2 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) { queue.push({ t, kind: 'lift', s: 1 - i * 0.18 }); t += 0.06 + Math.random() * 0.08; }
        }
        if (s.throttle < 0.15) hiThrottleFor = 0;
      }
      for (const q of queue) q.t -= dt;
      const due = queue.filter((q) => q.t <= 0); queue = queue.filter((q) => q.t > 0);
      for (const q of due) fire(q.kind, q.s);
      life -= dt;
      const on = life > 0, k = on ? Math.min(1, life / 0.06) : 0;
      for (const f of flames) {
        f.visible = on;
        if (!on) continue;
        f.scale.set(1, 1, (0.55 + 0.6 * strength) * (0.6 + 0.4 * k));
        f.userData.flash.scale.setScalar(0.45 + 0.5 * strength * k);
      }
      for (const l of lights) l.intensity = on ? 6 * strength * k : 0;
    },
  };
}
