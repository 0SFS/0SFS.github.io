"""
Regenerate the reference crops used for measurement, into measurements/crops/.

    blender -b --factory-startup --python make_crops.py --

Every crop is a region of `measurements/ref_SF50_three_view_1200dpi.png` or of
one of the reference photographs, so this is reproducible from what is in the
repository - nothing here lives outside it.
"""
import bpy, os, sys
import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
M = os.path.join(HERE, "measurements")
OUT = os.path.join(M, "crops")
os.makedirs(OUT, exist_ok=True)

DRAWING = os.path.join(M, "ref_SF50_three_view_1200dpi.png")
PHOTO = os.path.join(M, "photo_N50SF.jpg")

# (source, name, x0, y0, x1, y1, downscale) in top-down pixels
CROPS = [
    (DRAWING, "side_view", 700, 400, 4600, 1790, 3),
    (DRAWING, "plan_view", 150, 1850, 5300, 5650, 4),
    (DRAWING, "front_view", 150, 6050, 5300, 7900, 4),
    (DRAWING, "fwd_fuselage", 770, 450, 2670, 1600, 2),
    (DRAWING, "aft_fuselage", 2500, 450, 4550, 1600, 2),
    (DRAWING, "cabin_windows", 1300, 780, 2700, 1320, 1),
    (DRAWING, "windshield_front", 1700, 6140, 3800, 7040, 2),
    (DRAWING, "main_gear", 2320, 1350, 2820, 1770, 1),
    (DRAWING, "nose_gear", 1130, 1420, 1410, 1770, 1),
    (PHOTO, "photo_cabin", 400, 480, 1000, 720, 1),
    (PHOTO, "photo_aft_cabin", 700, 520, 1250, 720, 1),
]


def crop(src, name, x0, y0, x1, y1, down):
    im = bpy.data.images.load(src)
    w, h = im.size
    buf = np.empty(w * h * im.channels, dtype=np.float32)
    im.pixels.foreach_get(buf)
    arr = buf.reshape(h, w, im.channels)[::-1]
    a = arr[y0:min(y1, h), x0:min(x1, w)]
    bpy.data.images.remove(im)
    if down > 1:
        a = a[::down, ::down]
    if a.shape[2] == 3:
        a = np.concatenate([a, np.ones(a.shape[:2] + (1,), np.float32)], axis=2)
    out = os.path.join(OUT, f"{name}.png")
    img = bpy.data.images.new(name, a.shape[1], a.shape[0], alpha=True)
    img.pixels = a[::-1].ravel().tolist()
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)
    print(f"###CROP### {out} {a.shape[1]}x{a.shape[0]}")


for c in CROPS:
    crop(*c)
