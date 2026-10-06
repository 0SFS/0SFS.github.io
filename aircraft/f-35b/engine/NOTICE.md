# Original F135-PW-600 visual reconstruction

These two engine GLBs are original 0sfs geometry, licensed under the repository's
AGPL-3.0-only license. `scripts/f135Engine/` is the reproducible authored source;
`node scripts/build-f135-engine.mjs --install` exports both from that source.
`--check` compares the installed bytes. The adjacent manifest records dimensions,
source hashes, asset hashes, resource inventory, engineering references and limits.

The full export includes external casing, flanges, plumbing, accessories and
mounts. The installed export omits those meshes, while retaining the same swivel,
nozzle, liner, hot annulus, centerbody and intake/fan. No image, texture or mesh
from the user reference or TurboSquid previews is present in either runtime file.
Those images are qualitative research references with unresolved variant/rights.

This is an explicitly approximate PW-600 reconstruction. Primary manufacturer
sources establish the variant and overall family context; Lockheed engineering
accounts establish the B's compact nozzle and three-bearing mechanism. Detailed
stations, circular-joint sizes, panel and fan counts, accessories, aperture range,
materials and installation fit are modeling hypotheses. The aperture uses rigid
convergent/divergent flaps, gap seals, sliding throat shoes, slotted fairings and
followers at constant scale. Its two-angle command schedule is a reduced linkage,
not recovered production PW-600 hardware. Surface-only seals carry separate
nominal thickness/density declarations; those do not establish actual mass or
the native effective thermal capacities. It is not a calibrated
engine drawing, thermal map, control schedule or photometric reconstruction.

`../F-35B_AF267-airframe.glb` remains a derivative of AF267's CC BY 4.0 model;
its source credit is in `../NOTICE.md`. The generation removes the rejected
`vtol` subtree and the separately identified 124-triangle static engine tube in
`extras`, leaving its other components intact. All retained vertex/image byte
slices are copied unchanged. The original runtime/source GLB is preserved.
