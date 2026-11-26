// The stage of a look: renderer, light, sky, the world of a scene (land, road, plaza, trees), mist, lamp halos, the sky's reflection, tyre marks and the smoke, all from a
// look (data/looks/<name>.json) and a scene (data/scenes/<name>.json or the probe's data/probe-sunset.json). The look probe and the game both build their picture through this one
// file, so what the look session improves in game/view/look/ shows up in the game too. Nothing here knows about the game's rules, the network or the HUD.
// `load(look, scene)` can be called again with another look and scene (another map): the old world is taken down and disposed, the renderer, the camera and the post pass stay.
import * as THREE from '../../../vendor/three/three.module.js';
import { Halos } from '../../core/materials.js';
import { Skids } from '../fx.js';
import { buildWorld } from './world.js';
import { makeSky, makeMist, makeSkyEnvironment, sunDirection, makeClouds } from './sky.js';
import { Puffs } from './puffs.js';
import { Billows } from './billows.js';
import { Post } from './post.js';
import { fillSlots } from './models.js';
import { carMaterials } from '../carmaterials.js';
import { loadCarModel } from '../carmodel.js';
import { buildS15 } from '../s15.js';

/** Reads a look (colours, light, tiers) by name from data/looks/. */
export const loadLook = (name) => fetch(`data/looks/${name}.json`).then((r) => r.json());

/** Frees the geometries, materials and textures under an object. */
export function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    for (const m of [].concat(o.material ?? [])) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose?.(); }
  });
}

/**
 * @param {{ canvas: HTMLCanvasElement, look: object, scene0: object, tierName: 'high'|'low', shadowSpan?: number }} o
 * @returns the stage: { renderer, post, scene, camera, tier, tierName, sun, sunDir, hemi, sky, world, field, mist, halos, env, skids, smoke, buildMs, carTier, load(look, scene), resize(), render(), aimSun(x, y, z) }
 */
