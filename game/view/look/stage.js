// The stage of a look: renderer, light, sky, the world of a scene (land, road, plaza, trees), mist, lamp halos, the sky's reflection, tyre marks and the smoke, all from a
// look (data/looks/<name>.json) and a scene (data/scenes/<name>.json or the probe's data/probe-sunset.json). The look probe and the game both build their picture through this one
// file, so what the look session improves in game/view/look/ shows up in the game too. Nothing here knows about the game's rules, the network or the HUD.
// `load(look, scene)` can be called again with another look and scene (another map): the old world is taken down and disposed, the renderer, the camera and the post pass stay.
import * as THREE from '../../../vendor/three/three.module.js';
import { Halos } from '../../core/materials.js';
import { Skids } from '../fx.js';
import { buildWorld } from './world.js';
import { makeSky, makeMist, makeSkyEnvironment, sunDirection } from './sky.js';
import { Puffs } from './puffs.js';
import { Billows } from './billows.js';
import { Post } from './post.js';
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
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // the mood: ACES tone mapping on both tiers; the high tier adds bloom and a colour grade (post.js), the vignette is CSS
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.info.autoReset = false;   // one frame is several renders (scene, bloom passes): count them together
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 2600);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  scene.add(hemi, sun, sun.target);
  const tier0 = look.tiers[tierName];
  if (tier0.shadows) {
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;   // soft shadows
    sun.castShadow = true; sun.shadow.mapSize.set(tier0.shadows, tier0.shadows);
    const c = sun.shadow.camera; c.left = -shadowSpan; c.right = shadowSpan; c.top = shadowSpan; c.bottom = -shadowSpan; c.near = 1; c.far = 260;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; sun.shadow.radius = 6; sun.shadow.blurSamples = 10;
  }
  const post = tier0.post ? new Post(renderer, look.grade) : null;

  const stage = {
    renderer, post, scene, camera, tierName, sun, hemi, carTier: tierName === 'high' ? 'high' : 'low',
    tier: tier0, look, scene0, sunDir: null, sky: null, world: null, field: null, mist: null, halos: null, env: null, skids: null, smoke: null, buildMs: 0,
    /** Builds (or rebuilds) everything that belongs to a look and a scene. */
    load(newLook, newScene) {
      const t0 = performance.now();
      for (const o of [stage.sky, stage.world?.group, stage.mist, stage.halos?.points, stage.skids?.mesh, stage.smoke?.mesh]) if (o) { scene.remove(o); disposeTree(o); }
      stage.env?.dispose?.();
      const tier = newLook.tiers[tierName];
      Object.assign(stage, { look: newLook, scene0: newScene, tier });
      renderer.toneMappingExposure = newLook.grade.exposure;
      post?.setGrade(newLook.grade);
      scene.fog = new THREE.Fog(newLook.fog.colour, newLook.fog.near, newLook.fog.far);
      scene.background = new THREE.Color(newLook.fog.colour);
      stage.sunDir = sunDirection(newLook);
      hemi.color.set(newLook.fill.sky); hemi.groundColor.set(newLook.fill.ground); hemi.intensity = newLook.fill.intensity;
      sun.color.set(newLook.sun.colour); sun.intensity = newLook.sun.intensity;
      stage.sky = makeSky(newLook, 2200);
      scene.add(stage.sky);
      // the world of the scene, with the sky's reflection on the road
      stage.world = buildWorld(newScene, newLook, tierName);
      scene.add(stage.world.group);
      stage.field = stage.world.field;
      // low mist over the valley floor and the lake (places from the scene; the phone tier takes the first few); it lies relative to the road's height nearby
      const patches = (newScene.mist ?? []).slice(0, tier.mist).map(([x, z, w, d]) => [x, z, w, d, stage.field.groundY(x, z) + newLook.mist.y]);
      stage.mist = patches.length ? makeMist(newLook, patches) : new THREE.Group();
      scene.add(stage.mist);
      stage.halos = new Halos(64);
      for (const [x, y, z] of stage.world.lampHeads) stage.halos.add(x, y, z, new THREE.Color(newLook.lamp.light).multiplyScalar(newLook.lamp.halo ?? 0.55), newLook.lamp.haloSize ?? 2.6);
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
      post?.setSize(renderer.domElement.width, renderer.domElement.height);
    },
    render() { renderer.info.reset(); if (post) post.render(scene, camera); else renderer.render(scene, camera); },
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
    const m = model ? await loadCarModel(model, { tier: carTier, materials }) : null;
    return m ? { ...m, materials } : buildS15({ paint: new THREE.Color(paint).getHex(), kit, tier: carTier, env });
  };
}
