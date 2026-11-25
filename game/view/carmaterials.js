// The materials of a car (docs/CAR-MODELS.md): the code model and every model file get theirs from here, by slot name.
// `high` uses MeshPhysicalMaterial (clearcoat), `low` (phones) MeshStandardMaterial.
import * as THREE from '../../vendor/three/three.module.js';

/** A small carbon weave (twill) drawn here: no file. */
function carbonTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); x.fillStyle = '#0c0d0f'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const lit = (i + j) % 2 === 0, g = x.createLinearGradient(i * 8, j * 8, i * 8 + 8, j * 8 + 8);
    g.addColorStop(0, lit ? '#2b2e33' : '#15171a'); g.addColorStop(1, lit ? '#15171a' : '#2b2e33');
    x.fillStyle = g; x.fillRect(i * 8 + 0.5, j * 8 + 0.5, 7, 7);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------- the materials
export function carMaterials({ tier = 'high', paint = 0x1d3f8a, env = null } = {}) {
  const high = tier === 'high';
  const M = (cls, o) => new cls({ ...(env ? { envMap: env } : {}), ...o });
  return {
    paint: high
      ? M(THREE.MeshPhysicalMaterial, { color: paint, metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.1 })
      : M(THREE.MeshStandardMaterial, { color: paint, metalness: 0.45, roughness: 0.32, envMapIntensity: 1.0 }),
    glass: M(THREE.MeshStandardMaterial, { color: 0x04070b, metalness: 0.0, roughness: 0.06, envMapIntensity: 0.35 }),   // tinted: dark, with the room in it at a glancing angle
    chrome: M(THREE.MeshStandardMaterial, { color: 0xe3e7ee, metalness: 1, roughness: 0.1, envMapIntensity: 1.3 }),
    rubber: M(THREE.MeshStandardMaterial, { vertexColors: true, metalness: 0, roughness: 0.92 }),
    plastic: M(THREE.MeshStandardMaterial, { color: 0x14161a, metalness: 0, roughness: 0.82, envMapIntensity: 0.4 }),
    carbon: high
      ? M(THREE.MeshPhysicalMaterial, { map: carbonTexture(), metalness: 0.25, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.08, envMapIntensity: 0.9 })
      : M(THREE.MeshStandardMaterial, { map: carbonTexture(), metalness: 0.25, roughness: 0.42, envMapIntensity: 0.8 }),
    lights: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),   // they glow: unlit, brighter than white (the code model: colours per vertex)
    // the slots of a model file (docs/CAR-MODELS.md) that a vertex-coloured mesh does not cover
    light_front: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff3d6).multiplyScalar(3.2), toneMapped: false }),
    light_rear: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a1c).multiplyScalar(2.2), toneMapped: false }),
    interior: M(THREE.MeshStandardMaterial, { color: 0x1b1c20, metalness: 0, roughness: 0.9, envMapIntensity: 0.3 }),
  };
}

