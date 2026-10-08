# F-35B flight model

Date: 2026-10-05. Status: experimental playable integration. The F-35B is
selectable with the AF267 mesh and a modified FlightGear JSBSim model. Functional
airborne, control, conversion and retraction checks pass; aircraft performance
and operational hover/transition behavior remain uncalibrated. Ground collisions
belong to the separate ground work.

**Engine reconstruction requested 2026-10-06:** the user rejects the current
nozzle/interior asset, including large gaps between open petals and incorrect
proportions. The [engine rebuild brief](f135-engine-rebuild.md) collects the
observations, testable hypotheses, full/test-stand versus installed asset design,
reference gallery and acceptance criteria. The [next-agent prompt](../f135-engine-rebuild-prompt.md)
requests implementation in a fresh session. This supersedes treating the current
engine geometry as an adequate final asset; the replacement is not built yet.

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

The implementation below describes the current provisional rig. The user has
reported actual gaps at open aperture; replacing the layered nozzle geometry,
inner coverage and B-specific proportions is now the [rebuild task](f135-engine-rebuild.md).

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
telemetry is insufficient for a calibrated spectrum. `FGTurbine::Run` computes a generic EGT surrogate
from ambient temperature and spool speed before its augmentation branches;
the optional thermal model below adds an afterburner gas energy balance and a
metal state, but no spatial plume chemistry or measured radiance. Temperature
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
dimensions. F-35B data bind its interior to the rigid engine frames and its
exterior to the moving nozzle exit. A future engine
can supply another profile and installation without another aircraft branch
inside the renderer.

