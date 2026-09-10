"""
What is the lowest surface at (x, y), and which part is it?

    blender -b --factory-startup --python surface_probe.py -- \\
        <file.blend|file.glb> x,y [x,y ...] [--from-z 3.5]

Casts a ray straight down through the assembled aeroplane and reports every
surface it crosses, nearest the ground first. That is the question behind every
decision about where something goes on the underside, and it is one the
constant tables cannot answer on their own, because the answer depends on which
of several parts happens to be lowest there.

It is what settled two of the gear bays. `belly_rows.py` says the wing's lower
surface drops below the fuselage's from about x = 0.62 outboard; this says by
how much at a given station, and it is how the retracted main wheels were set
to sit proud of the wing root rather than buried a hand's width inside it.

Coordinates are the working frame the report uses: X across the span, Y along
the fuselage with the NOSE AT ZERO and aft negative, Z up from the ground.
"""
import bpy, sys, os
from mathutils import Vector

CG_SHIFT = -4.00                    # working Y = world Y + CG_SHIFT

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
PATH = argv[0]
FROM_Z = float(argv[argv.index("--from-z") + 1]) if "--from-z" in argv else 3.5
POINTS = []
for a in argv[1:]:
    if a.startswith("--") or "," not in a:
        continue
    x, y = (float(v) for v in a.split(","))
    POINTS.append((x, y))

if PATH.lower().endswith((".glb", ".gltf")):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=PATH)
else:
    bpy.ops.wm.open_mainfile(filepath=PATH)

deps = bpy.context.evaluated_depsgraph_get()
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']

print(f"### SURFACE PROBE ### {os.path.basename(PATH)}")
for x, y in POINTS:
    world_y = y - CG_SHIFT
    hits = []
    for o in meshes:
        # Ray in the object's own space, so a part with an origin off the
        # model's - every gear leg has one - is not silently missed.
        m_inv = o.matrix_world.inverted()
        origin = m_inv @ Vector((x, world_y, FROM_Z))
        direction = (m_inv.to_3x3() @ Vector((0.0, 0.0, -1.0))).normalized()
        # Walk the whole column, not just the first hit: the useful answer is
        # the ORDER of the surfaces, which is what says whether a wheel is
        # inside the wing or proud of it.
        travel = 0.0
        for _ in range(8):
            ok, loc, _nrm, _idx = o.ray_cast(origin, direction,
                                             distance=FROM_Z * 3 - travel,
                                             depsgraph=deps)
            if not ok:
                break
            world = o.matrix_world @ loc
            hits.append((round(world.z, 4), o.name))
            step = (loc - origin).length + 1e-4
            origin = loc + direction * 1e-4
            travel += step
    hits.sort(reverse=True)
    print(f"\nx={x:+.3f}  Y={y:+.3f}   (world y {world_y:+.3f})")
    if not hits:
        print("   nothing under this point")
    for z, name in hits:
        print(f"   z {z:7.4f}   {name}")
