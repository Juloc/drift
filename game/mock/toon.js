// The one light model of the mock stage: every surface of the world is `base colour x light` where the sun reaches it and `base colour x shadow
// colour` where it does not (a coloured shadow, not a dark one), with a soft edge between the two, a warm rim against the sun and a haze that
// takes the sky's colour with distance (warm towards the sun, cool away from it, thicker low in the valley). No physical light: the colours of a
// time of day are a handful of numbers (`KEY`), so a day is a blend between such sets. After the open-source folio of Bruno Simon (MIT), written
// for our renderer (a patch on the Lambert material: its shadow map, instancing, textures and vertex colours keep working).
import * as THREE from '../../vendor/three/three.module.js';

/** The colours of one time of day: the sunset of the owner's mockup. */
export const KEY = {
  sunDir: new THREE.Vector3(0.52, 0.2, -0.83).normalize(),
  light: new THREE.Color(1.24, 1.04, 0.95), shadow: new THREE.Color(0.56, 0.43, 0.82), rim: new THREE.Color(1.0, 0.55, 0.42),
  hazeWarm: new THREE.Color('#ffc59a'), hazeCool: new THREE.Color('#c9a2da'), hazeFar: 2600, hazeLow: -34,
};

export const shared = {
  uSun: { value: KEY.sunDir }, uLight: { value: KEY.light }, uShadow: { value: KEY.shadow }, uRim: { value: KEY.rim },
  uHazeWarm: { value: KEY.hazeWarm }, uHazeCool: { value: KEY.hazeCool }, uHazeFar: { value: KEY.hazeFar }, uHazeLow: { value: KEY.hazeLow },
};

export const HAZE_PARS = /* glsl */ `
  uniform vec3 uSun, uHazeWarm, uHazeCool; uniform float uHazeFar, uHazeLow;
  vec3 hazed(vec3 c, vec3 wpos, float k) {
    vec3 v = wpos - cameraPosition; float d = length(v); v /= max(d, 1e-4);
    float f = 1.0 - exp(-d / uHazeFar);
    f = max(f, smoothstep(uHazeLow + 26.0, uHazeLow - 14.0, wpos.y) * smoothstep(120.0, 520.0, d) * 0.55);   // the valley lies in mist
    vec3 hz = mix(uHazeCool, uHazeWarm, pow(max(dot(v, normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0), 3.0));
    return mix(c, hz, clamp(f * k, 0.0, 1.0));
  }`;

/**
 * A world material. o: { color, map, vertexColors, flat, side, alphaTest, soft (width of the light's edge, 0..1), rim (0..1), haze (0..1),
 *   pars (extra fragment declarations), paint (fragment code that may change `diffuseColor` from `vUv2` / `vWPos`), gloss (0..1: the sun's glint) }
 */
export function toon(o = {}) {
  const m = new THREE.MeshLambertMaterial({ color: o.color ?? 0xffffff, map: o.map ?? null, vertexColors: !!o.vertexColors, flatShading: !!o.flat, side: o.side ?? THREE.FrontSide, alphaTest: o.alphaTest ?? 0, transparent: !!o.transparent, opacity: o.opacity ?? 1, depthWrite: o.depthWrite ?? true });
  const soft = (o.soft ?? 0.35).toFixed(3), rim = (o.rim ?? 0.35).toFixed(3), haze = (o.haze ?? 1).toFixed(3), gloss = (o.gloss ?? 0).toFixed(3), glow = o.glow ?? null;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, o.uniforms ?? {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec2 vUv2;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          #endif
          vWPos = (modelMatrix * wp).xyz; vUv2 = uv; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; varying vec2 vUv2; uniform vec3 uLight, uShadow, uRim;\n${HAZE_PARS}\n${o.pars ?? ''}`)
      .replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>')
      .replace('#include <color_fragment>', `#include <color_fragment>\n${o.paint ?? ''}`)
      .replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;', `
        vec3 wn = inverseTransformDirection(normal, viewMatrix), vdir = normalize(cameraPosition - vWPos);
        float ndl = dot(wn, uSun), lit = smoothstep(-${soft}, ${soft}, ndl) * getShadowMask();
        lit = max(lit, 0.22 * smoothstep(0.0, 1.0, wn.y));                                   // the sky's light from above keeps shadows open
        vec3 base = diffuseColor.rgb;
        vec3 outgoingLight = mix(base * uShadow, base * uLight, lit);
        float fres = pow(1.0 - max(dot(wn, vdir), 0.0), 3.0);
        outgoingLight += uRim * base * fres * ${rim} * (0.35 + 0.65 * max(dot(-vdir, uSun), 0.0));  // a rim against the sun
        ${+gloss > 0 ? `{ vec3 h = normalize(uSun + vdir); float g = pow(max(dot(wn, h), 0.0), 26.0) + 0.25 * pow(max(dot(wn, h), 0.0), 5.0); outgoingLight += uLight * vec3(1.0, 0.72, 0.6) * g * ${gloss} * (0.35 + 0.65 * getShadowMask()); }` : ''}
        ${glow ? `outgoingLight += ${glow};` : ''}
        outgoingLight = hazed(outgoingLight, vWPos, ${haze}) + totalEmissiveRadiance;`);
  };
  m.customProgramCacheKey = () => `toon|${soft}|${rim}|${haze}|${gloss}|${o.pars ?? ''}|${o.paint ?? ''}|${glow ?? ''}`;
  return m;
}
