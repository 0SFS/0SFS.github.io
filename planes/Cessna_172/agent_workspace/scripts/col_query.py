"""Report the ink runs in given image columns (or rows) - exact landmark measurement."""
import bpy, sys
import numpy as np
a = sys.argv[sys.argv.index("--")+1:]
src = a[0]; mode = a[1]           # 'col' or 'row'
Y0,Y1 = int(a[2]), int(a[3])      # window along the other axis
idxs = [int(v) for v in a[4:]]
im = bpy.data.images.load(src); w,h = im.size
arr = np.array(im.pixels[:], dtype=np.float32).reshape(h,w,4)[::-1]
ink = arr[...,:3].mean(axis=2) < 0.55
for i in idxs:
    line = ink[Y0:Y1, i] if mode=='col' else ink[i, Y0:Y1]
    nz = np.nonzero(line)[0]
    if len(nz)==0:
        print(f"{mode} {i}: empty"); continue
    runs=[]; s=nz[0]; p=nz[0]
    for v in nz[1:]:
        if v>p+1: runs.append((s+Y0,p+Y0)); s=v
        p=v
    runs.append((s+Y0,p+Y0))
    print(f"{mode} {i}: first={nz[0]+Y0} last={nz[-1]+Y0} runs={runs}")
