# Independent spatial plume numerical and CPU image evidence

The [final report](report.json) evaluates eight actual native milestones from
[the new native trace](../native/trace.csv): cold, idle, dry99, AB onset, sustained
AB, cutoff, full-command powered lift and shutdown. Cold/shutdown have no active
field. The other six cases use the final 64 axial × 32 radial Float32 source field.
No GPU, browser, scene renderer, native rerun or performance benchmark is involved.

Reproduce with `node scripts/validation/f35b/check-spatial-plume.mjs`. The command
creates a fresh dated directory in `build/validation/spatial-plume`. It exits
nonzero for the explicit numerical thresholds in the report. Source snapshots
have `.txt` suffixes; report inputs and [files.json](files.json) identify their
hashes. The earlier native trace already carries frozen uniform-source values.

## Independent checks and results

The reference integrates frequency-form Planck radiation and the declared
CH*/C2* Gaussian bands at 0.25 nm using the retained CIE observer. It combines
XYZ before a single luminance-preserving gamut map. It does not call production
spectral interpolation. Local source errors on the listed 54 nodes are at most
**0.158% of peak reference channel**.

A separate elementwise Gauss quadrature integrates the full bilinear field with
its expanding cylindrical Jacobian. It does not use production volume weights.
The complete particle + CH* + C2* source integral agrees with reported watts to
**1.07 × 10⁻¹⁴ relative**, and stays below each declared fuel-power cap. The actual
Float32 RGB field integrated independently agrees with the reported isotropic
intensity to **6.22 × 10⁻¹⁵ relative**. Source powers are about 265 W at idle,
362 W dry/powered lift, 1,218 W at onset and 43,999 W sustained AB. These are
unattenuated source upper bounds, not a measured engine energy budget.

Independent RK4 transfer at 4,096 and 8,192 steps agrees within **9.2 × 10⁻⁷
relative** on the listed paths. A uniform cylinder matches its analytic transfer
solution. Uniform physical temperature/loading inputs give uniform chromaticity;
changing only temperature retention gives a normalized RGB range of 0.1195.
Chemical source scales causally with actually burned AB fuel at factors 0,
0.25, 0.5 and 1. There is no imposed downstream transport state or time fade.

The final source field is compared with 64 × 64 on 30 rays, including near-axis,
off-axis and faint edge paths in three states. Above a 1 cd/m² reference-channel
peak, the difference is at most **0.425%**. Very faint tails differ by up to
16.8% (a reference peak of 4.6 × 10⁻⁹ cd/m²); the relative and absolute values
remain in the report. This bounds these selected paths, not every possible ray.

The 480 transfer comparisons retain both uniform and exit-clustered integration
at 4, 8, 16 and 32 samples. Segment widths are physical lengths; clustering is
quadrature, not altered emission. At the final 32-sample default, the largest
error above 1 cd/m² is **0.396%**; the largest relative error on any listed finite
path is **3.74%**, at a dry tail of 2.24 × 10⁻¹⁷ cd/m². Lower budgets remain
user choices: eight clustered samples have a 13.2% bright-ray error here.

[Previous attempts](previous-attempts) preserve the rejected numerical choices.
The 32 × 16 field differed from 64 × 64 by 60% on a dim dry rear path and 5.83%
on a bright sustained-AB rear path. Improving the field exposed insufficient
uniform ray spacing: even 32 uniform samples missed 86.4% on a dim near-exit dry
path and 6.22% on a bright AB path. The final clustered quadrature addresses that
sampling failure without changing the physical field. The earliest report also
predates the combined-XYZ correction; its narrower component test must not be
read as validating that rejected mixture mapping.

## Controlled images, gamut and unresolved appearance

The 24 PNGs are independent volume integrals with 96 samples per ray, 192 × 128
pixels and identical old/new camera framing. Exposure and intensity are 1;
white reference is 1000 cd/m². Gas and background are composed linearly as
`Lgas + transmission × background`, then divided by white, mapped with
per-channel Reinhard, and encoded as sRGB. Chosen background RGB luminance
hypotheses are [40, 50, 70] cd/m² by day and [0.002, 0.003, 0.005] at night.
This simple display operator is not Babylon's rendered HDR pipeline or a real
camera response. Images exclude hardware, ground, airframe, scattering, scene
light and reflection; use the separate geometry audit for visibility support.

| Case | New rear / oblique peak Y (cd/m²) | Previous uniform rear / oblique |
| --- | ---: | ---: |
| Powered lift | 0.000111 / 0.000167 | 0.01115 / 0.01183 |
| AB onset | 319.1 / 378.5 | 206.7 / 59.65 |
| Sustained AB | 10,025 / 12,048 | 195,408 / 70,953 |

The new AB onset is a compact cyan/green annulus in the oblique view. Sustained
AB has a bright cyan/white annulus, a violet inner region in the rear view and
a faint warmer downstream tail. These colors arise from the provisional local
spectral mixture, but their locations and ratios are not F135 calibration.
Visible emission is concentrated near the exit despite six metres of support.
The previous source is a longer, nearly uniform white/yellow streak at sustained
AB. Retaining its useful spatial appearance does not validate its former field.

At onset **19.1% of meaningful field nodes** are outside linear-sRGB gamut before
the combined map; at sustained AB it is 23.1%. “Meaningful” is explicitly above
0.1% of that field's peak RGB source. The map preserves Y within 4.04 × 10⁻⁷
relative here. All meaningful dry nodes are outside that display gamut and map
to a very dim red source. The report records pre-map gamut separately from
image display range. AB onset has no pixels above the declared white reference.
Sustained-AB night images have 12.79% rear / 1.34% oblique pixels above white,
versus 11.18% / 5.03% previously. Reinhard compresses those values rather than
hard clipping; zero encoded channels exceed its range by construction, which
is not evidence of correct GPU tone mapping or universal absence of clipping.

Dry powered lift remains visually absent in these fixed-exposure 8-bit night
projections and is dimmer than the previous model. The night footage discrepancy
is **unresolved**. No brightness gain or AB activation was used to force a match.
Required actual-flight daylight/night, rear/oblique appearance qualification
remains pending an explicitly authorized browser/GPU run.
