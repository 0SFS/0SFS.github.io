# Lockheed Martin F-35B

The F-35B is selectable in 0sfs with AF267's converted model, an experimental
JSBSim flight model, animated controls, gear and lift-system parts, and a
geometry-based cockpit view. 0sfs owns this aircraft integration; JSBSim remains
the dynamics backend. Ground collision work is separate.

## Try it

Open **Aircraft**, select **Lockheed Martin F-35B Lightning II**, and **Apply**.
The aircraft change reloads the app and activates the matching mesh and flight
data. **Auto** loads the supplied 12,259-triangle mesh.

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

The GLB preserves 102 named mesh objects and their authored pivots, embeds all
four textures, uses standard glTF axes and a uniform scale matching the published
35 ft span. Its ground origin is below the trial FDM's assumed longitudinal CG.
The source proportions, CG/datum, gear travel and pilot-eye position are
development assumptions, not verified aircraft geometry.

The sixteen retained `feather.001`–`feather.016` nozzle petals hinge about their
local tangential axes while inheriting the VTOL swivel assembly's pitch/yaw.
Their hinge positions and scale stay fixed. The model owner's noncreating
native observer supplies `propulsion/engine[0]/nozzle-pos-norm`; visual travel
follows that observed position directly and holds its partial pose while
physics is paused. Missing observations leave the authored/last observed pose.
The display range runs from the authored tapered shape to approximately
axis-parallel petals, about 12.5° of hinge travel. This is geometry-based
presentation of JSBSim's generic turbine nozzle-display schedule, not a
calibrated F135 throat/exit-area schedule or measured actuator travel. The
[source geometry and actual-model checks](../../validation/evidence/aircraft/f35b/nozzle-area-2026-10-05/source-geometry.json)
record all sixteen tip paths, fixed hinges and retained vectoring hierarchy;
native SDK/app integration qualification is tracked separately.

The exhaust is a shared renderer attached to that moving nozzle. A small baked
optical texture supplies faint dry glow and afterburner emission; the flame and
shock-cell pattern use the genuine native augmentation observer. A tiny baked
brightness envelope follows simulation time and holds while paused. It uses one
static 12-triangle volume per declared exhaust source, bounded sampling and
physical metre path lengths, with no particle spawning or runtime spectroscopy.
The retained inner-nozzle liner has separate baked hot-surface emission while
the engine runs dry. Only that nozzle's declared material binding is cloned;
the gear/fuselage materials sharing its original material and all geometry stay
unchanged. This local thermal display does not brighten the dry exhaust tail,
and its assumed temperature/brightness table has no F135 radiometric calibration.
**Renderer → Aircraft exhaust** exposes enable, sample count, draw distance and
intensity. The THR fire indicator and warm accent report actual afterburner
activity. Color, extent, shock structure and brightness variation are explicit
visual approximations, with no calibrated F135 radiance or heat distortion.
The same settings home offers optional faint smoke with a particle budget,
emission rate, lifetime, distance and opacity. One static billboard batch uses
a baked sixteen-frame alpha sprite. Its history stays in double-precision ECEF
coordinates through origin translation/rotation; native time freezes births
and ages while paused, and relocation clears the trail. This is an artistic
aerosol appearance, with no measured F135 soot rate, contrail or wake simulation.
The [renderer method and sources](../../docs/proposals/f35b-fdm.md#baked-exhaust-renderer)
and [glow/smoke GPU acceptance record](../../validation/evidence/aircraft/f35b/exhaust-smoke-gpu-2026-10-05/acceptance.json)
track rendered GPU checks and the remaining qualification limits.
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
