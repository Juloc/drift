"""Turns a raw TRELLIS.2 car (.glb, one textured mesh with its own wheels) into a game car after docs/CAR-MODELS.md.

Usage (headless Blender 4.5; see docs/CAR-PIPELINE.md):
    blender -b -P car_from_trellis.py -- --raw raw.glb --car cars/s15.json --wheels s15-test.glb --variant smooth|smooth-hi --out OUT.glb

What it does, in this order:
 1. imports the raw mesh, turns it so that the front is -Y (Blender; = +Z in glTF), scales it uniformly to the real length,
    puts the lowest point (the tyres) on the ground;
 2. finds the four generated tyres by their contact patches with the ground (centres, track, wheelbase);
 3. centres the car: x = 0 between the tyres, y = 0 in the middle of the wheelbase;
 4. makes it symmetric: keeps one side (`keep_side` in the car file) and mirrors it;
 5. cuts the generated wheels out with a boolean cylinder around each axle (outboard of the body's middle),
    drops floaters; the cylinders' walls close the shell (a dark wheel well, one does not look into the hollow inside);
 6. decimates to the variant's triangle target (symmetric), sorts every face into a material slot by the colour of the
    texture under it and where it is (paint / glass / plastic / light_front / light_rear), one merged mesh per slot;
 7. keeps the UVs and the texture (webp, at most 1024) on paint and plastic, smooth normals with hard edges;
 8. takes the four wheels of the code model (the wheel_* nodes of `--wheels`, already after the rules), scales them to
    `wheel_radius` and puts them at the found centres;
 9. checks the scene with prepare_car.py and exports.
Prints the numbers (sizes, wheelbase, triangles per slot) for the pipeline notes.
"""
import sys, os, json, math, argparse, time
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prepare_car  # noqa: E402  (its main() only runs when it is the script itself)
import carlib  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--raw", required=True)
ap.add_argument("--car", required=True)
ap.add_argument("--wheels", required=True, help="a .glb with wheel_fl/fr/rl/rr after the rules (the code model's s15-test.glb or -hi)")
ap.add_argument("--variant", choices=["smooth", "smooth-hi", "loft"], required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--blend", help="also save the scene as .blend (for looking at it by hand)")
A = ap.parse_args(argv)
CFG = json.load(open(A.car))
R = CFG["regions"]
T0 = time.time()
LOFT = A.variant == "loft"   # a new even body over the generated shell, no texture (plain slot colours)
TIER = "high" if A.variant.endswith("-hi") else "phone"


def log(*a):
    print("[%5.1fs]" % (time.time() - T0), *a, flush=True)


def select_only(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def apply_all(o):
    select_only([o])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


# ---------------------------------------------------------------- 1. import, turn, scale, ground
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.scale_length = 1.0
bpy.ops.import_scene.gltf(filepath=A.raw)
raw = [o for o in bpy.context.scene.objects if o.type == "MESH"]
select_only(raw)
if len(raw) > 1:
    bpy.ops.object.join()
car = bpy.context.view_layer.objects.active
car.name = "raw"
for o in list(bpy.context.scene.objects):   # empties of the import
    if o is not car:
        bpy.data.objects.remove(o)
car.parent = None
apply_all(car)
while car.data.color_attributes:   # TRELLIS' own vertex colours: not used (the texture is the colour)
    car.data.color_attributes.remove(car.data.color_attributes[0])
# front to -Y
turn = {"-y": 0, "+y": math.pi, "+x": -math.pi / 2, "-x": math.pi / 2}[CFG["front"]]
car.rotation_euler = (0, 0, turn)
apply_all(car)
me = car.data
co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
lo, hi = co.min(0), co.max(0)
s = CFG["length"] / (hi[1] - lo[1])
co = (co - [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]]) * s
me.vertices.foreach_set("co", co.ravel()); me.update()
ext = co.max(0) - co.min(0)
log("raw %d triangles, scaled x%.3f -> %.3f long, %.3f wide (with mirrors), %.3f high (real car %.3f / %.3f / %.3f)" % (
    sum(len(p.vertices) - 2 for p in me.polygons), s, ext[1], ext[0], ext[2], CFG["length"], CFG["width"], CFG["height"]))

# ---------------------------------------------------------------- 2. the generated tyres: contact patches
centres = {}
for name, (sx, sy) in {"wheel_fl": (1, -1), "wheel_fr": (-1, -1), "wheel_rl": (1, 1), "wheel_rr": (-1, 1)}.items():
    q = co[(np.sign(co[:, 0]) == sx) & (np.sign(co[:, 1]) == sy) & (np.abs(co[:, 1]) > 0.5) & (np.abs(co[:, 0]) > 0.3)]
    zmin = q[:, 2].min()
    patch = q[q[:, 2] < zmin + 0.02]
    centres[name] = [float(patch[:, 0].mean()), float(patch[:, 1].mean()), float(zmin)]
    log("%s contact patch: %d points, x %.3f, y %.3f, lowest z %.3f" % (name, len(patch), *centres[name]))
cx = np.mean([c[0] for c in centres.values()])
cy = (np.mean([centres["wheel_fl"][1], centres["wheel_fr"][1]]) + np.mean([centres["wheel_rl"][1], centres["wheel_rr"][1]])) / 2
wheelbase = np.mean([centres["wheel_rl"][1], centres["wheel_rr"][1]]) - np.mean([centres["wheel_fl"][1], centres["wheel_fr"][1]])
track_f = centres["wheel_fr"][0] - centres["wheel_fl"][0]
track_r = centres["wheel_rr"][0] - centres["wheel_rl"][0]
log("wheelbase %.3f m (real %.3f), track front %.3f, rear %.3f" % (wheelbase, CFG["wheelbase"], track_f, track_r))

# ---------------------------------------------------------------- 3. centre
co -= [cx, cy, 0]
me.vertices.foreach_set("co", co.ravel()); me.update()
half_track = {"f": track_f / 2, "r": track_r / 2}
WR = CFG["wheel_radius"]
wheel_at = {n: Vector((math.copysign(half_track[n[6]], c[0] - cx), c[1] - cy, WR)) for n, c in centres.items()}
# the front and rear axle from the patches, symmetric about x = 0 and y = 0 (the origin is the middle of the wheelbase)
yf = (wheel_at["wheel_fl"].y + wheel_at["wheel_fr"].y) / 2
yr = (wheel_at["wheel_rl"].y + wheel_at["wheel_rr"].y) / 2
for n in wheel_at:
    wheel_at[n].y = yf if n[6] == "f" else yr

# ---------------------------------------------------------------- 4. symmetric: keep one side, mirror it
bm = bmesh.new(); bm.from_mesh(me)
keep = 1 if CFG["keep_side"] == "+x" else -1
geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, 0), plane_no=(keep, 0, 0), clear_inner=True, dist=1e-5)
bm.to_mesh(me); bm.free(); me.update()
mod = car.modifiers.new("mirror", "MIRROR")
mod.use_axis[0] = True; mod.use_clip = True; mod.use_mirror_merge = True; mod.merge_threshold = 0.002
select_only([car]); bpy.ops.object.modifier_apply(modifier="mirror")
log("mirrored the %s side" % CFG["keep_side"])

