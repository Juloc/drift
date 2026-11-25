"""Lists the loose parts of some materials with their place (to find emblems, lettering, plates). Usage: blender -b -P parts.py -- Mat.1,Mat.2 model.gltf"""
import bpy, bmesh, sys
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[sys.argv.index("--") + 2])
want = sys.argv[sys.argv.index("--") + 1].split(",")
for o in bpy.context.scene.objects:
    if o.type != "MESH": continue
    for i, ms in enumerate(o.material_slots):
        if not ms.material or ms.material.name not in want: continue
        bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world); bm.faces.ensure_lookup_table()
        faces = {f for f in bm.faces if f.material_index == i}; seen = set(); k = 0
        for f in faces:
            if f in seen: continue
            st, part = [f], []; seen.add(f)
            while st:
                g = st.pop(); part.append(g)
                for e in g.edges:
                    for h in e.link_faces:
                        if h in faces and h not in seen: seen.add(h); st.append(h)
            vs = [v.co for g in part for v in g.verts]
            lo = Vector([min(v[j] for v in vs) for j in range(3)]); hi = Vector([max(v[j] for v in vs) for j in range(3)])
            print("PART %s %s #%d faces %d lo %s hi %s" % (ms.material.name, o.name, k, len(part), tuple(round(x, 3) for x in lo), tuple(round(x, 3) for x in hi))); k += 1
        bm.free()
