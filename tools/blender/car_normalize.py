"""Turns a downloaded car model (.glb/.gltf/.fbx/.obj/.blend) into a game file after docs/CAR-MODELS.md.

Usage (headless Blender 4.5; see docs/CAR-PIPELINE.md, "Downloaded models"):
    blender -b -P car_normalize.py -- --model car.fbx --car cars/<car>.json --wheels s15-test.glb --tier phone|high --out OUT.glb

The car file (`tools/blender/cars/<car>.json`) gives the real sizes and a "source" block:
    "source": { "file": "...", "licence": "...", "author": "...", "url": "...",
                "front": "-y",          which way the model's front points after import (Blender axes; look.py shows it)
                "up": "+z",             "+y" when an importer left the model lying on its back
                "scale_by": "length",   or "wheelbase": the real size that decides the scale
                "wheels": "game",       "game": the game's wheels (code model) at the model's wheel centres; "model": its own
                "slots": { "regex": "slot", ... },   material name -> slot, tried before the built-in list
                "drop": ["regex", ...], objects or materials to throw away (a driver, a number plate, a ground plane)
                "drop_boxes": [{"material": "regex", "lo": [x, y, z], "hi": [x, y, z], "about": "..."}],   faces of a material
                                        inside a box of the model's own coordinates (as materials.py / parts.py print them)
                "slot_boxes": [{"material": "regex", "slot": "light_rear", "lo": [...], "hi": [...]}],   another slot for the faces
                                        of a material inside a box (a lamp material shared by the front and the rear)
                "targets": { "phone": 14000, "high": 40000 } }

What it does, in this order:
 1. imports, applies modifiers, puts every transform into the meshes, throws away cameras, lights, empties, bones, hidden objects;
 2. turns it (up, front), scales it uniformly (length or wheelbase), finds the four wheels: objects named like a wheel or
    shaped like one (round side, at a corner, near the ground); when there are none, loose parts of the meshes are tried;
 3. centres it: x = 0 between the wheels, y = 0 in the middle of the wheelbase, the tyres on the ground (z = 0);
 4. gives every material a slot by its name (the car file's list, then the built-in list; the rest becomes plastic and is listed),
    one merged mesh per slot, no textures, UVs only on carbon; the phone file drops the interior;
 5. wheels: the game's (scaled to the model's tyre) or the model's own (one mesh per wheel on the phone, the rim painted light
    grey into the vertex colours; rubber + chrome on the high tier);
 6. decimates the body slots (symmetric) to the tier's budget, smooth normals with hard edges, checks with prepare_car.py, exports.
It prints a table of the materials and their slots: fix a wrong one in "slots" and run again.
"""
import sys, os, re, json, math, argparse, time
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prepare_car  # noqa: E402
import carlib  # noqa: E402
from carlib import select_only, bake_world, bbox, WHEELS  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True)
ap.add_argument("--car", required=True)
ap.add_argument("--wheels", required=True, help="the code model's wheels (s15-test.glb for phone, s15-test-hi.glb for high)")
ap.add_argument("--tier", choices=["phone", "high"], default="phone")
ap.add_argument("--out", required=True)
ap.add_argument("--blend")
A = ap.parse_args(argv)
CFG = json.load(open(A.car))
SRC = CFG.get("source", {})
HIGH = A.tier == "high"
T0 = time.time()


def log(*a):
    print("[%5.1fs]" % (time.time() - T0), *a, flush=True)


# built-in names (lower case, searched anywhere in the material name); the car file's "slots" come first
SLOT_NAMES = [
    ("light_front", r"head.?l(ight|amp)|front.?l(ight|amp)|scheinwerfer|headlight|hl_glass|indicator|blinker|fog"),
    ("light_rear", r"tail.?l(ight|amp)|rear.?l(ight|amp)|brake.?l(ight|amp)|r(ue|ü)ckl|stop.?l|reverse"),
    ("glass", r"glass|window|windshield|windscreen|scheibe|glas"),
    ("rubber", r"tyre|tire|rubber|reifen|gummi"),
    ("chrome", r"chrome|chrom|(?<![a-z])rims?(?![a-z])|felge|alloy|metal|exhaust|steel|(?<![a-z])alu"),
    ("carbon", r"carbon|cf_|kohle"),
    ("interior", r"interior|seat|dash|steer|leather|cockpit|innen|sitz|lenk|pedal|gauge"),
    ("paint", r"paint|body|car_?col|(?<![a-z])lack|karosserie|exterior|coat"),
    ("plastic", r"plastic|black|trim|grill|rubber_?trim|kunststoff|mirror|matte|undercarriage|chassis"),
]
WHEEL_NAME = re.compile(r"wheel|tyre|tire|(?<![a-z])rims?(?![a-z])|(?<![a-z])rad(?![a-z])|reifen|felge|hub|spoke", re.I)
STAYS = re.compile(r"caliper|brake.?(pad|cal)|bremssattel|steering.?wheel|lenkrad", re.I)   # not spinning with the wheel


