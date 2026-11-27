"""Renders a .glb from a few sides into PNGs (headless Blender, for looking at a raw or finished model).
Usage: blender -b -P look.py -- model.glb outdir [--engine CYCLES|BLENDER_WORKBENCH]
Writes <outdir>/<name>_<view>.png for front, rear, left, right, top (orthographic, the model's own axes as imported).
"""
import sys, os, math, argparse
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
ap = argparse.ArgumentParser(); ap.add_argument("glb"); ap.add_argument("out"); ap.add_argument("--engine", default="BLENDER_WORKBENCH"); ap.add_argument("--size", type=int, default=640)
a = ap.parse_args(argv)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a.glb)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
mid, ext = (lo + hi) / 2, hi - lo
print("bbox (Blender axes) lo", tuple(round(v, 3) for v in lo), "hi", tuple(round(v, 3) for v in hi), "size", tuple(round(v, 3) for v in ext))
sc = bpy.context.scene
sc.render.engine = a.engine
sc.render.resolution_x = sc.render.resolution_y = a.size
if a.engine == "BLENDER_WORKBENCH":
    sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "TEXTURE"; sc.display.shading.show_cavity = False
else:
    sc.cycles.samples = 24; sc.cycles.device = "GPU"
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[1].default_value = 1.2
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = max(ext) * 1.15
d = max(ext) * 3
views = {"px": Vector((1, 0, 0)), "nx": Vector((-1, 0, 0)), "py": Vector((0, 1, 0)), "ny": Vector((0, -1, 0)), "top": Vector((0, 0, 1)), "iso": Vector((1, -1, 0.6)).normalized()}
name = os.path.splitext(os.path.basename(a.glb))[0]
os.makedirs(a.out, exist_ok=True)
for v, dirv in views.items():
    cam.location = mid + dirv * d
    cam.rotation_euler = (mid - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(a.out, "%s_%s.png" % (name, v))
    bpy.ops.render.render(write_still=True)
    print("wrote", sc.render.filepath)
