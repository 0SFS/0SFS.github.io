# F-35B flight model

Date: 2026-10-05. Status: experimental playable integration. The F-35B is
selectable with the AF267 mesh and a modified FlightGear JSBSim model. Functional
airborne, control, conversion and retraction checks pass; aircraft performance
and operational hover/transition behavior remain uncalibrated. Ground collisions
belong to the separate ground work.

## Current implementation and checks

Select Aircraft → Lockheed Martin F-35B Lightning II → Apply. Auto loads the
converted source mesh. The development start uses 300 kt, 48% throttle, gear up,
5,000 lb fuel, 1.92° pitch and -0.059 pitch trim. Saved Start settings override
profile defaults. The input owner adopts initialized trim before its first step.
The VTOL lever beside THR provides the pilot conversion command, displayed from
0 to 100%. Its command is also recorded under Controls → F-35B STOVL → Show all parameters;
the regular Controls panel has no second conversion slider.
Gear, surfaces, lift-system doors and nozzle follow physical FDM observations;
the model includes a geometry-based cockpit camera.

### External fuel tanks

Fuel → Left external / Right external provides **Jettison** and **Respawn empty**
for each tank. Both tank/pylon assemblies start attached and empty; the two
internal tanks start with 2,500 lb each. Each external tank adds 2,991 lb of fuel
capacity. Jettison removes the assembly's remaining fuel and dry mass, disables
its feed and removes its modeled drag. Respawn attaches an empty replacement;
the Fuel sliders fill it. These are simulator loadout controls and permit
replacement in flight as well as on the ground.