def slot_of_name(name):
    n = (name or "").lower()
    for rx, slot in SRC.get("slots", {}).items():
        if re.search(rx, n, re.I):
            return slot, "car file"
    s = prepare_car.slot_of(n)
    if s:
        return s, "exact"
    for slot, rx in SLOT_NAMES:
        if re.search(rx, n):
            return slot, "built-in"
    return "plastic", "UNKNOWN"


# ---------------------------------------------------------------- 1. import and flatten
ext = os.path.splitext(A.model)[1].lower()
if ext == ".blend":
    bpy.ops.wm.open_mainfile(filepath=A.model)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    {".glb": lambda p: bpy.ops.import_scene.gltf(filepath=p), ".gltf": lambda p: bpy.ops.import_scene.gltf(filepath=p),
     ".fbx": lambda p: bpy.ops.import_scene.fbx(filepath=p), ".obj": lambda p: bpy.ops.wm.obj_import(filepath=p)}[ext](A.model)
bpy.context.scene.unit_settings.scale_length = 1.0
for o in list(bpy.context.scene.objects):
    if o.type != "MESH" or o.hide_get() or o.hide_render or any(re.search(rx, o.name, re.I) for rx in SRC.get("drop", [])):
        continue
    if o.data.shape_keys:
        o.shape_key_clear()
    for m in list(o.modifiers):   # mirror, subdivision, armature in rest pose ...: the mesh as it is shown
        select_only([o])
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except RuntimeError:
            o.modifiers.remove(m)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and not o.hide_get() and not o.hide_render
          and not any(re.search(rx, o.name, re.I) for rx in SRC.get("drop", []))]
for o in meshes:
    bake_world(o)
for o in list(bpy.context.scene.objects):
    if o not in meshes:
        bpy.data.objects.remove(o)
# materials to drop (by name)
for o in meshes:
    bad = [i for i, ms in enumerate(o.material_slots) if ms.material and any(re.search(rx, ms.material.name, re.I) for rx in SRC.get("drop", []))]
    if bad:
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in bad], context="FACES")
        bm.to_mesh(o.data); bm.free()
# boxes: faces of one material inside a box of the model's own coordinates (emblems that share a material with lamps or trim)
for box in SRC.get("drop_boxes", []):
    lo_, hi_, n_ = Vector(box["lo"]), Vector(box["hi"]), 0
    for o in meshes:
        idx = [i for i, ms in enumerate(o.material_slots) if ms.material and re.search(box["material"], ms.material.name, re.I)]
        if not idx:
            continue
        bm = bmesh.new(); bm.from_mesh(o.data)
        gone = [f for f in bm.faces if f.material_index in idx and all(lo_[k] <= f.calc_center_median()[k] <= hi_[k] for k in range(3))]
        n_ += len(gone)
        bmesh.ops.delete(bm, geom=gone, context="FACES")
        bm.to_mesh(o.data); bm.free()
    log("dropped %d faces of %s in the box %s .. %s (%s)" % (n_, box["material"], box["lo"], box["hi"], box.get("about", "")))
# slot boxes: faces of a material inside a box get another slot (a lamp material shared by the front and the rear lamps)
for box in SRC.get("slot_boxes", []):
    lo_, hi_, n_ = Vector(box["lo"]), Vector(box["hi"]), 0
    target = bpy.data.materials.get(box["slot"]) or bpy.data.materials.new(box["slot"])   # its name is the slot
    for o in meshes:
        idx = [i for i, ms in enumerate(o.material_slots) if ms.material and re.search(box["material"], ms.material.name, re.I)]
        hits = [p for p in o.data.polygons if p.material_index in idx and all(lo_[k] <= (p.center)[k] <= hi_[k] for k in range(3))]
        if not hits:
            continue
        if target.name not in [ms.material.name for ms in o.material_slots if ms.material]:
            o.data.materials.append(target)
        ti = [ms.material.name if ms.material else None for ms in o.material_slots].index(target.name)
        for p in hits:
            p.material_index = ti
        n_ += len(hits)
    log("gave %d faces of %s in the box %s .. %s the slot %s" % (n_, box["material"], box["lo"], box["hi"], box["slot"]))
