# Current non-gray source and viewing experiment

The runnable aircraft diagnostic is
[check-dry-soot-source.mjs](../../../../../../scripts/validation/f35b/check-dry-soot-source.mjs).
It evaluates the current baked source against an otherwise identical gray source,
using frozen native observations rather than a new engine run. `report.json`
records the complete inputs, snapshots, hashes, source integrals and independent
transverse rays. Software logs are retained here, including the initial stale
light-unit expectation and its successful focused correction.

The dry powered-lift case remains **1003.128 K**, **zero burned AB fuel**, and
**κ550 = 0.025/m**. Its exterior source-volume Y integral changes from
**0.0113786 to 0.0102186 cd**. The whole-field particle source-power bound changes
from **5112.42 to 733.498 W** because the same non-gray absorption law is now
used in the bolometric integral. This is not a change in native engine heat,
measured escaped power or a closed engine energy balance. CH and C₂ remain zero
in dry operation. Native gas and solid temperatures, thermal-spatial basis,
fuel inputs and geometry are identical in the comparison.

Sustained AB exterior source Y changes from **37408.67 to 35773.67 cd**.
The spectrum correction therefore cannot be presented as a resolution of the
user's oversized-AB report. Reaction-source watts are identical in every case;
changing the AB flag alone leaves the stored source field exactly invariant.

[The contact sheet](exposure-comparison.svg) applies +0, +8 and +10 EV to each
case's **same frozen radiance buffer**, with white reference 1000 cd/m²,
component Reinhard mapping and sRGB encoding. The generated PNGs are retained
alongside it. The dry +10 EV panel has been inspected and shows a faint red
exterior jet. It is a source-only CPU visualization, without hardware, scene
illumination, deck, scattering, reference-camera response or the live material
composition path. Each panel is 2 m wide and 3 m downstream. All panels use
the same plotting orientation for comparison; the AB panels do not represent
operational hover. **Live appearance acceptance remains open.**

The runtime also corrects a separate scene-light unit error. The approximate
point light previously used raw source candela while the gas used radiance
divided by its explicit white reference. The light now divides by that same
reference once. At reference 1000, this prevents a 1000× relative reflected-light
gain. Tests verify reference scaling, exposure independence, hardware exclusion,
exterior-only source accounting and lifecycle. This remains an unshadowed
far-field point approximation, not an impinging-flow or near-deck solution.

Its range now uses glTF inverse-square falloff with a smooth finite-distance
taper, because Babylon's physical falloff ignores positive range in PBR.
The taper only reduces the upper bound and is a visualization limit.

`refined-rays/` retains the exterior transverse checks at 32/64/128 steps and
their 2048/4096-step reference refinement. The current
[complete-input posed record](posed-rays-complete-inputs/README.md) includes
**24,024 triangles per pose**, the native upstream gas temperature and ambient
pressure, and assertions that positive burned AB fuel activates the resolved
conditional parcel. CH power is **3.68683 W at onset / 190.59326 W sustained**.
Selected peak RGB errors reach **4.53442% at 32**, **2.98577% at 64** and
**0.702479% at 128** steps. The maximum 2048/4096 reference difference is
**0.102416%**. At 32 steps the worst bright-ray error is **3.64138%**; the larger
relative maximum belongs to a very dim cutoff-edge ray. The current 32-step
default **fails the 1% criterion** on twelve rays and the run exits 1. Higher
budgets remain available; no runtime default or threshold was changed.

The preserved [preceding posed run](posed-rays/README.md) had actual hardware
but omitted the upstream-temperature/pressure inputs and silently disabled the
current AB parcel. Its AB errors are an incomplete-source subset, superseded
by the complete-input record; dry and zero-burned-fuel ray values match exactly.

`invalid-empty-hardware-run/` preserves the preceding run with the faulty
index handling. Its hardware occlusion is invalid; consult the
[erratum](../occlusion-erratum/README.md). Original historical evidence was
also preserved with explanatory notices.

No server, browser, GPU run, benchmark or WASM build was performed. The source
and observer calculations support a mechanism under declared assumptions;
they do not measure F135 soot, nozzle temperature or the supplied video's
absolute radiance.
