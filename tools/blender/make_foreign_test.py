"""Makes a test car that looks like a download: the code model's S15 (s15-test-hi.glb) with foreign names, in centimetres,
front along +X, wheels as loose objects without wheel_* nodes; written as .glb, .fbx and .obj. For testing car_normalize.py.
Usage: blender -b -P make_foreign_test.py -- s15-test-hi.glb OUTDIR
"""
import sys, os, math
import bpy
from mathutils import Matrix

src, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
names = {"paint": "CarPaint_White", "glass": "Glass_Windows", "chrome": "Chrome_Rim", "rubber": "Tire_Rubber", "plastic": "Black_Plastic_Trim",
         "carbon": "Carbon_Fiber_Wing", "light_front": "HeadLight_Lens", "light_rear": "TailLight_Red", "interior": "Seat_Leather"}
for m in bpy.data.materials:
    m.name = names.get(m.name.split(".")[0], m.name)
k = 0
for o in list(bpy.context.scene.objects):
    if o.type == "MESH":
        mw = o.matrix_world.copy(); o.parent = None
        if o.data.users > 1:
            o.data = o.data.copy()
        o.data.transform(Matrix.Rotation(math.pi / 2, 4, "Z") @ Matrix.Scale(100, 4) @ mw)   # front -Y -> +X, metres -> centimetres
        o.matrix_world = Matrix.Identity(4)
        o.name = "Object_%d" % k; k += 1
for o in list(bpy.context.scene.objects):
    if o.type != "MESH":
        bpy.data.objects.remove(o)
os.makedirs(out, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(out, "foreign.glb"), export_format="GLB", export_yup=True)
bpy.ops.export_scene.fbx(filepath=os.path.join(out, "foreign.fbx"))
bpy.ops.wm.obj_export(filepath=os.path.join(out, "foreign.obj"))
print("wrote", out, k, "meshes")
