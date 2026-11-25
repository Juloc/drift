"""Checks a Blender scene against docs/CAR-MODELS.md and exports it as .glb.

Used by car_from_trellis.py (check() before its export); run on its own it checks and exports the open scene.

Usage (the car is the open scene; every object in it is part of the car):
    blender --background car.blend --python tools/blender/prepare_car.py -- --id 3 --out game/assets/cars [--tier phone|high] [--check-only]

It prints a report, exits with 1 when a rule is broken (nothing is written then), otherwise writes <out>/<id>.glb (phone) or <out>/<id>-hi.glb (high).
Blender: Z up, the car looks along -Y; the exporter turns that into glTF's Y up and +Z front.
"""
import sys
import os
import re
import argparse
import math

import bpy
from mathutils import Vector

SLOTS = ["paint", "glass", "chrome", "rubber", "plastic", "carbon", "light_front", "light_rear", "interior"]
WHEELS = {"wheel_fl": (1, 1), "wheel_fr": (-1, 1), "wheel_rl": (1, -1), "wheel_rr": (-1, -1)}   # glTF side (+x = left) and end (+z = front)
LIMITS = {"phone": {"tris": 15000, "calls": 12, "kb": 600}, "high": {"tris": 60000, "calls": 20, "kb": 3072}}
TARGET = {"phone": 15000, "high": 40000}


def slot_of(name):
    n = re.sub(r"\.\d+$", "", (name or "").lower())
    return n if n in SLOTS else None


def own_of(name):
    """'own_<name>' (the file's material, kept by the game) or 'lamp_front_<name>' / 'lamp_rear_<name>' (kept and glowing)."""
    n = (name or "").lower()
    return "lamp_front" if n.startswith("lamp_front_") else "lamp_rear" if n.startswith("lamp_rear_") else "own" if n.startswith("own_") else None


def to_gltf(v):
    """Blender (x right, y back, z up) -> glTF (x left, y up, z front): the exporter's +Y up with the car looking along -Y."""
    return Vector((-v.x, v.z, -v.y))


def triangles(obj):
    me = obj.to_mesh()
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    obj.to_mesh_clear()
    return n


