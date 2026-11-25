"""Renders a .glb from a few sides into PNGs (headless Blender, for looking at a raw or finished model).
Usage: blender -b -P look.py -- model.glb outdir [--engine CYCLES|BLENDER_WORKBENCH]
Writes <outdir>/<name>_<view>.png for front, rear, left, right, top (orthographic, the model's own axes as imported).
"""
import sys, os, math, argparse, json
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
ap = argparse.ArgumentParser(); ap.add_argument("glb"); ap.add_argument("out"); ap.add_argument("--engine", default="BLENDER_WORKBENCH"); ap.add_argument("--size", type=int, default=640)
ap.add_argument("--views", help='JSON {"name": [x, y, z]}: directions from the car to the camera (Blender axes as imported)')
ap.add_argument("--dist", type=float, default=3.0, help="camera distance in model lengths")
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
sc.render.resolution_x = a.size; sc.render.resolution_y = a.size * 2 // 3
if a.engine == "BLENDER_WORKBENCH":
    sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "TEXTURE"; sc.display.shading.show_cavity = False
else:
    sc.cycles.samples = 48; sc.cycles.device = "GPU"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "CUDA"; prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    # a sky gradient as the room (the reflections of the paint need something to show), and a sun from the front left
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
    nt = w.node_tree; bg = nt.nodes["Background"]; sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "HOSEK_WILKIE" if hasattr(sky, "sky_type") and "HOSEK_WILKIE" in [i.identifier for i in sky.bl_rna.properties["sky_type"].enum_items] else sky.sky_type
    nt.links.new(sky.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 0.6
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sc.collection.objects.link(sun)
    sun.data.energy = 3.0; sun.rotation_euler = (0.9, 0.3, -0.8)
    floor = bpy.data.objects.new("floor", bpy.data.meshes.new("floor")); sc.collection.objects.link(floor)
    import bmesh as _bm
    fb = _bm.new(); _bm.ops.create_grid(fb, x_segments=1, y_segments=1, size=max(ext) * 3); fb.to_mesh(floor.data); fb.free()
    floor.location = (mid.x, mid.y, lo.z)
    fm = bpy.data.materials.new("floor"); fm.diffuse_color = (0.6, 0.6, 0.62, 1); fm.use_nodes = True
    fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.55, 0.56, 0.6, 1); floor.data.materials.append(fm)
    sc.view_settings.view_transform = "AgX"
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = max(ext) * 1.15
if a.engine == "CYCLES":   # a perspective camera like the showroom's (about 30 degrees), the car from slightly above
    cam.data.type = "PERSP"; cam.data.lens = 60
d = max(ext) * a.dist
views = {"px": Vector((1, 0, 0)), "nx": Vector((-1, 0, 0)), "py": Vector((0, 1, 0)), "ny": Vector((0, -1, 0)), "top": Vector((0, 0, 1)), "iso": Vector((1, -1, 0.6)).normalized()}
if a.views:
    views = {k: Vector(v).normalized() for k, v in json.loads(a.views).items()}
name = os.path.splitext(os.path.basename(a.glb))[0]
os.makedirs(a.out, exist_ok=True)
for v, dirv in views.items():
    cam.location = mid + dirv * d
    cam.rotation_euler = (mid - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(a.out, "%s_%s.png" % (name, v))
    bpy.ops.render.render(write_still=True)
    print("wrote", sc.render.filepath)