The offline bake integrates absolute Planck radiance with the CIE 1931 observer.
The [current source correction](../validation/f135-exhaust-source-correction.md)
removes the unsupported CH*/C2* allocation used in earlier versions. [NASA's
JP-8/FT combustor study](https://ntrs.nasa.gov/citations/20140000730) supports
those emission mechanisms, but does not provide F135 populations, production
rates or component ratios. Chemical emission is explicitly unavailable; its
numerical zero does not establish physical absence. Particle temperature,
loading and mixing remain declared hypotheses. Source data, licenses, model
inputs and hashes are retained with the generated assets. Engine dynamics and
heat state remain native; the visual model does not change thrust or fuel.

`npm run build:exhaust` regenerates the optical lookup and metadata.
`npm run verify:exhaust`, also run by the production build, detects stale
outputs. The shared profile provides both the texture and HUD accent. This
avoids a separately chosen flame color in the UI.

The renderer samples a 64 × 32 axial/radial RGBA32F source field through one
12-triangle bounding volume. Signed flow distance joins six interior duct
sections and the exterior; a private optional depth pass clips at opaque scene
geometry. Native gas-bath temperature and fuel drive the provisional continuum
without a mode-selected Mach conversion. Toggling only AB leaves the physical
field unchanged. Native nozzle geometry supplies the radii and posed support.
Missing required observations suppress gas emission. No exhaust code writes
flight properties. Spectra are precomputed and geometry quadrature weights are
cached; optional smoke uses a separate bounded billboard batch, described below.

Renderer → Aircraft exhaust is the single settings home:

| Setting | Default | Bounds | Purpose |
| --- | --- | --- | --- |
| Aircraft exhaust | On | On/off | Off releases rendering resources |
| Exhaust samples | 128 samples/pixel | 4–128 | Selected posed CPU rays stay below 0.761% error; GPU cost unqualified |
| Exhaust axial / radial field samples | 64 / 32 samples/axis | 8–64 each | Source evaluation and texture memory; 32 KiB at default |
| Exhaust opaque occlusion | On | On/off | Extra depth pass stops gas rays at hardware/scenery |
| Exhaust depth resolution | 1× viewport | 0.25–1× | Depth-buffer memory and thin-edge accuracy |
| Exhaust draw distance | 2,000 m | 1–20,000 m | Skip distant plumes |
| Exhaust display gain | 1× | 0–8× | Display gain after physical source evaluation |
| Nozzle glow white reference | 1,000 cd/m² | 1–100,000 cd/m² | Surface luminance mapped to display white; lower is brighter |
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
Other engine installations can declare their own liner materials.

#### Separate gas and metal temperatures (2026-10-06)

Owner: JSBSim owns the optional generic turbine `<thermal>` model; 0sfs owns
its F135 XML parameters, observations and display. No aircraft name appears in
the native implementation. Existing turbines without `<thermal>` keep their
original behavior. This observer does not change thrust or fuel consumption.

Afterburner fuel is the current total fuel demand minus the same-step cached
unaugmented demand, and is zero when native augmentation is inactive. The
configured flow is the gas stream before this additional fuel. Its temperature
comes from an energy balance with the baseline gas temperature, effective gas
specific heat, fuel heating value and combustion efficiency. The native generic
EGT remains the baseline estimate; it is not a measured F135 station. [NASA's
burner energy equation](https://www.grc.nasa.gov/www/k-12/airplane/burnth.html)
supports this approach. The additional fuel burns behind the turbine, using
remaining oxygen; it does not imply a hotter turbine inlet.

The optional stoichiometric fuel/air ratio bounds heat release by the remaining
oxygen: inlet air is the declared gas stream minus core fuel, and only the
remaining complete-combustion fuel capacity can heat the afterburner stream.
All supplied fuel still contributes mass and native fuel consumption. The F135
profile uses the representative Jet-A `C12H23` surrogate and mass ratio 0.068
from [NASA's AIAA-2005-0549 combustion model](https://ntrs.nasa.gov/api/citations/20050198965/downloads/20050198965.pdf)
(pages 2 and 4). This is an oxygen-availability bound, not an equilibrium
chemistry solver or a measurement of fuel in an F135. The thermal observers
distinguish supplied and heat-releasing afterburner fuel.

The metal is a separate effective thermal lump:

`C dTw/dt = Hg(Tgas − Tw) + Hc(Tcool − Tw) + εf σ Af(Tgas⁴ − Tw⁴) − εw σ Aw(Tw⁴ − Tamb⁴)`.

All temperatures are Kelvin. A bounded implicit solve advances this balance
once per accepted native step; rendering has no heating or cooling clock.
[NASA's main-combustor liner study](https://ntrs.nasa.gov/citations/19730007232) includes
convection, radiation and film cooling. This is general heat-balance evidence,
not an afterburner-liner experiment or F135 temperature calibration.
[NACA nozzle measurements](https://ntrs.nasa.gov/api/citations/19930089626/downloads/19930089626.pdf)
demonstrate why bulk exhaust, near-wall gas and metal temperatures cannot be
interchanged. A single uniform lump is an approximation: it cannot reproduce
spatially different flameholder, liner and nozzle-petal temperatures.

The installed F135 profile explicitly estimates these inputs; none is presented
as a measured F135 parameter:

| Parameter | Authored value / rule | Basis and limitation |
| --- | --- | --- |
| Reference gas flow | 120 kg/s × `(N2/100)² × (Pt/2116.22 psf) × sqrt(288.15 K/Tt)` | Assumed corrected-flow surrogate, not an engine deck |
| Effective gas specific heat | 1,150 J/(kg·K) | Constant approximation; real value depends on temperature and mixture |
| Fuel lower heating value | 43.3 MJ/kg | Representative kerosene value; [NASA fuel measurements](https://ntrs.nasa.gov/api/citations/19830003070/downloads/19830003070.pdf) report approximately 43.23 MJ/kg |
| Afterburner efficiency | 0.95 | Assumed effective combustion efficiency |
| Stoichiometric fuel/air ratio | 0.068 kg/kg | Representative NASA Jet-A surrogate; bounds residual-oxygen heat release |
| Metal heat capacity | 12,000 J/K | Effective 20 kg × 600 J/(kg·K), not actual F135 part mass/alloy; representative high-temperature [nickel-alloy specific heat](https://www.specialmetals.com/documents/technical-bulletins/inconel/inconel-alloy-625.pdf) varies with temperature |
| Gas conductance | `20 + 580 × (N2/100)²` W/K | Assumed effective convection including stationary residual exchange |
| Cooling conductance | `20 + 680 × (N2/100)²` W/K | Assumed effective cooling-air/film exchange; not measured F135 cooling |
| Cooling bath | `Tt + 100 × (N2/100)²` K | Effective warmer cooling stream, not modeled compressor bleed |
| Outward radiating area / emissivity | 1 m² / 0.8 | Effective bolometric heat loss to ambient |
| Flame exchange area / emissivity | 1 m² / 0.05 | Effective grey radiation term, not a claim that gas is a blackbody |

The initial 150 W/K full-speed cooling guess predicted a 1,631 K steady wall in
the installed static afterburner case. That is too hot to adopt as an unqualified
metal-wall default. The provisional 700 W/K effective cooling deliberately
represents stronger film cooling, rather than raising gas or wall temperatures
to obtain visible light. This is a provisional modeling choice, not a material
temperature limit or a fitted F135 cooling coefficient. Exact alloy, coating,
spatial temperatures, coolant flow and a variable-specific-heat gas model remain
needed for physical calibration.

Cold starts begin at ambient and heat gradually. Explicit running initialization
seeds a warm equilibrium on the first real step, after scenario throttle is set.
Native trim's synthetic timesteps, pause and zero-time calculations do not age
the metal. Repeated running initialization preserves existing heat. Snapshots
and relocation restore the native metal state across reset, for every engine
that exposes it. The validated writable state property exists for this purpose;
visuals only read the separate read-only observations.

The existing single noncreating visual batch reads
`thermal/nozzle-gas-temperature-k` and `thermal/metal-temperature-k`, with native
validity/initialization flags. Missing observations suppress their own emission.
Metal glow remains independent of augmentation, fuel cutoff, spool speed and
plume flicker: hot stopped hardware can keep glowing as it cools.

Metal emission is baked separately at 128 temperatures from 300–1,800 K.
Planck spectral radiance is integrated against the CIE observer with the
683 lm/W photometric factor and wavelength increments in metres. The table is
linear-sRGB luminance-equivalent radiance in cd/m², with an assumed visible grey
emissivity of 0.8. That optical emissivity is separate from the heat-loss model's
bolometric value. Runtime interpolates two samples and divides by the explicit
**Nozzle glow white reference**; there is no arbitrary temperature offset,
brightness floor, spectroscopy, extra draw call or extra animation clock.
[NIST's candela realization](https://www.nist.gov/pml/sensor-science/optical-radiation/realization-candela)
documents photopic integration. The reference defaults to 1,000 cd/m² as a
provisional scene display mapping, not a measurement of this scene's lighting.
The [glTF emissive specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#additional-textures)
also leaves pixel brightness dependent on exposure.

The flame lookup now samples actual modeled gas temperature. Soot thermal
emission and excited-molecule bands remain separate assumed components; the
gas is not rendered as glowing solid metal. The same bounded texture and volume
renderer are retained. Temperature drives the continuum but cannot establish
soot concentration, excited-state populations or a unique F135 flame color.

**Engine → Temperatures and oil** shows **EGT (exhaust gas)** (the existing
baseline), **Nozzle gas temperature** and **Nozzle metal temperature** in °C.
Unavailable or uninitialized thermal observations show `n/a`. The values reveal
whether darkness is caused by low metal temperature or display mapping. A cool
or well-cooled nozzle may have little visible incandescence in daylight.

Historical [gas-proxy evidence](../../validation/evidence/aircraft/f35b/temperature-glow-2026-10-06/acceptance.json)
and the [visibility audit](../../validation/evidence/aircraft/f35b/temperature-ui-audit-2026-10-06/acceptance.json)
describe the superseded implementation. Its 1,006 K gas proxy produced only
0.000429 red emission due to arbitrary normalization. Neither those receipts
nor older GPU checks qualify the new thermal model's physical calibration.

The [separate-temperature acceptance record](../../validation/evidence/aircraft/f35b/thermal-model-2026-10-06/acceptance.json)
retains the installed fork14 lifecycle trace, native regressions, optical bake
and final CI (1,767 passing tests plus the existing expected gear-arm failure).
Eight installed-SDK scenarios cover startup, heating, cooling, pause, reset,
recovery and relocation. A same-time initialization defect found in candidate
fork13 was fixed natively and that immutable candidate is explicitly rejected.
The static hold-down profile reaches approximately 2,362 K gas / 1,270 K metal
after sustained afterburner; this is model output, not F135 measurement.
At the default display reference, that metal temperature adds approximately
`[1.254, 0.0941, 0]` linear RGB to the scoped material. Updated headless GPU
checks have not been executed for this revision; no new pixel or device
qualification is claimed.

#### Observations, hypotheses and unresolved discrepancies (2026-10-06)

This ledger distinguishes visible evidence from a diagnosis. A video can establish
that a photographed appearance exists. Without operating telemetry and radiometric
calibration it cannot uniquely identify fuel staging, metal temperature or the
exhaust spectrum. The current model is not a calibrated F135 engine deck.

The subsequent [dry-glow mechanism investigation](../validation/f135-dry-vtol-mechanism.md)
records the retained landing sequence's axial brightness bands, changing strobe,
near-deck bright region and editorial cut. It ranks source, scattering, surface
and camera hypotheses without treating the non-gray spectral correction as
completion of impingement, deck or visual acceptance work.

The [physical correction](../validation/f135-engine-physical-correction.md) records
rigid geometry and native heat accounting; the later [spatial-plume report](../validation/f135-plume-spatial.md)
records the rejected first spatial implementation. Earlier rows retain the observations and then-current
defects; the table below records what changed without discarding those references.
The user's subsequent test still finds a large pale-blue AB onset outside the
engine and no dry VTOL luminous jet. The [post-test audit](../f135-plume-physical-followup-prompt.md#follow-up-after-testing-the-spatial-implementation)
found that the compact source retained an unmeasured exterior chemical-power
allocation and that assumed exit Mach jumped on AB selection, initially reducing
modeled static temperature. Existing CPU comparisons already show a brighter
onset from one view and substantially dimmer dry exhaust. These remain physical
and visual acceptance failures, despite passing numerical/software checks.

The [source-contract correction](../validation/f135-exhaust-source-correction.md)
removed both unsupported operations: the native gas-bath proxy is used
without a nozzle-Mach remapping, and no burned-fuel percentage is assigned to
exterior chemical light. Missing reaction/species state is explicitly unavailable,
not a prediction that real CH*/C2* emission is zero. Thermal continuum is evaluated
on one support through the actual authored curved duct and across the exit,
with one shared source bound and optional opaque-depth clipping. These changes
correct identified model assumptions; they do not establish visual acceptance.
The dry free jet and deck patch remain separate open appearance constraints.
The subsequent [AB response checkpoint](../validation/f135-exhaust-response.md)
adds a conditional internal CH(A) parcel and temperature mixture; it does not
restore the exterior fuel-to-light allocation. Its chemistry and spatial inputs
remain uncalibrated. The current particle source uses a non-gray absorption
spectrum with matching integrated power. These changes do not qualify the dry
carrier glow or reported AB extent.

The 2026-10-07 [joint onset investigation](../validation/f135-ab-onset.md)
follows the user's persistent audible-before-visible AB report. Actual installed
native output after a cold start selects 43,000 lbf wet thrust **4.1333 s before
positive burned AB fuel**; settled dry operation leaves an 83.3 ms interval.
The shipped DSP's base thrust cue changes during that interval even with the
deliberate AB mix muted. Internal optical reaction emission starts on the first
positive burn while the cold liner is only 483 K; the optical source does not
wait for metal heating. These are simulation observations, not F135 timing
measurements or a rendered/perceived synchronization pass. A joint regression
retains the zero-burn/excess-thrust invariant as a known native failure. Correct
the transient fuel/heat/thrust/nozzle closure in JSBSim, rather than hiding it
with audio delays or optical brightness changes. The user now accepts the faint
red dry night appearance, but neither that feedback nor the new display gain
calibrates absolute emission or resolves the carrier deck interaction.

| Source-contract follow-up | Evidence | Remaining discriminator |
| --- | --- | --- |
| Native temperature meaning and flag-only jump | The native equation is an imposed constant-cp gas bath derived from generic EGT and AB heat. No measured total/static nozzle station, pressure/area flow closure or STOVL shaft balance exists. The optical expansion is removed; frozen physical inputs give identical fields when only AB selection changes. | Calibrated engine station and particle-temperature data are still needed. See [native audit](../../validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/native/README.md). |
| Exterior chemical-light allocation | Local production, radiative decay and collisional loss determine excited-state emission. Neither a fuel-power fraction nor equal band energies supplies these inputs. The unsupported term is absent with an explicit unavailable status, and the legacy model remains archived. | Internal reacting-mixture/species/pressure data, absolute spectra and any justified exterior reaction field. No hue is prohibited. |
| Interior-to-exterior continuity | One thermal-bath continuation field follows rigid duct sections, excludes the centerbody and clips nozzle seals. Source weights include all sections once; an optional depth pass clips view rays at opaque scene geometry. | This is not a prediction of augmentor combustion. GPU compilation, depth-edge accuracy and rear/oblique day/night appearance remain unqualified. |
| Dry jet versus deck patch | Source-only gas/solid and ideal receiving-surface bounds are retained separately. The stand has no lit deck receiver; its raster terrain is unlit. Published deck thermal-load evidence does not establish visible deck incandescence. | Measured dry emission, a physical deck interaction/receiver, and comparable camera/exposure evidence. Operational hover AB remains inhibited. |

| Correction / hypothesis | Measured implementation evidence | Remaining discriminator |
| --- | --- | --- |
| User reports metal changing shape | Old morphs change edges by 40.5–41.3%; the replacement uses 112 rigid driven nodes with fixed vertices, unit scale, closed-volume and attachment tests, shared full/installed poses and independent throat/exit sections. [Geometry evidence](../../validation/evidence/aircraft/f35b/engine-physical-correction-2026-10-06/geometry/README.md). | Count, lengths, pivots, sliding shoes and follower mechanism are explicit PW-600 approximations; native command is not measured A8 scheduling. |
| Immediate red then purple at startup | Original observation lacks recorded state. The stand now defaults stopped/cold; already-running initialization and hot restart have separate traces. Normalized gas amplitude is replaced by absolute emission/absorption, and local gas light excludes engine hardware. | Contribution views make a future capture diagnosable. Exact original cause and GPU day/night appearance remain unqualified; no desired hue or bright idle was imposed. |
| Stored energy and thermal lag | 133,577 installed native steps close both local solid balances to a maximum per-step residual of 2.733e-9 J; independent cooling convergence and 108 sensitivity cases retained. [Native evidence](../../validation/evidence/aircraft/f35b/engine-physical-correction-2026-10-06/native/README.md). | Effective capacities and prescribed baths are unmeasured. Local closure does not solve whole-engine conservation or calibrate temperatures. |
| Gas and surface light attribution | Absolute Planck/CIE solids; dimensional grey gas transfer with explicitly bounded fuel-powered sources. Independent interpolation error ≤0.328%; contributions isolated; current optical sensitivities retained. [Optics evidence](../../validation/evidence/aircraft/f35b/engine-physical-correction-2026-10-06/optics/README.md). | Particle loading, CH*/C2* fractions, camera response and local receivers remain uncertain. Pink/violet test-cell and luminous powered-lift references remain valid constraints, with AB inhibited in hover. |


The following spatial-pass rows retain historical source/sampling results. The
[occlusion erratum](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/occlusion-erratum/README.md)
withdraws their hardware-visibility claims: the old CPU tracer loaded zero
hardware triangles. Attachment and unblocked source calculations remain
separate; current posed-ray errors and acceptance are in the mechanism report.

| Spatial-plume follow-up | Finding / implemented correction | Remaining difference |
| --- | --- | --- |
| Entire AB plume looks bright blue | Native AB onset makes assumed excited bands dominate the faint continuum. The old shader applies one RGB everywhere; new temperature/loading/CH*/C2* fields mix local spectra before a single gamut map. | Early blue-rich chemical emission remains a hypothesis. Exact reported pixels and fixed-exposure GPU appearance have not been reproduced. |
| Dry downward plume absent | A new 82,925-step native trace reproduces valid dry powered lift. Actual-GLB rays find correctly directed, unoccluded support; old thermal rays are only 0.0112–0.0197 cd/m². | Expanded/mixed dry thermal gas is dimmer still; the night footage's external light and deck patch remain unexplained. No AB or artificial dry brightness source was added. |
| Sampling changes apparent color | Independent quadrature found narrow-source misses. A 64 × 32 source field and 32 exit-clustered ray segments improve tested bright-ray errors to below 0.5% separately for field/ray sampling; user budgets remain explicit. | Finite CPU checks do not qualify all views, GPU precision, performance or material-local HDR composition. See [evidence](../../validation/evidence/aircraft/f35b/plume-spatial-2026-10-06/acceptance.json). |


| Question / observation | Finding and evidence | Status / next discriminator |
| --- | --- | --- |
| Does the F-35B have an afterburner? | Yes. The F135-PW-600 is described as an augmented, two-spool turbofan in the [USMC-released Lockheed report, enclosure 25, printed p80 / PDF p32](https://www.hqmc.marines.mil/LinkClick.aspx?fileticket=7A2LJuIKWCg%3D&mid=155018&portalid=61&tabid=16139). [Rolls-Royce](https://www.rolls-royce.com/media/our-stories/innovation/2016/liftsystem.aspx/1000) explicitly describes afterburning in conventional flight. | Supported hardware capability; distinguish conventional flight from powered lift. |
| Pink/violet exhaust in real life | The P&W-sponsored Sam Eckholm factory/test-cell video shows a pink/violet external plume at [12:40](https://www.youtube.com/watch?v=sahwo4JdVzs&t=760s), [13:30](https://www.youtube.com/watch?v=sahwo4JdVzs&t=810s) and [13:40](https://www.youtube.com/watch?v=sahwo4JdVzs&t=820s). P&W embeds this video on its [F135 product page](https://www.prattwhitney.com/en/products/military-engines/f135). | A universal “real F135 exhaust is not pink” claim is rejected. The footage does not establish a universal pink hue or identify the PW-600 nozzle calibration. |
| Red/orange emission during powered lift | The Royal Navy footage credited in Navy Lookout's video shows night-time exhaust emission at [2:38](https://www.youtube.com/watch?v=rIroDPghWF4&t=158s), the ramp shot at [2:41](https://www.youtube.com/watch?v=rIroDPghWF4&t=161s), and the downward-nozzle landing close-up around [2:42.8](https://www.youtube.com/watch?v=rIroDPghWF4&t=162s). Full-resolution extracted frames confirm an external luminous region and a bright patch on the deck below the downward nozzle; this is more than an internal metal-glow observation. | **Confirmed reference appearance; unresolved sim discrepancy.** The current non-AB powered-lift exhaust/deck-lighting appearance is incomplete. Determine the contributions of gas/particle emission, scattered/reflected light and heated surfaces without enabling AB merely to imitate the light. Camera uncertainty does not erase the observed external glow. |
| Does that prove AB in hover? | [Lockheed engineer Kevin Renshaw's nozzle history](https://www.codeonemagazine.com/c5_article.html?item_id=137), section “DARPA ASTOVL And Beyond,” states that AB is not used in X-35B/F-35B hover. Its “Origins” section separately describes 1960s JT8D ground tests with a bent nozzle and AB. | Keep the operational hover inhibit. Do not reinterpret the naval footage as that historical test. No complete public F135 transition/STO inhibit schedule was found; our exact conversion threshold is an implementation assumption. |
| Nozzle contracts more in the test-cell video | Compare the tight aperture at [12:00](https://www.youtube.com/watch?v=sahwo4JdVzs&t=720s) with the open, luminous exhaust at [12:40](https://www.youtube.com/watch?v=sahwo4JdVzs&t=760s). Our [geometry audit](../../validation/evidence/aircraft/f35b/nozzle-area-2026-10-05/source-geometry.json) gives about 0.8054 m closed and 1.1635 m open free-tip diameter, with 12.503° petal travel. These are asset measurements, not real throat dimensions. | **Open geometry/scheduling discrepancy:** the asset cannot close past its authored rest pose. Establish nozzle variant, view and operating condition before fitting endpoints. Static testing alone is not a demonstrated explanation. |
| Why only visible at 100%, not 99%? | Current F135 native augmentation is off at 0.99 command. The [installed dry99 diagnostic](../../validation/evidence/aircraft/f35b/thermal-model-2026-10-06/dry99-cycle/acceptance.json) measures metal warming from 186.6°C idle to 390.6°C dry, then 996.3°C AB; it cools back to 390.6°C after AB. These are simulation outputs. | **Thermal/optical calibration gap:** dry heating works, but the model's cooled metal is almost invisible at the default display mapping. This does not establish that every visible real surface or gas region should be dark. A distinct AB light-off is plausible; exact lever threshold and dry appearance are not validated. |
| Ring with discrete bright spots | The rear-view video identifies the first segment as **F-35A**, with bright annular appearance at [0:50](https://www.youtube.com/watch?v=Cztrk6K0Klo&t=50s), [1:15](https://www.youtube.com/watch?v=Cztrk6K0Klo&t=75s), and [1:32](https://www.youtube.com/watch?v=Cztrk6K0Klo&t=92s). Inspection of 1080p frames around 1:30–1:34 confirms a darker center and nonuniform bright annular region. The user identifies eight bright spots at 1:32. | **Spatial discrepancy / hypothesis:** the current flat uniform cap does not represent the pattern. Eight is a candidate count, not a confirmed count of injectors, flameholders, thermal zones or flame kernels. Heat shimmer, small image size and exposure limit independent counting. Brightness is not a velocity measurement; F-35A geometry is not direct PW-600 nozzle calibration. |

The video's broader timestamp `3:38` is its F-22/F-35 discussion chapter;
the test-cell examples above identify the relevant flame/nozzle images directly.
Evidence review used public video metadata and storyboards, followed by 1080p
extracts of 2:36–2:43 in the naval video and 1:30–1:34 in the rear-view video.
Representative unretouched frames are retained for [2:38](../../validation/evidence/aircraft/f35b/engine-review-2026-10-06/frames/vtol-158.png),
[2:41](../../validation/evidence/aircraft/f35b/engine-review-2026-10-06/frames/vtol-161.png),
[about 2:42.8](../../validation/evidence/aircraft/f35b/engine-review-2026-10-06/frames/vtol-162p8.png)
and [1:32](../../validation/evidence/aircraft/f35b/engine-review-2026-10-06/frames/rear-92.png).
These are qualitative appearance references, not calibrated radiometry or
audio/FADEC telemetry. No temperature or flow velocity was inferred from RGB
pixels. [Review provenance](../../validation/evidence/aircraft/f35b/engine-review-2026-10-06/research.json)
records extraction limits, hashes and source URLs.

The simulator's generic nozzle schedule follows normalized N2 in dry operation
and opens in AB; it is not an F135 FADEC area schedule. Native 99% dry in the
diagnostic gives approximately 99.6% N2 and 1% nozzle position, so it is already
near the visual minimum. Real nozzle throat area A8 controls engine matching;
exit area A9 and its linkage matter too. The [Lockheed-authored aerodynamic
integration chapter, §2.2.1 and §6.2](https://onlinelibrary.wiley.com/doi/full/10.1002/9780470686652.eae490)
discusses this and distinguishes the compact STOVL nozzle from the longer CTOL/CV
design. A circular free-tip area ratio is not a measured A8 ratio.

The pre-correction baked profile assumed 99.5% to 98.5% of visible radiant
energy came from soot continuum, favoring warm colors. That was an input
assumption, not a deduction from gas temperature or kerosene alone. The [NASA
JP-8/FT imaging study, §4.1](https://ntrs.nasa.gov/citations/20140000730)
identifies CH* near 432 nm, C2* bands near 473/516/573 nm and soot-associated
orange emission. Species populations, soot loading, pressure, path length,
mixing and the camera response are not supplied by bulk exhaust temperature.
The study supports mechanisms, not our F135 band weights. Camera effects are
a possible contributor, not a demonstrated explanation for this specific pink
plume. Neither a universal orange nor universal purple recoloring is justified.

The naval examples have a very dark background. White balance/tint, exposure,
tone curves and channel clipping alter recorded color and brightness; [Adobe's
camera color/tonal documentation](https://helpx.adobe.com/camera-raw/desktop/using/make-color-tonal-adjustments-camera.html)
describes these controls and their clipping effects. We do not have the source
camera's exposure, white balance, spectral response, ungraded footage or a
calibration target. A black-looking background does not establish zero ambient
illumination or a calibrated emission threshold. Account for this by separating
two acceptance questions: **does non-AB powered lift produce the observed visible
exhaust-region light?** and **does its color/brightness match under comparable
capture conditions?** The first is an open simulation discrepancy; the second
is currently unqualified. This uncertainty must not be used to dismiss the first.

Future reference captures should record airframe/engine variant, dry/AB state
when known, power, nozzle angle, viewing direction, day/night conditions and
available camera metadata. Compare the same frozen engine state under bright and
dark scene lighting while holding exposure and white balance fixed; then vary
exposure explicitly. Keep native thermal/emission state unchanged during that
display experiment. Measure relative plume/nozzle/background levels and flag
clipped channels instead of treating screenshot RGB as gas temperature. General
scene exposure/white-balance controls belong to FOSS Earth; flight-specific
thermal observations and engine reference cases belong to 0sfs. No calibrated
camera-response or night-lighting validation has yet been implemented.

The dry diagnostic uses the same baked metal table as the renderer: approximately
`1.96e-5 cd/m²` at the dry equilibrium versus `332.6 cd/m²` at the AB equilibrium.
Dividing by the default `1000 cd/m²` white reference makes dry emission minute.
This isolates a model-calibration issue from a binary AB gate on metal: the latter
does not exist. Cooling from AB to dry can be reasonable even while dry power
heats a cold engine. It does not validate this model's particular equilibrium.

#### More than one solid temperature

N1/N2 are shaft-speed percentages, not two material temperatures ([FAA engine
malfunction report, pp39–40](https://www.faa.gov/sites/faa.gov/files/aircraft/air_cert/design_approvals/engine_prop/engine_malf_report.pdf)).
The F135's LP shaft joins a three-stage fan and two-stage turbine; the HP shaft
joins a six-stage compressor and single-stage turbine (USMC/Lockheed report
above). Each shaft therefore links compression hardware to much hotter downstream
hardware. Afterburning adds heat behind the turbines, rather than increasing all
upstream metal temperatures together ([NASA afterburner explanation](https://www.grc.nasa.gov/www/k-12/airplane/turbab.html)).

The design recommendation is two independently modeled solid regions first:
core-facing internal hardware and cooled downstream liner/nozzle hardware.
A third region for nozzle petals is useful once geometry/material masks and
distinct thermal inputs exist. “Two” or “three” is a reduced simulation design,
not a measured number of uniform temperatures in the real engine. Renshaw's
article documents bypass cooling across the swivel joints and separate nozzle
flaps. [NACA TN3973, Appendix A and Fig29](https://ntrs.nasa.gov/api/citations/19930084700/downloads/19930084700.pdf)
also illustrates component-specific temperatures/cooling in older engines; those
values are not F135 calibration data.

The current [asset audit](../../validation/evidence/aircraft/f35b/temperature-ui-audit-2026-10-06/geometry-report.json)
finds an opaque two-triangle cap, not modeled turbine blades or a verified
flameholder. Calling it a particular spool/component would invent detail. At that review snapshot a single temperature remained in production. The
reconstruction and physical correction now bind two independent native regions;
splitting state without distinct material bindings would not improve the image.

Visible spots are also not a count of thermal states or point lights. If the
azimuthal pattern is confirmed, represent it as engine-profile geometry/emission
data: a radial/angular mask or baked volume distribution, sampled by the shared
renderer. Separate the pattern's shape from native gas/solid temperatures and
augmentation state. The later implementation uses a profile-driven eight-lobe mask. Its count remains
a hypothesis, with no eight-emitter hardware identification or performance claim. Do not bake a solid central
glowing disk simply because the asset currently contains a flat cap.

The ring also does not identify the upstream main combustion annulus: the main
burner precedes the turbine, while the afterburner is a separate downstream
section ([FAA-hosted *Aerodynamics for Naval Aviators*, p129](https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/00-80T-80.pdf)).
[NASA TP-1068](https://ntrs.nasa.gov/citations/19780003163) tests downstream ring
flameholders and discrete fuel mixers in an experimental turbofan. These provide
possible mechanisms for a spatial pattern, not an identification of F135 hardware
or eight emitters. The proposed inference “brightest ring = fastest gas” is not
supported: [flameholder-wake research](https://ntrs.nasa.gov/citations/19820051508)
examines recirculating flows used to stabilize combustion. A bright reacting
region can coexist with locally slowed or reversed flow. Temperature, emitting
species and optical path must also be distinguished from flow velocity.

Hypotheses to test, without assuming the answer:

- **Different solids:** the one strongly cooled lump underestimates hotter internal
  surfaces. Split core-facing hardware from cooled liner, document each heat
  capacity/cooling assumption, and compare cold→dry and AB→dry at the same power.
- **Missing dry light:** core emission or internal reflections contribute to the
  night-time landing appearance. Identify the visible geometry and viewing path;
  include the external plume and deck interaction, not only the nozzle interior.
  Do not enable the long AB plume merely to create red light.
- **Wrong gas mixture:** assumed soot-dominated visible energy is inappropriate for
  some F135 operating conditions. Compare independent daytime/night-time references
  and obtain spectral/operating data before claiming a chemistry-calibrated color.
- **Wrong aperture mapping:** authored minimum/maximum and generic nozzle scheduling
  differ from PW-600 geometry and control. Measure the correct variant; keep
  geometry, throat area, exit area and conversion scheduling separate.

#### Engine test stand and live history

0sfs owns the fixture, aircraft visibility and instrument plots. JSBSim remains
the sole owner of spool, fuel, thrust and thermal dynamics. **Engine → Engine test
stand → Open engine test stand** reloads with `?engineTest=1`; **Return to flight**
removes that flag. The stand bypasses saved-flight restoration/saving, terrain
collision response and flight assists. **Earth remains loaded** through the
normal map/terrain preparation path. It uses native `setHoldDown` before
initialization, so motion is constrained while the engine continues taking normal
fixed steps. It starts running at idle, zero airspeed and zero wind in the
standard atmosphere, at **MSP / KMSP runway 35's threshold**. The [FAA AIP,
AD 2.12](https://www.faa.gov/air_traffic/publications/atpubs/aip_html/part3_ad_2.0_minnesota.html)
gives 44°51′58.2366″N, 93°14′11.9205″W, 833.3 ft MSL and 350° true bearing;
loaded terrain supplies final placement/clearance. The existing **Location** tab
moves the fixture, including runway selections, without applying arrival/departure
flight speed or control presets. There is no separate test-stand altitude setting:
location and altitude have their existing UI home. Camera distance/zoom remain in
Engine → Test stand conditions. The regular THR, start/stop gesture, VTOL, pause
and orbit controls remain available. Reloading the stand returns to its default;
returning to flight retains normal saved-flight behavior.

This Earth-backed placement supersedes the initial empty-world/sea-level fixture.
The [engine reconstruction brief](f135-engine-rebuild.md) records the requested
full engine asset, now implemented in the
[reconstruction report](../validation/f135-engine-reconstruction.md).
The [updated stand acceptance](../../validation/evidence/aircraft/f35b/engine-rebuild-2026-10-06/acceptance.json)
retains 1,795 passing tests, the existing expected gear failure, native hot/stopped
relocation checks and app Location-tab checks. No flight-app GPU appearance check
was run for this revision.

The pre-rebuild F-35B asset supplied only the isolated `vtol` nozzle assembly and
petals, plus their normal exhaust effects: it had no complete engine casing,
fan or turbine mesh. The reconstruction now selects a complete external main
engine in the stand and a separate installed export in flight, with common
nozzle/material/kinematic data and two native solid temperatures. Other aircraft run the same native fixture; without declared
engine geometry they show readings without an aircraft mesh. No stock aircraft
name is embedded in the fixture or history code. The test is static; hold-down
does not turn an initial airspeed into a valid wind-tunnel condition.

**Engine → History** provides plots and latest/min/max values for native metrics
that exist, including separately labeled gas and metal temperatures. Clear starts
a fresh history; CSV exports its actual samples and units. **History sampling**
sets the retained simulation-time window (default 60 s, 1–600 s) and sampling
ceiling (default 5 Hz, 0–30 Hz). Zero disables and clears history. Paused/repeated
simulation times add no samples, backwards time starts a new record, absent
observations stay absent, and hidden plots do not redraw. These low-rate trends
are not a combustion-instability or acoustic measurement.

For a reproducible comparison, set VTOL to 0, observe idle, hold 99% until the
temperature settles, engage AB, then return to 99%. Record metal and gas curves,
native AB state, N2, nozzle position and fuel flow together. Repeat in powered
lift; save the CSV and note viewing/exhaust display settings. A matching software
trace establishes repeatability, not agreement with an actual F135.

The [test-stand/history acceptance record](../../validation/evidence/aircraft/f35b/engine-review-2026-10-06/acceptance.json)
retains source hashes, related checks and the completed full CI: 166 files,
1,791 passing tests plus the existing expected gear failure. Actual installed-SDK
tests cover stationary SF50 and F135 engines with advancing spool, thrust, fuel
and thermal state. DOM/NullEngine checks cover native-time histories, visibility,
camera focus and saved-flight isolation. No browser/GPU appearance qualification
was run; the ring, dry light, nozzle endpoints and optical-mixture gaps remain open.

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

Aircraft → Flight controls → Full-stick roll rate sets, in °/s, the roll rate
the fly-by-wire asks for at full stick, through native
`fcs/full-stick-roll-rate-deg_sec`. The source loop balanced the stick against
0.09 × roll rate in rad/s, so full stick asked for about 637°/s. Its integrator
trigger was inverted, holding above 5 kt and running only when parked, so in
flight the loop was proportional. Measured on 2026-10-07 with the clean
aircraft, it settled at 43–62% of its command between 200 and 600 kt and reached
full aileron by 55–80% stick. With the stick centred it rolled back toward level
at 2–9°/s.

The law now adds feedforward of the aileron for the commanded rate,
p = a·vt / 165 ft, faded out by conversion. The integrator only holds bank: it
runs with the stick centred and roll rate under 10°/s, holds while the stick is
deflected, a roll is stopping or the command is saturated, and resets in Manual,
on the ground and with any conversion. Proportional and derivative gains are
unchanged. The jet flies the setting within 11% between 200 and 600 kt at
10,000 ft and at 300 kt at 30,000 ft, from +10% at 200 kt to −10% at 600 kt,
following Mach, until the ailerons run out near 150°/s at 200 kt. With the stick
centred it holds roll rate under 0.5°/s. Bank still drifts slowly in a turn,
since the law holds roll rate, not bank angle. Stopping overshoot grows with
roll rate, as aileron rate and roll acceleration allow: about 3–9° from 30°/s,
and up to 55° from 160°/s at 200 kt.

The autopilot flies the source gradient; in the tuning runs it held a 30° bank
within 0.3° from 200 to 600 kt. Roll auto-trim waits under fly-by-wire, where
roll trim is a rate command and the integrator holds bank. That command is in
the stick's units, `fcs/roll-trim-rate-cmd-norm`, scaled like the stick by the
full-stick roll rate, so full trim asks what full stick asks, and the host's
Roll trim range takes a share of it; until 2026-10-07 trim entered unscaled, as
637°/s at full trim. Manual and the hover
roll posts read the unscaled stick. Integration tests check tracking, hands-off
hold, Manual, the posts and the ground reset. Pitch and yaw keep the same
inverted trigger. These are simulator tuning choices, not F-35 control-law data.

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
