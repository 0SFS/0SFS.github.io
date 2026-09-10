"""
Geometry / performance validation for the low-poly Cirrus SF50 Vision Jet.

    blender -b --factory-startup --python validate_sf50.py -- \
        <file.blend|file.glb> [--json out.json]

Reports dimensions against the published figures, counts, mesh health, ground
contact and left/right symmetry error.  Output is a single JSON object between
###JSON### and ###END### so it can be diffed between iterations.

Two of the checks flag things that are correct on purpose, and the report says
which:

- **Open boundary edges** are expected wherever a surface is deliberately not
  sealed: the nacelle is left open where it is buried in the fuselage crown,
  wing and V-tail roots are uncapped inside the body, and the gear legs have no
  end caps because both ends are buried.
- **Symmetry error** should be zero. This airframe has no asymmetric part -
  there is no propeller - so anything here is a real defect.
"""
import bpy, bmesh, sys, os, json
from mathutils import Vector, kdtree

argv = sys.argv[sys.argv.index("--") + 1:]
PATH = argv[0]
OUTJSON = argv[argv.index("--json") + 1] if "--json" in argv else None

# published figures, POH page 1-4 (metres)
REF = dict(length=9.357, span=11.796, height=3.322)
TOL = 0.06                                   # 6 cm tolerance for a pass
GROUND_TOL = 0.005                           # wheels must reach z = 0

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
    # World-space extent, because "the part is in the wrong place" and "the
    # part did not move at all" look identical in a render and are one line
    # apart here. Origin alone does not say it: a mesh can be rotated or
    # rebuilt around an origin that never moved.
    pts = [o.matrix_world @ vt.co for vt in me.vertices]
    bb = ([round(min(p[i] for p in pts), 4) for i in range(3)],
          [round(max(p[i] for p in pts), 4) for i in range(3)]) if pts else None
    per_object.append(dict(name=o.name, tris=t, verts=v,
                           mats=[m.name for m in me.materials if m],
                           origin=[round(c, 4) for c in o.location],
                           bbox=bb))
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


def dim(name, value):
    return dict(value=round(value, 4), ref=REF[name],
                err=round(value - REF[name], 4),
                pass_=abs(value - REF[name]) <= TOL)


dims = dict(length=dim("length", length), span=dim("span", span),
            height=dim("height", height))

# ------------------------------------------------------- ground contact ----
# The catalog drops the visual by aircraftClearanceMeters(), which assumes the
# exported origin is on the ground between the wheels.  If the lowest vertex is
# not at z = 0 the aircraft floats or sinks by exactly that much - the Cessna's
# coarse levels floated because their low-poly wheels had no bottom vertex.
lowest = round(mins[2], 5)
ground = dict(lowest_z=lowest, pass_=abs(lowest) <= GROUND_TOL)
touching = sorted(o.name for o in meshes
                  if any((o.matrix_world @ v.co).z <= GROUND_TOL
                         for v in o.data.vertices))
ground["objects_on_the_ground"] = touching

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
kd = kdtree.KDTree(len(all_pts))
for i, p in enumerate(all_pts):
    kd.insert(p, i)
kd.balance()
errs = []
for p in all_pts:
    m = p.copy()
    m[0] = -m[0]                          # span axis is X in both conventions
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
        m[0] = -m[0]
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
    ground_contact=ground,
    # NOTE: on a re-imported GLB the vertex counts are inflated because the
    # glTF exporter splits vertices per normal and per material; the mesh
    # health numbers are only meaningful when run against the .blend.
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