for o in [o for o in meshes if not len(o.data.polygons)]:   # emptied by a dropped material: away with the object too
    bpy.data.objects.remove(o)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
tris0 = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
log("imported %s: %d meshes, %d triangles, %d materials" % (os.path.basename(A.model), len(meshes), tris0, len({ms.material for o in meshes for ms in o.material_slots})))

# ---------------------------------------------------------------- 2. turn, scale, wheels
turn = Matrix.Identity(4)
if SRC.get("up", "+z") == "+y":
    turn = Matrix.Rotation(math.pi / 2, 4, "X") @ turn
elif SRC.get("up", "+z") == "-y":
    turn = Matrix.Rotation(-math.pi / 2, 4, "X") @ turn
turn = Matrix.Rotation({"-y": 0, "+y": math.pi, "+x": -math.pi / 2, "-x": math.pi / 2}[SRC.get("front", "-y")], 4, "Z") @ turn
for o in meshes:
    o.data.transform(turn)
lo, hi = bbox(meshes)
k = CFG["length"] / (hi.y - lo.y)
mid = (lo + hi) / 2
for o in meshes:
    o.data.transform(Matrix.Scale(k, 4) @ Matrix.Translation((-mid.x, -mid.y, -lo.z)))
lo, hi = bbox(meshes)
log("turned, scaled x%.4f by the length: %.3f long, %.3f wide, %.3f high (real %.3f / %.3f / %.3f)" % (k, hi.y - lo.y, hi.x - lo.x, hi.z - lo.z, CFG["length"], CFG["width"], CFG["height"]))


_box = {}


def box(o):
    """bbox of one mesh, fast (numpy), cached until clear_boxes()."""
    if o.name not in _box:
        co = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
        _box[o.name] = (Vector(co.min(0)), Vector(co.max(0)))
    return _box[o.name]


def wheel_like(o):
    """(centre, radius) when the object looks like a tyre or a wheel: a round side, at a corner, low; else None."""
    a, b = box(o)
    d = b - a
    c = (a + b) / 2
    if not (0.35 < d.z < 0.95 and abs(d.y - d.z) < 0.22 * d.z and d.x < 0.55 and c.z < 0.6 and abs(c.y) > 0.6 and abs(c.x) > 0.3):
        return None
    return c, d.z / 2


def find_wheels(objs):
    """Groups wheel parts by corner; the tyre (the biggest round part) gives centre and radius, everything round about it
    within its radius belongs to the wheel (rim, disc), except what stays (calipers)."""
    _box.clear()
    found = {}
    for name, (sx, sy) in zip(WHEELS, ((-1, -1), (1, -1), (-1, 1), (1, 1))):
        cands = []
        for o in objs:
            if STAYS.search(o.name) or any(ms.material and STAYS.search(ms.material.name) for ms in o.material_slots):
                continue
            w = wheel_like(o)
            named = WHEEL_NAME.search(o.name) or any(ms.material and WHEEL_NAME.search(ms.material.name) for ms in o.material_slots)
            if w and (w[0].x > 0) == (sx > 0) and (w[0].y > 0) == (sy > 0):
                cands.append((w[1] + (0.01 if named else 0), o, w))
        if not cands:
            continue
        _, tyre, (c, r) = max(cands, key=lambda t: t[0])
        parts = [tyre]
        for o in objs:
            if o is tyre or STAYS.search(o.name):
                continue
            a, b = box(o)
            oc, od = (a + b) / 2, b - a
            if (Vector((0, oc.y - c.y, oc.z - c.z)).length < 0.3 * r and abs(oc.x - c.x) < 0.3 and max(od.y, od.z) <= 2.05 * r):
                parts.append(o)
        found[name] = (c, r, parts)
    return found


wheels = find_wheels(meshes)
if len(wheels) < 4:   # wheels inside bigger meshes: try the loose parts
    log("found %d wheels as objects; trying loose parts" % len(wheels))
    select_only(meshes)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE"); bpy.ops.object.mode_set(mode="OBJECT")
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    wheels = find_wheels(meshes)
if len(wheels) < 4:
    log("PROBLEM: found only these wheels: %s (name the objects in 'source' or check 'front'/'up')" % ", ".join(wheels))
    sys.exit(1)