# ---------------------------------------------------------------- 5. cut the generated wheels out (a boolean cylinder per wheel), clean
# The cylinder takes the generated tyre, rim and brake away and leaves a clean round wheel well whose walls close the shell.
# Its faces get the darkest texel of the texture (UV), so they come out as dark plastic.
WW = CFG["wheel_width"]
CUT = CFG["cut"]   # the generated tyre: radius and axle height measured once per car (a side slice, see docs/CAR-PIPELINE.md)
img0 = next(nd.image for m in me.materials for nd in m.node_tree.nodes if nd.type == "TEX_IMAGE" and nd.image)
w0, h0 = img0.size
px0 = np.empty(w0 * h0 * 4, dtype=np.float32); img0.pixels.foreach_get(px0); px0 = px0.reshape(h0, w0, 4)[:, :, :3].sum(2)
dy, dx = np.unravel_index(np.argmin(px0), px0.shape)
DARK_UV = ((dx + 0.5) / w0, (dy + 0.5) / h0)


def cut_wells(obj, uv_name=None):
    """Boolean difference with one cylinder per wheel (axle along X, from inboard of the tyre to outside the car)."""
    cbm = bmesh.new()
    for n, w in wheel_at.items():
        inner, outer = abs(w.x) - WW / 2 - CUT["inboard"], 1.4
        m = Matrix.Translation((math.copysign((inner + outer) / 2, w.x), w.y, CUT["axle_z"])) @ Matrix.Rotation(math.pi / 2, 4, "Y")
        bmesh.ops.create_cone(cbm, cap_ends=True, cap_tris=False, segments=48, radius1=CUT["radius"], radius2=CUT["radius"], depth=outer - inner, matrix=m, calc_uvs=False)
    if uv_name:   # the same name as the car's UV map: the boolean keeps one map
        cuv = cbm.loops.layers.uv.new(uv_name)
        for f in cbm.faces:
            for l in f.loops:
                l[cuv].uv = DARK_UV
    cutter = bpy.data.objects.new("cutter", bpy.data.meshes.new("cutter")); bpy.context.scene.collection.objects.link(cutter)
    cbm.to_mesh(cutter.data); cbm.free()
    if obj.data.materials:
        cutter.data.materials.append(obj.data.materials[0])
    mod = obj.modifiers.new("wells", "BOOLEAN")
    mod.operation = "DIFFERENCE"; mod.solver = "EXACT"; mod.object = cutter; mod.use_hole_tolerant = True
    select_only([obj]); bpy.ops.object.modifier_apply(modifier="wells")
    bpy.data.objects.remove(cutter)


