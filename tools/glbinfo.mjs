// What is in a .glb: per mesh primitive the material, triangles, vertices and bytes; images and their bytes.
// Usage: node tools/glbinfo.mjs file.glb
import fs from 'node:fs';
const b = fs.readFileSync(process.argv[2]);
const n = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + n).toString());
const view = (i) => j.bufferViews[i].byteLength, acc = (i) => j.accessors[i];
let total = 0;
for (const m of j.meshes) for (const p of m.primitives) {
  const bytes = Object.values(p.attributes).reduce((s, a) => s + view(acc(a).bufferView), 0) + view(acc(p.indices).bufferView);
  total += bytes;
  console.log(`${m.name.padEnd(22)} ${(j.materials?.[p.material]?.name ?? '-').padEnd(12)} ${String(acc(p.indices).count / 3).padStart(6)} tris ${String(acc(p.attributes.POSITION).count).padStart(6)} verts ${(bytes / 1024).toFixed(0).padStart(5)} KB  ${Object.keys(p.attributes).join(' ')}`);
}
for (const im of j.images ?? []) console.log(`image ${im.name ?? ''} ${im.mimeType} ${(view(im.bufferView) / 1024).toFixed(0)} KB`);
console.log(`geometry ${(total / 1024).toFixed(0)} KB, file ${(b.length / 1024).toFixed(0)} KB, extensions ${JSON.stringify(j.extensionsUsed ?? [])}`);