wb = (wheels["wheel_rl"][0].y + wheels["wheel_rr"][0].y - wheels["wheel_fl"][0].y - wheels["wheel_fr"][0].y) / 2
if SRC.get("scale_by") == "wheelbase":
    k = CFG["wheelbase"] / wb
    for o in meshes:
        o.data.transform(Matrix.Scale(k, 4))
    wheels = {n: (c * k, r * k, p) for n, (c, r, p) in wheels.items()}
    log("scaled again x%.4f by the wheelbase" % k)
    wb *= k
for n, (c, r, p) in wheels.items():
    log("%s: centre (%.3f, %.3f, %.3f), radius %.3f, %d parts (%s)" % (n, c.x, c.y, c.z, r, len(p), ", ".join(o.name for o in p[:4])))

# ---------------------------------------------------------------- 3. centre: symmetric wheel positions, tyres on the ground
cx = sum(c.x for c, _, _ in wheels.values()) / 4
cy = sum(c.y for c, _, _ in wheels.values()) / 4
ground = min(c.z - r for c, r, _ in wheels.values())
for o in meshes:
    o.data.transform(Matrix.Translation((-cx, -cy, -ground)))
R = sum(r for _, r, _ in wheels.values()) / 4
yf = (wheels["wheel_fl"][0].y + wheels["wheel_fr"][0].y) / 2 - cy
yr = (wheels["wheel_rl"][0].y + wheels["wheel_rr"][0].y) / 2 - cy
xf = (wheels["wheel_fr"][0].x - wheels["wheel_fl"][0].x) / 2
xr = (wheels["wheel_rr"][0].x - wheels["wheel_rl"][0].x) / 2
wheel_at = {"wheel_fl": Vector((-xf, yf, R)), "wheel_fr": Vector((xf, yf, R)), "wheel_rl": Vector((-xr, yr, R)), "wheel_rr": Vector((xr, yr, R))}
log("wheelbase %.3f m (real %.3f), track %.3f / %.3f, tyre radius %.3f" % (yr - yf, CFG["wheelbase"], 2 * xf, 2 * xr, R))
wheel_parts = {n: p for n, (_, _, p) in wheels.items()}
in_wheel = {o for p in wheel_parts.values() for o in p}

# ---------------------------------------------------------------- 4. slots by material name, one mesh per slot
slot_mats = {}


def slot_material(slot):
    if slot not in slot_mats:
        slot_mats[slot] = bpy.data.materials.new(slot)
    return slot_mats[slot]


table = {}
for o in meshes:
    if not o.material_slots:
        o.data.materials.append(None)
    for ms in o.material_slots:
        name = ms.material.name if ms.material else "(none)"
        if name not in table:
            table[name] = slot_of_name(name)
log("materials -> slots:")
for name, (slot, why) in sorted(table.items(), key=lambda t: (t[1][0], t[0])):
    log("   %-34s %-12s %s" % (name[:34], slot, why))
def grey_of(m):
    """The material's brightness in sRGB (0..1): the base colour, 0.5 with a texture; kept for the wheels' vertex colours."""
    if not m or not m.use_nodes or "Principled BSDF" not in m.node_tree.nodes:
        return 0.5
    inp = m.node_tree.nodes["Principled BSDF"].inputs["Base Color"]
    if inp.is_linked:
        return 0.5
    r, g, b = inp.default_value[:3]
    return min(0.85, (0.2126 * r + 0.7152 * g + 0.0722 * b) ** (1 / 2.2))


for o in meshes:
    if o in in_wheel:
        o["greys"] = [grey_of(ms.material) for ms in o.material_slots]
    for ms in o.material_slots:
        ms.material = slot_material(table[ms.material.name if ms.material else "(none)"][0])

body = [o for o in meshes if o not in in_wheel]
select_only(body)
bpy.ops.object.join()
car = bpy.context.view_layer.objects.active
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=0.0001)
bpy.ops.mesh.separate(type="MATERIAL"); bpy.ops.object.mode_set(mode="OBJECT")
body = [o for o in bpy.context.scene.objects if o.type == "MESH" and o not in in_wheel]
for o in body:
    select_only([o]); bpy.ops.object.material_slot_remove_unused()
    slot = o.data.materials[0].name.split(".")[0]
    if slot == "interior" and not HIGH:
        bpy.data.objects.remove(o); continue
    o.name = o.data.name = "body_" + slot
    if slot != "carbon":
        while o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers[0])
    while o.data.color_attributes:
        o.data.color_attributes.remove(o.data.color_attributes[0])
body = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name.startswith("body_")]

