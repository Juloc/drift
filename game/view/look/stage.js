// The stage of a look: renderer, light, sky, the world of a scene (land, road, plaza, trees), mist, lamp halos, the sky's reflection, tyre marks and the smoke, all from a
// look (data/looks/<name>.json) and a scene (data/scenes/<name>.json or the probe's data/probe-sunset.json). The look probe and the game both build their picture through this one
// file, so what the look session improves in game/view/look/ shows up in the game too. Nothing here knows about the game's rules, the network or the HUD.
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
import { X } from '../space.js';

/** Reads a look (colours, light, tiers) by name from data/looks/. */
export const loadLook = (name) => fetch(`data/looks/${name}.json`).then((r) => r.json());

/**
 * @param {{ canvas: HTMLCanvasElement, look: object, scene0: object, tierName: 'high'|'low', shadowSpan?: number }} o
 * @returns the stage: { renderer, post, scene, camera, tier, tierName, sun, sunDir, hemi, sky, world, field, mist, halos, env, skids, smoke, buildMs, carTier, resize(), render(), aimSun(x, y, z) }
 */
export function createStage({ canvas, look, scene0, tierName = 'high', shadowSpan = 36 }) {
  const tier = look.tiers[tierName];
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // the mood: ACES tone mapping on both tiers; the high tier adds bloom and a colour grade (post.js), the vignette is CSS
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = look.grade.exposure;
  renderer.info.autoReset = false;   // one frame is several renders (scene, bloom passes): count them together
  const post = tier.post ? new Post(renderer, look.grade) : null;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(look.fog.colour, look.fog.near, look.fog.far);
  scene.background = new THREE.Color(look.fog.colour);
  const sunDir = sunDirection(look);
  const hemi = new THREE.HemisphereLight(look.fill.sky, look.fill.ground, look.fill.intensity);
  const sun = new THREE.DirectionalLight(look.sun.colour, look.sun.intensity);
  scene.add(hemi, sun, sun.target);
  if (tier.shadows) {
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;   // soft shadows
    sun.castShadow = true; sun.shadow.mapSize.set(tier.shadows, tier.shadows);
    const c = sun.shadow.camera; c.left = -shadowSpan; c.right = shadowSpan; c.top = shadowSpan; c.bottom = -shadowSpan; c.near = 1; c.far = 260;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; sun.shadow.radius = 6; sun.shadow.blurSamples = 10;
  }
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 2600);
  const sky = makeSky(look, 2200);
  scene.add(sky);

  // the world of the scene, with the sky's reflection on the road
  const t0 = performance.now();
  const world = buildWorld(scene0, look, tierName);
  scene.add(world.group);
  const field = world.field;
  // low mist over the valley floor and the lake (places from the scene; the phone tier takes the first few); it lies relative to the road's height nearby
  const mist = makeMist(look, (scene0.mist ?? []).slice(0, tier.mist).map(([x, z, w, d]) => [x, z, w, d, field.groundY(x, z) + look.mist.y]));
  scene.add(mist);
  const halos = new Halos(32);
  for (const [x, y, z] of world.lampHeads) halos.add(x, y, z, new THREE.Color(look.lamp.light).multiplyScalar(look.lamp.halo ?? 0.55), look.lamp.haloSize ?? 2.6);
  scene.add(halos.points);
  const buildMs = performance.now() - t0;
  const env = makeSkyEnvironment(renderer, look, tier.env);
  world.road.material.envMap = env;   // the road shines in the low sun

  // tyre marks and smoke: painted billows (camera-facing cloud sprites) or faceted puffs, as the look says
  const skids = new Skids(1500);
  skids.mesh.material.color.set(look.skid.colour); skids.mesh.material.opacity = look.skid.opacity;
  const smoke = look.smoke.style === 'billows' ? new Billows(look, tier.billows ?? tier.smoke) : new Puffs(look, tier.smoke, tier.smokeDetail);
  scene.add(skids.mesh, smoke.mesh);

  const stage = {
    renderer, post, scene, camera, tier, tierName, sun, sunDir, hemi, sky, world, field, mist, halos, env, skids, smoke, buildMs, look, scene0,
    carTier: tierName === 'high' ? 'high' : 'low',
    resize() {
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tier.dpr));
      renderer.setSize(Math.max(2, Math.round(innerWidth * tier.scale)), Math.max(2, Math.round(innerHeight * tier.scale)), false);
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      halos.resize(renderer.domElement.height, camera.fov);
      post?.setSize(renderer.domElement.width, renderer.domElement.height);
    },
    render() { renderer.info.reset(); if (post) post.render(scene, camera); else renderer.render(scene, camera); },
    /** The sun's shadow box and the sun itself follow a point (drawing axes: x already mirrored). */
    aimSun(cx, cy, cz) { sun.target.position.set(cx, cy, cz); sun.position.set(cx + sunDir.x * 120, cy + sunDir.y * 120 + 30, cz + sunDir.z * 120); },
  };
  return stage;
}

/**
 * Makes cars of the look: a model file (docs/CAR-MODELS.md, `model` = the file's name) in a paint, or the code S15 when there is no file or it cannot be used.
 * The tail lights take the look's deep red (very bright red turns orange under the tone mapping).
 */
export function carMaker(stage) {
  const { look, env, carTier } = stage;
  return async (paint, { model = null, kit = false } = {}) => {
    const materials = carMaterials({ tier: carTier, paint: new THREE.Color(paint).getHex(), env });
    if (look.car?.tail) materials.light_rear.color.set(look.car.tail).multiplyScalar(look.car.tailGlow ?? 1);
    const m = model ? await loadCarModel(model, { tier: carTier, materials }) : null;
    return m ? { ...m, materials } : buildS15({ paint: new THREE.Color(paint).getHex(), kit, tier: carTier, env });
  };
}
export { X };
