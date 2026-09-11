"""
Tyres every airframe shares: ONE plain mesh per tyre, ONE texture per airframe.

    sys.path.insert(0, <repo>/planes/shared); import tyres

Both generators import this rather than carrying a copy, so the C172 and the
SF50 cannot drift apart on something a viewer compares side by side.

**Everything the tyre shows is in its texture, not its geometry.** The mesh is
the plain n-sided cylinder the airframes always had. The texture is an atlas of
two squares side by side:

    u 0.0 - 0.5   the tyre as painted: rubber, with a white band through the hub
    u 0.5 - 1.0   the same tyre averaged over one turn

and the mesh's UVs address the left square. Once the band spins faster than the
display can show, the runtime shifts the texture's u offset by half and the
very same polygons draw the average. No second mesh, no extra vertices, no
hide-and-show - one number changes. docs/drawing-fast-rotation.md is the
argument.

The UVs are a PLANAR projection onto the sidewall plane - u from fore-aft
position, v from height - which is exact for any polygon: a linear function of
position interpolates exactly across any triangle, so the painted band is a
straight, constant-width stripe however coarse the cylinder is. The tread's
vertices are the rim's vertices, so each tread quad reads the texture along the
chord between two rim points, and the band crosses the tread top and bottom
exactly where it should.

**These are visual meshes and nothing else.** Collision never reads a tyre -
ground contact is JSBSim's contact points and the loaded aircraft is made
unpickable. If collision ever needs a tyre shape it builds its own cylinder
from the radius and width; it never reads this one, and this model never
carries one for it.
"""
import math

# Linear RGB, as Blender's Principled BSDF takes it.
TYRE_RGB = (0.030, 0.031, 0.034)    # nearly black: rubber reads as rubber only
                                    # when it is darker than the shadows round it
STRIPE_RGB = (0.88, 0.89, 0.90)
# Half the band's width as a fraction of the tyre's radius: 0.18 of a 0.19 m
# tyre is a 68 mm band, bold enough to read at chase distance and narrow
# enough to still be a stripe.
STRIPE_HALF = 0.18
# The coarsest ring worth texturing. Below six sides the band is a pixel at the
# distance that level is drawn from, and a four-sided wheel is barely a wheel.
STRIPE_MIN_SIDES = 6
# Each atlas square is this many pixels. 128 across a 0.38 m tyre is 3 mm a
# pixel, which puts ~23 of them across the band.
SQUARE_PX = 128
# The disc is inset this far inside its square, so bilinear filtering at the
# rim never reaches into the neighbouring square. Outside the disc each square
# carries on with what its rim shows - rubber (and the band) in the sharp one,
# the rim's average in the blurred one - so filtering across the rim is seamless.
# The sampler REPEATs: the runtime holds the sharp tyre at u offset 1, not 0, so
# switching to the blur (1.5) never changes whether the texture HAS a
# transform, and so never costs a shader compile in the middle of a take-off
# roll.
INSET = 0.96


def band_coverage(rho, half):
    """Fraction of one turn a point at radius `rho` spends under the band.

    Inside the band's half-width the band covers the whole circle; outside it,
    the circle of radius rho crosses the band in four arcs of asin(half / rho)
    each. So the rotational average of a banded sidewall is NOT a uniform grey:
    it is a bright disc at the hub, `half` in radius, falling off to
    (2 / pi) * asin(half / r) at the rim - which is also the tread's average,
    because the rim is where the tread meets the sidewall.
    """
    if rho <= half:
        return 1.0
    return (2.0 / math.pi) * math.asin(min(1.0, half / rho))