# ---------------------------------------------------------------- 5. wheels
if SRC.get("wheels", "game") == "game":
    for o in in_wheel:
        bpy.data.objects.remove(o)
    carlib.code_wheels(A.wheels, wheel_at, R, log)
else:
    # the model's own wheels: one node per wheel at its centre; rubber (tyre, dark) and the rest (rim, disc: chrome on the high
    # tier, in the single rubber mesh on the phone); every part keeps its own material's brightness in the vertex colours
    for name, parts in wheel_parts.items():
        at = wheel_at[name]
        c = wheels[name][0] - Vector((cx, cy, ground))
        empty = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(empty)
        empty.location = at
        for o in parts:
            o.data.transform(Matrix.Translation(-c))
            for ms in o.material_slots:
                if ms.material.name.split(".")[0] != "rubber":
                    ms.material = slot_material("chrome")
            cl = o.data.color_attributes.new("Color", "BYTE_COLOR", "CORNER")
            greys = list(o.get("greys", []))
            for poly in o.data.polygons:   # sRGB: the tyre dark as the code model's, the rest as bright as its own material was
                rub = o.material_slots[poly.material_index].material.name.startswith("rubber")
                g = 0.07 if rub else (greys[poly.material_index] if poly.material_index < len(greys) else 0.72)
                for li in poly.loop_indices:
                    cl.data[li].color_srgb = (g, g, g, 1)
            o.data.color_attributes.active_color = cl
            o.data.color_attributes.render_color_index = o.data.color_attributes.active_color_index
            while o.data.uv_layers:
                o.data.uv_layers.remove(o.data.uv_layers[0])
        select_only(parts); bpy.ops.object.join()
        w = bpy.context.view_layer.objects.active
        own = [w]
        if not HIGH:   # one primitive per wheel, at most about 800 triangles
            w.data.materials.clear(); w.data.materials.append(slot_material("rubber"))
            for poly in w.data.polygons:
                poly.material_index = 0
            n = sum(len(p.vertices) - 2 for p in w.data.polygons)
            if n > 800:
                mod = w.modifiers.new("decimate", "DECIMATE"); mod.ratio = 800 / n
                bpy.ops.object.modifier_apply(modifier="decimate")
        else:
            before = set(bpy.context.scene.objects)
            bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.mesh.separate(type="MATERIAL"); bpy.ops.object.mode_set(mode="OBJECT")
            own += [x for x in bpy.context.scene.objects if x not in before]
        for o in own:
            select_only([o]); bpy.ops.object.material_slot_remove_unused()

            o.parent = empty
            o.name = o.data.name = "%s_%s" % (name, o.data.materials[0].name.split(".")[0])
        log("%s: the model's wheel at (%.3f, %.3f, %.3f)" % (name, at.x, at.y, at.z))
carlib.drop_unused()

# ---------------------------------------------------------------- 6. budget, normals, check, export
def tris_of(objs):
    return sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)


wheel_meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.parent and o.parent.name in WHEELS]
target = SRC.get("targets", {}).get(A.tier, 40000 if HIGH else 14000)
budget = target - tris_of(wheel_meshes)
have = tris_of(body)
if have > budget:
    small = [o for o in body if tris_of([o]) < 400]   # lamps and the like stay as they are
    big = [o for o in body if o not in small]
    ratio = (budget - tris_of(small)) / max(1, tris_of(big))
    for o in big:
        select_only([o])
        mod = o.modifiers.new("decimate", "DECIMATE")
        mod.decimate_type = "COLLAPSE"; mod.ratio = max(0.02, ratio); mod.use_symmetry = True; mod.symmetry_axis = "X"; mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier="decimate")
    log("decimated the body %d -> %d triangles (budget %d = %d - wheels %d)" % (have, tris_of(body), budget, target, tris_of(wheel_meshes)))
else:
    log("body %d triangles, within the budget %d: not decimated" % (have, budget))
for o in body:
    select_only([o])
    if o.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
bpy.context.view_layer.update()
problems, notes = prepare_car.check(A.tier)
for n_ in notes:
    log("  ", n_)
for p in problems:
    log("PROBLEM:", p)
if A.blend:
    bpy.ops.wm.save_as_mainfile(filepath=A.blend)
if problems:
    sys.exit(1)
carlib.export_glb(A.out)
kb = os.path.getsize(A.out) / 1024
log("wrote %s: %.0f KB (limit %d KB)" % (A.out, kb, prepare_car.LIMITS[A.tier]["kb"]))
if kb > prepare_car.LIMITS[A.tier]["kb"]:
    log("PROBLEM: the file is larger than the limit")
    sys.exit(1)
