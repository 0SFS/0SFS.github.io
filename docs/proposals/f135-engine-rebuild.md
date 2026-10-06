# F135 engine reconstruction and appearance

Date: 2026-10-06. Status: reconstruction implemented; terminal acceptance and
remaining visual qualification limits are recorded in the
[implementation report](../validation/f135-engine-reconstruction.md).
The user's subsequent test rejects the deforming aperture and immediate
red-to-purple startup appearance as physically convincing. The
[physical-correction follow-up prompt](../f135-engine-physical-correction-prompt.md)
records those observations, confirmed implementation mechanisms and required
mechanical, thermal and optical checks. The [physical-correction report](../validation/f135-engine-physical-correction.md)
records the implemented rigid mechanism, native heat accounting and dimensional
optics, with the remaining calibration and GPU qualification limits.
The later [spatial-plume follow-up](../f135-plume-physical-followup-prompt.md)
records the user's missing VTOL exhaust and uniformly bright blue AB report,
the confirmed single-color source field, and required physical/visual checks.
The [spatial-plume report](../validation/f135-plume-spatial.md) records its
implementation, source/sampling corrections and remaining appearance differences.
The user's subsequent test still rejects the bright pale-blue AB onset and absent
dry powered-lift glow. The [open follow-up](../f135-plume-physical-followup-prompt.md#follow-up-after-testing-the-spatial-implementation)
records the current source-allocation, temperature-station and nozzle-boundary
issues; numerical checks did not complete the appearance objective.
The remainder retains the approved brief and the pre-rebuild baseline for the
long F-35B investigation. The [agent prompt](../f135-engine-rebuild-prompt.md)
asks the next agent to implement it. The [F-35B investigation](f35b-fdm.md)
retains the detailed research, earlier fixes and validation history.

## Requested result

Replace the current F-35B engine visual assembly from scratch. The user rejects
its shape, long tapered petals, large gaps when open in afterburner, flat rear
interior and inadequate dry-power glow. Do not try to make those meshes credible
by changing their brightness or scaling them again. Build a complete, inspectable
F135-PW-600 main engine for the Engine test stand and a compact representation of
everything visible through the aircraft's openings for flight. Both must share
the same nozzle shape, kinematics, material identities and thermal observations.

The test stand belongs on Earth, initially at **MSP / KMSP runway 35**, with
relocation through the existing **Location** tab. It is a simulation fixture,
not a claim that there is a real F135 test facility on that runway. Retain normal
Earth scenery, lighting and floating-origin behavior, native engine operation,
THR, start/stop, VTOL, pause, orbit, temperature tables/plots and CSV export.
Keep it stationary with native hold-down, without overwriting the saved flight.

"Start from scratch" applies to the rejected engine asset and its inadequate
visual bindings. Audit the thermal, plume and area-schedule assumptions as part
of the replacement. Preserve working native lifecycle, controls, aircraft and
data interfaces unless a demonstrated defect requires changing them in their
owner. Retain the old source/evidence for comparison; remove the old engine
assembly from the active runtime asset when its replacement is ready.

## Do the F-35A and F-35B look different from the rear?

They can share useful qualitative appearances, but the rear hardware is not
identical. Lockheed engineers describe a **shorter STOVL nozzle**, compared with
the A/C design, in [Hamstra and McCallum, §6.2.2](https://onlinelibrary.wiley.com/doi/full/10.1002/9780470686652.eae490).
[Kevin Renshaw's engineering account](https://www.codeonemagazine.com/c5_article.html?item_id=137)
also distinguishes the compact B nozzle from the longer A/C flaps. The B adds
the three-bearing swivel duct and its cooling/actuation hardware. From directly
behind, perspective can hide length differences; similar rings or colors are
reasonable hypotheses to compare across variants. That does not establish equal
diameters, petal proportions, aperture travel or internal viewing paths.

Use the A footage to challenge a uniform glowing disk and to investigate a
nonuniform annulus. Use identified **B / PW-600** references to set the nozzle
shape and swivel geometry. Do not discard the A observations, and do not make
their exact geometry the B's specification.

## References and their authority

| Reference | What it supplies | What it does not establish |
| --- | --- | --- |
| [User's supplied rear CAD-style image](../../validation/evidence/aircraft/f35b/engine-rebuild-2026-10-06/user-reference/PRATT-and-WHITNEY-Turbine-Jet-Engine-F135-F119-34.webp), [provenance](../../validation/evidence/aircraft/f35b/engine-rebuild-2026-10-06/user-reference/provenance.json) | Layered outer panels and an internal flow-path structure; useful illustration of the user's objection to isolated long wedges. Moved unchanged out of the repository root. | Its filename contains F135 and F119; original URL, actual variant, dimensions and rights were not supplied. It is a render, not an authenticated engineering drawing or photograph. |
| [TurboSquid listing 2503075](https://www.turbosquid.com/3d-models/3d-pratt-whitney-f135-turbofan-engine-metallic-rigged-2503075), [retained gallery and inventory](../../validation/evidence/aircraft/f35b/engine-rebuild-2026-10-06/turbosquid/README.md) | 23 public previews (21 stills and two turntable posters), with original URLs and hashes. The live page returned a CAPTCHA; additional images and full turntable frame sets remain unverified. | An artist's model is not measured F135 geometry. Public previews do not supply the paid mesh or a runtime asset license. Verify variant and proportions independently. Inventory states any access/completeness limits. |
| [P&W F135 page](https://www.prattwhitney.com/en/products/military-engines/f135) and [2017 engine facts](https://filecache.mediaroom.com/mr5mr_prattwhitney/177487/download/F135-engine-S16208.pdf) | Manufacturer context and variant-specific engine ratings. | A complete PW-600 engineering deck, thermal map or FADEC schedule. |
| [USMC-released Lockheed report, enclosure 25, printed p80 / PDF p32](https://www.hqmc.marines.mil/LinkClick.aspx?fileticket=7A2LJuIKWCg%3D&mid=155018&portalid=61&tabid=16139) | PW-600 augmented two-spool layout: three-stage fan, six-stage compressor, one-stage HP turbine, two-stage LP turbine. | Detailed visible flameholder geometry or eight thermal zones. |
| [Detailed observation ledger and source links](f35b-fdm.md#observations-hypotheses-and-unresolved-discrepancies-2026-10-06), [retained video research](../../validation/evidence/aircraft/f35b/engine-review-2026-10-06/research.json) | Timestamped appearances, original frame hashes, source-specific limitations and competing explanations. | Temperatures or flow velocities measured from video RGB. |

Do not use third-party preview renders as runtime textures. Build an original
asset from documented proportions and mechanisms, retaining uncertainty for
unmeasured detail. Keep every new engineering claim next to its source; mark
modeling choices separately.

## Observations → hypotheses → implementation tests

These hypotheses are permission to construct and test a better approximation,
not permission to describe an assumption as a measurement.

| Observed appearance or defect | Working hypothesis / alternative | Consequence and discriminator |
| --- | --- | --- |
| The user sees massive holes between current petals in AB, and petals that are too long and narrow at their aft ends. | The authored wedges and their independent hinge rotation lack suitable overlap/inner sealing surfaces, and may have incorrect B proportions. | Rebuild the layered nozzle and linkage. Sweep the entire opening range and conversion poses; require a continuous intended flow-path wall and no unintended line of sight through gaps to sky. Exterior panel seams can exist; they must not be mistaken for holes through the nozzle. Measure silhouette against B references. |
| The real rear-view F-35A develops a bright ring around a darker center; [0:50](https://www.youtube.com/watch?v=Cztrk6K0Klo&t=50s), [1:15](https://www.youtube.com/watch?v=Cztrk6K0Klo&t=75s), [1:32](https://www.youtube.com/watch?v=Cztrk6K0Klo&t=92s). | A spatially distributed reacting/emitting region and visible hardware could create an annulus. Exact gas/solid contributions are not identified. | Give the nozzle real depth and distinct internal regions. Separate angular/radial emission structure from material temperature. Compare rear and oblique views across power, rather than painting one opaque disk. |
| At 1:32 the user identifies **eight bright spots**. The [retained frame](../../validation/evidence/aircraft/f35b/engine-review-2026-10-06/frames/rear-92.png) confirms uneven annular brightness; independent count remains unresolved. | Eight lobes are a useful provisional pattern, not proof of eight injectors, eight solid temperatures or eight lights. | Keep any lobe count/contrast in engine profile data, label it provisional, and compare temporal sequences. Use a baked mask/volume distribution if warranted, not eight dynamic point lights. |
| Current interior looks dark at 99% and glows after AB. | One heavily cooled wall state may omit hotter visible hardware; geometry, emission attribution and display mapping can also be wrong. | Separate cold→99% from AB→99% tests. Read gas and each metal state. Cooling after AB is not evidence of no dry heating; visible dry behavior still needs to match reference conditions. Do not drive all incandescence with AB state. |
| A real test-cell plume is pink/violet: [12:40](https://www.youtube.com/watch?v=sahwo4JdVzs&t=760s), [13:30](https://www.youtube.com/watch?v=sahwo4JdVzs&t=810s), [13:40](https://www.youtube.com/watch?v=sahwo4JdVzs&t=820s). | Assumed soot/chemiluminescence weights and unknown camera response can change apparent hue. | Reject the previous categorical claim that real exhaust cannot look pink. Compare multiple views/conditions; do not replace universal orange with universal purple. |
| Navy footage shows red/orange external emission during powered lift: [2:38](https://www.youtube.com/watch?v=rIroDPghWF4&t=158s), ramp at [2:41](https://www.youtube.com/watch?v=rIroDPghWF4&t=161s), downward-nozzle close-up about [2:42.8](https://www.youtube.com/watch?v=rIroDPghWF4&t=162s). | Gas/particle emission, illuminated exhaust and hot hardware/reflection may contribute; exact proportions unknown. | This is an open sim discrepancy, not merely an internal-glow observation. Reproduce an externally luminous exhaust region and its scene interaction where the evidence supports it, without enabling AB solely to get light. |
| Landing footage has a nearly black background. | Exposure, white balance, tone mapping and clipping affect the image; a dark background does not identify the engine mode. | Compare the same physical state under day/night lighting with fixed exposure, then vary exposure separately. Record display settings; never infer a unique temperature from color or dismiss visible emission because camera metadata is absent. |
| The test video nozzle seems to close more than ours. | Wrong variant, endpoint geometry or native area schedule may explain it; static testing alone is not proven to explain it. | Distinguish throat A8, exit A9, actuator position and visual tip radius. Establish the reference variant and perspective, then compare closed/intermediate/open shapes and their native commands. |

The F-35B **does have afterburner** for conventional flight. The designer account
states it is not used in operational hover; a historical bent-nozzle AB ground
test is a different case. Keep that distinction, and label the current exact
transition inhibit threshold as an assumption. The night video does not supply
fuel-staging telemetry.

The main combustor is upstream of the turbines; afterburner heat is added
downstream ([NASA](https://www.grc.nasa.gov/www/k-12/airplane/turbab.html)). A bright
ring is not direct identification of the main combustion annulus or the fastest
flow. Flameholders can stabilize burning in recirculating wakes
([NASA/AIAA wake study](https://ntrs.nasa.gov/citations/19820051508)).

The [actual-mesh angular diagnostic](../../validation/evidence/aircraft/f35b/engine-rebuild-2026-10-06/geometry-report.json)
reproduces gaps using the production rig and exported triangles. At full opening,
sections 0.583 m and 0.708 m aft of the hinge plane have approximately 37.6° and
71.3° of uncovered circumference; the closed pose covers 360° there. The housing
does not extend to those sections. This establishes missing petal coverage,
independently of materials/lighting. It is not a complete connected-wall or gas
seal test, and intentional trailing-edge serrations must remain distinguishable
from unintended upstream holes. Reproduce with
`node scripts/validation/f35b/inspect-nozzle-gaps.mjs`; the
[receipt](../../validation/evidence/aircraft/f35b/engine-rebuild-2026-10-06/geometry-receipt.json)
and report retain algorithm tolerances, source hashes and scope.

## Asset architecture decision

Use **one authored source with semantic assemblies and two generated runtime
exports**, not two independently modeled engines and not a full engine silently
downloaded in every flight. This is a design recommendation based on the required
views and resource costs, not a benchmark result.

- **Full test-stand export:** complete external PW-600 main-engine form, inlet/fan
  face, casing, major visible accessories, augmentation duct, B swivel assembly
  and layered nozzle/interior. Model visible detail, not invisible every-stage
  internals unless an explicit cutaway feature is added. A LiftFan/roll-post
  system is a separately identified assembly, not a fake second core engine.
- **Installed export:** retain only geometry that can become visible through
  aircraft openings, from rear/oblique views and over the full conversion travel.
  Include needed internal occluders, lining and hot hardware. Test visibility in
  both conventional and converted poses before removing a part. Use the same
  source geometry, pivot definitions, material slots and animation curves.
- **Shared runtime contract:** engine/installation profile selects assets,
  attachment transforms, material-to-temperature bindings and nozzle observations.
  The full asset loads only in the test stand. A later inspector may enable
  semantic groups there, but `isVisible = false` alone is not a flight-memory or
  bandwidth optimization. Do not run transforms or effects for excluded groups.
- **LOD and cost:** follow this repository's increasing-detail LOD numbering.
  Geometry and texture resolution, sampling, visible lifetimes, instance limits
  and similar resource choices have named user parameters with units/reasons.
  Generate expensive geometry/optics offline, bind/calculate invariant data once,
  and update only changed visible state. No per-frame scene searches or new
  independent animation/render loop. Do not claim an energy win without a qualified
  measurement.

0sfs owns the asset generator, engine visuals, flight/test-stand composition and
instrumentation. JSBSim owns actual engine and thermal dynamics, persistent state
and the WASM SDK. FOSS Earth owns terrain, globe lighting/exposure, shared camera
and UI infrastructure. Aircraft/engine differences belong in data; a specialized
mechanism is acceptable when its physical structure requires it, but avoid
duplicating simulation/rendering code for each aircraft.

## Temperature and light contract

N1/N2 are shaft speeds, not metal temperatures. Start with two independent solid
regions **if the geometry and physics inputs support them**: hotter core-facing
hardware and cooled downstream liner/nozzle hardware. Add a third petal region
only when it has a distinct useful thermal/material model. These are reduced
models, not claims that the real engine has two or three uniform temperatures.

Maintain separate gas and solid temperatures. Each solid needs capacity, heat
transfer, cooling, radiative heat loss and initial/persistent state in its owning
native model. Visible spectral/material emission belongs in 0sfs's optical bake
and renderer; a bolometric heat-loss emissivity is not automatically its visible
spectral emissivity. Afterburner should heat the downstream stream/structures through that
model; it must not toggle all metal emission. Gas luminosity also depends on
emitting species, density and optical path. Fuel being kerosene/air does not
determine a unique visible spectrum from bulk temperature. The [NASA JP-8 study,
§4.1](https://ntrs.nasa.gov/citations/20140000730) supports CH/C2 emission bands and
soot continuum mechanisms, not our F135 mixture weights.

Retain offline spectral/material tables and cheap runtime interpolation. Split
physical radiance, spatial emission distribution and display exposure. Do not
invent a private render-time thermal integrator or use arbitrary N2-to-red ramps
as measured temperature. State uncertainty and compare hypotheses with the
reference observations while better measurements are unavailable.

## Current implementation the next agent must inspect

| Surface | Current behavior / issue |
| --- | --- |
| `src/flight/aircraft/aircraftCatalog.ts` | F-35B test stand selects only `vtol`. Declared exhaust attaches there; hot surface is `darkmet2`. No complete engine asset exists. |
| `src/flight/aircraft/aircraftAnimation.ts` | Sixteen authored `feather.*` objects rotate independently about local hinges over ~12.503°. Their taper defines the limits; this is not a measured PW-600 linkage. Existing single-parent vectoring matches commanded direction, not a reconstruction of all three bearing motions. |
| [Current aperture audit](../../validation/evidence/aircraft/f35b/nozzle-area-2026-10-05/source-geometry.json), [interior geometry audit](../../validation/evidence/aircraft/f35b/temperature-ui-audit-2026-10-06/geometry-report.json) | ~0.8054 m closed / 1.1635 m open free-tip diameter. ~2.087 circular-area proxy, not actual throat area. Nozzle subtree has 34 mesh primitives (also checked in `createAircraftModel.test.ts`); flat internal cap has only two triangles. |
| `createAircraftModel.ts`, `createAircraftEngineVisuals.ts` | Model preparation/reveal, engine-only filtering and effect lifetimes. Preserve their cancellation/readiness/disposal contracts when replacing the engine assembly. |
| `createEngineHotSurfaceGlow.ts`, `createEngineExhaust.ts`, `createEngineSmoke.ts` | Metal emission is already independent of AB state, follows native metal K, and uses a physical table plus display reference. Gas plume and smoke are separate effects. Shape/profile assumptions remain provisional. |
| `scripts/exhaustOptics/`, `scripts/build-exhaust-optics.mjs` | Offline gas/surface tables. Current visible gas mixture assumes 99.5→98.5% soot-continuum energy, explaining its warm bias; these are unmeasured weights. |
| `public/jsbsim-data/aircraft/F-35B-jsbsim/Engines/F135-PW-600.xml` | Trial thrust/fuel tables, strongly cooled single wall lump and generic turbine nozzle display schedule. Its 28,000/43,000 lbf ratings match published CTOL/CV classes, rather than the 2017 STOVL 27,000/41,000 classes. Audit coupled propulsion before retuning constants in isolation. |
| [Installed JSBSim contract](../jsbsim.md) | `1.2.4-fork.14`, native gas plus one solid temperature, simulation-time integration, warm/cold initialization, reset/recovery/persistence. Changing physical models requires native changes and normal tarball adoption, not an application patch. |
| `physics/safeFlightState.ts`, `hud/engineMonitorModel.ts`, `hud/engineHistory.ts`, catalogue temperature bindings | Recovery currently recognizes the single `thermal/metal-temperature-state-k` state; curated rows expose one gas and one metal temperature. Multi-zone native work must also extend snapshot/relocation recovery, plots/CSV and distinct material bindings. A second native wall by itself is insufficient. |
| [Dry99 diagnostic](../../validation/evidence/aircraft/f35b/thermal-model-2026-10-06/dry99-cycle/acceptance.json) | Simulated idle→99%→AB→99% metal equilibria: ~186.6→390.6→996.3→390.6°C. Dry metal radiance ~1.96e-5 cd/m² versus ~332.6 in AB. This explains current dark dry rendering but is **not real F135 calibration**. |
| `engineTestStand.ts`, `createFlightSimApp.ts`, `hud/engineHistory.ts` | Native stationary engine, isolated asset, ordinary controls, histories and CSV. Earth-backed MSP runway 35 placement and Location-tab relocation are described in the F-35B investigation and latest acceptance record. |

The prior [engine-history acceptance](../../validation/evidence/aircraft/f35b/engine-review-2026-10-06/acceptance.json)
passed 1,791 tests plus an existing expected gear-envelope failure. It established
software behavior, not visual realism or device performance. Check current files
and current receipts rather than treating a historical pass as validation of new
geometry.

The [Earth-backed stand and handoff acceptance](../../validation/evidence/aircraft/f35b/engine-rebuild-2026-10-06/acceptance.json)
passed full CI: 166 files, 1,795 tests and the same expected gear failure. Native
tests retain a stopped/hot engine through runway relocation and subsequent
physics steps; app tests exercise normal terrain startup and the Location tab.
No replacement geometry, new thermal model or flight-app GPU qualification was
introduced. The current stand still shows the isolated old nozzle pending rebuild.

## Required acceptance for the rebuild

1. Reproducible source/generator, dimensions with provenance and uncertainties,
   full/installed exports, runtime notices and hashes. Remove old active nozzle
   parts without changing unrelated airframe, gear or controls.
2. Geometric coverage tests on the actual exported meshes across closed,
   intermediate and fully open aperture plus conversion/yaw travel: valid normals,
   overlap/seals, no unintended holes, no gross self-intersection, correct
   attachment/axis and no airframe clipping. Outer seams alone must not fail a
   test for a sealed inner flow path. Record tolerances and why they are chosen.
3. Full and installed variants share the same visible nozzle silhouette/material
   contract and exhaust origin at equivalent poses. A flight resource inventory
   demonstrates that stand-only geometry/textures are neither loaded nor drawn.
4. Fixed-step engine traces: cold start→idle→99% dry→AB→99%→shutdown/cooling,
   pause, reset/recovery, relocation, and powered lift without AB. Plot gas and
   each metal state, augmentation, fuel, N1/N2 and nozzle observations together.
   Native state must not advance on render-only frames or paused/zero-time calls.
5. Matched rear/oblique reference comparisons with declared variant, pose, power
   evidence and day/night/exposure settings. Evaluate annulus/center contrast,
   petal proportions, apparent aperture and external powered-lift luminosity.
   Separate verified matches from provisional visual fitting. GPU/browser checks
   run only when requested under AGENTS.md; do not claim them from NullEngine tests.
6. Earth-backed test stand opens at MSP runway 35, follows Location-tab relocation
   while stationary and leaves the saved flight intact. Full engine is available
   there; aircraft mode uses the installed export. Controls/plots remain usable.
7. Run related checks then full CI once as required. Retain logs and representative
   results in validation/evidence, with source/artifact identities. Fix engine
   defects upstream in their owner; do not alter unrelated concurrent dirty work.

## Other conversation work and scope

The engine rebuild must preserve the existing sound controls/native telemetry,
AB HUD indication, automatic flaps, VTOL controls, experimental FBW, forces
overlay and gear fixes. Their status and caveats are in [F-35B documentation](f35b-fdm.md),
[sound specification](../sound.md), [audio implementation ledger](../validation/audio-implementation-ledger.md)
and [flight settings](flight-settings.md). No acoustic tier is device-qualified.
The F135 and Vision Jet FJ33 have separate engine profiles sharing approximate
renderer code; no per-aircraft duplicate engine simulator is requested.

Customizable flight instruments/world-space attitude/prograde cues remain a
[separate deferred TODO](flight-settings.md#todo-custom-flight-instruments-and-world-space-cues).
Gear-bay containment and its expected failure remain in the
[gear follow-up](f35b-fdm.md#deferred-aircraft-work-requested-2026-10-05).
Ground collisions are another agent's work. Existing evidence records, original
source assets and files under build must not be deleted as part of this rebuild.