[Lockheed Martin's 2023 F-35B product card](https://www.f35.com/content/dam/lockheed-martin/aero/f35/documents/F-35B%20Product%20Card.pdf)
publishes 13,100 lb internal fuel capacity, represented here by two 6,550 lb
lumped tanks. With both external tanks installed, total capacity is 19,082 lb.
The panel shows internal and attached external capacity separately and excludes
a released tank from the total and distribution slider. Its detached gauge
cannot be filled. Attachment changes invalidate a total-slider drag's old fuel
split so it cannot refill a released tank.

The visible equipment uses retained FlightGear tank and inner-pylon geometry.
Both sides sit 3.25 m from the centerline; fuel and equipment mass use the same
mount locations as their visuals. The source geometry and inherited external
capacity do not establish a real F-35B approved loadout. The 300 lb combined dry
mass and 1 ft² equivalent drag area per assembly are development assumptions.
The tank and pylon are released together. Internal grouping, external fuel
plumbing and aerodynamic interference remain simplified and uncalibrated.

Released assemblies retain the aircraft's ground-relative velocity and fall
under gravity in ECEF coordinates, so floating-origin changes do not carry them
with the aircraft. Only accepted simulation steps advance their motion; pausing
or a physics hold freezes them. Renderer → Released fuel tanks controls their
visible lifetime and the number retained. Repeated releases replace the prior
released mesh for that station. Relocation clears released visuals; restarting
starts a fresh default loadout. Released objects are a bounded ballistic visual,
not persistent terrain-colliding debris or a second JSBSim vehicle.

Attachment and fuel survive recovery, relocation and saved sessions. Older
saves without attachment flags use the attached defaults; internal quantities
are clamped to the current capacity. Meshes are prepared hidden and shown only
when ready, with the latest attachment state applied. Historical flight evidence
retains its recorded configuration; clean-aircraft handling regressions explicitly
remove the external assemblies before measuring their original fixtures.

The [retained fit inspection](../../validation/evidence/aircraft/f35b/external-tanks/README.md)
includes three CPU-rendered views of the distributed meshes. The reproducible
asset conversion is `node scripts/build-external-tank-model.mjs --install`;
source, license and conversion hashes accompany the published GLB. Regression
tests cover its actual geometry, hidden preparation, release motion, paused
rebasing, resource limits, fuel accounting and attachment persistence.

### Nozzle aperture and afterburner indication

The real F-35B has separate mechanisms for nozzle area and thrust direction.
Its compact convergent/divergent nozzle uses moving flaps; the three-bearing
swivel duct changes where it points. [Moog's engine-controls datasheet](https://www.moog.com/content/dam/moog/literature/Aircraft/acc/Moog-ACC-Engine-Controls-Datasheet-1.pdf)
identifies its F-35B fueldraulic swivel-duct and convergent-nozzle actuation.
Increasing area accommodates hotter afterburning flow, as explained by
[NASA](https://www.grc.nasa.gov/www/k-12/airplane/tunmodnoz.html).
[Lockheed's engineering account](https://www.codeonemagazine.com/article.html?item_id=137)
distinguishes the compact nozzle flaps from the swivel assembly and states that
the F-35B does not use afterburner in hover. Public sources consulted do not
establish its complete proprietary area schedule or conversion interlock logic.

The asset's 16 separate `feather.*` meshes now rotate about their own hinges,
under the existing swivelling parent. JSBSim's read-only
`propulsion/engine[0]/nozzle-pos-norm` supplies normalized display position.
The authored taper and an approximately axis-parallel open pose define the
visual endpoints; they are not measured F135 travel limits. JSBSim's generic
turbine display schedule opens at idle/off and in augmentation and contracts
with dry spool speed. This is mechanical visual feedback, not a calibrated
F135 nozzle-area, shaft-power or thrust model. Missing observations preserve
the authored/last known pose, and paused physics creates no extra animation.

THR replaces `%` with `🔥` and uses the aircraft's declared accent only while
the native read-only `augmentation` observer reports active. Throttle demand,
sound settings and nozzle opening are not substitutes for that observation.
The app resolves a non-creating property batch once per loaded model, reads it
once per view update for both the rig and HUD, and disposes it with the model.
Aircraft metadata selects the relevant engine indices and color; HUD code has
no F-35-specific condition. The text alternative says “afterburner active.”

The F-35B's provisional HUD accent is warm orange (`#ff9450`), sampled offline
from the same assumed emission spectrum used by the plume. A soot-dominated
visible-energy mixture is the declared warm reference, informed qualitatively
by [this 56th Fighter Wing daylight afterburner photograph](https://www.dvidshub.net/image/9578175/us-marine-corps-f-35b-performs-during-luke-days-2026).
This is a calculated approximation with assumed inputs, not a measured F135
spectrum or a unique prediction from the current FDM. [Lockheed's BF-17 night-AB
image](https://www.codeonemagazine.com/images/media/2015_F35B_AB_15J00016_024_1267828237_3075.jpg)
also shows a pale blue/white plume with a violet tint near the nozzle. Neither
photo proves a universal engine hue. The user supplied
[this video](https://www.youtube.com/watch?v=1DqymFoxolE) as a further reference;
its frames could not be fetched during this research and are not claimed as
inspected evidence.

Visible color can be calculated from spectral radiance, but our current
telemetry is insufficient. `FGTurbine::Run` computes a generic EGT surrogate
from ambient temperature and spool speed before its augmentation branches;
it supplies no spatial afterburning-plume chemistry or radiance. Temperature
alone does not establish a hydrocarbon flame's spectrum: [NASA's flame
measurements](https://ntrs.nasa.gov/citations/20160010264) document visible
chemiluminescence from electronically excited CH. [NASA's NEQAIR description](https://software.nasa.gov/software/ARC-15262-1B)
illustrates spectral emission/absorption integration through nonuniform gas;
it is a reference for the method, not an adopted F135 plume solver.

The implemented exhaust renderer uses a reusable baked optical/volume model;
further physical qualification needs engine-specific data: spatial temperature,
pressure, species and excited
populations, soot properties, mixing/shock structure, and optical path. Integrate
visible radiance, convert with [CIE color-matching functions](https://cie.co.at/datatable/cie-1931-colour-matching-functions-2-degree-observer),
then apply documented exposure/display mapping. Prefer offline spectral tables
and a bounded runtime lookup when practical. Identify assumed or fitted inputs;
public F135 material found so far does not provide the dataset needed to claim
a calibrated result. Keep video/photo comparisons as validation with known
capture conditions. Do not substitute a blackbody temperature-to-RGB lookup
or infer afterburner from visible glow.

### Baked exhaust renderer

Owner: 0sfs, because these are aircraft-engine observations and attached
visuals. `createEngineExhaust` is a shared renderer; aircraft metadata declares
the engine index, observed power/flow paths, optical profile, attachment and
dimensions. F-35B data attach it to the moving `vtol` nozzle. A future engine
can supply another profile and installation without another aircraft branch
inside the renderer.

The offline bake combines a Planck continuum with approximate visible CH*/C2*
bands and converts spectral radiance through the CIE 1931 observer. [NASA's
actual JP-8/FT combustor study](https://ntrs.nasa.gov/citations/20140000730)
supports those emission mechanisms; it does not provide F135 component ratios.
The configured soot fraction is a fraction of visible radiant energy over the
integration window, not soot concentration or a fuel mass fraction. Defaults
are deliberately recorded as assumptions, including temperature, spectral
mixture, plume length and brightness. The source data, their license, model
inputs and hashes are retained with the generated asset. The visible-gas
model does not simulate real engine chemistry, clutch/shaft dynamics or thrust.

`npm run build:exhaust` regenerates the optical lookup and metadata.
`npm run verify:exhaust`, also run by the production build, detects stale
outputs. The shared profile provides both the texture and HUD accent. This
avoids a separately chosen flame color in the UI.

The GPU samples a 64 × 32 linear-RGBA texture through one 12-triangle bounding
volume. Dry and afterburner rows are separate, selected by native augmentation;
the dry bank is a faint thermal approximation with no afterburner shock pattern.
Native fuel flow and power observations gate burning, native nozzle position
sets radius, and the parent supplies physical nozzle pitch/yaw. Missing required
observations suppress the plume. No exhaust code writes flight properties.
The light volume has no CPU particle simulation or runtime wavelength integration.
Optional smoke uses a separate bounded billboard batch, described below.

Renderer → Aircraft exhaust is the single settings home:

| Setting | Default | Bounds | Purpose |
| --- | --- | --- | --- |
| Aircraft exhaust | On | On/off | Off releases rendering resources |
| Exhaust samples | 8 samples/pixel | 4–32 | Bounded GPU work through the volume |
| Exhaust draw distance | 2,000 m | 1–20,000 m | Skip distant plumes |
| Exhaust brightness | 1× | 0–8× | Relative optical gain, not engine power |
| Aircraft smoke | On | On/off | Optional faint aerosol; off releases its resources |
| Smoke particles | 64 particles/engine | 0–512 | Fixed maximum trail pool and instance budget |
| Smoke emission | 8 particles/s | 0–128 | Native-time birth rate |
| Smoke lifetime | 2 s | 0.1–10 s | Native-time retention and dissipation |
| Smoke draw distance | 1,000 m | 1–20,000 m | Clear and suppress distant trails |
| Smoke opacity | 2.5% | 0–100% | Artistic aerosol alpha |

These are software cost bounds, not a device performance qualification. The
renderer draws emitted light and optionally sparse aerosol sprites. Scene-color
heat refraction, aerodynamic wake advection, ground illumination and a calibrated
F135 optical dataset remain follow-up work. Those effects need their own explicit
resource budgets.

#### Dry hardware glow and bounded smoke (2026-10-05)

A hot dry engine need not look completely dark. [NASA's thermography practice](https://extapps.ksc.nasa.gov/Reliability/Documents/Preferred_Practices/at9.pdf)
explains thermal emission from heated surfaces and its extension into visible
red at sufficiently high temperatures. Afterburner is a separate process:
[NASA's engine history](https://www.nasa.gov/special-projects-laboratory-turbojet-enhancements/)
describes additional fuel burning between the turbine and nozzle. These sources
support separate hardware glow and augmented gas flame; they do not supply F135
surface temperature or display radiance.

The authored F-35B `vtol` mesh has an inner conical liner/rear disk using `darkmet2`.
That material is also shared by fuselage and gear parts. The installation names
only matching materials beneath its declared nozzle attachment; the renderer
clones those PBR bindings, preserves their geometry/shading and restores them on
disposal. It prepares clones hidden before committing them with the plume.
No dry tail is brightened and the existing afterburner LUT/shock appearance stays
unchanged. Other engine installations can declare their own liner materials.

A separate offline thermal table uses an assumed 900–1,400 K Planck continuum,
converted through the same CIE observer into warm linear RGB. Native normalized
power interpolates its relative display emission; this is neither measured
hardware temperature nor a thermal-inertia model. Missing/cutoff observations
remove the display glow. This approximation represents hot visible hardware,
not an afterburner flame or combustion throughout the tailpipe.

`createEngineSmoke` renders one static two-triangle quad as a thin-instance batch,
with a fixed user-bounded pool and one 128 × 128, sixteen-frame procedural alpha
flipbook. `node scripts/build-engine-smoke.mjs --install` reproduces the sprite and
its adjacent source/assumption manifest; `--check` detects stale outputs. The
existing `build:exhaust` / `verify:exhaust` commands also install/check this sprite.
The sprite is original procedural artwork. The F135 installation defaults to very
faint, unqualified aerosol appearance rather than a measured soot rate or
contrail. Radius growth and simple ambient-frame drift are explicit artistic
profile values; there is no wind, buoyancy, chemistry or CFD.

Birth coordinates, drift and history stay in Float64 ECEF storage. A lazily cached
Float64 ENU/origin frame projects each active particle into small current-scene
coordinates before GPU Float32 upload, including when the origin translates or
rotates. The native clock owns births and ages, so pause holds them exactly.
Relocation/reset, backwards or excessive time jumps clear history. Missing
frames/required observations suppress emission; already emitted aerosol can
dissipate after a normal engine cutoff. Model replacement/disposal cancels hidden
preparation and releases the batch, texture and materials. No smoke code writes
flight properties or spawns an independent render loop.

[NVIDIA's authored smoke example](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-6-fire-vulcan-demo)
supports precomputed animated sprites and alpha blending. Its [screen-particle
chapter](https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-23-high-speed-screen-particles)
identifies overdraw/fill cost and discusses reduced-resolution rendering, including
overhead that can outweigh savings at low coverage. Sparse billboards therefore
serve this small trail first. A lower-resolution particle pass or GPU particle
simulation would need measurements and a separate budget before adoption; neither
has an established energy advantage here.

KSP1's documented mod ecosystem supplies two useful examples:
[Waterfall](https://github.com/KSPModStewards/Waterfall) implements mesh-driven engine
effects, while [SmokeScreen](https://github.com/sarbian/SmokeScreen) extends the
particle-emitter approach for smoke. Those primary repositories describe mods,
not proof of stock KSP1 or KSP2's smoke implementation. The inspected official
[KSP2 post](https://store.steampowered.com/news/posts/?appids=954850&enddate=1687548001&feed=steam_community_announcements)
discusses point-light/shadow choices for launch exhaust, without
establishing its smoke algorithm. KSP2's precise smoke technique remains unresolved.

The retained [exhaust acceptance record](../../validation/evidence/aircraft/f35b/exhaust-2026-10-05/acceptance.json)
records earlier plume qualification. The dry-glow/smoke follow-up passed fifty
focused software cases, including native-time pause, bounded births, Earth-radius
translation/rotation and hot-material ownership/readiness; incremental typecheck
and lint also pass; the [software follow-up and retained logs](../../validation/evidence/aircraft/f35b/exhaust-2026-10-05/glow-smoke-software.json)
record the separate pass/failure-correction runs and artifact hashes. The
[GPU follow-up](../../validation/evidence/aircraft/f35b/exhaust-smoke-gpu-2026-10-05/acceptance.json)
checks actual WebGL2/WebGPU rendering, pause, one smoke draw per engine, and
trail projection through translated and rotated world frames. The
[combined acceptance record](../../validation/evidence/aircraft/f35b/final-acceptance-2026-10-05/acceptance.json)
links the final application CI and shared-owner checks. These checks do not
measure energy use or calibrate the assumed optical inputs.

### Aircraft control law

Aircraft → Flight controls → Aircraft control law selects Auto, Manual or
Fly-by-wire. Auto resolves to the F-35B's experimental native FBW law. Manual
bypasses aircraft stabilization while retaining actuator limits, trim and
conversion; external input/auto-trim assists and autopilot remain separately
configured. The setting shows the observed active law and survives relocation,
runway presets and snapshot recovery. This is a simulator option, not a claim
about a real F-35 cockpit selector.

The 2026-10-05 yaw regression reproduced conventional-flight actuator hunting
at 450/600 kt after yaw disturbances or rudder release, with zero subsequent
pilot yaw command. The source's constant feedback gain fought the rudder's
rate/lag limits. A dynamic-pressure schedule removes the reproduced hunting;
the check samples at the full 120 Hz physics rate. Perfect neutral starts did
not self-excite in the tested cases. See the
[retained yaw and control-law evidence](../../validation/evidence/aircraft/f35b/yaw-2026-10-05/README.md)
for failing/passing comparisons, 17 native yaw/mode cases and the retained
12 conventional/hover regressions. These are prototype stability checks, not
real-aircraft control-law calibration or transition-envelope qualification.

The [runtime FDM notice](../../public/jsbsim-data/aircraft/F-35B-jsbsim/NOTICE.md)
and [source manifest](../../public/jsbsim-data/aircraft/F-35B-jsbsim/source-manifest.json)
record the dated modifications and source/current hashes. JSBSim FCS XML owns
conversion slew, thrust allocation, attitude damping and nozzle direction.
Its physical lever moves over 2.5 s for a full stroke. No host code imposes a
hover pose. Auxiliary thrust follows the actual main-nozzle upward native body
force and reaches zero on retraction or main shutdown. Fan allocation uses current
longitudinal arms about CG; differential roll posts retain their capacity ratio.
Native auxiliary carriers have no separate spool lag or second conversion gate.
Retained atmospheric tables bound capacity. Fuel accounting uses the main engine
with an approximate conversion correction; the auxiliary turbine instances are
force surrogates with no separate fuel use.

The [retained lift-allocation comparison](../../validation/evidence/aircraft/f35b/lift-allocation-2026-10-05/README.md)
records 70 cases per plant, including 0/25/50/75/100% conversion at three speeds
and powers. It fixes a reproduced intermediate-conversion pitch imbalance without
changing control gains. Low power cannot support the declared weight; the mixed
aero/thrust authority, shaft/clutch work and transition envelope remain unvalidated.
The model requires native cached force observations from SDK fork.10 or newer;
fork.11 separately repairs already-stopped zero-time turbine thrust.
Trailing-edge Auto flaps default enabled independently of Manual/FBW selection.

The source force arms could not balance enough lift at the retained CG and
coarse published capacities. The development model instead uses the inspected
fan center and nozzle exit, preserving the source CG, inertias and aerodynamics.
Those positions and the assumed nose datum remain unverified. Geometry scaling,
part origins and the CG alignment are recorded in
[export.json](../../validation/evidence/aircraft/f35b/export.json).

| Functional check | Evidence and boundary |
| --- | --- |
| Actual app bootstrap, terrain relocation, trim adoption and controls | [12 installed-SDK tests](../../validation/evidence/aircraft/f35b/installed-sdk-acceptance.json): 60 s conventional flight with trim assist on/off; control signs, conversion rate, partial-conversion recovery and retraction |
| Zero-speed converted forces and attitude | Native vertical force exceeds 35,000 lbf; finite state and pitch/roll each below 0.1 rad for 60 s at the explicit development loading. At 98% throttle this fixture climbs; it is not hover hold. |
| Actual WASM, mesh, renderer, input and rig | [Browser acceptance](../../validation/evidence/aircraft/f35b/playable-headless.json): 102 parts, 12,259 triangles, 120 Hz, conventional flight, axis commands, keyboard gear, conversion and force-free retraction; normal Chrome exit |

The browser check is a standalone Babylon aircraft scene, with local request
fulfillment and no server. It does not qualify the full globe app, ground
handling or audio. The source aerodynamic model, CG, inertias, propulsion,
shaft/clutch/bypass behavior, transition envelope, disturbances, fuel use and
supersonic performance still need calibration. Pilot instructions and
reproduction commands are in [the aircraft README](../../planes/Lockheed_Martin_F-35B/README.md).

One variant-specific discrepancy remains in the inherited
[`Engines/F135-PW-600.xml`](../../public/jsbsim-data/aircraft/F-35B-jsbsim/Engines/F135-PW-600.xml):
`milthrust` is 28,000 lbf and `maxthrust` is 43,000 lbf. Pratt & Whitney's
2017 F135 product card assigns those intermediate/maximum thrust classes to
CTOL/CV, and lists 27,000/41,000 lbf for STOVL. The installed values therefore
match the CTOL/CV classes despite the file's `F135-PW-600` name. The sound
definition's 28,000 lbf dry-thrust reference deliberately follows this
installed trial FDM; it is not an OEM rating for the STOVL variant. Rated
thrust is not acoustic amplitude, so this discrepancy does not explain the
reported sound-scale difference. [Pratt & Whitney F135 product facts,
Engine Characteristics](https://filecache.mediaroom.com/mr5mr_prattwhitney/177487/download/F135-engine-S16208.pdf)
provides the primary variant distinction.

Follow-up acceptance item: calibrate the STOVL propulsion variant against its
published thrust classes and stated reference conditions, then check main
engine thrust, shaft-power extraction, fan/nozzle/roll-post force balance,
fuel use and conversion together. Retain model/profile hashes and repeatable
native fixtures with explicit mass, fuel, atmosphere, altitude and Mach before
accepting that calibration. Changing two rating constants alone does not
qualify the coupled prototype; no FDM or sound retuning is made for this note.

## Recommendation

The integration uses FlightGear's existing **F-35B JSBSim variant** as an
experimental starting point, with the separately acquired Sketchfab model.
JSBSim remains the backend. Conventional flight was checked before adding
conversion and basic airborne lift-system controls. This avoids a new backend
and uses the packaged JSBSim WASM without an engine rebuild.

That evidence makes the model a candidate to develop, not an accurate F-35B.
The XML declares `release="TRIAL"`, dates its creation to 2011-10-15, and credits
F-GTUX with a derivation from Erik Hofman's F-16 and Aeromatic. FlightGear's
JSBSim entry gives its own FDM a rating of 1, whereas the primary YASim entry
gives that FDM 4. The package-level rating copied into the catalogue should not
be mistaken for the JSBSim variant's rating. [The source variant](https://github.com/FGMEMBERS/F-35B/blob/2726b3bdf3c7c54ea09a5d4a248e86a739604ca7/F-35B-jsbsim-set.xml)
and [the source XML](https://github.com/FGMEMBERS/F-35B/blob/2726b3bdf3c7c54ea09a5d4a248e86a739604ca7/F-35B-jsbsim.xml)
record those limitations.

The Sketchfab model is an exterior asset. Its description saying it appears
in GeoFS does not provide a flight model or permission to copy GeoFS's physics.
No independently licensed, portable F-35B GeoFS FDM was established in this
research. There is consequently no verified GeoFS import path to prefer over
the available JSBSim XML. [The supplied model page](https://sketchfab.com/3d-models/lockheed-martin-f-35b-lightning-ii-5d54a6af45974ad386ae74d42b33374a)
is a separate source from FlightGear's aircraft package.

## Source and licence

The FlightGear source package inspected on 2026-10-05 was
[F-35B.zip from the official FGAddon catalogue distribution](https://fgaddon.b-cdn.net/Aircraft-trunk/F-35B.zip).
Its identity matches the retained 2026-09-19 inventory:

| Field | Value |
| --- | --- |
| Aircraft package / JSBSim variant | `F-35B-yasim` / `F-35B-jsbsim` |
| FGAddon revision | `15340` |
| Archive size | 10,618,616 bytes |
| SHA-256 | `caf3c591c838148ccdeec8fc61a23fd09f17574aeb36e0071e84a132dd25ebd6` |
| MD5 recorded by the inventory | `7d8225e9c41f456d7fbb705064bb0274` |
| Package authors | Petar Jedvaj, Detlef Faber, F-GTUX, Stuart Cassie and Gary Brown |
| FDM dependency closure | Aircraft XML, three engine XML files, `direct.xml`, `Systems/pushback.xml` |

The [retained source record](../../validation/evidence/aircraft/f35b/source-record.json)
preserves the original inventory provenance alongside the archive hash and
the source wiring observation; the private scratch directory is not evidence
readers need to access.

The [retained FDM candidate](../../planes/Lockheed_Martin_F-35B/tests/flightgear-jsbsim/README.md)
contains the original six-file JSBSim closure, variant entry point, both fan
mixers, and package licence, with per-file hashes and original archive paths.
These source bytes remain unchanged; a separately modified copy is installed
in the app's runtime data with its own change notice and hashes.

[FGAddon's revision 15340](https://sourceforge.net/p/flightgear/fgaddon/15340/)
records texture colour-profile fixes on 2025-08-28. The official archive URL
is mutable; pin the archive hash as well as the revision when adopting it.
The [FGMEMBERS mirror](https://github.com/FGMEMBERS/F-35B/tree/2726b3bdf3c7c54ea09a5d4a248e86a739604ca7)
was also inspected at commit `2726b3bdf3c7c54ea09a5d4a248e86a739604ca7`
(2025-07-10). Its pinned source links are useful for review, but that mirror
commit is not the identity of the official archive.

The package's `License.txt` contains GPLv3, and the FDM's file header explicitly
names GPL. Retain the package licence, credits, unmodified source, and dated
change notices with any adopted FDM or translated Nasal code.
[The package licence](https://github.com/FGMEMBERS/F-35B/blob/2726b3bdf3c7c54ea09a5d4a248e86a739604ca7/License.txt)
is independent of the Sketchfab exterior's **CC BY 4.0** licence. Keep its
creator attribution and mesh modification notices separate from the FDM's
GPL source and licence notices. 0SFS's
`package.json` declares `AGPL-3.0-only`; GPLv3 and AGPLv3 explicitly allow
combining their covered code, while preserving each part's applicable terms.
This removes the GPLv2-only version issue for this package; it does not remove
the need to carry its provenance and source. [AGPLv3 section 13](https://www.gnu.org/licenses/agpl-3.0.html#section13)
describes that combination.

## What was already measured

The [F-35B result extracted unchanged](../../validation/evidence/aircraft/f35b/prior-flightgear-smoke.json)
from the retained [2026-09-19 smoke run](../../validation/evidence/aircraft/flightgear-inventory-2026-09-19/smoke-flightgear.json)
records the following for `F-35B-jsbsim`. This is an earlier run, not a new
validation of the current app or SDK:

| Observation | Result |
| --- | --- |
| Model load | Passed, with eight external properties created by the generic FlightGear stand-in |
| Engine count | Four |
| Conventional flight start | 120 kt |
| Reported thrust | 40,492 lbf |
| Flight trim | Not achieved |
| Thirty-second flight smoke criterion | Passed |
| Maximum altitude error | 804 ft |
| Speed change | 3 kt |
| Maximum roll | 0 degrees |

The smoke pilot held level flight approximately. The large altitude excursion
and absence of trim are explicit limits. These results do not validate
handling, performance, fuel use, supersonic flight, conversion or hover.
The reported engine count also does not mean the real F-35B has four independent
engines: the XML represents the main engine, lift fan and two roll posts using
four turbine engine instances. The survey method and generic property shim are
explained in [adding aircraft from FlightGear](../flightgear-aircraft.md).

## STOVL is partly outside the XML

The aircraft XML positions a main F135 thruster aft, a vertical lift-fan
thruster forward, and two vertical roll-post thrusters to either side. It reads
ordinary `fcs/*-cmd-norm` flight controls. It additionally expects
`fcs/throttle1`, `fcs/throttle2`, and `fcs/throttle3` for the auxiliary thrust
channels. The lift fan and roll posts use generic turbine spool and fuel
models, rather than shaft power and bypass flow shared with one main engine.

[`Nasal/fan-jsbsim.nas`](https://github.com/FGMEMBERS/F-35B/blob/2726b3bdf3c7c54ea09a5d4a248e86a739604ca7/Nasal/fan-jsbsim.nas)
supplies the missing hover behavior: it reads throttle, a mixture control
repurposed as conversion position, elevator position, filtered rudder, and
aileron input. It distributes the three auxiliary throttle commands, rotates
the main nozzle in pitch and yaw, controls augmentation, and enables a
fly-by-wire override during conversion. It runs from an elevator-position
listener. That listener timing should become a defined fixed-step update if
the equations are brought into 0SFS.

There is a concrete source wiring problem: the official archive's
`F-35B-jsbsim-set.xml` loads **`fan-yasim.nas`**, despite also containing
`fan-jsbsim.nas`. The former writes YASim's fan and flap properties rather than
the JSBSim auxiliary throttle and nozzle properties. Thus copying the JSBSim
XML alone, or assuming the variant's existing Nasal include is correct, does
not establish working STOVL. The 2026-09-19 smoke test did not execute either
Nasal file.

The real system couples a shaft-driven lift fan, clutch and driveshaft, a
swivelling main nozzle, and bypass-fed wing roll posts. Rolls-Royce publishes
approximate capacities of more than 20,000 lbf at the lift fan, 18,000 lbf at
the main nozzle, and 1,950 lbf per roll post; the nozzle traverses 95 degrees
in 2.5 seconds. Those numbers provide coarse checks, not an aircraft control
law or a complete FDM. [Rolls-Royce's system description](https://www.rolls-royce.com/media/press-releases-archive/yr-2008/231208-liftsystem-delivery.aspx)
supports those checks. The current native force carriers and FCS allocation
remain experimental; they do not implement calibrated shaft/clutch or bypass
flow sharing. The original independent turbine/Nasal implementation is retained
as source evidence rather than used as a control-law authority.

## Original implementation stages

The stages below motivated the integration above. They remain useful boundaries
for further calibration; their acceptance scope should not be read as a claim
that aircraft fidelity or the full conversion envelope has been established.

1. **Retain the candidate, then test conventional flight.** Keep the selected
   source closure and provenance together. Add an F-35B package to
   `public/jsbsim-data/`, its manifest entry, aircraft ID/catalogue entry and
   `FdmProfile`. Explicitly initialize auxiliary commands to zero, keep the
   nozzle forward and the fan doors closed, and start the main engine in a
   known state. Verify the required external property defaults, trim, thrust,
   control signs and finite trajectories with the installed SDK. Display
   "experimental flight model" with the aircraft. Do not call this STOVL.
2. **Implement conversion and hover in the FDM/control layer.** Prefer JSBSim
   system XML for propulsion allocation and control laws; use 0SFS only for
   the pilot command, state display and exterior animation. A direct
   fixed-step translation of the Nasal mixer can first reproduce the source
   behavior, but it needs its own qualification. Give conversion a named
   parameter and physical nozzle/door state, enforce actuator rates and
   defined augmentation behavior, and avoid treating the piston mixture
   setting as the user-facing conversion control. Share available thrust and
   fuel accounting consistently across the fan, nozzle and roll posts.
3. **Qualify airborne STOVL independently.** Check sustained hover at explicit
   mass, fuel, atmosphere and altitude; pitch/roll/yaw control authority;
   conversion in both directions; engine response; and stable handling under
   disturbances. The host should observe the same force-driven trajectory
   rather than imposing a synthetic hover position. Ground contact and
   landing collision checks are outside this proposal.

The app resolves the F-35B's separate JSBSim data closure. Its profile and
bootstrap supply model-local dependencies, initial controls and trim. The
physics control boundary now supports an optional STOVL lever, while the
observations expose physical conversion and nozzle angles. See
[`fdmProfiles.ts`](../../src/flight/jsbsim/fdmProfiles.ts),
[`bootstrapC172.ts`](../../src/flight/jsbsim/bootstrapC172.ts), and
[`flightModelDriver.ts`](../../src/flight/model/flightModelDriver.ts).

## Why defer YASim

YASim would make FlightGear's higher-rated F-35B variant available, but it
requires another WASM build, SDK lifecycle, XML/property adapter and flight
observation implementation. The standalone `yasim` target already exists, so
this does not require porting all of FlightGear; it does still link
`SimGearCore`, and `FGFDM` parses aircraft XML and binds SimGear properties.
[The build target](https://github.com/FlightGear/flightgear/blob/next/src/FDM/YASim/CMakeLists.txt)
and [the integration class](https://github.com/FlightGear/flightgear/blob/next/src/FDM/YASim/FGFDM.hpp)
show that boundary. This aircraft also depends on `fan-yasim.nas` for fan
mixing, so a YASim backend alone would not import its complete behavior.

Revisit YASim when access to its wider aircraft fleet is the objective, or if
the JSBSim candidate proves more expensive to make usable than that backend
work. For this aircraft, continue calibrating the integrated JSBSim model and
measure what remains before taking on a second engine.

## Deferred aircraft work requested 2026-10-05

Owner: 0sfs aircraft visuals and their flight-model observations. The user
brought the gear-stowage investigation and rendering optimization forward on
2026-10-05; remaining physical-model work stays tracked here.

- [ ] **Further exhaust fidelity:** the initial emitted-light plume and shared
  spectral lookup were brought into this pass at the user's request. Qualify
  the assumed optical inputs against representative measurements; add
  scene-color heat refraction, smoke/wake advection and illumination with named
  resource budgets when requested. Knowing “air + hydrocarbon fuel” alone does
  not determine an exact emitted spectrum. Keep the HUD and plume on one
  engine-specific optical dataset and preserve native engagement/force ownership.
- [x] **Wheels protrude in the underlying stowed pose:** confirmed independently
  of visibility: the previous single-axis quarter-turn left main tires about
  0.471 m below the selected closed skin envelope and the nose tire about
  0.232 m below it. The original model author's compound rotations place all
  three tires within that exterior envelope. This is a source-informed asset
  correction, not a verified reproduction of the real aircraft's kinematics.
- [ ] **Arm clearance and physical bay fit:** with the source-informed pose,
  parts of each main leg still extend about 0.027 m below the selected skin
  envelope. Full internal bay clearance is unqualified. Resolve the remaining
  mesh/rig mismatch and obtain better B-specific mechanical references before
  claiming realistic wheel swivel, shortening distances or linkage motion.
- [x] **Skip drawing fully stowed gear, with an override:** the catalog names
  the enclosed wheel/arm meshes; they stop drawing at physical gear position
  zero and return at any positive position. Doors remain visible. Debug →
  Aircraft visuals → Render stowed landing gear keeps them drawable for
  inspection, including while paused. The setting is persistent, defaults off,
  and does not change geometry or physics.
- [x] **Exterior stowage regression:** actual distributed tire vertices are
  checked against selected exterior skin triangles independently of visibility.
  The [retained baseline and corrected pose](../../validation/evidence/aircraft/f35b/gear-stow-2026-10-05/acceptance.json)
  expose the original protrusion; rig tests also cover extension, pivots,
  paused state and wheel spin. An expected-failure test tracks the remaining
  arm protrusion. `node scripts/validation/f35b/inspect-gear-stow.mjs --check-stowed`
  checks every gear part and still exits unsuccessfully for that open defect.
  Zero sampled exterior violations is not proof of internal bay clearance or
  collision-free motion through the whole retraction cycle.

The [research record](../../validation/evidence/aircraft/f35b/gear-stow-2026-10-05/research.json)
separates the official B-specific evidence from the source author's numerical
pose. No verified wheel-swivel angle or strut-shortening distance was found for
the real F-35B; the original GeoFS setup also conceals its main gear near full
retraction. Neither source establishes the internal bay geometry.
The deferred throttle-handle start/stop gesture is recorded in
[Flight settings](flight-settings.md#todo-hold-the-idle-throttle-handle-to-stop-or-start-the-engine).