tris0 = len(me.polygons)
_pbm = bmesh.new(); _pbm.from_mesh(me)
PRE_BVH = BVHTree.FromBMesh(_pbm)   # the shell before the wells (tyres in place): what the loft's sections are taken from
_pbm.free()
cut_wells(car, me.uv_layers.active.name)
log("wheel wells: boolean with 4 cylinders (radius %.3f, axle at %.3f): %d -> %d faces" % (CUT["radius"], CUT["axle_z"], tris0, len(me.polygons)))
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0005)
# floaters: connected pieces with less than 1 % of the faces
bm.faces.ensure_lookup_table()
seen, parts = set(), []
for f in bm.faces:
    if f.index in seen:
        continue
    stack, part = [f], []
    seen.add(f.index)
    while stack:
        g = stack.pop(); part.append(g)
        for e in g.edges:
            for h in e.link_faces:
                if h.index not in seen:
                    seen.add(h.index); stack.append(h)
    parts.append(part)
parts.sort(key=len, reverse=True)
small = [f for p in parts if len(p) < 0.01 * len(bm.faces) for f in p]
bmesh.ops.delete(bm, geom=small, context="FACES")
loose = [v for v in bm.verts if not v.link_faces]
bmesh.ops.delete(bm, geom=loose, context="VERTS")
log("%d connected pieces, dropped %d faces in %d small ones" % (len(parts), len(small), sum(1 for p in parts if len(p) < 0.01 * sum(map(len, parts)))))
bmesh.ops.triangulate(bm, faces=bm.faces[:])
for it in range(CFG.get("smooth_iterations", 0)):   # a little calmer surface (TRELLIS panels are lumpy), the volume kept
    bmesh.ops.smooth_laplacian_vert(bm, verts=bm.verts[:], lambda_factor=0.4, lambda_border=0.0, use_x=True, use_y=True, use_z=True, preserve_volume=True)
bm.to_mesh(me); bm.free(); me.update()

# the source for colours and slots: the cleaned full-detail mesh with its texture
src = car.copy(); src.data = me.copy(); src.name = "source"; bpy.context.scene.collection.objects.link(src)
img = None
for m in me.materials:
    for nd in (m.node_tree.nodes if m and m.use_nodes else []):
        if nd.type == "TEX_IMAGE" and nd.image and any(l.to_socket.name == "Base Color" for l in nd.outputs[0].links):
            img = nd.image
assert img is not None, "no base colour texture in the raw model"
W, H = img.size
RGBA = np.empty(W * H * 4, dtype=np.float32); img.pixels.foreach_get(RGBA); RGBA = RGBA.reshape(H, W, 4); PIX = RGBA[:, :, :3]
log("texture %s %dx%d" % (img.name, W, H))
sbm = bmesh.new(); sbm.from_mesh(src.data); sbm.faces.ensure_lookup_table()
suv = sbm.loops.layers.uv.active
sbvh = BVHTree.FromBMesh(sbm)

# the paint's own colour: the median of the bright, grey texels
V = PIX.max(2); SAT = (V - PIX.min(2)) / np.maximum(V, 1e-4)
PAINT_REF = np.median(PIX[(V > 0.6) & (SAT < 0.2)], axis=0)
log("paint colour of the texture", np.round(PAINT_REF, 3))


