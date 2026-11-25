// The studio for the showpiece: a reflection map made from three.js's own RoomEnvironment (no download), a neutral floor with a contact shadow,
// warm key, cool fill and a rim light from behind. Used by showroom.html and by the game when a probe model is asked for.
import * as THREE from '../../vendor/three/three.module.js';
import { RoomEnvironment } from '../../vendor/three/addons/environments/RoomEnvironment.js';

/** Reflections: the room turned into a PMREM cube; `size` 256 on the high tier, 64 on a phone. */
export function makeEnvironment(renderer, size = 256) {
  const pm = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const tex = pm.fromScene(room, 0.04, 0.1, 100, { size }).texture;
  room.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  pm.dispose();
  return tex;
}

/** A soft dark patch under a car, drawn on a canvas: the contact shadow of both tiers. */
export function contactShadow(w = 5.6, d = 11) {
  const c = document.createElement('canvas'); c.width = c.height = 128;   // a round gradient on a square, stretched to the plane
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 63);
  g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.55, 'rgba(0,0,0,0.5)'); g.addColorStop(0.85, 'rgba(0,0,0,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }));
  mesh.position.y = 0.004; mesh.renderOrder = 1;
  return mesh;
}

/** Lights and floor for a studio scene; returns what the page may want to move. */
export function studio(scene, { shadows = true, size = 2048 } = {}) {
  scene.background = new THREE.Color(0xcfd4db);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc4c9d0, roughness: 0.62, metalness: 0 }));
  floor.receiveShadow = true;
  scene.add(floor);
  const key = new THREE.DirectionalLight(0xffe0b8, 2.8); key.position.set(-6, 8, 7);
  const fill = new THREE.DirectionalLight(0xaec4ff, 1.0); fill.position.set(7, 3.5, 2);
  const rim = new THREE.DirectionalLight(0xdfe9ff, 2.0); rim.position.set(0.5, 4.5, -8);
  scene.add(key, fill, rim, new THREE.HemisphereLight(0xdde6ff, 0xb9b2a8, 0.25));
  if (shadows) {
    key.castShadow = true; key.shadow.mapSize.set(size, size);
    const c = key.shadow.camera; c.left = -7; c.right = 7; c.top = 7; c.bottom = -7; c.near = 1; c.far = 30;
    key.shadow.radius = 5; key.shadow.bias = -0.0003; key.shadow.normalBias = 0.03;
  }
  return { floor, key, fill, rim };
}
