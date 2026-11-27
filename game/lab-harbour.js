// The harbour frame: the quay ring (view/look/quay.js) as the still picture after the owner's mockup. This page owns the renderer and the loop only.
// ?tier=low is the phone's tier; ?off=crowd,smoke,palms,shadow,ao,bloom switches a part off; ?t= the moment (things move); ?top=1 a view from above.
import * as THREE from '../vendor/three/three.module.js';
import { buildQuay } from './view/look/quay.js';

window.__err = []; addEventListener('error', (e) => window.__err.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__err.push(String(e.reason?.message ?? e.reason)));
const params = new URLSearchParams(location.search), canvas = document.getElementById('view'), info = document.getElementById('info');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight, false); renderer.info.autoReset = false;
const tier = params.get('tier') === 'low' || (!params.has('tier') && matchMedia('(pointer: coarse)').matches) ? 'low' : 'high';
const h = await buildQuay({ renderer, params, still: true, tier });
addEventListener('resize', () => h.resize(innerWidth, innerHeight)); window.__h = h; if (params.has('emit') && h.still?.car) { const f = new THREE.Vector3(); h.still.car.getWorldPosition(f); f.y = 0.6; h.smoke.view.focus = f; }   // (for looking into the scene from the console)
let frames = 0, last = performance.now(), ms = 16, emitAt = 0; const emitK = +(params.get('emit') || 0);
const frame = () => { const now = performance.now(), dt = Math.min((now - last) / 1000, 0.05); ms += (now - last - ms) * 0.1; last = now;
  if (emitK) { emitAt = (emitAt + dt * 0.45) % 0.5; for (const w of [-0.7, 0.7]) for (let n = 0; n < 2; n++) { const a = 0.09 - 0.5 + emitAt, r = 26.6 + w; h.smoke.emit(30 - r * Math.cos(a), -4 - r * Math.sin(a), emitK, 0, 0); } }   // ?emit=k: lumps laid along the ring behind the car as a driving car lays them (strength k), to judge the smoke of a drive in the still
  h.tick(dt); renderer.info.reset(); h.composer.render(); if (frames === (emitK ? 150 : 6)) window.__ready = true;
  if (++frames % 40 === 0) info.textContent = `${Math.round(1000 / ms)} fps (${ms.toFixed(1)} ms) · ${renderer.info.render.calls} calls, ${Math.round(renderer.info.render.triangles / 1000)}k triangles · ${h.perf()}`; requestAnimationFrame(frame); };
frame();
// ?bench=1: the time of one picture, the best of 40 renders that wait for the graphics card (the frame loop above is tied to the screen's rate)
if (params.has('bench')) setTimeout(() => { const gl = renderer.getContext(), px = new Uint8Array(4); let best = 1e9; for (let i = 0; i < 40; i++) { const t0 = performance.now(); h.composer.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); best = Math.min(best, performance.now() - t0); } window.__bench = +best.toFixed(1); }, 1500);
