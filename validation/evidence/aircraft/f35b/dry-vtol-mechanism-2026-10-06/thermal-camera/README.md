# Dry thermal emission, observer and receiver constraints

The existing dry source can produce visible red light under a sufficiently
sensitive low-light observation without another combustion source. This is a
quantitative possibility, not identification of the reference camera or physical
acceptance of the present F135 temperature/loading model. The reproducible
[diagnostic](../../../../../../scripts/validation/f35b/analyze-dry-exhaust-observer.mjs)
holds the retained dry native observation fixed. `report.json`, `spectrum.csv`,
input snapshots/hashes and check logs record the calculation.

At **1003.128 K**, the blackbody ceiling is **2.89145 cd/m²**. Integrated radiance
is **0.21361 W/(m² sr)** over 380–780 nm and **16.98494 W/(m² sr)** over
780–1100 nm. The latter carries **109.62 times** as many photons. A homogeneous
one-metre slab with the current 0.025/m grey absorption gives **0.07139 cd/m²**;
the retained nonuniform exit ray gives **0.01859 cd/m²**. These are different
physical supports, not interchangeable estimates of a pixel.

## What a stock color camera could record

The diagnostic evaluates
`N_e = A_pixel t π/(4 N²) ∫ Lλ τoptics(λ) QE(λ) λ/(hc) dλ`.
It uses a declared 5 µm pixel, f/2.8 and 20 ms exposure, with unity quantum
efficiency and lens transmission to expose an upper sensitivity bound. An
isothermal spectrum with the same photopic luminance as the retained exit ray
gives about **9, 38, 82, 255 electrons** for ideal sharp cutoffs at 650, 700,
730 and 780 nm. Real filter transmission, color filters, QE, noise and source
pixel coverage must be applied before claiming detectability. A larger aperture,
pixel or exposure increases collected photons by its stated physical factor;
gain increases recorded signal and noise, not collected photons.

