// Model files for the world (game/assets/env/<name>.glb, each 1 m high, standing on y = 0): the world builds code shapes everywhere and, where
// the look names a model (look.models: { rocks: 'rocks', lantern: 'lantern', tint: { rocks: '#...' } }, high tier only), it keeps a list of
// places instead (world.slots). This fills those places, one instanced mesh per material of the file, so a kind costs one or two draws.
// The files come in after the world is drawn (they are small); a file that cannot be read leaves its places empty.
import * as THREE from '../../../vendor/three/three.module.js';

async function readModel(name) {
  const { GLTFLoader } = await import('../../../vendor/three/addons/loaders/GLTFLoader.js');
  const url = new URL(`../../assets/env/${name}.glb`, import.meta.url).href;
  // the content policy (connect-src 'self'): textures through ordinary images, not image bitmaps fetched from blob: addresses. A plugin hands the
  // parser an image loader; nothing global is touched (the car loader swaps createImageBitmap for its own loads, so a swap here could cross it)
  const loader = new GLTFLoader();
  loader.register((parser) => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); return { name: 'drift_plain_images' }; });
  try { return await loader.loadAsync(url); } catch { return null; }
}

/** Fills world.slots with the look's model files; `alive()` says whether the world is still the one shown (another map may have come). */
export async function fillSlots(world, look, alive = () => true) {
  const M = look.models ?? {}, m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (const [kind, places] of Object.entries(world.slots ?? {})) {
    if (!M[kind] || !places.length) continue;
    const gltf = await readModel(M[kind]);
    if (!gltf || !alive()) continue;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const material = o.material.clone();
      if (M.tint?.[kind]) material.color.set(M.tint[kind]);   // the file's colours towards the look (painted green rocks to the dusk's grey-violet)
      const sat = M.saturation?.[kind];   // look.models.saturation: how much of the file's own colour stays (0 grey, 1 as painted)
      if (sat !== undefined) material.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), diffuseColor.rgb, ${sat.toFixed(3)});`); };
      const mesh = new THREE.InstancedMesh(o.geometry.clone().applyMatrix4(o.matrixWorld), material, places.length);
      places.forEach(([x, y, z, ry, sx, sy, sz], i) => mesh.setMatrixAt(i, m.compose(p.set(x, y, z), q.setFromAxisAngle(up, ry), s.set(sx, sy, sz))));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = `model:${kind}`;
      world.group.add(mesh);
    });
  }
}
