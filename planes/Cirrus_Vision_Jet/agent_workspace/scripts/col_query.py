"""
Numeric sampler for the reference three-view: turns "roughly here" into a number.

    blender -b --factory-startup --python col_query.py -- <image.png> <mode> [args]

Modes:
    bbox                        ink bounding box of the whole image
    col  <y0> <y1> <x...>       ink runs down each column x, within rows [y0,y1)
    row  <x0> <x1> <y...>       ink runs across each row y, within cols [x0,x1)
    span <axis> <a0> <a1> <b0> <b1> <step>
                                first/last ink along `axis` for every line in
                                [b0,b1) stepped by `step` -- a whole profile in
                                one call.  axis is 'col' or 'row'.

Image rows are reported in TOP-DOWN pixel coordinates, matching the numbers a
crop of the PDF page is described with.  Blender stores images bottom-up, so the
array is flipped once on load.

Loaded with foreach_get into a preallocated float32 array: the obvious
`im.pixels[:]` builds a Python list of ~4 floats per pixel, which is gigabytes
at the 1200 dpi this drawing is sampled at.
"""
import bpy, sys
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
src, mode = argv[0], argv[1]

im = bpy.data.images.load(src)
w, h = im.size
buf = np.empty(w * h * im.channels, dtype=np.float32)
im.pixels.foreach_get(buf)
arr = buf.reshape(h, w, im.channels)[::-1]          # flip to top-down
INK = arr[..., :3].mean(axis=2) < 0.55              # the drawing is black on white


def runs(line, offset):
    nz = np.nonzero(line)[0]
    if len(nz) == 0:
        return None
    out, start, prev = [], nz[0], nz[0]
    for v in nz[1:]:
        if v > prev + 1:
            out.append((int(start + offset), int(prev + offset)))
            start = v
        prev = v
    out.append((int(start + offset), int(prev + offset)))
    return out


print(f"###IMAGE### {src} {w}x{h}")

if mode == "bbox":
    cols = np.nonzero(INK.any(axis=0))[0]
    rows = np.nonzero(INK.any(axis=1))[0]
    print(f"###BBOX### x={cols[0]}..{cols[-1]} y={rows[0]}..{rows[-1]} "
          f"w={cols[-1] - cols[0] + 1} h={rows[-1] - rows[0] + 1}")

elif mode in ("col", "row"):
    a0, a1 = int(argv[2]), int(argv[3])
    for i in (int(v) for v in argv[4:]):
        line = INK[a0:a1, i] if mode == "col" else INK[i, a0:a1]
        r = runs(line, a0)
        print(f"{mode} {i}: " + ("empty" if r is None
                                 else f"first={r[0][0]} last={r[-1][1]} runs={r}"))

elif mode == "span":
    axis = argv[2]
    a0, a1, b0, b1, step = (int(v) for v in argv[3:8])
    for i in range(b0, b1, step):
        line = INK[a0:a1, i] if axis == "col" else INK[i, a0:a1]
        r = runs(line, a0)
        print(f"{i}\t" + ("empty" if r is None
                          else f"{r[0][0]}\t{r[-1][1]}\t{len(r)}"))
else:
    raise SystemExit(f"unknown mode {mode}")
