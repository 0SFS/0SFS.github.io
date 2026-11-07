# Learjet 60 HD asset

“Bombardier Learjet 60” by [OUTPISTON](https://sketchfab.com/outpiston), from
[Sketchfab](https://sketchfab.com/3d-models/bombardier-learjet-60-7573f836dd3a46bdbce8b90b5a40f104).
Licensed under [Creative Commons Attribution–NonCommercial–ShareAlike 4.0 International](https://creativecommons.org/licenses/by-nc-sa/4.0/).
The GLB and the rendered `../thumbnails/learjet-60.png` retain those terms;
the project's code license does not replace the asset's license.

The prepared GLB adds attribution, source metadata and white exterior paint.
Its geometry, transforms and all twelve embedded JPEG textures are preserved.
A white, nonmetallic paint material replaces the original black textured paint
on the fuselage, wings, tail and nacelle shells. Glazing, chrome, lights, engine
fan meshes and cabin keep their authored materials. Painted stripes and the
registration on those original paint textures are covered by the new solid
white paint. The gallery thumbnail is a static render of the same model, with
a camera and studio lighting.

The model has 25,176 triangles and uses metres, with +Y up and its nose along +Z.
The native origin is retained. Its bounds are approximately 12.798 m across,
3.869 m high and 18.105 m long. These are mesh measurements, not aircraft
performance or geometry specifications. The white exterior is
modelled with landing gear retracted. No control-surface or gear animation is
claimed.

Rebuild the white-painted GLB from the downloaded archive, from the repository
root:

```sh
node scripts/prepare-hd.mjs /path/to/bombardier-learjet-60.zip
```

The source GLB's SHA-256 is
`628b40536e7af862e9e47f85e3517e47cd6cf14e796f014cbd20a7e0f5bd0fde`.
The script checks it before preparing the runtime file.
