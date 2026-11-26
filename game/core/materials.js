// Materials. Everything solid uses one matte "clay" material with vertex colours:
// no gloss, a faint grain in the colour, optional sway for trees and flags.

import * as THREE from '../../vendor/three/three.module.js';

export const shared = {
  uTime: { value: 0 },
};

const NOISE_GLSL = /* glsl */ `
float clayHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float clayNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(clayHash(i), clayHash(i + vec3(1,0,0)), f.x),
                 mix(clayHash(i + vec3(0,1,0)), clayHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(clayHash(i + vec3(0,0,1)), clayHash(i + vec3(1,0,1)), f.x),
                 mix(clayHash(i + vec3(0,1,1)), clayHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;

function patchClay(shader) {
  shader.uniforms.uTime = shared.uTime;
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      /* glsl */ `#include <common>
      uniform float uTime;
      varying vec3 vWPos;
      #ifdef SWAY
      attribute float sway;
      #endif`,
    )
    .replace(
      '#include <begin_vertex>',
      /* glsl */ `vec3 transformed = vec3(position);
      #ifdef SWAY
        vec4 wp0 = modelMatrix * vec4(position, 1.0);
        float ph = wp0.x * 0.35 + wp0.z * 0.27;
        transformed.x += sway * sin(uTime * 1.5 + ph) * 0.13;
        transformed.z += sway * cos(uTime * 1.2 + ph * 1.3) * 0.10;
      #endif`,
    )
    .replace(
      '#include <project_vertex>',
      /* glsl */ `#include <project_vertex>
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      /* glsl */ `#include <common>
      varying vec3 vWPos;
      ${NOISE_GLSL}`,
    )
    .replace(
      '#include <color_fragment>',
      /* glsl */ `#include <color_fragment>
      #ifdef GRAIN
        float grain = clayNoise(vWPos * 9.0) * 0.55 + clayNoise(vWPos * 2.3) * 0.45;
        diffuseColor.rgb *= 0.93 + grain * 0.14;
      #endif`,
    );
}

const clayMaterials = [];

/** Matte clay. opts: sway (bool), flat (bool), side */
export function makeClay(opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: opts.side ?? THREE.FrontSide,
    flatShading: !!opts.flat,
  });
  mat.defines = { GRAIN: 1 };
  if (opts.sway) mat.defines.SWAY = 1;
  mat.onBeforeCompile = patchClay;
  clayMaterials.push(mat);
  return mat;
}

/** Grain costs a few noise lookups per pixel; the low quality tier switches it off. */
export function setGrain(on) {
  for (const m of clayMaterials) {
    const has = 'GRAIN' in m.defines;
    if (on && !has) m.defines.GRAIN = 1;
    else if (!on && has) delete m.defines.GRAIN;
    else continue;
    m.needsUpdate = true;
  }
}

/** Clouds: bright and soft, and they dissolve (dither) when the camera gets close. */
export function makeCloud() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xb9c2d4, emissiveIntensity: 0.8 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vCamDist;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCamDist = -mvPosition.z;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCamDist;')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float keep = smoothstep(70.0, 130.0, vCamDist);
        float dither = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
        if (dither > keep) discard;`,
      );
  };
  return mat;
}

/** Unlit, for things that glow: windows, bulbs, neon. Colours may be brighter than 1. */
export function makeGlow() {
  return new THREE.MeshBasicMaterial({ vertexColors: true });
}

/**
 * Soft round halos as GL points (one draw call for all lamps, windows, headlights).
 * Positions can be moved every frame with `set`.
 */
export class Halos {
  /** `maxPx`: the biggest a halo gets on the screen; `nearFade` (metres): halos fade out within this distance of the camera (no giant disc in front of the lens). */
  constructor(capacity = 96, { maxPx = 180, nearFade = 0 } = {}) {
    this.capacity = capacity;
    this.n = 0;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2000);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uMax: { value: maxPx }, uFade: { value: nearFade } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec3 tint;
        uniform float uScale, uMax, uFade;
        varying vec3 vColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vColor = uFade > 0.0 ? tint * smoothstep(uFade * 0.2, uFade, -mv.z) : tint;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(size * uScale / -mv.z, uMax);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = pow(max(0.0, 1.0 - d), 2.2);
          gl_FragColor = vec4(vColor * a, 1.0);
        }`,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  add(x, y, z, color, size) {
    const i = this.n++;
    if (i >= this.capacity) throw new Error('Halos: capacity too small');
    const c = color.isColor ? color : new THREE.Color(color);
    this.col.set([c.r, c.g, c.b], i * 3);
    this.size[i] = size;
    this.set(i, x, y, z);
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    g.attributes.tint.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    return i;
  }

  set(i, x, y, z) {
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  setSize(i, s) {
    this.size[i] = s;
    this.points.geometry.attributes.size.needsUpdate = true;
  }

  /** uScale = half the drawing-buffer height / tan(fov/2): makes `size` a world-space diameter. */
  resize(bufferHeight, fovDeg) {
    this.material.uniforms.uScale.value = (bufferHeight * 0.5) / Math.tan((fovDeg * Math.PI) / 360);
  }
}
