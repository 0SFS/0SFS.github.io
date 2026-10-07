# Non-grey particle source spectrum

This implements a reduced spectral correction in the aircraft optical bake.
Reference absorption remains **κ550 = 0.025/m** in both modes. The source uses
`κλ = κ550 (550 nm/λ)^α`, with **α = 1**, sensitivity **1–1.3**.
[NIST's primary laboratory measurements](https://www.nist.gov/publications/measured-situ-mass-absorption-spectra-nine-forms-highly-absorbing-carbonaceous-aerosol)
support this spectral-exponent interval over 500–840 nm for flame-generated
soot. They do not establish F135 loading, particle temperature or the power law
outside that measured interval. Full-spectrum extrapolation is an explicit
reduced-model hypothesis.

The generated `particleSpectrum.xyz` and `.rgb` tables retain absolute
absorption-weighted photometric radiance per unit κ550. Existing unweighted
blackbody and solid-emission tables are unchanged; the acceptance receipt
compares them exactly with the preceding retained profile. Profiles without
the new field retain the historical grey model. The runtime integration and
combined software checks are separate root-owned records.

The bolometric source bound uses the same spectrum:

```
Psource = integral_volume 4 κ550 σ T⁴ ratio(T) dV
ratio(T) = (550 nm kT/hc)^α Γ(4+α) ζ(4+α) / [Γ(4) ζ(4)]
```

`ratio(T)` is stored as `planckMeanAbsorptionRatio`, with unit
`relative-to-reference-absorption`. It is linear in temperature for α = 1.
At **1003.128 K**, the ratio is **0.1469525610** and the independent weighted
visible Y is **2.597835 cd/m²**, versus the unweighted blackbody 2.891446 cd/m².
The spectrum correction lowers visible emission at the same opacity; it cannot
by itself fix the reported dry darkness. [Observer sensitivity](../thermal-camera/README.md)
is a separate calculation with unchanged source power.

## Numerical checks

The [runnable diagnostic](../../../../../../scripts/validation/f35b/analyze-particle-spectrum.mjs)
compares the generated table with independent frequency-form Planck/CIE
integration and a direct frequency-domain bolometric integral. It checks the
150 K and 3200 K endpoints plus eight interior temperatures. Sampled logarithmic
XYZ interpolation has maximum photopic relative error **0.1174%**, maximum
XYZ-channel error **0.1577%**; linearly interpolated power ratio differs by at
most **3.95 × 10⁻¹¹ relative**. This is the recorded sample matrix, not a proven
all-temperature bound.

Runtime scalar κ550 attenuation remains an approximation. For a homogeneous
slab, exact transfer is `Bλ[1 − exp(−κλ L)]`; the reduced path uses
`Bλ(κλ/κ550)[1 − exp(−κ550 L)]`. It does not approach the correct LTE blackbody
limit at large optical depth. The diagnostic compares both across α = 1 and
1.3, 800/1003.128/1500/2000/2500 K, and these declared paths:

| Path m | τ550 | Maximum photopic error | Maximum XYZ-channel error |
| ---: | ---: | ---: | ---: |
| 0.1 | 0.0025 | 0.01873% | 0.03236% |
| 1 | 0.025 | 0.18654% | 0.32168% |
| 6 | 0.15 | 1.09401% | 1.86745% |
| 12 | 0.3 | 2.12846% | 3.58970% |

The 0.25-to-0.125 nm quadrature comparison differs by at most 4.90 × 10⁻⁶
relative in exact-slab photopic Y. These are homogeneous-slab errors, not bounds
for arbitrary temperature/loading profiles or actual posed engine rays. No RGB
channel extinction approximation or infrared-to-visible mapping is hidden in
the result.

The first focused run found a **3.39% relative cold-end error** when the new
particle table reused the old rectangular 1 nm integral. Only the new particle
table was changed to quarter-nanometre trapezoids with interpolated official CIE
observations. The failure log remains retained. Its corrected focused file
passed **6 tests**, including independent α = 0/1/1.3 spectra, an analytic α = 1
power moment, negligible cold amplitudes, unchanged solids, absent legacy
fields and invalid-input checks. Deterministic generation and stale-artifact
detection are also covered by that file.

`acceptance.json` retains source/output identities and exact commands. The final
bake, focused run, targeted lint and standalone diagnostic passed. No additional
suite, browser, server, GPU capture, benchmark or native run was performed here.
These checks qualify the approximation's arithmetic, not the F135 source or the
user's night-footage appearance target.
