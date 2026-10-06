# Prompt: rebuild the F135-PW-600 visual engine

Work in `/Users/felg/gh/0sfs`. Read `AGENTS.md`, then
`docs/proposals/f135-engine-rebuild.md` completely. That is the user's rebuild
brief, evidence ledger, architecture recommendation and acceptance criteria.
Follow its links to the source-backed F-35B investigation and retained images.
Inspect the current dirty tree; it contains substantial existing/concurrent work
which must be preserved.

Implement the replacement, not just a plan. The current engine is rejected:
long tapered petals separate into huge holes in AB, the shape is poor, the
interior is a flat cap, and dry-power/annular glow is inadequately represented.
Rebuild the F135-PW-600 engine visual assembly from scratch, replacing the old
assembly in the active aircraft once ready. Keep its original source and evidence.

Produce one authored engine source with two generated runtime representations:
a complete externally inspectable engine for the test stand, and a small installed
asset containing only geometry visible through the aircraft across rear/oblique
views and full VTOL travel. Share nozzle geometry, materials, pivots and animation;
do not download a hidden complete engine during flight. Reconstruct overlapping
flow-path/nozzle surfaces and B-specific compact geometry, with reliable continuous
coverage over the full aperture range. Do not simply widen/brighten the old wedges.

The test stand must remain on Earth, default to MSP/KMSP runway 35 and relocate
using the existing Location tab. Preserve stationary native hold-down, engine
controls, Earth lighting, orbit, parameter histories/CSV and saved-flight isolation.
The preceding session restores that integration; inspect and extend it as needed.

Use the user-supplied image and downloaded TurboSquid previews in
`validation/evidence/aircraft/f35b/engine-rebuild-2026-10-06/`. Read their manifests
and provenance/completeness limits. They are modeling references, not authenticated
engineering drawings or licensed runtime textures. Independently source B-specific
dimensions/kinematics. The F-35A rear video remains valuable evidence of a bright
nonuniform ring and dark center; the user's eight-spot count is a working
hypothesis, not a proven component count. A/B nozzles do differ in length.

Use observations to build and test explicit hypotheses. Separate gas emission
from material incandescence; N1/N2 are speeds, not temperatures. Evaluate two useful
solid thermal regions first, with a third only if distinct geometry/thermal inputs
justify it. Native JSBSim owns new thermal dynamics and persistence; do not add
a render-time engine integrator. Existing fork.14 lifecycle fixes and working
controls are not rejected merely because the visual engine is being replaced.

Account for visible non-AB powered-lift exhaust, dry-power appearance, pink/violet
test-cell footage, and day/night exposure/white balance. Preserve operational
hover AB inhibition; do not turn on AB to mimic the observed landing light.
Temperature plus kerosene alone cannot determine the spectrum. Precompute costly
optics/spatial data offline and use cheap runtime lookup with explicit, provisional
engine-profile inputs. No unsupported claim of F135 calibration or energy savings.

0sfs owns aircraft visuals/composition; JSBSim owns physics/SDK; FOSS Earth owns
globe rendering, lighting/exposure and generic UI/camera infrastructure. Put each
change in its owner and consume public exports. Reuse data-driven mechanisms;
avoid aircraft-specific copies. Respect parameter/resource controls, hidden
preparation/readiness, render-on-demand, pause and disposal rules in AGENTS.md.

Complete geometry/coverage, native lifecycle, asset-loading and related regression
checks in the brief, then full CI once. Retain measurements, sources, uncertainty,
logs and representative artifacts. Do not start servers, GPU benchmarks or browser
qualification unless requested; state the limits of terminal-only checks. Do not
change ground collisions, unrelated phone UI or the deferred flight-instrument
customization. Finish with what changed, evidence, remaining uncertainties and
clear steps for the user to test the full engine and installed aircraft.