def check(tier):
    problems, notes = [], []
    objs = [o for o in bpy.context.scene.objects if o.type in {"MESH", "EMPTY"}]
    meshes = [o for o in objs if o.type == "MESH"]
    scene_unit = bpy.context.scene.unit_settings
    if abs(scene_unit.scale_length - 1.0) > 1e-6:
        problems.append("scene unit scale is %s, must be 1.0 (1 unit = 1 m)" % scene_unit.scale_length)

    # wheels: found by name, origin at the wheel centre, no rotation, scale 1, tyre touching the ground
    wheel_pos = {}
    for name, (sx, sz) in WHEELS.items():
        w = bpy.data.objects.get(name)
        if w is None:
            problems.append("missing wheel node '%s'" % name)
            continue
        p = to_gltf(w.matrix_world.translation)
        wheel_pos[name] = p
        if (p.x > 0) != (sx > 0) or (p.z > 0) != (sz > 0):
            problems.append("%s is at the wrong corner: glTF position %s (front is +Z, left is +X; in Blender: front = -Y, left = -X)" % (name, tuple(round(c, 3) for c in p)))
        rot = w.matrix_world.to_quaternion()
        if rot.angle > 1e-3:
            problems.append("%s has a rotation (%.1f deg): apply it (Ctrl+A) before export" % (name, math.degrees(rot.angle)))
        if any(abs(s - 1.0) > 1e-4 for s in w.matrix_world.to_scale()):
            problems.append("%s has a scale other than 1: apply it" % name)
        kids = [c for c in w.children_recursive if c.type == "MESH"]
        if not kids and w.type != "MESH":
            problems.append("%s has no meshes below it" % name)
    if len(wheel_pos) == 4:
        radius_ok = []
        for name, p in wheel_pos.items():
            w = bpy.data.objects[name]
            parts = [w] if w.type == "MESH" else [c for c in w.children_recursive if c.type == "MESH"]
            low = min((to_gltf(o.matrix_world @ Vector(c)).y for o in parts for c in o.bound_box), default=0.0)
            radius_ok.append(abs(low) <= 0.01)
            if abs(low) > 0.01:
                problems.append("%s: the tyre's lowest point is at y = %.3f m, must be 0 (±1 cm)" % (name, low))
        # symmetric about x = 0, wheelbase centred at z = 0
        if abs(wheel_pos["wheel_fl"].x + wheel_pos["wheel_fr"].x) > 0.01 or abs(wheel_pos["wheel_rl"].x + wheel_pos["wheel_rr"].x) > 0.01:
            problems.append("the wheels are not symmetric about x = 0")
        zc = (wheel_pos["wheel_fl"].z + wheel_pos["wheel_rl"].z) / 2
        if abs(zc) > 0.05:
            problems.append("the middle of the wheelbase is at z = %.3f, the origin must be there" % zc)
        wb = wheel_pos["wheel_fl"].z - wheel_pos["wheel_rl"].z
        track = wheel_pos["wheel_fl"].x - wheel_pos["wheel_fr"].x
        notes.append("wheelbase %.2f m, track %.2f m" % (wb, track))
        if not (2.0 <= wb <= 3.2 and 1.2 <= track <= 1.9):
            problems.append("wheelbase %.2f m / track %.2f m look wrong for a car (check the scale: 1 unit = 1 m)" % (wb, track))

    # materials -> slots; meshes outside the wheels count as body
    used, calls, tris = {}, 0, 0
    for o in meshes:
        n = triangles(o)
        tris += n
        in_wheel, a = False, o
        while a is not None:   # a mesh is part of a wheel when it or one of its parents carries a wheel name
            in_wheel = in_wheel or a.name in WHEELS
            a = a.parent
        if not o.material_slots:
            problems.append("mesh '%s' has no material (no slot)" % o.name)
        for ms in o.material_slots:
            nm = ms.material.name if ms.material else None
            if own_of(nm):
                used[own_of(nm)] = used.get(own_of(nm), 0) + 1
            elif slot_of(nm) is None:
                problems.append("mesh '%s': material '%s' is no slot name (%s)" % (o.name, nm, ", ".join(SLOTS)))
            else:
                used[slot_of(nm)] = used.get(slot_of(nm), 0) + 1
            calls += 1
        if o.modifiers:
            notes.append("mesh '%s' has modifiers: the export applies them" % o.name)
        if not in_wheel:
            seen = {slot_of(ms.material.name) or ms.material.name for ms in o.material_slots if ms.material}
            if len(o.material_slots) > 1 and len(seen) < len(o.material_slots):
                problems.append("mesh '%s' repeats a slot: merge the parts of one slot into one mesh" % o.name)
        if o.data.uv_layers and not any(slot_of(ms.material.name) == "carbon" or own_of(ms.material.name) for ms in o.material_slots if ms.material):
            notes.append("mesh '%s' has UVs but no carbon slot: they are dropped by the game" % o.name)
    body_slots = sorted(s for s in used)
    notes.append("slots in use: %s" % ", ".join(body_slots))
    if tier == "phone" and "interior" in used:
        problems.append("the phone file must not use 'interior'")
    # draw calls: one per primitive; the body slots once each (merged), wheels per their primitives
    notes.append("triangles %d (target %d, limit %d), draw calls (primitives) %d (limit %d)" % (tris, TARGET[tier], LIMITS[tier]["tris"], calls, LIMITS[tier]["calls"]))
    if tris > LIMITS[tier]["tris"]:
        problems.append("%d triangles, the limit for the %s file is %d" % (tris, tier, LIMITS[tier]["tris"]))
    if calls > LIMITS[tier]["calls"]:
        problems.append("%d draw calls (mesh primitives), the limit for the %s file is %d: merge by slot; a phone wheel is ONE primitive (rim in vertex colours)" % (calls, tier, LIMITS[tier]["calls"]))

    # size and symmetry of the whole car
    pts = [to_gltf(o.matrix_world @ Vector(c)) for o in meshes for c in o.bound_box]
    if pts:
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        notes.append("bounding box (glTF axes): x %.2f..%.2f, y %.2f..%.2f, z %.2f..%.2f -> %.2f m long, %.2f m wide, %.2f m high" % (lo.x, hi.x, lo.y, hi.y, lo.z, hi.z, hi.z - lo.z, hi.x - lo.x, hi.y - lo.y))
        if abs(lo.x + hi.x) > 0.05:
            problems.append("the car is not centred on x = 0")
        if not (3.4 <= hi.z - lo.z <= 5.4 and 1.5 <= hi.x - lo.x <= 2.1 and 1.1 <= hi.y - lo.y <= 1.7):
            problems.append("the size is unusual for a car (check the scale)")
        if abs(lo.y) > 0.02:
            problems.append("the car's lowest point is at y = %.3f, the ground must be y = 0" % lo.y)
    return problems, notes


def export(path):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", export_yup=True, use_selection=False,
        export_apply=True, export_normals=True, export_tangents=False, export_texcoords=True,
        export_vertex_color="ACTIVE", export_materials="EXPORT", export_image_format="AUTO",
        export_cameras=False, export_lights=False, export_animations=False, export_skins=False, export_morph=False,
    )


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, help="the car's index from cars.json")
    ap.add_argument("--out", default="game/assets/cars")
    ap.add_argument("--tier", choices=["phone", "high"], default="phone")
    ap.add_argument("--check-only", action="store_true")
    a = ap.parse_args(argv)
    problems, notes = check(a.tier)
    for n in notes:
        print("  ", n)
    for p in problems:
        print("PROBLEM:", p)
    if problems:
        print("%d problem(s): nothing exported" % len(problems))
        sys.exit(1)
    if a.check_only:
        print("ok (checked only)")
        return
    os.makedirs(a.out, exist_ok=True)
    path = os.path.join(a.out, "%s%s.glb" % (a.id, "" if a.tier == "phone" else "-hi"))
    export(path)
    kb = os.path.getsize(path) / 1024
    print("wrote %s (%.0f KB, limit %d KB)" % (path, kb, LIMITS[a.tier]["kb"]))
    if kb > LIMITS[a.tier]["kb"]:
        print("PROBLEM: the file is larger than the limit")
        sys.exit(1)


if __name__ == "__main__":
    main()