def fill_uv_triangle(uvs, colour):
    """Paints one UV triangle of the texture (and a pixel around it) in one colour."""
    p = np.array([(u % 1.0 * W, v % 1.0 * H) for u, v in uvs])
    x0, y0 = np.floor(p.min(0) - 1).astype(int); x1, y1 = np.ceil(p.max(0) + 1).astype(int)
    xs, ys = np.meshgrid(np.arange(max(x0, 0), min(x1, W)), np.arange(max(y0, 0), min(y1, H)))
    q = np.stack([xs.ravel() + 0.5, ys.ravel() + 0.5], 1)
    (ax, ay), (bx, by), (cx_, cy_) = p
    den = (by - cy_) * (ax - cx_) + (cx_ - bx) * (ay - cy_)
    if abs(den) < 1e-9:
        return 0
    l1 = ((by - cy_) * (q[:, 0] - cx_) + (cx_ - bx) * (q[:, 1] - cy_)) / den
    l2 = ((cy_ - ay) * (q[:, 0] - cx_) + (ax - cx_) * (q[:, 1] - cy_)) / den
    m = (l1 > -0.08) & (l2 > -0.08) & (1 - l1 - l2 > -0.08)
    PIX[ys.ravel()[m], xs.ravel()[m]] = colour
    return int(m.sum())


# erase: lettering and badges of the picture (docs/ASSETS.md: none on a model) painted over with the paint's colour
for box in CFG.get("erase", []):
    n_faces = n_px = 0
    for f in sbm.faces:
        c = f.calc_center_median()
        if box["y"][0] < c.y < box["y"][1] and box["z"][0] < c.z < box["z"][1] and abs(c.x) > box.get("min_abs_x", 0):
            col = PIX[int(f.loops[0][suv].uv.y % 1 * H) % H, int(f.loops[0][suv].uv.x % 1 * W) % W]
            if col.max() > 0.35:   # only the painted surface, not a window or a grille in the box
                n_px += fill_uv_triangle([tuple(l[suv].uv) for l in f.loops], PAINT_REF); n_faces += 1
    log("erased %d texels on %d faces (%s)" % (n_px, n_faces, box.get("about", "")))
img.pixels.foreach_set(RGBA.ravel()); img.update()


PIXB = PIX.copy()   # a 3x3 box blur of the texture: the numbers for slots and contours, less noisy than single texels
for _ in range(CFG.get("loft", {}).get("blur_passes", 3) if LOFT else 1):
    PIXB[1:-1, 1:-1] = sum(PIXB[1 + dy:PIXB.shape[0] - 1 + dy, 1 + dx:PIXB.shape[1] - 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)) / 9


def colour_at(p, blur=False):
    """The texture's colour on the source surface nearest to p (and that UV)."""
    loc, _, i, _ = sbvh.find_nearest(p)
    f = sbm.faces[i]
    a, b, c = (l.vert.co for l in f.loops)
    ua, ub, uc = (Vector((l[suv].uv.x, l[suv].uv.y, 0)) for l in f.loops)
    uv = barycentric_transform(loc, a, b, c, ua, ub, uc)
    x, y = int(uv.x % 1.0 * W) % W, int(uv.y % 1.0 * H) % H
    return (PIXB if blur else PIX)[y, x], (uv.x, uv.y)


