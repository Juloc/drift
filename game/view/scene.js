// Renderer, scene, lights and the quality tiers. The tier table is this game's own (the governor class is the website's).
import * as THREE from '../../vendor/three/three.module.js';
import { Governor } from '../core/quality.js';
import { setGrain } from '../core/materials.js';
import { X } from './space.js';

export const TIERS = {
  high: { dpr: 1.75, scale: 1, shadows: 1024, grain: true },
  medium: { dpr: 1.25, scale: 1, shadows: 0, grain: true },
  low: { dpr: 1, scale: 0.75, shadows: 0, grain: false },
};

export function createView(canvas, { tier, auto, sky }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sky.horizon);
  scene.fog = new THREE.Fog(sky.horizon, 150, 380);
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0xe8c9a0, 1.5);
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
  sun.position.set(-30, 60, 25);
  scene.add(hemi, sun, sun.target);
  const camera = new THREE.PerspectiveCamera(55, 1, 1, 600);
  const view = { renderer, scene, camera, sun, hemi, tier, scale: 1, governor: null };
  /** The look of a map: sky and fog colour, the strength and colour of the light (a night harbour, a bright desert). */
  view.look = (map) => {
    const sk = map.sky ?? sky, l = map.light ?? {};
    scene.background.set(sk.horizon); scene.fog.color.set(sk.horizon);
    hemi.intensity = l.hemi ?? 1.5; sun.intensity = l.sun ?? 2.6;
    hemi.color.set(l.hemiSky ?? 0xcfe6ff); hemi.groundColor.set(l.hemiGround ?? 0xe8c9a0); sun.color.set(l.sunColour ?? 0xfff0d0);
  };

  view.resize = () => {
    const t = TIERS[view.tier];
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, t.dpr));
    const w = innerWidth, h = innerHeight;
    renderer.setSize(Math.max(2, Math.round(w * t.scale)), Math.max(2, Math.round(h * t.scale)), false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  view.apply = (name) => {
    view.tier = name;
    const t = TIERS[name];
    setGrain(t.grain);
    renderer.shadowMap.enabled = t.shadows > 0;
    sun.castShadow = t.shadows > 0;
    if (t.shadows > 0) {
      sun.shadow.mapSize.set(t.shadows, t.shadows);
      const c = sun.shadow.camera;
      c.left = -30; c.right = 30; c.top = 30; c.bottom = -30; c.near = 1; c.far = 160;
      c.updateProjectionMatrix();
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
    }
    sun.shadow.map?.dispose(); sun.shadow.map = null;
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    view.resize();
  };
  view.governor = new Governor((name) => view.apply(name), tier);
  view.governor.auto = auto;
  view.apply(tier);
  addEventListener('resize', view.resize);
  /** keep the sun's shadow box around the car (centre snapped to whole texels) */
  view.followSun = (x, z) => {
    const snap = 60 / Math.max(1, TIERS[view.tier].shadows || 1024);
    const sx = Math.round(X(x) / snap) * snap, sz = Math.round(z / snap) * snap;
    sun.position.set(sx - 30, 60, sz + 25);
    sun.target.position.set(sx, 0, sz);
  };
  return view;
}
