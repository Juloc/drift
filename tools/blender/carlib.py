"""Small helpers shared by car_from_trellis.py and car_normalize.py (Blender 4.5, Z up, the car looks along -Y)."""
import bpy
from mathutils import Vector, Matrix

WHEELS = ("wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr")


def select_only(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def bake_world(o):
    """Puts the object's world matrix into its own mesh data (a copy when shared) and detaches it: no parent, no transform."""
    mw = o.matrix_world.copy()
    o.parent = None
    if o.data.users > 1:
        o.data = o.data.copy()
    o.data.transform(mw)
    o.matrix_world = Matrix.Identity(4)


def bbox(objs):
    """Lowest and highest corner of the meshes' vertices (world = data after bake_world)."""
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


def drop_unused():
    for coll in (bpy.data.meshes, bpy.data.materials):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


def code_wheels(path, wheel_at, radius, log=print):
    """Takes the four wheel_* nodes of a model file after the rules (the code model's s15-test.glb, or -hi), scales each
    wheel to `radius` and puts it at wheel_at[name] (Blender coordinates): an empty named wheel_xx at the centre, no rotation,
    the meshes below it. Returns the empties."""
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    imported = [o for o in bpy.context.scene.objects if o not in before]
    keep, nodes = [], {}
    for name in wheel_at:
        node = next(o for o in imported if o.name.split(".")[0] == name and o.type == "EMPTY")
        parts = [o for o in node.children_recursive if o.type == "MESH"]
        for o in parts:
            bake_world(o)
            o.data = o.data.copy()
        nodes[name] = parts
        keep += parts
    for o in imported:
        if o not in keep:
            bpy.data.objects.remove(o)
    empties = []
    for name, at in wheel_at.items():
        parts = nodes[name]
        lo, hi = bbox(parts)
        c0, r0 = (lo + hi) / 2, (hi.z - lo.z) / 2
        empty = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(empty)
        empty.location = at
        for o in parts:
            o.data.transform(Matrix.Translation(-c0))
            o.data.transform(Matrix.Scale(radius / r0, 4))
            o.parent = empty
            o.name = o.data.name = "%s_%s" % (name, o.data.materials[0].name.split(".")[0])
        log("%s at (%.3f, %.3f, %.3f), radius %.3f (code wheel %.3f, x %.3f)" % (name, at.x, at.y, at.z, radius, r0, radius / r0))
        empties.append(empty)
    drop_unused()
    bpy.context.view_layer.update()
    return empties


def export_glb(path, textures=False):
    """The export settings of docs/CAR-MODELS.md (glTF Y up: the car's front -Y becomes +Z)."""
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", export_yup=True, use_selection=False, export_apply=True,
        export_normals=True, export_tangents=False, export_texcoords=True, export_vertex_color="ACTIVE",
        export_materials="EXPORT", export_image_format="WEBP" if textures else "NONE", export_image_quality=82,
        export_cameras=False, export_lights=False, export_animations=False, export_skins=False, export_morph=False,
    )
