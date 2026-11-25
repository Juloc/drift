"""Renders a model's front and rear with one flat colour per material and prints the legend (to see which material an
emblem or a lamp is). Usage: blender -b -P matcolours.py -- model.gltf outdir [front_axis=-y]"""
import sys, os, colorsys
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
path, out = args[0], args[1]
front = args[2] if len(args) > 2 else "-y"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
mats = sorted({ms.material for o in bpy.context.scene.objects if o.type == "MESH" for ms in o.material_slots if ms.material}, key=lambda m: m.name)
for i, m in enumerate(mats):
    r, g, b = colorsys.hsv_to_rgb((i * 0.618) % 1, 0.85, 0.95 if i % 2 else 0.6)
    m.diffuse_color = (r, g, b, 1)
    print("COLOUR %-40s #%02x%02x%02x" % (m.name, int(r * 255), int(g * 255), int(b * 255)))
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
pts = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
mid, ext = (lo + hi) / 2, hi - lo
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "FLAT"; sc.display.shading.color_type = "MATERIAL"
sc.render.resolution_x, sc.render.resolution_y = 1000, 600
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = max(ext.x, ext.z) * 1.15
sign = -1 if front.startswith("-") else 1
os.makedirs(out, exist_ok=True)
for name, d in (("front", sign), ("rear", -sign)):
    cam.location = mid + Vector((0, d * ext.y * 2, 0))
    cam.rotation_euler = (mid - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(out, "matcol_%s.png" % name)
    bpy.ops.render.render(write_still=True)
