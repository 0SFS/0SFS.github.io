# F-35B aircraft model

**Lockheed Martin F-35B Lightning II** by
[AF267](https://sketchfab.com/jsong.js.us), provided by
[Sketchfab](https://sketchfab.com/3d-models/lockheed-martin-f-35b-lightning-ii-5d54a6af45974ad386ae74d42b33374a),
is licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
The [complete license text](LICENSE-CC-BY-4.0.txt) accompanies this model.
No endorsement by the creator, GeoFS or Lockheed Martin is implied.

0sfs converted the unmodified Blender source and four textures to
`F-35B_AF267.glb` on 2026-10-05. Changes: relinked texture paths; applied a
uniform scale using the published 35 ft wingspan; rotated the source to
standard glTF coordinates; aligned its reference point on the ground beneath
the trial FDM's longitudinal CG; and exported glTF materials with embedded
textures, including the exporter's metallic-texture channel conversion.
Authored geometry, part names, moving-part pivots and hierarchy are preserved.

The flight loads `F-35B_AF267-airframe.glb`, which the F135 repository's
`scripts/build-f135-engine.mjs` generates from `F-35B_AF267.glb` so that the
0sfs F135 takes the place of AF267's nozzle. The generation removes the `vtol`
nozzle subtree and AF267's static engine tube in `extras`, and adds a 0sfs aft
closeout to `extras` (F135's `scripts/f135Engine/closeout.mjs`): a painted flange from
the fuselage's aft edge in to the nozzle, a dark recess behind it and a dark
bulkhead round the engine. The closeout is shaped to clear the swivelling nozzle
in every pose. It is an approximation, not a drawing of the real aircraft
([proposal](../../../docs/proposals/f35b-aft-fuselage-closeout.md)). The engine
`manifest.json` records the removed parts and the closeout. The other retained
bytes are copied unchanged. The generated file is an adaptation of this CC BY 4.0
model and carries the same attribution.

0sfs also changes the loaded airframe in memory. When the airframe loads with
weapon stations, `@0sfs/stores` does the following:

- Cuts four weapon-bay door footprints out of the lower `fuselage` livery skin.
- Blends the skin around them onto fitted hinge rails.
- Hangs the clipped skin as four moving door leaves, with generated inner faces.
- Adds a generated stand-in bay lining behind the openings.

The model files are not changed. These are adaptations of this CC BY 4.0
model and carry the same attribution.
[Stores.NOTICE.md](Stores.NOTICE.md) records the fit and its limits.

The source's proportions produce a 15.396 m length after span scaling, about
1.3% shorter than the published 51.2 ft length. The longitudinal CG alignment
uses the trial FDM's assumption that structural x=0 is the nose datum and its
CG lies 368.52 in aft. That CG and datum have not been validated for a real F-35B.

The editable original and its attribution remain in
`planes/Lockheed_Martin_F-35B/tests/sketchfab-5d54a6af45974ad386ae74d42b33374a/`.
Conversion is reproducible with `scripts/prepare-f35b-model.py`; the adjacent
[export provenance](F-35B_AF267.provenance.json) records hashes, texture
inclusion, dimensions, coordinates and every part's reference point.

The aircraft selection panel credits AF267 and links to the source. The gallery
image `public/aircraft/thumbnails/f-35b.png` is a 0sfs render of this converted
CC BY 4.0 model and carries the same model attribution. The Fuel tab's top-view
outline, in `src/flight/aircraft/generated/aircraftTopViews.ts`, is traced from
this model by `scripts/build-aircraft-top-views.mjs`, and the tab credits AF267
beside it.

This visual model's license does not license the separately sourced flight
dynamics data. Those files carry their own provenance and license.
