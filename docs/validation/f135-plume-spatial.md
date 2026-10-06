# Spatial F135 plume

This is the retained first spatial implementation record. The subsequent
[source-contract correction](f135-exhaust-source-correction.md) removes its
unqualified Mach switch and exterior chemical allocation. Neither pass is
visually accepted; the following numbers describe this historical version.

**Subsequent user acceptance failed:** the user still sees a large pale-blue AB
onset apparently detached from the engine, and no luminous dry VTOL exhaust.
The [open follow-up audit](../f135-plume-physical-followup-prompt.md#follow-up-after-testing-the-spatial-implementation)
records the concentrated, assumed exterior chemical source and AB-boolean Mach
discontinuity. The results below qualify implementation of an approximation;
they do not establish its physical appearance as correct.

This implements the [spatial-plume follow-up](../f135-plume-physical-followup-prompt.md)
in 0sfs. The active gas renderer now samples local absolute emission and
absorption from a spatial field. The rigid engine, native thermal solver,
fork.16 SDK, aircraft XML, full/installed assets and operational powered-lift
AB inhibit remain unchanged. This is a reduced optical approximation, not a
new native flow solver or a calibrated F135 plume.

The [combined acceptance record](../../validation/evidence/aircraft/f35b/plume-spatial-2026-10-06/acceptance.json)
links final identities, checks and retained numerical/CPU evidence. No browser,
GPU run, server or benchmark was started. Required flight-render rear/oblique
day/night appearance qualification remains outstanding.

## Causes found

The [new installed-native trace](../../validation/evidence/aircraft/f35b/plume-spatial-2026-10-06/native/README.md)
audits **82,925 steps** and reproduces the previous native milestone values.
It records cold start, idle, dry99, AB onset/sustain/cutoff, shutdown and
full-command powered lift. Its frozen helper, optical profile and shader preserve
the previous uniform-source model for a repeatable comparison.

At AB +0.233 s, the old model has excited-source photopic Y of about
**274.50 cd/m³**, versus **0.470 cd/m³** from particles. It adds those sources
once, then applies the same RGB everywhere. That is a confirmed explanation for
uniform blue-dominated *modeled* emission at onset. Sustained AB changes the
balance: about **251,606 cd/m³ continuum / 8,265 cd/m³ excited emission**.
The evidence does not support an always-blue physical source or identify the
exact display clipping in the user's uncaptured observation.

Dry powered lift has conversion 1, nozzle pitch π/2, AB off, valid gas data,
**1003.13 K** station gas and **4.42005 kg/s** supplied fuel. The old grey source
has Y about **0.07225 cd/m³** and a hardcoded 1.2 m support. Tested old-volume
rays yield only **0.0112–0.0197 cd/m²**, or roughly **1.12–1.97 × 10⁻⁵** linear
scene luminance at white reference 1000 cd/m², before exposure. This supports a
dim-source diagnosis; it does not prove the user's exact pixel visibility.

[Actual-GLB geometry checks](../../validation/evidence/aircraft/f35b/plume-spatial-2026-10-06/geometry-baseline/README.md)
find no VTOL-specific disable or complete hardware occlusion. The exit origin
and axis follow the rigid nozzle, and rear/oblique/world-side views retain
unobstructed positive tracer paths through the support. Coarse midpoint sampling
can still miss thin regions, while first-interaction depth can integrate light
behind an opaque surface. Those approximations are separate from radiance.
The tracer includes engine hardware, not ground or airframe geometry.

The native gas observation is an imposed enthalpy-mixture proxy based on legacy
EGT and added AB energy. It has no qualified static/total station definition,
exit velocity, particle population or reaction-progress field. Native EPR is
also not a calibrated nozzle pressure ratio. No demonstrated native defect was
found, so this task does not retune temperatures or change the SDK.

## Spatial physical approximation

The profile declares an axisymmetric, quasi-steady field in axial distance
`ξ = z/Rexit` and fractional radius. The computational support is 6 m in both
modes; its radius expands as `R(z) = Rexit + 0.07 z`. Local physics controls its
emission extent instead of the former dry/AB support-length switch. An offline
97 × 33 basis table contains separate temperature-excess, particle-loading,
CH* and C2* weights. No angular rainbow, arbitrary time fade, shock pattern or
turbulence animation is imposed. The previous eight-lobe mask remains historical
appearance evidence and is not multiplied into this new axisymmetric field.

For this explicit hypothesis, the native station proxy is treated as total
temperature. `Tstatic = Tstation / (1 + (γ−1) M²/2)` uses γ = 1.33 and assumed
exit Mach **0.8 dry / 1.1 AB**. The resulting temperature excess mixes toward
the **actual native ambient temperature**, independently along and across the
jet. Particle temperature follows that local bath. Loading begins annular,
mixes toward a filled cross-section, dilutes with expanding area and declines
with axial distance. It does not create a hotter dry particle population merely
to explain the footage.

[NASA's isentropic relations](https://www.grc.nasa.gov/www/k-12/airplane/isentrop.html)
support the temperature relation, not the station assignment or chosen Mach
numbers. The profile records sensitivity ranges including no expansion,
different spreading/mixing rates, particle-loss lengths and reaction widths.
These are uncertainty brackets, not calibrated confidence intervals. The model
does not solve shocks, momentum, entrainment mass balance, particle thermal
inertia, dissociation, scattering or ground impingement.
The 6 m computational boundary can truncate nonzero source/extinction before the
authored ξ = 24 fade reaches zero; it is an explicit finite-support approximation.

CH* and C2* have separate localized radial and axial source weights. Their
nominal supports end at **2.2 / 3 exit radii** respectively, with different decay scales.
Bilinear sampling broadens each cutoff by up to one source-grid interval.
Their total energy allocation remains the declared **10⁻⁶ of actually burned
AB fuel power**, split using the retained band-energy weights. Dry operation
has no chemical source. These are optional near-exit emission hypotheses; they
are not a prediction of continued exterior combustion or long-lived excited
molecules transported metres downstream. [NASA's afterburner description](https://www.grc.nasa.gov/www/k-12/airplane/turbab.html)
places the added fuel and burning upstream of the nozzle exit.

Thermal and chemical light remain distinct mechanisms. Local particles emit
`κ Bλ(T)`, while excited species emit from their separately allocated chemical
source. [NASA's jet-fuel imaging study](https://ntrs.nasa.gov/citations/20140000730)
supports CH*/C2* bands and soot continuum; it does not establish these F135
fractions or spatial distributions. Expensive Planck/CIE integration is offline.
The new path retains physical XYZ for each component, combines the local
mixture, then performs one nonnegative RGB gamut map preserving photopic Y.
Clipping each species separately before adding them would bias the mixture and
is avoided.

The particle source keeps the previous **0.3% dry / 1.5% AB** supplied-fuel-power
caps, with **43.3 MJ/kg** heating value. The actual bilinear field is integrated
over its expanding cylindrical coordinates, including local temperature and
loading, to bound its entire bolometric particle source. CH*/C2* fields are
independently normalized to their allocated watts. Float storage has a small
numerical headroom margin. These are unattenuated source bounds; self-absorption
can reduce escaped power. They do not close the engine's energy budget or debit
the imposed native reservoirs a second time.

## Runtime and lifecycle

A changed native temperature, ambient, fuel, AB state or exit geometry produces
a small **RGBA32F** table: RGB is local cd/m³; alpha is local extinction in m⁻¹.
The shader samples that field directly and integrates emission/absorption along
the ray. It does not multiply the old density mask again. Both GLSL and WGSL use
explicit bilinear sampling, so float-linear texture filtering is not required.
The source-volume integral also supplies the existing single approximate scene
light, which excludes engine hardware.

Default field resolution is **64 axial × 32 radial samples**, using **32 KiB of
GPU source texture per engine**. The named axial/radial controls each allow
8–64 samples; host evaluation buffers and update work scale with that product.
The volume remains one 12-triangle mesh. Each ray step fetches four field texels;
ray samples, field samples and draw distance stay in **Renderer → Aircraft
exhaust**. The ray default is now **32**, because independent integration found
large errors at 8–16 for narrow emission. Existing user-selected lower budgets
are preserved. No GPU cost or performance improvement is claimed.

Ray segment boundaries cluster toward the lower-axial-distance end of each ray,
with weaker clustering as axial span decreases; transverse rays remain uniform.
Every segment uses its own physical length and front-to-back transmittance.
This resolves the short emitting region without multiplying its intensity or
adding samples. Uniform box stepping could nearly skip the first 0.095 m field
cell even at 32 samples. The measured bright-ray integration error falls from
6.22% to **0.396%** against refined independent RK4 on the checked rays. The
separate 64 × 32 field interpolation error is **≤0.425%** on the checked bright
rays versus 64 × 64; very faint tails retain larger relative errors. These are
finite numerical comparisons, not guarantees for every camera or GPU pixel.

Physical fields are cached independently of display gain, white reference,
exposure, camera and clock-only updates. Hidden gas/scene-light views defer field
work until needed. Resizing replaces and disposes the owned texture. Readiness,
disposal, contribution isolation and render-on-demand have software regressions;
the light-only view also now requests a frame when its first light appears.
Ambient Rankine is read once in the existing noncreating native property batch
and converted to kelvin; unavailable ambient suppresses the spatial source.

This field has **no downstream transport state**. AB source allocation follows
native burned fuel causally at each accepted observation; cutoff removes that
source immediately in the quasi-steady approximation. There is no render-time
fade or invented residence-time simulation. Finite transport, if introduced,
belongs in JSBSim with persistence and fixed-step tests. Pause/recovery/Location
remain native-owned; held inputs produce identical field data. The app's visual
activity gate follows positive fuel/spool observations, so its short shutdown
tail is distinguished from the native running flag becoming false.

## Retained numerical and software checks

The [independent optical report](../../validation/evidence/aircraft/f35b/plume-spatial-2026-10-06/spatial-optics/README.md)
checks eight native milestones, 54 local spectral nodes, complete field source
powers, a homogeneous analytic transfer case, field refinement and 480 ray
comparisons. Local combined-spectrum error is at most **0.158% of peak reference
channel**. Independent quadrature agrees with reported complete-field power to
1.07 × 10⁻¹⁴ relative and with the actual Float32 RGB integral to 6.22 × 10⁻¹⁵.
These checks establish the implementation of the declared approximation; they
do not validate its unmeasured physical inputs.

The [final geometry record](../../validation/evidence/aircraft/f35b/plume-spatial-2026-10-06/geometry/README.md)
covers 12 nozzle poses and 36 views. All retain positive unoccluded support.
At 32 ray samples two very thin tracer paths are missed, with no whole-view
loss. This does not establish visibility through ground or airframe geometry.

Twenty-four retained CPU images compare the previous and new gas fields from
rear/oblique views with fixed day/night backgrounds, exposure 1 and white
reference 1000 cd/m². New powered-lift peak Y is only **0.000111 / 0.000167 cd/m²**
in rear/oblique views, versus **0.01115 / 0.01183** previously. AB onset is a
compact cyan/green annulus; sustained AB has a bright cyan/white base and faint
warmer tail. Those colors follow provisional local spectra, not measured F135
species distributions. At onset 19.1% of meaningful source nodes are outside
linear-sRGB before gamut mapping, while no CPU image pixels exceed the selected
white reference. The CPU display operator compresses high values and is not
the application's GPU tone mapper. Neither metric proves absence of rendered
clipping. See the optical report for the images, thresholds and full limits.

Final incremental TypeScript, related tests (**63 files / 782 tests**) and lint
passed. **`npm run ci` passed once: 169 files, 1,832 passed tests and one existing
expected failure**, followed by the production build and JSBSim/audio/exhaust/
engine artifact checks. The existing F-35 main-gear containment expected failure
is unrelated and preserved. [Application logs](../../validation/evidence/aircraft/f35b/plume-spatial-2026-10-06/application/README.md)
record the commands, source hashes and evidence audit. No code changed after
these checks. Archived source snapshots end in `.txt`; discovery includes no
evidence copies. The current legacy evaluator also reproduces all 4,171 frozen
uniform-baseline rows exactly.

Reproduce the independent optical and geometric diagnostics with
`node scripts/validation/f35b/check-spatial-plume.mjs` and
`node scripts/validation/f35b/check-plume-geometry.mjs`. Both default to fresh
dated directories under `build/`. Native trace reproduction and its explicit
frozen-baseline option are documented in the native evidence README. Generated
optical assets use `npm run build:exhaust`; `npm run verify:exhaust` checks their
bytes without replacing them.

## Acceptance limits and user check

Independent CPU spectra, field integrals, transfer quadrature, state transitions,
sampling convergence, sensitivity cases and rear/oblique projections are retained
with recorded exposure and backgrounds. They are not flight-app screenshots.
The required rendered daylight/night comparisons and AB-onset gamut/clipping
qualification remain pending an explicitly requested browser/GPU run.

The new expansion/mixing assumption makes the dry thermal source **dimmer** than
the old uniform gas field. It does not yet explain the Navy footage's external
red/orange emission and illuminated deck. Temperature/station calibration,
particle loading, surface/reflected contributions and camera response remain
possible differences. The retained [powered-lift and test-cell references](../proposals/f35b-fdm.md#observations-hypotheses-and-unresolved-discrepancies-2026-10-06)
remain valid constraints. No dry brightness multiplier, external fuel burning,
AB activation in hover, or universal hue was added to force agreement.

For an interactive check, run `npm run dev`, select F-35B, and open the Earth
test stand from **Engine → Engine test stand**, starting cold. Use 32 exhaust ray
samples and the default 64 × 32 field. Keep display gains, white references and
scene exposure fixed. Test idle → 99% dry → AB onset → sustained AB → 99% →
shutdown, then test full-throttle VTOL separately. Compare rear and oblique views
using gas, solid, reflection and nearby-light contribution modes. Export native
history/CSV with the operating state; record daylight/night settings and exposure.
Use normal restart for retained heat, and the explicit already-running choice
only as a separate initialized experiment. This record does not claim those
visual comparisons have already passed.