export function createStage({ canvas, look, scene0, tierName = 'high', shadowSpan = 36 }) {
  // a tier without the after-pass (the phone) draws straight to the screen: let the browser smooth the edges there (MSAA); the after-pass has its own
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !(look.tiers[tierName] ?? look.tiers.low)?.post, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // the mood: ACES tone mapping on both tiers; the high tier adds bloom and a colour grade (post.js), the vignette is CSS
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.info.autoReset = false;   // one frame is several renders (scene, bloom passes): count them together
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 2600);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  const key2 = new THREE.DirectionalLight(0xffffff, 0);   // look.key2: a second warm light (grazing light from the bright side of the sky)
  scene.add(hemi, sun, sun.target, key2, key2.target);
  // a look may lack a tier (older looks have high and low only): medium falls back to low
  const tierOf = (lk, name) => lk.tiers[name] ?? lk.tiers[name === 'medium' ? 'low' : 'high'];
  const tier0 = tierOf(look, tierName);
  /** shadows of a tier (soft, VSM); off when the tier has none */
  const setShadows = (t) => {
    renderer.shadowMap.enabled = !!t.shadows; sun.castShadow = !!t.shadows;
    if (!t.shadows) return;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    sun.shadow.map?.dispose(); sun.shadow.map = null;
    sun.shadow.mapSize.set(t.shadows, t.shadows);
    const c = sun.shadow.camera; c.left = -shadowSpan; c.right = shadowSpan; c.top = shadowSpan; c.bottom = -shadowSpan; c.near = 1; c.far = 260;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; sun.shadow.radius = 6; sun.shadow.blurSamples = 10;
  };
  setShadows(tier0);
  const post = tier0.post ? new Post(renderer, look.grade) : null;

  const stage = {
    renderer, post, scene, camera, tierName, sun, hemi, carTier: tierName === 'low' ? 'low' : 'high',
    usePost: !!tier0.post, tier: tier0, look, scene0, sunDir: null, sky: null, clouds: null, world: null, field: null, mist: null, halos: null, env: null, skids: null, smoke: null, buildMs: 0,
    /** Builds (or rebuilds) everything that belongs to a look and a scene. */
    load(newLook, newScene) {
      const t0 = performance.now();
      for (const o of [stage.sky, stage.clouds, stage.world?.group, stage.mist, stage.halos?.points, stage.skids?.mesh, stage.smoke?.mesh]) if (o) { scene.remove(o); disposeTree(o); }
      stage.env?.dispose?.();
      const tier = tierOf(newLook, tierName);
      Object.assign(stage, { look: newLook, scene0: newScene, tier });
      renderer.toneMappingExposure = newLook.grade.exposure;
      // look.grade.tone 'neutral': Khronos PBR Neutral keeps hues (orange stays orange, the sky does not turn peach); default ACES
      renderer.toneMapping = newLook.grade.tone === 'neutral' ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
      scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
      stage.post?.setGrade(newLook.grade);
      scene.fog = new THREE.Fog(newLook.fog.colour, newLook.fog.near, newLook.fog.far);
      scene.background = new THREE.Color(newLook.fog.colour);
      stage.sunDir = sunDirection(newLook);
      hemi.color.set(newLook.fill.sky); hemi.groundColor.set(newLook.fill.ground); hemi.intensity = newLook.fill.intensity;
      sun.color.set(newLook.sun.colour); sun.intensity = newLook.sun.intensity;
      const k2 = newLook.key2; key2.intensity = k2?.intensity ?? 0; if (k2) { key2.color.set(k2.colour); key2.position.set(-k2.dir[0] * 100, k2.dir[1] * 100, k2.dir[2] * 100); }
      stage.sky = makeSky(newLook, 2200);
      scene.add(stage.sky);
      // the cloud bands of their own (in front of the dome, so the bloom does not wash them out)
      stage.clouds = newLook.sky.bands ? makeClouds(newLook, newLook.sky.bands, 2100) : null;
      if (stage.clouds) scene.add(stage.clouds);
      // the world of the scene, with the sky's reflection on the road
      stage.world = buildWorld(newScene, newLook, tierName);
      scene.add(stage.world.group);
      const world = stage.world; fillSlots(world, newLook, () => stage.world === world);   // model files for the places the world kept (look.models), when they have come
      stage.field = stage.world.field;
      // low mist over the valley floor and the lake (places from the scene; the phone tier takes the first few); it lies relative to the road's height nearby
      const patches = (newScene.mist ?? []).slice(0, tier.mist).map(([x, z, w, d, y]) => [x, z, w, d, y ?? stage.field.groundY(x, z) + newLook.mist.y]);   // a patch may give its own absolute height
      stage.mist = patches.length ? makeMist(newLook, patches) : new THREE.Group();
      scene.add(stage.mist);
      // with the after-pass on, the bloom already makes every lamp head glow: the halo is a smaller, fainter second glow (look.lamp.haloPost), at most 90 px, and fades within 8 m of the camera
      stage.halos = new Halos(Math.max(64, stage.world.lampHeads.length), { maxPx: tier.post ? 90 : 180, nearFade: 8 });
      for (const [x, y, z, size] of stage.world.lampHeads) stage.halos.add(x, y, z, new THREE.Color(newLook.lamp.light).multiplyScalar((newLook.lamp.halo ?? 0.55) * (tier.post ? newLook.lamp.haloPost ?? 0.4 : 1)), size ?? newLook.lamp.haloSize ?? 2.6);   // a head may give its own halo size (a stone lantern's is smaller)
      scene.add(stage.halos.points);
      stage.env = makeSkyEnvironment(renderer, newLook, tier.env);
      stage.world.road.material.envMap = stage.env;   // the road shines in the low sun
      // tyre marks and smoke: painted billows (camera-facing cloud sprites) or faceted puffs, as the look says
      stage.skids = new Skids(1500);
      stage.skids.mesh.material.color.set(newLook.skid.colour); stage.skids.mesh.material.opacity = newLook.skid.opacity;
      stage.smoke = newLook.smoke.style === 'billows' ? new Billows(newLook, tier.billows ?? tier.smoke) : new Puffs(newLook, tier.smoke, tier.smokeDetail);
      scene.add(stage.skids.mesh, stage.smoke.mesh);
      stage.buildMs = performance.now() - t0;
      stage.resize();
      return stage;
    },
    resize() {
      const tier = stage.tier;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tier.dpr));
      renderer.setSize(Math.max(2, Math.round(innerWidth * tier.scale)), Math.max(2, Math.round(innerHeight * tier.scale)), false);
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      stage.halos?.resize(renderer.domElement.height, camera.fov);
      stage.post?.setSize(renderer.domElement.width, renderer.domElement.height);
    },
    /**
     * Another quality tier (high, medium, low): shadows, the after-pass and the density of the world follow; the world is built again.
     * The cars are the caller's (their materials depend on stage.carTier): build them again when `carTier` changed. Returns true when it changed.
     */
    setTier(name) {
      if (name === tierName || !['high', 'medium', 'low'].includes(name)) return false;
      tierName = name; stage.tierName = name; stage.carTier = name === 'low' ? 'low' : 'high';
      const t = tierOf(stage.look, name);
      setShadows(t);
      if (t.post && !stage.post) stage.post = new Post(renderer, stage.look.grade);
      stage.usePost = !!t.post;
      scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
      stage.load(stage.look, stage.scene0);
      stage.post?.setSize(renderer.domElement.width, renderer.domElement.height);
      return true;
    },
    render() { renderer.info.reset(); camera.updateMatrixWorld(); stage.smoke?.aim?.(camera);   // the smoke keeps the car in sight (also in the game)
      if (stage.post && stage.usePost) stage.post.render(scene, camera); else renderer.render(scene, camera); },
    /** The sun's shadow box and the sun itself follow a point (drawing axes: x already mirrored). */
    aimSun(cx, cy, cz) { const d = stage.sunDir; sun.target.position.set(cx, cy, cz); sun.position.set(cx + d.x * 120, cy + d.y * 120 + 30, cz + d.z * 120); },
    /** Points the environment map of every material under `root` that has one at the stage's reflection (after another map was loaded). */
    reflect(root) { root.traverse((o) => { for (const m of [].concat(o.material ?? [])) if (m.envMap !== undefined && m.isMeshStandardMaterial) m.envMap = stage.env; }); },
  };
  stage.load(look, scene0);
  return stage;
}

