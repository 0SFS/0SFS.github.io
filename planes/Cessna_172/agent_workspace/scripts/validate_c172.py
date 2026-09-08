"""
Geometry / performance validation for the low-poly Cessna 172.

    blender -b --factory-startup --python validate_c172.py -- <file.blend|file.glb> [--json out.json]

Reports dimensions, counts, mesh health and left/right symmetry error.
Output is a single JSON object between ###JSON### and ###END### so it can be
diffed between iterations.
"""
import bpy, bmesh, sys, os, json, math
from mathutils import Vector, kdtree

argv = sys.argv[sys.argv.index("--") + 1:]
PATH = argv[0]
OUTJSON = argv[argv.index("--json") + 1] if "--json" in argv else None

# reference dimensions (Cessna 172S, metres)
REF = dict(length=8.280, span=10.998, height=2.718)
TOL = 0.06                                   # 6 cm tolerance for a pass

if PATH.lower().endswith((".glb", ".gltf")):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=PATH)
    GLTF = True
else:
    bpy.ops.wm.open_mainfile(filepath=PATH)
    GLTF = False

sc = bpy.context.scene
meshes = [o for o in sc.objects if o.type == 'MESH']

# ---------------------------------------------------------------- counts ----
tris = verts = 0
mats = set()
per_object = []
all_pts = []
for o in meshes:
    me = o.data
    me.calc_loop_triangles()
    t, v = len(me.loop_triangles), len(me.vertices)
    tris += t
    verts += v
    for m in me.materials:
        if m:
            mats.add(m.name)
    per_object.append(dict(name=o.name, tris=t, verts=v,
                           mats=[m.name for m in me.materials if m],
                           origin=[round(c, 4) for c in o.location]))
    for vt in me.vertices:
        all_pts.append(o.matrix_world @ vt.co)

# ------------------------------------------------------------ dimensions ----
mins = Vector((1e9,) * 3)
maxs = Vector((-1e9,) * 3)
for p in all_pts:
    for i in range(3):
        mins[i] = min(mins[i], p[i])
        maxs[i] = max(maxs[i], p[i])
size = [maxs[i] - mins[i] for i in range(3)]

# Blender's glTF importer converts Y-up back to Z-up, so a re-imported GLB is
# already in the project convention: X = span, Y = length, Z = height.
span, length, height = size[0], size[1], size[2]

dims = dict(
    length=dict(value=round(length, 4), ref=REF["length"],
                err=round(length - REF["length"], 4),
                pass_=abs(length - REF["length"]) <= TOL),
    span=dict(value=round(span, 4), ref=REF["span"],
              err=round(span - REF["span"], 4),
              pass_=abs(span - REF["span"]) <= TOL),
    height=dict(value=round(height, 4), ref=REF["height"],
                err=round(height - REF["height"], 4),
                pass_=abs(height - REF["height"]) <= TOL),
)

# ---------------------------------------------------------- mesh health ----
non_manifold = 0
degenerate = 0
loose_verts = 0
open_shells = []
for o in meshes:
    bm = bmesh.new()
    bm.from_mesh(o.data)
    nm = sum(1 for e in bm.edges if not e.is_manifold)
    non_manifold += nm
    degenerate += sum(1 for f in bm.faces if f.calc_area() < 1e-8)
    loose_verts += sum(1 for v in bm.verts if not v.link_edges)
    if nm:
        open_shells.append(dict(name=o.name, boundary_edges=nm))
    bm.free()

bad_transforms = []
for o in meshes:
    if any(abs(sv - 1.0) > 1e-5 for sv in o.scale):
        bad_transforms.append(dict(name=o.name, kind="scale",
                                   value=[round(c, 5) for c in o.scale]))
    if any(abs(rv) > 1e-5 for rv in o.rotation_euler):
        bad_transforms.append(dict(name=o.name, kind="rotation",
                                   value=[round(c, 5) for c in o.rotation_euler]))

# ------------------------------------------------------------- symmetry ----
# mirror every vertex across the centreline and measure the distance to the
# nearest real vertex; intentionally-asymmetric parts do not exist in this model
axis = 0 if not GLTF else 0          # span axis is X in both conventions
kd = kdtree.KDTree(len(all_pts))
for i, p in enumerate(all_pts):
    kd.insert(p, i)
kd.balance()
errs = []
for p in all_pts:
    m = p.copy()
    m[axis] = -m[axis]
    _, _, d = kd.find(m)
    errs.append(d)
sym = dict(mean=round(sum(errs) / max(1, len(errs)), 6),
           max=round(max(errs) if errs else 0.0, 6),
           over_1mm=sum(1 for d in errs if d > 0.001))

sym_by_obj = []
for o in meshes:
    e = []
    for vt in o.data.vertices:
        p = o.matrix_world @ vt.co
        m = p.copy()
        m[axis] = -m[axis]
        _, _, d = kd.find(m)
        e.append(d)
    if e and max(e) > 0.001:
        sym_by_obj.append(dict(name=o.name, max=round(max(e), 5),
                               over_1mm=sum(1 for d in e if d > 0.001)))

report = dict(
    file=os.path.basename(PATH),
    objects=len([o for o in sc.objects if o.type != 'EMPTY']),
    empties=len([o for o in sc.objects if o.type == 'EMPTY']),
    meshes=len(meshes),
    triangles=tris,
    vertices=verts,
    materials=len(mats),
    material_names=sorted(mats),
    textures=len(bpy.data.images),
    texture_names=[i.name for i in bpy.data.images],
    dimensions=dims,
    bbox_min=[round(v, 4) for v in mins],
    bbox_max=[round(v, 4) for v in maxs],
    size_xyz=[round(v, 4) for v in size],
    # NOTE: on a re-imported GLB these counts are inflated because the glTF
    # exporter splits vertices per normal/material; they are only meaningful
    # when run against the .blend.
    non_manifold_edges=non_manifold,
    open_boundary_by_object=sorted(open_shells, key=lambda d: -d["boundary_edges"]),
    degenerate_faces=degenerate,
    loose_vertices=loose_verts,
    unapplied_transforms=bad_transforms,
    symmetry_error_m=sym,
    asymmetric_objects=sorted(sym_by_obj, key=lambda d: -d["max"]),
    object_names=sorted(o.name for o in sc.objects),
    per_object=sorted(per_object, key=lambda d: -d["tris"]),
)

print("###JSON###")
print(json.dumps(report, indent=1))
print("###END###")
if OUTJSON:
    os.makedirs(os.path.dirname(OUTJSON), exist_ok=True)
    with open(OUTJSON, "w") as f:
        json.dump(report, f, indent=1)
    print("###WROTE###", OUTJSON)
