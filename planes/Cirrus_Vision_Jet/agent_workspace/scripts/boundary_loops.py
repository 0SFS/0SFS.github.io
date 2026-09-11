"""
Every open boundary on the named objects, as closed loops.

    blender -b --factory-startup --python boundary_loops.py -- <file.blend> Obj [Obj ...]

Prints, per object, one tuple per loop of open edges: (edge count, centre x, y,
z, highest and lowest number of open edges at any of its vertices). A hole cut
cleanly is one loop whose every vertex has exactly two, (n, ..., 2, 2). A
T-junction shows up as a loop count that does not match what closes it: the
SF50's wing gear mouth once came out at 23 edges against its pocket rim's 21,
because the faces outboard of the door's hinge had not taken the door's two
corner vertices. A render shows nothing of the kind; the crack is sub-pixel
until the light is behind it.
"""
import bpy, bmesh, sys
from mathutils import Vector

bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index("--") + 1])
for name in sys.argv[sys.argv.index("--") + 2:]:
    ob = bpy.data.objects[name]
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bnd = [e for e in bm.edges if len(e.link_faces) == 1]
    seen, loops = set(), []
    for e in bnd:
        if e in seen: continue
        stack, comp = [e], []
        while stack:
            x = stack.pop()
            if x in seen: continue
            seen.add(x); comp.append(x)
            for v in x.verts:
                stack += [y for y in v.link_edges if len(y.link_faces) == 1 and y not in seen]
        vs = {v for x in comp for v in x.verts}
        deg = [sum(1 for y in v.link_edges if len(y.link_faces) == 1) for v in vs]
        pts = [ob.matrix_world @ v.co for v in vs]
        c = sum(pts, Vector()) / len(pts)
        loops.append((len(comp), round(c.x, 3), round(c.y, 3), round(c.z, 3), max(deg), min(deg)))
    print("###", name, loops)