def plain_tyre(center, r, w, n):
    """The n-sided cylinder, axle along X, and its UVs. Pure geometry.

    Returns (verts, faces, uvs, smooth): `uvs` is one (u, v) per VERTEX, since
    the planar projection gives a rim point the same UV whichever face it is
    read from - so the mesh needs no UV seam and no split vertices for it.

    The ring starts at -90 deg so ONE vertex sits exactly at the bottom of the
    tyre at every n: the sim stands the aircraft on vertices, not on the circle
    they approximate, and the Cessna's coarse wheels floated for want of one.
    """
    cx, cy, cz = center
    ring = [(r * math.cos(a), r * math.sin(a))
            for a in (2 * math.pi * i / n - math.pi / 2.0 for i in range(n))]
    verts = ([(cx - w / 2.0, cy + u, cz + v) for u, v in ring]
             + [(cx + w / 2.0, cy + u, cz + v) for u, v in ring])
    faces = [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    smooth = [True] * n
    faces.append(list(range(n - 1, -1, -1)))          # near sidewall
    faces.append([n + i for i in range(n)])           # far sidewall
    smooth += [False, False]
    uv = [sharp_uv(u / r, v / r) for u, v in ring]
    return verts, faces, uv + uv, smooth


def sharp_uv(x, z):
    """Atlas UV of a point at (x, z) / r on the sidewall, in the SHARP square."""
    return (0.25 + 0.25 * INSET * x, 0.5 + 0.5 * INSET * z)


def _srgb(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1.0 / 2.4)) - 0.055


def atlas_pixels(half_ratio, px=SQUARE_PX):
    """The atlas as a flat RGBA list, Blender's order (bottom row first).

    Both squares are blended in LINEAR light and only then encoded to sRGB:
    the average is what a camera integrates over a turn, not the average of the
    numbers in a file. The band's edges are supersampled so they are one
    antialiased pixel wide rather than a staircase.
    """
    width, height = 2 * px, px
    out = []
    ss = 8
    for j in range(height):
        zr = ((j + 0.5) / height - 0.5) / (0.5 * INSET)
        for i in range(width):
            u = (i + 0.5) / width
            left = u < 0.5
            if left:
                cover = 0.0
                for k in range(ss):
                    us = (i + (k + 0.5) / ss) / width
                    xr = (us - 0.25) / (0.25 * INSET)
                    cover += 1.0 if abs(xr) < half_ratio else 0.0
                f = cover / ss
            else:
                xr = (u - 0.75) / (0.25 * INSET)
                f = band_coverage(min(math.hypot(xr, zr), 1.0), half_ratio)
            lin = [TYRE_RGB[c] + (STRIPE_RGB[c] - TYRE_RGB[c]) * f for c in range(3)]
            out.extend([_srgb(lin[0]), _srgb(lin[1]), _srgb(lin[2]), 1.0])
    return out


def tyre_material(bpy, prefix, textured):
    """`<prefix>_Tyre`: the atlas on the finest levels, flat rubber below."""
    name = f"{prefix}_Tyre" if textured else f"{prefix}_TyrePlain"
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*TYRE_RGB, 1.0)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.80
    bsdf.inputs["Base Color"].default_value = (*TYRE_RGB, 1.0)
    if textured:
        key = f"{prefix}_TyreAtlas"
        image = bpy.data.images.get(key)
        if image is None:
            image = bpy.data.images.new(key, 2 * SQUARE_PX, SQUARE_PX, alpha=False)
            image.pixels = atlas_pixels(STRIPE_HALF)
            image.pack()
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        tex.extension = 'REPEAT'
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def build_tyre(bpy, name, center, r, w, n, prefix, collection):
    """Build one tyre as a Blender object, origin on the hub.

    Textured with the atlas when it has at least STRIPE_MIN_SIDES sides, plain
    rubber otherwise. The same 2n vertices and n + 2 faces either way: the band
    and its blur cost no geometry at all.
    """
    import bmesh
    from mathutils import Matrix, Vector
    textured = n >= STRIPE_MIN_SIDES
    verts, faces, uvs, smooth = plain_tyre(center, r, w, n)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    # recalc before UVs, while the mesh is only topology
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    if textured:
        layer = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li in poly.loop_indices:
                layer.data[li].uv = uvs[me.loops[li].vertex_index]
    for poly, s in zip(me.polygons, smooth):
        poly.use_smooth = s
    me.materials.append(tyre_material(bpy, prefix, textured))
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    c = Vector(center)
    me.transform(Matrix.Translation(-c))
    ob.location = c
    return ob
