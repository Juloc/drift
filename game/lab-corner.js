// The hero corner as a still picture: the harbour scene (view/look/harbour.js) with the posed car and smoke, one fixed camera. `?still=1` draws exactly 30 pictures and stops (for
// comparing two builds of the page); the other parameters of the scene (sky, sun, fog, exposure, camera) are read by the scene itself.
import * as THREE from '../vendor/three/three.module.js';
import { buildHarbour } from './view/look/harbour.js';

window.__err = []; addEventListener('error', (e) => window.__err.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__err.push(String(e.reason?.message ?? e.reason)));
const params = new URLSearchParams(location.search), canvas = document.getElementById('view'), info = document.getElementById('info');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight, false);
const h = await buildHarbour({ renderer, params, still: true });
addEventListener('resize', () => h.resize(innerWidth, innerHeight));
window.__dbg = h.debug;
const STILL = params.has('still');
let frames = 0;
const frame = () => {
  h.composer.render(); frames++;
  if (frames === 5 && !STILL) window.__ready = true;
  if (frames === 30) { info.textContent = `${renderer.info.render.calls} calls, ${Math.round(renderer.info.render.triangles / 1000)}k triangles`; if (STILL) { window.__ready = true; return; } }
  requestAnimationFrame(frame);
};
frame();
