0sfs owns this aircraft exhaust bake. Run `node scripts/build-exhaust-optics.mjs`
for a dated scratch output, `--install` to replace the generated asset, or
`--check` to verify the retained asset against its complete source inputs.
There is no network access or spectral integration in the runtime.

The model combines a grey-soot Planck continuum with simplified visible
radical bands, integrated against the official CIE 1931 observer. NASA's
[JP-8 combustor imaging report](https://ntrs.nasa.gov/citations/20140000730)
supports the selected emission mechanisms and approximate band locations.
[NISTIR 6783, section 4](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir6783.pdf)
supports the thermal continuum model and its optical-depth limitations.
Neither measures an F135 afterburner spectrum. The temperatures, band widths,
energy weights, soot fractions and relative intensity are explicit visual
assumptions in the JSON profile. No generic JSBSim EGT is interpreted as actual
F135 plume temperature, and no pressure/kinetic/soot-loading solution is claimed.
Components are normalized over the same 360–830 nm visible-energy window
before mixing. The soot coefficient is a visible radiant-energy fraction,
not a soot mass fraction or a chemical abundance. The default .995→.985
continuum fraction intentionally provides a warm, soot-dominated reference,
consistent only qualitatively with this
[documented daylight F-35B afterburner photo](https://www.dvidshub.net/image/9578175/us-marine-corps-f-35b-performs-during-luke-days-2026).
The NASA JP-8 experiments do not measure F135 component ratios. Changing these
unknown ratios produces different colors; no unique F135 color is claimed.

The 64×32 PNG contains linear-sRGB peak-normalized spectral colors in RGB and a
separately assumed relative intensity in alpha. It has no sRGB PNG chunk: set
the runtime texture's `gammaSpace=false`, disable mipmaps, and use clamped
texel-center UVs. U is axial distance. Rows 0–15 are faint dry thermal emission;
rows 16–31 are the afterburner mode. Native observed augmentation selects the
mode; normalized engine power selects a row. An off engine must draw no plume.
The shader supplies geometry, radial shaping, brightness and exposure. The dry
bank has no radical flame and peaks at 0.012 relative intensity before RGBA8
quantization. It must not be used to suggest dry hover uses an afterburner.
The first/top PNG scanline is dry row 0; Babylon loads it with `invertY=false`.
The afterburner alpha also contains an assumed static shock-cell envelope;
its count/contrast/falloff are declared visual parameters, not a nozzle-pressure
prediction. The dry alpha has no shock modulation.
The HUD accent uses the same assumed afterburner spectrum followed by sRGB
display encoding, with no separate whitening. It is a display accent, not an
exhaust colorimeter result.

The optional temporal brightness sequence is 32 baked samples over 0.8 seconds,
bounded within ±4% and mean one. Its periodic harmonics are artistic, unrelated
to measured F135 combustion instability or vibration. The runtime interpolates
wrapped sample indices using native simulation time; holding that time freezes
the brightness. It changes neither the baked spectrum nor the mode-bank choice,
and it needs no runtime spectral integration or per-fragment trigonometry.

The observer CSV and metadata are unmodified official CIE files. Attribution:
CIE 2019, *Colour-matching functions of CIE 1931 standard colorimetric observer*,
International Commission on Illumination (CIE), Vienna, AT,
DOI [10.25039/CIE.DS.xvudnb9b](https://doi.org/10.25039/CIE.DS.xvudnb9b).
They and the derived optical PNG/metadata are licensed
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Changes: spectral integration, assumed continuum/bands and conversion into the
RGB/relative-intensity lookup described above. The manifest records input and
output hashes and source URLs. Code follows the repository's code license.
