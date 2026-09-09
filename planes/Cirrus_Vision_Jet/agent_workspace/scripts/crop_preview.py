"""Crop and upscale a region of an image, for looking at a detail closely.

    blender -b --factory-startup --python crop_preview.py -- <in> <out> x0 y0 x1 y1 [scale]

Coordinates are top-down pixels, matching how the rest of the measurement
scripts talk about images.
"""
import bpy, sys
import numpy as np

a = sys.argv[sys.argv.index("--") + 1:]
src, out = a[0], a[1]
x0, y0, x1, y1 = (int(v) for v in a[2:6])
scale = int(a[6]) if len(a) > 6 else 1

im = bpy.data.images.load(src)
w, h = im.size
buf = np.empty(w * h * im.channels, dtype=np.float32)
im.pixels.foreach_get(buf)
arr = buf.reshape(h, w, im.channels)[::-1]
crop = arr[y0:y1, x0:x1]
if scale > 1:
    crop = np.repeat(np.repeat(crop, scale, axis=0), scale, axis=1)
if crop.shape[2] == 3:
    crop = np.concatenate([crop, np.ones(crop.shape[:2] + (1,), np.float32)], axis=2)
img = bpy.data.images.new("crop", crop.shape[1], crop.shape[0], alpha=True)
img.pixels = crop[::-1].ravel().tolist()
img.filepath_raw = out
img.file_format = 'PNG'
img.save()
print("###CROP###", out, crop.shape[1], "x", crop.shape[0])
