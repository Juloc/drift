"""Lists the materials of a model: base colour, textures, alpha, triangles and where on the car (for the slots of a car file).
Usage: blender -b -P materials.py -- model.gltf|glb|fbx|obj"""
import sys, os
import bpy
from mathutils import Vector

path = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
ext = os.path.splitext(path)[1].lower()
{".glb": bpy.ops.import_scene.gltf, ".gltf": bpy.ops.import_scene.gltf, ".fbx": bpy.ops.import_scene.fbx}.get(ext, bpy.ops.wm.obj_import)(filepath=path)
stats = {}
allp = []
for o in bpy.context.scene.objects:
    if o.type != "MESH":
        continue
    mw = o.matrix_world
    for p in o.data.polygons:
        m = o.material_slots[p.material_index].material if o.material_slots else None
        c = mw @ p.center
        allp.append(c)
        s = stats.setdefault(m.name if m else "(none)", {"tris": 0, "lo": Vector(c), "hi": Vector(c), "objs": set(), "m": m})
        s["tris"] += len(p.vertices) - 2
        s["lo"] = Vector(map(min, s["lo"], c)); s["hi"] = Vector(map(max, s["hi"], c)); s["objs"].add(o.name)
lo = Vector(map(min, *allp)) if False else Vector([min(p[i] for p in allp) for i in range(3)])
hi = Vector([max(p[i] for p in allp) for i in range(3)])
print("MODEL bbox lo", tuple(round(v, 3) for v in lo), "hi", tuple(round(v, 3) for v in hi))
for name, s in sorted(stats.items(), key=lambda t: -t[1]["tris"]):
    m = s["m"]; col = tex = alpha = metal = rough = ""
    if m and m.use_nodes:
        b = m.node_tree.nodes.get("Principled BSDF")
        if b:
            col = tuple(round(v, 2) for v in b.inputs["Base Color"].default_value[:3])
            metal = round(b.inputs["Metallic"].default_value, 2); rough = round(b.inputs["Roughness"].default_value, 2)
            alpha = round(b.inputs["Alpha"].default_value, 2)
        tex = ",".join(n.image.name for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image)
    print("MAT %-14s tris %6d col %-18s metal %-4s rough %-4s alpha %-4s tex %-30s lo %s hi %s objs %s" % (
        name, s["tris"], col, metal, rough, alpha, tex, tuple(round(v, 2) for v in s["lo"]), tuple(round(v, 2) for v in s["hi"]), ",".join(sorted(s["objs"]))[:80]))
