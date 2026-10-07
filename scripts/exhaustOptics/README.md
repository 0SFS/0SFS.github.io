0sfs owns this aircraft exhaust bake. Run `node scripts/build-exhaust-optics.mjs`
for a dated scratch output, `--install` to replace generated assets, or `--check`
to verify them against their complete source inputs. The script also checks or
generates the existing smoke asset. Runtime has no network access or spectral
integration.

The latest particle correction is a **non-grey source spectrum**, separate from
the observer investigation. It retains reference absorption **κ550 = 0.025/m**
and bakes `κλ/κ550 = (550 nm/λ)^α` with **α = 1**, sensitivity **1–1.3**.
[NIST's primary flame-soot measurements](https://www.nist.gov/publications/measured-situ-mass-absorption-spectra-nine-forms-highly-absorbing-carbonaceous-aerosol)
support that exponent range over **500–840 nm**; they do not measure F135 soot.
The extension to all wavelengths is a declared model hypothesis.
`gasEmission.particleSpectrum` contains separate absolute XYZ/RGB tables and a
dimensionless Planck-mean absorption ratio. Its bolometric source is
`4 κ550 σ T⁴ ratio(T)`, with
`ratio = (550 nm kT/hc)^α Γ(4+α) ζ(4+α) / (Γ(4) ζ(4))`.
This keeps the same spectrum in visible emission and the thermal power bound.
At 1003.128 K the ratio is 0.146953; the unweighted blackbody table and all solid
emission tables remain unchanged. Profiles without `particleSpectrum` retain
their historical grey behavior.

The new particle table uses quarter-nanometre integration of the interpolated
official CIE observer. Runtime still attenuates with scalar κ550. This is an
approximation to spectral transfer, not an LTE-correct optically thick limit.
The [spectral diagnostic](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/particle-spectrum/README.md)
quantifies its error for declared homogeneous paths. It also checks independent
Planck integrals and interpolation. No non-grey table normalizes a cold spectrum
to a visible peak, and the correction slightly lowers dry visible emission.

The [thermal/camera diagnostic](../../validation/evidence/aircraft/f35b/dry-vtol-mechanism-2026-10-06/thermal-camera/README.md)
instead holds the source fixed and quantifies visible/NIR photon collection,
exposure sensitivity, opacity-implied soot mass and separate receiver hypotheses.
It does not map infrared energy into visible scene RGB or assert an unknown
camera's spectral response. Neither diagnostic qualifies the night-footage match.

The latest [AB response checkpoint](../../docs/validation/f135-exhaust-response.md)
adds the [conditional internal CH(A) parcel](combustion/README.md) and a
constant-cp mean-enthalpy temperature mixture. The source-correction description
below records the preceding chemistry-unavailable baseline; its claims of no
replacement parcel and a homogeneous interior are historical, not the complete
current profile. The selected runtime parcel remains uncalibrated, C2 remains
unavailable, and dry powered-lift appearance remains unresolved.

The [dry VTOL observation ledger](../../docs/validation/f135-dry-vtol-observation.md)
records the remaining night-video constraint. The current scalar mixing basis
now preserves a finite hot core before centerline decay, with a growing thermal
shear layer. This follows the structure measured in
[NASA's high-speed Raman temperature study, figures 15 and 17](https://ntrs.nasa.gov/api/citations/20170005666/downloads/20170005666.pdf).
The 3-diameter plateau, 2–5-diameter sensitivity, cubic radial interpolation and
post-core decay coefficient remain declared F135 surrogate inputs. They do not
raise the native bath temperature, enable AB in hover or add dry chemical light.
This is baked once; runtime field and pixel sample budgets are unchanged.

The [preceding source-correction report](../../docs/validation/f135-exhaust-source-correction.md)
follows the [open post-test follow-up](../../docs/f135-plume-physical-followup-prompt.md) and
[primary-source audit](../../validation/evidence/aircraft/f35b/exhaust-correction-2026-10-06/source-research/README.md). The
[profile](f135-visible-approximation.json) records every source assumption,
uncertainty range and reference. Generated metadata retains those inputs and
their hashes. The older
[normalized reconstruction](../../validation/evidence/aircraft/f35b/engine-rebuild-2026-10-06/implementation/optics/README.md)
and [uniform dimensional model](../../validation/evidence/aircraft/f35b/engine-physical-correction-2026-10-06/optics/README.md),
plus the [rejected spatial pass](../../docs/validation/f135-plume-spatial.md),
remain preserved comparison records.

The current bake integrates absolute Planck radiation against the
official CIE 1931 observer. Gas tables have 1024 temperatures from 150–3200 K;
solid tables retain 512 temperatures from 300–1800 K and provisional visible
grey emissivity 0.8. Cold amplitudes remain negligible; no physical spectrum is
normalized to a visible peak. Raw XYZ receives one nonnegative RGB gamut map
preserving photopic Y. The solid
table likewise retains absolute cd/m².

The version-2 model declares the native observation as an **imposed gas-bath
proxy**, not a qualified exit static/total temperature. It applies no additional
Mach expansion. The offline 97×33 basis stores temperature-excess retention and
particle loading in axial exit-radius units and fractional radius. Particles
share this subsequently mixed bath. These remain physical-input hypotheses.
The field is quasi-steady, with no
downstream transport state, shock solution or render-time temperature dynamics.

Chemistry is explicitly **unavailable**: the native engine supplies no local
precursor, production, excited population or quenching state. The former imposed
fuel-to-photon allocation, equal CH*/C2* band energies and exterior reaction
bases are removed from the active profile. Zero stored chemical source is not a
measurement that exterior reaction is physically zero. No replacement interior
fraction, synthetic flamelet or hue ban is introduced. A future population model
also needs supported transition strengths and level populations; the primary
audit records these requirements. The version-1 evaluator and generator remain
compatible with frozen old profiles solely for reproducible comparisons.

For each changed physical input, the aircraft evaluator builds a user-sized
axisymmetric field (default 64 axial × 32 radial endpoint samples). RGBA32F stores
RGB emission in cd/m³ and extinction in m⁻¹. Signed path distance spans upstream
hardware and the exterior, with zero at the exit. Geometry supplies piecewise
outer/inner radii and ruled-section area factors. Upstream temperature/loading
continue the exit boundary as a homogeneous hypothesis, not an augmentor flame
solution. The complete interpolated source is integrated once, excluding solid
centerbody volume. Split Gauss quadrature is exact without a centerbody and
independently checked for the annular case. Further renderer seal-plane clipping
makes this circular-domain integral a conservative source upper bound.
The separate exterior-only integral supplies the approximate unoccluded nearby
light. Internal photons require volume transfer and hardware visibility; they
are not added to that point light.
Geometry quadrature has a separate bounded cache: one domain/resolution entry per
live profile. Changed thermal/fuel inputs reuse those read-only weights.

Both AB modes retain the previous uncertain dry coefficient 0.025 m⁻¹ and the
same uncertain 0.3% supplied-fuel-power ceiling. Toggling the mode flag alone
changes neither loading, temperature nor emitted source. This is continuity of
an explicit provisional model, not calibration of the correct particle loading.
The renderer samples this field directly, integrates transfer, divides by an
explicit luminance reference, and uses the shared scene image processing once.

The 6 m exterior support can truncate residual opacity and emission before
the authored basis reaches its axial fade at 24 exit radii.
Neither the support nor its discretization is an F135 flow solution. Independent
spectral accuracy, grid convergence, ray integration and appearance acceptance
are distinct checks; historical pass limits do not qualify this changed domain.

The 1×1024 optical PNG is only a fixed-reference preview, clipped at
10000 cd/m². The old 128×128 annular/angular PNG remains for historical and legacy
profile use. Neither PNG supplies gas color or density in the current F135
spatial-field shader. The HUD accent is a UI color, not a radiometric output.

[NASA's JP-8 imaging report](https://ntrs.nasa.gov/citations/20140000730) supports
CH*/C2* bands and soot-associated continuum, not F135 species fractions or
spatial distributions. [NISTIR 6783, section 4](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir6783.pdf)
supports emission/absorption and its grey-model limitations.
None of these sources calibrates the F135 field. The retained night powered-lift
glow and deck illumination remain open physical/appearance constraints; no gain
or external burning was added to force agreement. Required flight-render
appearance comparisons remain unqualified. Removal of unsupported sources alone
does not complete that appearance objective.

The observer CSV and metadata are unmodified official CIE files. Attribution:
CIE 2019, *Colour-matching functions of CIE 1931 standard colorimetric observer*,
International Commission on Illumination (CIE), Vienna, AT,
DOI [10.25039/CIE.DS.xvudnb9b](https://doi.org/10.25039/CIE.DS.xvudnb9b).
They and the derived optical tables/PNG/metadata are licensed
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Changes: absolute spectral integration, assumed material/particle/band inputs,
spatial bases and photometric conversion described above. Code follows the
repository's code license.
