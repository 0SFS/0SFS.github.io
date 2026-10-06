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