The cutoff matters. [Basler's optical guidance](https://www.baslerweb.com/en/learning/cameras-fluorescence-microscopy/)
describes color-camera IR filters blocking above approximately 650–700 nm.
[Hamamatsu's example silicon detector](https://www.hamamatsu.com/us/en/product/optical-sensors/photodiodes/si-photodiodes/S16008-66.html)
responds through 1100 nm; that is not a specification for the footage camera.
[Axis explains](https://whitepapers.axis.com/en-us/lighting-for-network-video)
that NIR can reach all RGB filter channels and compromise color. An NIR photon
is not intrinsically red or orange. Night recording alone does not establish
that the IR-cut filter was absent; common day/night cameras output monochrome
when it is removed.

With the grey thermal spectrum, average NIR sensitivity of 0.01 times visible
sensitivity makes the NIR photon contribution about 1.10 times the visible
contribution; 0.001 makes it 0.110 times. These are conditional leakage bounds,
not measured filter rejection. The implementation must keep CIE-visible and
camera-NIR outputs distinct.

The retained source's red channel at the existing 1000 cd/m² white reference is
0.00110 after the diagnostic's component Reinhard/sRGB mapping at 0 EV, 0.15694
at +8 EV and 0.31304 at +10 EV. Source watts are identical. This demonstrates a
real observation-range issue but neither reconstructs the live HDR/compositing
pipeline nor identifies the correct exposure. It cannot alone explain the deck
patch or qualify the oversized-AB complaint.

## A mass-constrained particle model

[NIST's 2018 measurements](https://www.nist.gov/publications/measured-situ-mass-absorption-spectra-nine-forms-highly-absorbing-carbonaceous-aerosol)
found flame-soot absorption coefficients of 3.8–8.6 m²/g at 550 nm and spectral
exponents 1.0–1.3 over 500–840 nm. These are absorption measurements, so they
can enter thermal emission; total extinction must not be substituted silently.
They are measurements of other flame particles, not F135 soot.

The reduced relation is
`κλ = MAC550 ρsoot (550 nm/λ)^α`, with MAC in m²/g and soot density in g/m³.
At κ550 = 0.025/m, the measured MAC interval implies **2.91–6.58 mg/m³** locally.
Using the retained, uncalibrated 115.83 kg/s flow proxy, ideal-gas density at its
98.31 kPa and 1003.128 K, and a uniform cross section gives an equivalent
**223–505 mg soot/kg fuel**. Real radial loading lowers the area mean. This is a
mass check on the assumed opacity, not a newly measured emission index.
[A primary V2527 idle study](https://digitalcommons.unl.edu/nasapub/205/)
measured 225 ± 35 mg/kg; its different engine and operating point offer a scale
comparison only.

At unchanged κ550, α = 1 and 1.3 lower the one-metre visible luminance to
**0.06422 and 0.06226 cd/m²**, versus 0.07139 for grey opacity. Their NIR values
are **0.22990 and 0.19206 W/(m² sr)**, versus 0.41936 grey. The power-law extension
outside the measured 500–840 nm interval is a declared spectral hypothesis.
This correction is physically motivated and does not boost the dry source.

## Thermal molecules and deck mechanisms

[NASA TP-1722](https://ntrs.nasa.gov/api/citations/19810010595/downloads/19810010595.pdf)
distinguishes gas bands from a soot continuum in a measured JT8D combustor.
Its strong H₂O/CO₂ bands are mainly beyond ordinary silicon's response.
They contribute heat, not ordinary RGB pixels through a direct detector path.
Water's weaker NIR bands remain relevant:
[heated-cell measurements near 940 nm](https://opg.optica.org/ao/abstract.cfm?uri=ao-44-31-6593)
cover 420–970 K. [HITEMP](https://hitran.org/hitemp/) provides the hot-band data
needed for `κλ(T,p,X) Bλ(T)` transfer. At the retained gas temperature, even a
fully opaque 930–950 nm interval is bounded by **0.76794 W/(m² sr)**. Actual
line filling, water concentration, pressure/path and camera response reduce or
redistribute it. No line strength or band opacity was fabricated here.

The receiver calculation applies the exact parallel disk-to-point projected
solid angle `πR²/(h²+R²)` and a declared 20% Lambertian reflectance. At one metre,
a disk uniformly filled with the retained dry-ray spectrum returns
**0.000516 cd/m²**. Alternative filled disks at the retained hot core and liner
temperatures return **0.02068** and **5.40 × 10⁻⁷ cd/m²**. They are alternatives,
not additive contributions: actual hardware visibility and radiating area must
be integrated to predict a deck patch. Specular reflection, airborne scattering,
impingement and heated-deck emission are distinct terms.

Surface heating cannot be identified from heat load alone. Blackbody ceilings
are 6.74 × 10⁻⁷, 1.39 × 10⁻⁴, 0.00809 and 0.20020 cd/m² at 600, 700, 800 and
900 K. [NAVSEA's thermal account](https://www.navsea.navy.mil/Media/News/Article-View/Article/4053212/carderock-team-provides-critical-technical-support-for-f-35b-sea-trials-on-js-k/)
establishes heating and cooling, but gives no deck temperature or visible
incandescence. Immediate co-motion/disappearance of a patch favors reflected
illumination or plume-local scattering over a long-lived heated footprint;
measured persistence and spatial alignment are the useful discriminator.

## Implementable next steps and checks

1. Bake a non-grey particle-emission table with κ550 retained, α = 1 nominal
   and 1–1.3 sensitivity. Use the same spectrum for the thermal power integral.
   Do not apply it to metal emissivity or normalize its color/amplitude.
2. Compare the same source under explicitly recorded global exposure/fill and
   white reference; keep physics fixed and evaluate dry and AB together. A
   low-light observer configuration must also affect the surrounding scene.
3. Integrate visible engine/volume radiance onto a lit aircraft-test receiver
   with geometry and visibility. Keep receiver reflectance and dimensions
   explicit. Thermal surface emission requires a separate heat-history model.
4. Add HITEMP/NIR observer calculations only as spectral sensitivity diagnostics
   unless a camera response or measured spectrum supports their actual use.

The executable passed independent wavelength/frequency Planck agreement within
6.64 × 10⁻¹⁵ relative, 0.25-to-0.125 nm band refinement within 6.96 × 10⁻⁶,
zero/thick-slab limits, photon-band additivity and source bounds. Targeted lint
passed. No browser, server, native run, GPU test, runtime change or appearance
acceptance is represented by this record.
