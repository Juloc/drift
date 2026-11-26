// Model files for the world (game/assets/env/<name>.glb, each 1 m high, standing on y = 0): the world builds code shapes everywhere and, where
// the look names a model (look.models: { rocks: 'rocks', lantern: 'lantern', tint: { rocks: '#...' } }, high tier only), it keeps a list of
// places instead (world.slots). This fills those places, one instanced mesh per material of the file, so a kind costs one or two draws.
// The files come in after the world is drawn (they are small); a file that cannot be read leaves its places empty.
import * as THREE from '../../../vendor/three/three.module.js';

export async function readModel(name) {
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
      // look.models.paint[kind] = { rock, moss }: the file's painting only gives the light and dark of the surface; the colour is the look's: rock colour, and moss where the face looks up
      const P = M.paint?.[kind];
      if (P) { const c = (h) => { const k = new THREE.Color(h); return `vec3(${k.r.toFixed(4)}, ${k.g.toFixed(4)}, ${k.b.toFixed(4)})`; };
        material.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); vec3 wn = inverseTransformDirection(normal, viewMatrix);
            vec3 rockC = ${c(P.rock)} * (0.55 + 1.1 * l), mossC = ${c(P.moss)} * (0.7 + 0.7 * l);
            diffuseColor.rgb = mix(rockC, mossC, smoothstep(0.55, 0.85, wn.y)); }`); }; }
      const sat = P ? undefined : M.saturation?.[kind];   // look.models.saturation: how much of the file's own colour stays (0 grey, 1 as painted)
      if (sat !== undefined) material.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), diffuseColor.rgb, ${sat.toFixed(3)});`); };
      // the props of the models dissolve within 3 m of the camera too (a dither: nothing stands in front of the lens)
      const prev = material.onBeforeCompile;
      material.onBeforeCompile = (sh, r) => { prev?.(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
        { float dc = length(vViewPosition); if (dc < 3.0 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) > smoothstep(0.8, 3.0, dc)) discard; }`); };
      const mesh = new THREE.InstancedMesh(o.geometry.clone().applyMatrix4(o.matrixWorld), material, places.length);
      // a place may bring the ground's normal: the model's up turns to it, then it turns about it by ry
      const q2 = new THREE.Quaternion(), nv = new THREE.Vector3();
      places.forEach(([x, y, z, ry, sx, sy, sz, n], i) => {
        q.setFromAxisAngle(up, ry);
        if (n) { q2.setFromUnitVectors(up, nv.set(n[0], n[1], n[2]).normalize()); q.premultiply(q2); }
        mesh.setMatrixAt(i, m.compose(p.set(x, y, z), q, s.set(sx, sy, sz)));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = `model:${kind}`;
      world.group.add(mesh);
    });
  }
}
