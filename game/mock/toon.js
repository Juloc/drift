// The one light model of the mock stage. Every surface has its true colour (what it would be under white light); a time of day is a handful of
// numbers (`KEY`): what the low sun adds where it reaches (`light`), what the sky gives from above and the ground from below where it does not
// (`skyFill`, `groundFill`), a rim against the sun and a haze that takes the sky's colour with distance (warm towards the sun, thicker low in the
// valley). The numbers of the sunset are measured from the owner's mockup: a white thing in the sun is rose (#c998aa), in shadow mauve (#987284);
// the land is darker than the sky. A face is lit only as far as it turns to the sun, so level ground under a low sun stays nearly in shadow: that
// is what makes it evening. After the open-source folio of Bruno Simon (MIT), written for our renderer (a patch on the Lambert material: its
// shadow map, instancing, textures and vertex colours keep working).
import * as THREE from '../../vendor/three/three.module.js';

/** The colours of one time of day (linear, as factors on a surface's own colour): the sunset of the owner's mockup. */
export const KEY = {
  sunDir: new THREE.Vector3(0.52, 0.2, -0.83).normalize(),
  light: new THREE.Color(1.05, 0.56, 0.62), skyFill: new THREE.Color(0.43, 0.22, 0.3), groundFill: new THREE.Color(0.25, 0.12, 0.16), rim: new THREE.Color(1.0, 0.5, 0.4),
  hazeWarm: new THREE.Color(0.93, 0.36, 0.27), hazeCool: new THREE.Color(0.78, 0.27, 0.34), hazeFar: 2300, hazeLow: -34,
};

export const shared = {
  uSun: { value: KEY.sunDir }, uLight: { value: KEY.light }, uSkyFill: { value: KEY.skyFill }, uGroundFill: { value: KEY.groundFill }, uRim: { value: KEY.rim },
  uHazeWarm: { value: KEY.hazeWarm }, uHazeCool: { value: KEY.hazeCool }, uHazeFar: { value: KEY.hazeFar }, uHazeLow: { value: KEY.hazeLow }, uTime: { value: 0 },
};

export const HAZE_PARS = /* glsl */ `
  uniform vec3 uSun, uHazeWarm, uHazeCool; uniform float uHazeFar, uHazeLow;
  vec3 hazed(vec3 c, vec3 wpos, float k) {
    vec3 v = wpos - cameraPosition; float d = length(v); v /= max(d, 1e-4);
    float f = 1.0 - exp(-d / uHazeFar);
    f = max(f, smoothstep(uHazeLow + 26.0, uHazeLow - 14.0, wpos.y) * smoothstep(120.0, 520.0, d) * 0.5);   // the valley lies in mist
    vec3 hz = mix(uHazeCool, uHazeWarm, pow(max(dot(v, normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0), 3.0));
    return mix(c, hz, clamp(f * k, 0.0, 1.0));
  }`;

/**
 * A world material. o: { color, map, vertexColors, flat, side, alphaTest, soft (how wide the light's edge is, 0..1), rim (0..1), haze (0..1),
 *   vary (0..1: how much lighter and darker the colour wanders over the surface; default 0.3), sway (metres a metre of height: instances wave in the wind),
 *   bake (the geometry has a `bake` attribute, 0..1: how much of the sun reaches the vertex past the land, worked out once for the sun's place),
 *   pars (extra fragment declarations), paint (fragment code that may change `diffuseColor` from `vUv2` / `vWPos`), gloss (0..1: the sun's glint) }
 */
export function toon(o = {}) {
  const m = new THREE.MeshLambertMaterial({ color: o.color ?? 0xffffff, map: o.map ?? null, vertexColors: !!o.vertexColors, flatShading: !!o.flat, side: o.side ?? THREE.FrontSide, alphaTest: o.alphaTest ?? 0, transparent: !!o.transparent, opacity: o.opacity ?? 1, depthWrite: o.depthWrite ?? true });
  const soft = (o.soft ?? 0.35).toFixed(3), rim = (o.rim ?? 0.35).toFixed(3), haze = (o.haze ?? 1).toFixed(3), gloss = (o.gloss ?? 0).toFixed(3), glow = o.glow ?? null, vary = (o.vary ?? 0.3).toFixed(3), sway = o.sway ?? 0, bake = !!o.bake;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, o.uniforms ?? {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; varying vec2 vUv2; uniform float uTime;${bake ? ' attribute float bake; varying float vBake;' : ''}`)
      .replace('#include <begin_vertex>', sway ? `#include <begin_vertex>
        #ifdef USE_INSTANCING
        { float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.29, gust = 0.6 + 0.4 * sin(uTime * 0.5 + ph * 0.21); transformed.x += sin(uTime * 1.7 + ph) * ${sway.toFixed(3)} * position.y * gust; transformed.z += cos(uTime * 1.3 + ph * 1.31) * ${(sway * 0.7).toFixed(3)} * position.y * gust; }
        #endif` : '#include <begin_vertex>')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          #endif
          vWPos = (modelMatrix * wp).xyz; vUv2 = uv; ${bake ? 'vBake = bake;' : ''} }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; varying vec2 vUv2; uniform vec3 uLight, uSkyFill, uGroundFill, uRim;${bake ? ' varying float vBake;' : ''}\n${HAZE_PARS}\n${o.pars ?? ''}`)
      .replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>')
      .replace('#include <color_fragment>', `#include <color_fragment>\n${o.paint ?? ''}`)
      .replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;', `
        vec3 wn = inverseTransformDirection(normal, viewMatrix), vdir = normalize(cameraPosition - vWPos);
        float reach = getShadowMask()${bake ? ' * vBake' : ''};                                // how much of the sun arrives here (the near shadow map, and the land's own shadow worked out beforehand)
        float ndl = dot(wn, uSun), lit = smoothstep(0.02 - 0.3 * ${soft}, 0.42 + 0.6 * ${soft}, ndl) * reach;
        vec3 base = diffuseColor.rgb;
        base *= 1.0 + ${vary} * 0.22 * sin(vWPos.x * 0.31 + sin(vWPos.z * 0.23) * 1.7) * sin(vWPos.z * 0.27 + vWPos.y * 0.45);   // a little lighter and darker in slow waves, as a brush leaves it
        vec3 fill = mix(uGroundFill, uSkyFill, smoothstep(-0.7, 0.85, wn.y));               // where the sun does not reach: the sky's light from above, the ground's from below
        vec3 outgoingLight = base * (fill + uLight * lit);
        float fres = pow(1.0 - max(dot(wn, vdir), 0.0), 3.0);
        outgoingLight += uRim * base * fres * ${rim} * (0.2 + 0.8 * max(dot(-vdir, uSun), 0.0)) * (0.4 + 0.6 * reach);  // a rim against the sun
        ${+gloss > 0 ? `{ vec3 h = normalize(uSun + vdir); float g = pow(max(dot(wn, h), 0.0), 26.0) + 0.25 * pow(max(dot(wn, h), 0.0), 5.0); outgoingLight += uLight * vec3(1.0, 0.8, 0.66) * g * ${gloss} * (0.25 + 0.75 * reach); }` : ''}
        ${glow ? `outgoingLight += ${glow};` : ''}
        outgoingLight = hazed(outgoingLight, vWPos, ${haze}) + totalEmissiveRadiance;`);
  };
  m.customProgramCacheKey = () => `toon|${bake}|${vary}|${sway}|${soft}|${rim}|${haze}|${gloss}|${o.pars ?? ''}|${o.paint ?? ''}|${glow ?? ''}`;
  return m;
}
