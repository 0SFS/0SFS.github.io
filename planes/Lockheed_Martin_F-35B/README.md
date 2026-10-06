# Lockheed Martin F-35B

The F-35B is selectable in 0sfs with AF267's converted model, an experimental
JSBSim flight model, animated controls, gear and lift-system parts, and a
geometry-based cockpit view. 0sfs owns this aircraft integration; JSBSim remains
the dynamics backend. Ground collision work is separate.

The [sourced findings, video timestamps, hypotheses and unresolved appearance
discrepancies](../../docs/proposals/f35b-fdm.md#observations-hypotheses-and-unresolved-discrepancies-2026-10-06)
cover pink/violet exhaust, visible emission during powered lift, dry/AB thermal
behavior, camera effects and nozzle contraction. These observations do not
establish measured F135 temperatures or a validated control schedule.

**Engine → Engine test stand → Open engine test stand** opens a cold-soaked,
stopped native-engine session with the complete reconstructed PW-600 main engine **on Earth at
MSP runway 35**. Move it and choose altitude through the existing **Location** tab.
**Engine history** plots native readings and exports CSV. Starting camera distance,
zoom range, history duration and sampling rate are in the Engine tab.
The stand loads the full engine; flight loads only the installed geometry from
the same authored source. The core-facing interior, compact layered nozzle and
three-bearing swivel are original approximations, not measured CAD. Gas and two
independent native solid temperatures appear in histories/CSV. **Initial engine
state** offers a separate already-running initialization; normal start/stop
retains heat for hot restarts. **Solid heat balances** exposes native signed heat
terms, with optional history/CSV columns. See the
[physical-correction report](../../docs/validation/f135-engine-physical-correction.md)
for precise cold-cycle steps, evidence and remaining GPU/appearance limits.

The nozzle/interior has been reconstructed. The [engine rebuild
brief](../../docs/proposals/f135-engine-rebuild.md) records the rejected shape and
open-petal gaps, source-backed A/B differences, complete versus installed model
architecture, local reference images and acceptance criteria. Its original
[implementation prompt](../../docs/f135-engine-rebuild-prompt.md) remains retained.

## Try it

Open **Aircraft**, select **Lockheed Martin F-35B Lightning II**, and **Apply**.
The aircraft change reloads the app and activates the matching mesh and flight
data. **Auto** loads the airframe and compact installed engine; the Aircraft panel
shows their combined triangle count.

The development start is conventional flight at **300 kt**, **48% throttle**,
gear up and **5,000 lb fuel**. Saved Start settings take precedence over profile
defaults; use Aircraft → Start → Show all parameters to inspect them. Normal
flight controls apply, **G** operates gear, and **V** changes camera view.

The **VTOL lever beside THR** commands the lift system: 0% conventional,
100% fan open and rear nozzle down. Physical conversion takes 2.5 seconds for
a full stroke. Throttle controls lift, and stick/rudder inputs produce native
pitch, roll and yaw moments. This is an experimental control model: the
zero-speed test at 98% throttle climbs, and no hover power setting or operational
transition procedure has been established.
The same command remains in **Controls → F-35B STOVL → Show all parameters**.

**FLAPS → AUTO** starts enabled and uses the native F-35B schedule independently
of the Manual/FBW selector. The slider follows actual travel. Moving a flap
control takes over manually; clicking AUTO resumes the schedule. The saved
setting is also in **Aircraft → Assists**. An autopilot that owns flaps takes
precedence, and the HUD shows that ownership.

**Debug → Forces** shows the native engine, lift-fan, roll-post, aerodynamic,
weight and resultant forces. Adjust arrow scale and labels there. At 0% VTOL
conversion the lift fan and roll posts produce no force; powered-lift authority
requires conversion and sufficient engine power. The [force documentation](../../docs/aircraft-forces.md)
explains the observations and their limits.

Open **Sound → Enable sound** to hear the approximate F135 procedural voice.
Its engine-specific setup emphasizes broadband exhaust roar, follows native
shaft speed/thrust/fuel flow, and changes the existing exhaust layer when the
native afterburner observer is active. Cockpit/chase treatment and volume
controls apply; **Med** is the default quality. The F135 and FJ33 are distinct
engine definitions sharing an explicitly approximate renderer. Separate
LiftFan sound, measured spectra and calibrated loudness remain unimplemented.
The [current audio acceptance record](../../validation/evidence/audio/f135/acoustic-profile-acceptance.json)
and [sound specification](../../docs/sound.md) retain real JSBSim/DSP checks and
the remaining acoustic/device qualification limits.

## Assets and source

The user-supplied original archive, Blender source and four textures remain
unchanged in
[`tests/sketchfab-5d54a6af45974ad386ae74d42b33374a/`](tests/sketchfab-5d54a6af45974ad386ae74d42b33374a/NOTICE.md).
AF267's model is licensed under CC BY 4.0. Runtime attribution and modifications
are recorded in [the mesh notice](../../public/aircraft/f-35b/NOTICE.md) and
[export provenance](../../public/aircraft/f-35b/F-35B_AF267.provenance.json).

The retained source GLB has 102 named mesh objects and their authored pivots,
four embedded textures, standard glTF axes and a uniform scale matching the
published 35 ft span. The active airframe export removes its old nozzle and
internal engine tube, retaining unrelated mesh data. Its ground origin is below
the trial FDM's assumed longitudinal CG. Source proportions, CG/datum, gear
travel and pilot-eye position remain development assumptions.

The active engine comes from one original source with separate full and installed
exports. Convergent/divergent flaps, sliding seals, throat shoes and external
fairings move as rigid parts at constant scale. Three circular swivel bearings
follow native pitch/yaw; aperture follows `propulsion/engine[0]/nozzle-pos-norm`
and holds while physics is paused. Missing observations preserve the last pose.
Throat A8, exit A9 and native command remain distinct: dimensions and linkage are
explicit hypotheses, not a calibrated PW-600 FADEC schedule. The engine-bay doors
retain their provisional 6 cm outboard hinge and early opening during conversion,
with unchanged closed geometry. The [geometry evidence](../../validation/evidence/aircraft/f35b/engine-physical-correction-2026-10-06/geometry/README.md)
records rigid shape/volume, attachment, overlap, occlusion and clearance checks.

The gas support follows the authored augmentor, curved rigid duct, throat,
nozzle exit and free plume. One field and source-power bound cover the complete
support; no rigid asset changes shape. The native temperature is explicitly an
imposed thermal-bath proxy, with no additional assumed Mach expansion. The
continuum uses precomputed absolute particle spectra; internal gas continues
the same boundary hypothesis upstream rather than inventing an augmentor flame.
The unsupported exterior CH*/C2* fuel allocation is removed. Chemical emission
is recorded as unavailable because native reactant/population state is absent,
not asserted to be physically zero or forbidden blue. See the
[source-contract correction](../../docs/validation/f135-exhaust-source-correction.md).
The night powered-lift light remains unexplained and appearance is not accepted.

Core-facing hardware and the cooled nozzle liner have independent native solid
temperatures, estimated heat capacities, gas/coolant transfer and radiation.
Gas and solids remain separate observations. Metal retains heat after cutoff and
through pause, recovery and relocation. Read-only native accounting reports each
solid's existing discrete heat balance; prescribed reservoirs do not close the entire
engine budget. Absolute material emission includes the assumed grey emissivity,
then uses an explicit display reference and the shared scene exposure/tone mapping.
No arbitrary bright idle or startup color sequence is imposed.

**Engine → Temperatures and oil** shows EGT, nozzle gas, core-facing metal and
nozzle metal in °C. **Renderer → Aircraft exhaust** exposes contribution views
(combined, solid, gas, reflection, nearby scene light), ray samples, axial/radial
field samples, opaque-depth occlusion and its resolution, draw distance,
display gain, gas/metal white references and the single nearby light's gain/range.
The default is 128 ray samples and a 64 × 32 source field (32 KiB GPU texture per
engine); lower budgets may miss narrow emission. The optional depth pass stops
ray integration at opaque hardware/scenery. The approximate light uses only the
exterior source bound and excludes its own engine meshes; the emissive raster basemap does not
receive it. Display gains never change physical temperature, fuel or source power.
The THR fire indicator reports actual AB activity; powered-lift inhibition stays
native. Optical depth, species fractions, temperature calibration and rendered
brightness remain unqualified against measured F135 data.
The same settings home offers optional faint smoke with a particle budget,
emission rate, lifetime, distance and opacity. One static billboard batch uses
a baked sixteen-frame alpha sprite. Its history stays in double-precision ECEF
coordinates through origin translation/rotation; native time freezes births
and ages while paused, and relocation clears the trail. This is an artistic
aerosol appearance, with no measured F135 soot rate, contrail or wake simulation.
The [renderer method and sources](../../docs/proposals/f35b-fdm.md#baked-exhaust-renderer)
and [source-correction acceptance record](../../validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/acceptance.json)
track current optical/application checks and their calibration limits. The
[earlier glow/smoke GPU record](../../validation/evidence/aircraft/f35b/exhaust-smoke-gpu-2026-10-05/acceptance.json)
concerns the preceding implementation; current GPU pixels remain unqualified.
The [combined acceptance record](../../validation/evidence/aircraft/f35b/final-acceptance-2026-10-05/acceptance.json)
also retains application CI, Auto-flap coverage and shared force-overlay checks.

Gear retraction now follows the original asset author's documented compound
pose: the mains fold forward/up and turn inward, with separate piston motion;
the nose folds forward through 110°. Authored hinges and deployed geometry are
preserved. This replaces the earlier single-axis quarter-turn, which left main
tires about 47 cm below the model's selected closed skin envelope. Actual-mesh
checks now put all three tires inside that envelope with visibility ignored.
About 2.7 cm of main-leg geometry still falls outside it; true internal bay
clearance and real linkage motion remain unqualified.

The [original GeoFS aircraft definition](https://www.geo-fs.com/models/aircraft/load.php?id=5229)
supports this asset calibration. It also hides its main gear near full
retraction, so it cannot certify physical fit. An
[official USMC photo of an F-35B retracting its gear](https://www.dvidshub.net/image/997094/simultaneous-launch-four-f-35b-lightning-ii-aircraft)
supports forward/upward movement at an intermediate pose. Available B-specific
primary evidence does not establish a wheel-swivel angle or strut-shortening
distance. See the [research record](../../validation/evidence/aircraft/f35b/gear-stow-2026-10-05/research.json)
and the [remaining stowage work](../../docs/proposals/f35b-fdm.md#deferred-aircraft-work-requested-2026-10-05).
The [geometry/check record](../../validation/evidence/aircraft/f35b/gear-stow-2026-10-05/acceptance.json)
retains the visible baseline and current raw-vertex measurements. Run
`node scripts/validation/f35b/inspect-gear-stow.mjs --check-stowed` for a strict
selected-skin check: it currently exits with failure for the open main-leg
clearance issue. The ordinary rig tests track the desired zero-protrusion
condition as an expected failure, requiring review when it is resolved.

At physical gear position zero, the enclosed wheels and arms stop drawing;
bay doors remain visible. Any extension restores the gear immediately. Enable
**Debug → Aircraft visuals → Render stowed landing gear** to inspect the
underlying stowed pose. This persistent setting defaults off and changes
rendering only. Geometry checks do not depend on it.

The original FlightGear JSBSim source closure and Nasal mixers remain unchanged
in [`tests/flightgear-jsbsim/`](tests/flightgear-jsbsim/README.md). The modified
runtime data has its own [GPL notice and change log](../../public/jsbsim-data/aircraft/F-35B-jsbsim/NOTICE.md)
and [source manifest](../../public/jsbsim-data/aircraft/F-35B-jsbsim/source-manifest.json).
The Sketchfab GeoFS description supplies no flight-model provenance.

## Reproduce and inspect

The [source inspector](../../scripts/inspect-f35b-source.py) and
[converter](../../scripts/prepare-f35b-model.py) use Blender headlessly, disable
embedded scripts, and default to dated output under `build/`. The successful
retry supersedes the initial sandbox startup failure. Source integrity, bounds,
materials and part pivots are retained in
[source-inspection.json](../../validation/evidence/aircraft/f35b/source-inspection.json)
and [export.json](../../validation/evidence/aircraft/f35b/export.json).

With Blender on the PATH, reproduce the mesh from the repository root:

```sh
mkdir -p build/tools/blender-tmp
TMPDIR="$PWD/build/tools/blender-tmp" blender --background --factory-startup \
  --disable-autoexec --threads 5 --python scripts/prepare-f35b-model.py
```

The [installed-SDK acceptance](../../validation/evidence/aircraft/f35b/installed-sdk-acceptance.json)
checks bootstrap, relocation, trim adoption, control signs, 60-second
conventional and converted airborne behavior, conversion rate, recovery and
force-free retraction. The [browser acceptance](../../validation/evidence/aircraft/f35b/playable-headless.json)
uses the actual WASM, GLB, Babylon renderer, input manager and animation rig at
120 Hz, with local requests and no server. It checks a standalone aircraft scene;
it does not qualify the full globe, ground handling or audio.

```sh
npx vitest run src/flight/jsbsim/f35b.integration.test.ts --maxWorkers=50%
node scripts/validation/f35b/check-playable-headless.mjs
```

The [FDM implementation notes](../../docs/proposals/f35b-fdm.md) explain the
JSBSim choice, original source defects and remaining calibration work.
The [initial playable check record](../../validation/evidence/aircraft/f35b/playable-checks.json)
records the import's CI, source integrity and built-asset checks. The
[sound, gear and VTOL follow-up record](../../validation/evidence/aircraft/f35b/followup-checks.json)
records the current 1,261-test CI pass, actual-model gear checks, sound checks,
and VTOL lever behavior across pause, reset and reload.
