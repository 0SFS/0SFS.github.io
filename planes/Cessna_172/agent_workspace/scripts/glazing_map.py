"""Colour every windshield / rear-window candidate face so specific polygons can
be named unambiguously.  Legend is printed to stdout."""
import bpy, sys, math
from mathutils import Vector
a = sys.argv[sys.argv.index("--")+1:]
BLEND, OUTDIR, PREFIX = a[0], a[1], a[2]
bpy.ops.wm.open_mainfile(filepath=BLEND)
ob = bpy.data.objects["Fuselage"]
me = ob.data

PAL = [("RED",(0.85,0.05,0.05)), ("GREEN",(0.05,0.7,0.1)), ("BLUE",(0.1,0.25,0.95)),
       ("YELLOW",(0.95,0.85,0.05)), ("MAGENTA",(0.9,0.1,0.75)), ("CYAN",(0.05,0.8,0.85)),
       ("ORANGE",(1.0,0.45,0.0)), ("PURPLE",(0.5,0.1,0.8)), ("LIME",(0.6,0.95,0.15)),
       ("PINK",(1.0,0.55,0.7)), ("TEAL",(0.0,0.5,0.5)), ("BROWN",(0.45,0.28,0.1))]
mats = []
for name, rgb in PAL:
    m = bpy.data.materials.new("DBG_"+name); m.use_nodes = True
    nt = m.node_tree
    for nd in list(nt.nodes):
        if nd.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(nd)
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[0].default_value = (*rgb, 1); em.inputs[1].default_value = 1.0
    nt.links.new(em.outputs[0], nt.nodes["Material Output"].inputs[0])
    me.materials.append(m); mats.append(len(me.materials)-1)

# cabin region in world Y (origin already shifted): windshield & rear window
CGS = 0.62
def wy(y): return y - CGS          # world -> working
groups = {}
for poly in me.polygons:
    c = poly.center
    y, x, z = wy(c.y), c.x, c.z
    if not (-2.20 <= y <= 0.55 and z > 1.35):
        continue
    if -0.20 < y <= 0.55:      reg = "WINDSHIELD"
    elif -1.72 <= y <= -1.20:  continue          # cabin side windows: not in question
    elif -2.20 <= y < -1.68:   reg = "REARWINDOW"
    else:                      continue
    seg = "front" if y > 0.19 else "aft"
    if reg == "REARWINDOW": seg = "only"
    side = "RIGHT" if x > 0.06 else ("LEFT" if x < -0.06 else "CENTRE")
    band = "UPPER" if z > 1.86 else "LOWER"
    key = (reg, seg, side, band)
    groups.setdefault(key, []).append(poly)

print("### LEGEND ###")
for i,(key, polys) in enumerate(sorted(groups.items())):
    idx = mats[i % len(mats)]
    for p in polys: p.material_index = idx
    cur = "GLASS" if any(True for _ in [1]) else ""
    print(f"  {PAL[i%len(PAL)][0]:8s} = {key[0]:11s} {key[1]:5s} seg, {key[2]:6s} side, {key[3]:5s} band   ({len(polys)} tris)")

sc = bpy.context.scene
bpy.ops.wm.save_as_mainfile(filepath="/tmp/dbg_glazing.blend")
print("###SAVED###")