# ---------------------------------------------------------------- 6. decimate (symmetric), slots
target = CFG["targets"][A.variant]
tris = len(me.polygons)
if LOFT:
    # A new, even body over the generated one: cross-sections along the car, each found by rays from inside the section's
    # middle out to the generated shell (+x half, mirrored), smoothed, then lofted into one closed mesh of quads.
    # Parts that stand out of that body (mirrors, wing, splitter) are taken over from the generated mesh and thinned out.
    Lc = CFG.get("loft", {})
    NS, NA = Lc.get("stations", 56), Lc.get("angles", 36)
    y0, y1 = min(v.co.y for v in me.vertices), max(v.co.y for v in me.vertices)
    trim = Lc.get("trim", 0.02)
    y0, y1 = y0 + trim, y1 - trim   # the very ends are capped (a section there would be all misses)
    Y = [y0 + (y1 - y0) * (1 - math.cos(math.pi * (i + 0.5) / NS)) / 2 for i in range(NS)]   # denser at the ends
    TH = [math.pi * j / (NA - 1) for j in range(NA)]   # 0 = up, pi = down, on the +x side

    def ray(o, d):
        return PRE_BVH.ray_cast(o, d)[0]

    FLIP = math.radians(Lc.get("outside_from_deg", 75))   # rays further down than this come from outside (flares, sills, tyres)

    rad, cz = np.full((NS, NA), np.nan), np.zeros(NS)
    for i, y in enumerate(Y):
        top, bot = ray(Vector((0, y, 5)), Vector((0, 0, -1))), ray(Vector((0, y, -1)), Vector((0, 0, 1)))
        zt, zb = (top.z if top else 1.0), (bot.z if bot else 0.15)
        cz[i] = (zt + zb) / 2
        c = Vector((0, y, cz[i]))
        for j, th in enumerate(TH):
            d = Vector((math.sin(th), 0, math.cos(th)))
            # upwards from inside (the first surface: not the wing, not a mirror), sideways and down from outside (the outermost)
            p = ray(c, d) if th < FLIP else ray(c + d * 4.0, -d)
            if p is not None:
                rad[i, j] = (p - c).length
            elif th >= FLIP:
                rad[i, j] = 0.02   # nothing there from outside: the body does not reach this far
    for i in range(NS):   # gaps: from the neighbours on the ring
        row = rad[i]; ok = ~np.isnan(row)
        if ok.any():
            rad[i] = np.interp(np.arange(NA), np.flatnonzero(ok), row[ok])
    from_median = np.copy(rad)
    for i in range(1, NS - 1):   # spikes: a 3x3 median, then a light [1 2 1] blur along the car and around the ring
        for j in range(NA):
            from_median[i, j] = np.median(rad[i - 1:i + 2, max(0, j - 1):j + 2])
    rad = from_median
    for _ in range(Lc.get("blur", 1)):
        rad[1:-1] = (rad[:-2] + 2 * rad[1:-1] + rad[2:]) / 4
        rad[:, 1:-1] = (rad[:, :-2] + 2 * rad[:, 1:-1] + rad[:, 2:]) / 4
    lbm = bmesh.new()
    rings = []
    for i, y in enumerate(Y):
        pts = [Vector((rad[i, j] * math.sin(t), y, cz[i] + rad[i, j] * math.cos(t))) for j, t in enumerate(TH)]
        ring = [lbm.verts.new(p) for p in pts]
        ring += [lbm.verts.new(Vector((-p.x, p.y, p.z))) for p in reversed(pts[1:-1])]   # the -x half, mirrored
        rings.append(ring)
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for j in range(n):
            lbm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
    for ring, yy, zc in ((rings[0], Y[0], cz[0]), (rings[-1], Y[-1], cz[-1])):   # the ends: a fan to the middle
        hub = lbm.verts.new(Vector((0, yy, zc)))
        for j in range(n):
            lbm.faces.new((hub, ring[j], ring[(j + 1) % n]))
    bmesh.ops.recalc_face_normals(lbm, faces=lbm.faces[:])
    lbvh = BVHTree.FromBMesh(lbm)
    loft_faces = len(lbm.faces)
    # attachments: faces of the generated mesh clearly outside the new body
    abm = bmesh.new(); vmap = {}
    for f in sbm.faces:
        cen = f.calc_center_median()
        loc, nrm, _, _ = lbvh.find_nearest(cen)
        if loc is not None and cen.z > Lc.get("attach_above", 0.75) and (cen - loc).dot(nrm) > Lc.get("attach", 0.025):
            vs = []
            for v in f.verts:
                if v.index not in vmap:
                    vmap[v.index] = abm.verts.new(v.co)
                vs.append(vmap[v.index])
            try:
                abm.faces.new(vs)
            except ValueError:
                pass
    # drop crumbs (pieces of fewer than 30 faces)
    abm.faces.ensure_lookup_table(); seen = set(); crumbs = []
    for f in abm.faces:
        if f in seen:
            continue
        part, stack = [], [f]; seen.add(f)
        while stack:
            g = stack.pop(); part.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h not in seen:
                        seen.add(h); stack.append(h)
        if len(part) < Lc.get("crumb_faces", 60):
            crumbs += part
    bmesh.ops.delete(abm, geom=crumbs, context="FACES")
    bmesh.ops.delete(abm, geom=[v for v in abm.verts if not v.link_faces], context="VERTS")
    att = bpy.data.objects.new("attachments", bpy.data.meshes.new("attachments")); bpy.context.scene.collection.objects.link(att)
    abm.to_mesh(att.data); abm.free()
    na = len(att.data.polygons)
    if na > Lc.get("attach_faces", 1500):
        mod = att.modifiers.new("decimate", "DECIMATE"); mod.ratio = Lc.get("attach_faces", 1500) / na; mod.use_symmetry = True; mod.symmetry_axis = "X"
        select_only([att]); bpy.ops.object.modifier_apply(modifier="decimate")
    loft = bpy.data.meshes.new("loft"); lbm.to_mesh(loft); lbm.free()
    old = car.data; car.data = loft; bpy.data.meshes.remove(old); me = car.data
    select_only([car, att]); bpy.context.view_layer.objects.active = car; bpy.ops.object.join()
    cut_wells(car)
    log("loft: %d sections x %d points -> %d faces; %d faces of attachments (from %d outside); wells cut: %d faces" % (
        NS, 2 * NA - 2, loft_faces, len(me.polygons) and min(na, Lc.get("attach_faces", 1500)), na, len(me.polygons)))
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free(); me.update()
elif target and target < tris:
    mod = car.modifiers.new("decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"; mod.ratio = target / tris; mod.use_symmetry = True; mod.symmetry_axis = "X"; mod.use_collapse_triangulate = True
    select_only([car]); bpy.ops.object.modifier_apply(modifier="decimate")
log("decimated %d -> %d triangles (target %s)" % (tris, len(me.polygons), target or "none"))

zs = np.array([v.co.z for v in me.vertices]); ys = np.array([v.co.y for v in me.vertices])
ROOF, FRONT, REAR = zs.max(), ys.min(), ys.max()
SLOTS = ["paint", "glass", "plastic", "light_front", "light_rear"]
HL, TL = R["headlamp"], R["taillamp"]


def in_tail(p):
    return p.y > REAR - TL["from_rear"] and TL["z"][0] < p.z < TL["z"][1]


def in_head(p):
    return p.y < FRONT + HL["from_front"] and HL["z"][0] < p.z < HL["z"][1] and abs(p.x) > HL["min_abs_x"]


# the region tests as numbers: > 0 inside (glass: dark above the belt line; tail lamp: red; head lamp: not white)
FIELDS = {
    "light_rear": lambda p, c: min(c[0] - 0.3, c[0] - 1.7 * max(c[1], c[2])) if in_tail(p) else None,
    "light_front": lambda p, c: 0.6 - max(c) if in_head(p) else None,
    "glass": lambda p, c: 0.35 - max(c) if p.z > R["belt"] else None,
}
if LOFT:   # the loft has no texture: the dark parts low down (grille, intakes, underbody) get a clean edge too
    FIELDS["plastic"] = lambda p, c: (0.3 - max(c)) if p.z <= R["belt"] and not near_well(p) else None


def near_well(p):
    """On the lip of a wheel well: dark there is the generated tyre's shadow, not a part of the car."""
    return any(math.hypot(p.y - w.y, p.z - CUT["axle_z"]) < CUT["radius"] + 0.12 for w in wheel_at.values())


def in_well(p):
    """On the walls of a cut wheel well (the cylinder and its inner disc)."""
    return any(math.hypot(p.y - w.y, p.z - CUT["axle_z"]) < CUT["radius"] + 0.01 and abs(p.x) > abs(w.x) - WW / 2 - CUT["inboard"] - 0.01
               for w in wheel_at.values())


def slot_for(cen, col):
    if LOFT and in_well(cen):
        return "plastic"
    v, mn = max(col), min(col)
    sat = (v - mn) / v if v > 1e-4 else 0
    for slot, field in FIELDS.items():
        f = field(cen, col)
        if f is not None and f > 0:
            return slot
    if v > 0.45 and sat < 0.35:
        return "paint"
    if LOFT:
        return "paint"   # plastic only through its field above (a clean edge), never by a lone dark face
    if v < 0.35:
        return "plastic"
    return "paint" if cen.z > 0.3 else "plastic"


# contour cuts: the mesh is cut where a region's number crosses 0 (the edge of a window or a lamp in the texture),
# so that the faces of glass and lamps end on that line and not on the zigzag of the triangles
bm = bmesh.new(); bm.from_mesh(me)
for slot, field in FIELDS.items():
    val = {v: field(v.co, colour_at(v.co, blur=True)[0]) for v in bm.verts}
    pct = {}
    for e in bm.edges:
        fa, fb = val[e.verts[0]], val[e.verts[1]]
        if fa is not None and fb is not None and (fa > 0) != (fb > 0):
            # the texture's edge is a step, not a slope: look for it along the edge (9 samples), then interpolate between two
            a, b = e.verts[0].co, e.verts[1].co
            ts = np.linspace(0.08, 0.92, 9)
            fs = [field(a.lerp(b, t), colour_at(a.lerp(b, t), blur=True)[0]) for t in ts]
            fs = [fa if x is None else x for x in fs]
            k = next((i for i in range(8) if (fs[i] > 0) != (fs[i + 1] > 0)), None)
            pct[e] = 0.5 if k is None else ts[k] + (ts[k + 1] - ts[k]) * fs[k] / (fs[k] - fs[k + 1])
    if not pct:
        continue
    res = bmesh.ops.bisect_edges(bm, edges=list(pct), cuts=1, edge_percents=pct)
    nv = [g for g in res["geom_split"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.connect_verts(bm, verts=nv, check_degenerate=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    err = np.mean([abs(field(v.co, colour_at(v.co, blur=True)[0]) or 0) for v in nv[:200]])
    log("contour %s: cut %d edges (|number| on the cut %.3f)" % (slot, len(nv), err))
bm.faces.ensure_lookup_table(); bm.faces.index_update()
face_slot, face_col, face_uv = [], [], []
for f in bm.faces:
    cen = f.calc_center_median()
    pts = [cen] + [cen.lerp(l.vert.co, 0.6) for l in f.loops]
    cols = [colour_at(p, blur=True) for p in pts]
    col = np.median(np.array([c for c, _ in cols]), axis=0)
    face_col.append(col); face_uv.append(cols[0][1])
    face_slot.append(slot_for(cen, col))
# one pass of a majority filter: a lone face among others of one slot takes theirs (no speckles)
for it in range(2):
    new = list(face_slot)
    for f in bm.faces:
        nb = [face_slot[h.index] for e in f.edges for h in e.link_faces if h is not f]
        if nb and nb.count(face_slot[f.index]) == 0:
            new[f.index] = max(set(nb), key=nb.count)
    face_slot = new
counts = {s_: face_slot.count(s_) for s_ in SLOTS}
log("faces per slot:", counts)

# ---------------------------------------------------------------- 7. materials, UVs / vertex colours, split by slot
mats = {}
for s_ in SLOTS:
    m = bpy.data.materials.new(s_); m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    if s_ in ("paint", "plastic") and not LOFT:
        tex = m.node_tree.nodes.new("ShaderNodeTexImage"); tex.image = img
        m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    mats[s_] = m
me.materials.clear()
for s_ in SLOTS:
    me.materials.append(mats[s_])
for f in bm.faces:
    f.material_index = SLOTS.index(face_slot[f.index])
bm.to_mesh(me); bm.free(); me.update()
sbm.free(); bpy.data.objects.remove(src)
for m in list(bpy.data.materials):
    if m.users == 0:
        bpy.data.materials.remove(m)

# normals: smooth with hard edges
select_only([car])
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="MATERIAL"); bpy.ops.object.mode_set(mode="OBJECT")
body = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for o in body:
    s_ = o.data.materials[o.data.polygons[0].material_index].name.split(".")[0]
    o.name = o.data.name = "body_" + s_
    select_only([o]); bpy.ops.object.material_slot_remove_unused()   # one material per mesh: the slot
    if s_ not in ("paint", "plastic"):   # only these two carry the texture; the others need no UVs
        while o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers[0])
log("body meshes:", ", ".join("%s %d" % (o.name, len(o.data.polygons)) for o in body))

# ---------------------------------------------------------------- 8. the wheels of the code model at the found centres
carlib.code_wheels(A.wheels, wheel_at, WR, log)

# ---------------------------------------------------------------- 9. check, export
problems, notes = prepare_car.check(TIER)
for n_ in notes:
    log("  ", n_)
for p in problems:
    log("PROBLEM:", p)
if A.blend:
    bpy.ops.wm.save_as_mainfile(filepath=A.blend)
if problems:
    sys.exit(1)
carlib.export_glb(A.out, textures=not LOFT)
kb = os.path.getsize(A.out) / 1024
log("wrote %s: %.0f KB (limit %d KB)" % (A.out, kb, prepare_car.LIMITS[TIER]["kb"]))
if kb > prepare_car.LIMITS[TIER]["kb"]:
    log("PROBLEM: the file is larger than the limit")
    sys.exit(1)