/**
 * Makes cars of the look: a model file (docs/CAR-MODELS.md, `model` = the file's name) in a paint, or the code S15 when there is no file or it cannot be used.
 * The tail lights take the look's deep red (very bright red turns orange under the tone mapping).
 */
export function carMaker(stage) {
  return async (paint, { model = null, kit = false } = {}) => {
    const { look, env, carTier } = stage;
    const materials = carMaterials({ tier: carTier, paint: new THREE.Color(paint).getHex(), env });
    if (look.car?.tail) materials.light_rear.color.set(look.car.tail).multiplyScalar(look.car.tailGlow ?? 1);
    // look.car.gloss: { env, roughness, coat }: how much of the sky the paint mirrors (dusk: less, so the roof shows its shape, not white)
    const gl = look.car?.gloss;
    if (gl) { const p = materials.paint; if (gl.env !== undefined) p.envMapIntensity = gl.env; if (gl.roughness !== undefined) p.roughness = gl.roughness; if (gl.coat !== undefined && p.clearcoatRoughness !== undefined) p.clearcoatRoughness = gl.coat; if (gl.clearcoat !== undefined && p.clearcoat !== undefined) p.clearcoat = gl.clearcoat; if (gl.specular !== undefined && p.specularIntensity !== undefined) p.specularIntensity = gl.specular; }   // gloss.specular: the direct lights' highlight (lower: no sparkling points, the shine comes from the sky map)
    const m = model ? await loadCarModel(model, { tier: carTier, materials }) : null;
    return m ? { ...m, materials } : buildS15({ paint: new THREE.Color(paint).getHex(), kit, tier: carTier, env });
  };
}
