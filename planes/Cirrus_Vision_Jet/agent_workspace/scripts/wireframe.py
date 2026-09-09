"""
Draw the mesh wireframe of a .blend, orthographically, into a PNG.

    blender -b --factory-startup --python wireframe.py -- \
        <model.blend> <side|plan|front> <out.png> [--px 150] [--only Fuselage]

Blender's Workbench wireframe shading is viewport-only and comes out blank in a
headless render, so the edges are projected and rasterised here instead. This
is the view that shows whether triangles are going somewhere useful - a shaded
render hides a hundred wasted ones.
"""
import bpy, sys, os
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
BLEND, VIEW, OUT = argv[0], argv[1], argv[2]
PX = float(argv[argv.index("--px") + 1]) if "--px" in argv else 150.0
ONLY = argv[argv.index("--only") + 1] if "--only" in argv else None

WINDOWS = {                      # metric window as it appears on the page
    # h and v name which model axis runs left-to-right and top-to-bottom
    "side": dict(h=(4.6, -5.9), v=(3.75, -0.35), ax=(1, 2)),
    "plan": dict(h=(-6.4, 6.4), v=(4.6, -5.9), ax=(0, 1)),
    "front": dict(h=(-6.4, 6.4), v=(3.75, -0.35), ax=(0, 2)),
}
W = WINDOWS[VIEW]
h0, h1 = W["h"]
v0, v1 = W["v"]
NX = int(round(abs(h1 - h0) * PX))
NY = int(round(abs(v0 - v1) * PX))

bpy.ops.wm.open_mainfile(filepath=BLEND)
img = np.ones((NY, NX), dtype=np.float32)


def to_px(co):
    a, b = W["ax"]
    x = (co[a] - h0) / (h1 - h0) * NX
    y = (co[b] - v0) / (v1 - v0) * NY
    return x, y


def line(x0, y0, x1, y1):
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    if n > 4000:
        return
    for t in range(n + 1):
        x = int(round(x0 + (x1 - x0) * t / n))
        y = int(round(y0 + (y1 - y0) * t / n))
        if 0 <= x < NX and 0 <= y < NY:
            img[y, x] = 0.0


edges = 0
for ob in bpy.context.scene.objects:
    if ob.type != 'MESH':
        continue
    if ONLY and ONLY not in ob.name:
        continue
    mw = ob.matrix_world
    co = [mw @ v.co for v in ob.data.vertices]
    for e in ob.data.edges:
        a, b = co[e.vertices[0]], co[e.vertices[1]]
        x0, y0 = to_px(a)
        x1, y1 = to_px(b)
        line(x0, y0, x1, y1)
        edges += 1

rgba = np.stack([img, img, img, np.ones_like(img)], axis=2)
out = bpy.data.images.new("wire", NX, NY, alpha=True)
out.pixels = rgba[::-1].ravel().tolist()
out.filepath_raw = OUT
out.file_format = 'PNG'
out.save()
print(f"###WIRE### {OUT} {NX}x{NY} edges={edges}")
