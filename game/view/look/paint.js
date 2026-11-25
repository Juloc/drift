// The painted look of a car (the owner: "too smooth"): the light on it in two or three soft steps (a toon ramp), the edges a little
// darker (a soft contour), less mirror (a light clear-coat gloss instead of chrome), and dust low on the sills. Only the drawing of the
// car's own materials changes; the model and the game's materials file stay as they are.
import * as THREE from '../../../vendor/three/three.module.js';

/** Patches every lit material under `root`. `o` from the look's `car` block. Returns the uniforms to move (`uBase`: the ground's height). */
export function paintCar(root, sun, o = {}) {
  const uniforms = { uBase: { value: 0 }, uDirt: { value: new THREE.Color(o.dirt ?? '#7a5a52') }, uRim: { value: o.rim ?? 0.45 } };
  const sunLum = (sun.color.r + sun.color.g + sun.color.b) / 3 * sun.intensity / Math.PI;
  const done = new Set();
  root.traverse((m) => {
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      if (done.has(mat) || mat.isMeshBasicMaterial || !mat.isMeshStandardMaterial) continue;
      done.add(mat);
      if (mat.metalness > 0.9) { mat.roughness = Math.max(mat.roughness, 0.28); mat.envMapIntensity = 0.7; }   // rims: satin, not a mirror
      else if (mat.clearcoat !== undefined && mat.clearcoat > 0 || mat.metalness > 0.3) { mat.metalness = 0.15; mat.roughness = 0.42; mat.envMapIntensity = o.gloss ?? 0.5; if (mat.clearcoat) mat.clearcoatRoughness = 0.12; }
      const c = mat.color ?? new THREE.Color(1, 1, 1), key = Math.max(0.05, sunLum * (c.r + c.g + c.b) / 3);
      const steps = o.steps ?? true;
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uniforms, { uKey: { value: key } });
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY;').replace('#include <project_vertex>', '#include <project_vertex>\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vWY;\nuniform float uBase, uRim, uKey;\nuniform vec3 uDirt;')
          .replace('#include <color_fragment>', '#include <color_fragment>\nfloat dust = 1.0 - smoothstep(0.16, 0.45, abs(vWY - uBase));\ndiffuseColor.rgb = mix(diffuseColor.rgb, uDirt, dust * 0.5);')
          .replace('#include <lights_fragment_end>', steps ? `#include <lights_fragment_end>
            { vec3 dd = reflectedLight.directDiffuse; float l = dot(dd, vec3(0.3333));
              float t = clamp(l / uKey, 0.0, 1.0), st = 0.18 + 0.42 * smoothstep(0.06, 0.13, t) + 0.4 * smoothstep(0.42, 0.5, t);
              if (l > 1e-5) reflectedLight.directDiffuse = dd / l * st * uKey; }` : '#include <lights_fragment_end>')
          .replace('#include <opaque_fragment>', '#include <opaque_fragment>\nfloat rim = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));\ngl_FragColor.rgb *= 1.0 - smoothstep(0.6, 0.97, rim) * uRim;');
      };
      mat.needsUpdate = true;
    }
  });
  return uniforms;
}
