import bpy, sys
import numpy as np
a = sys.argv[sys.argv.index("--")+1:]
src = a[0]; X0,Y0,X1,Y1 = [int(v) for v in a[1:5]]
im = bpy.data.images.load(src); w,h = im.size
arr = np.array(im.pixels[:], dtype=np.float32).reshape(h,w,4)[::-1]
c = arr[Y0:Y1, X0:X1]
ink = c[...,:3].mean(axis=2) < 0.55
rows = ink.sum(axis=1); cols = ink.sum(axis=0)
print("crop", c.shape[1], "x", c.shape[0])
print("ROWS (y_in_crop:count) nonzero:")
print(" ".join(f"{i}:{v}" for i,v in enumerate(rows) if v>0))
print("COLS nonzero range:", np.nonzero(cols)[0].min(), np.nonzero(cols)[0].max())
print("COLS:")
print(" ".join(f"{i}:{v}" for i,v in enumerate(cols) if v>0))
