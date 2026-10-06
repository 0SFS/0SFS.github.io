# Reconstructed engine optics, 2026-10-06

The engine optical changes belong to 0sfs. They use the existing shared gas
renderer and independent native-temperature material bindings. No rendering-time
thermal integration, N1/N2-to-temperature conversion, extra animation clock or
eight-light arrangement was added.

The [profile source](../../../../../../../scripts/exhaustOptics/f135-visible-approximation.json)
declares provisional inputs. The retained [manifest](f135-exhaust-lut.manifest.json)
contains source attribution, assumptions and deterministic hashes. Reproduce the
runtime assets with `npm run build:exhaust`; verify them with
`npm run verify:exhaust`.

- The [Cartesian gas mask](f135-exhaust-spatial.png) is a 128×128 original offline
  bake. Red stores a nonuniform annulus, green stores downstream mixed emission.
  Radius 0.68, width 0.16, eight lobes and 35% contrast are explicit hypotheses.
  The count comes from the user's interpretation of the retained F-35A sequence;
  it does not identify B hardware, injectors, thermal zones or lights. The shader
  reads the mask once per ray sample, in addition to its existing spectral lookup.
- The [spectral lookup](f135-exhaust-lut.png) retains separate dry and native-AB
  banks. Dry emission no longer quantizes to nearly zero at useful operating
  temperatures. It can illuminate an external powered-lift plume without changing
  augmentation. Its optical loading is an assumption, not measured F135 radiance.
- The AB mixture changes from a warmer continuum-rich nozzle toward a band-rich
  downstream region. It represents a testable alternative to the prior almost
  entirely soot-continuum profile. It does not establish a universal pink or
  orange plume, measured species fractions or a camera response.
- Core-facing and cooled-liner material groups receive separate native solid
  temperatures. They use the unchanged absolute visible grey-body table and an
  explicit display reference. Gas pattern, gas flicker, power and AB never gate
  solid incandescence; stopped hardware can remain hot.
- One optional unshadowed point light uses relative RGB baked from the gas table.
  The Renderer → Aircraft exhaust settings expose its enable switch, 1000 cd
  default reference and 12 m default range, with bounds and reasons. The reference
  is a display assumption at unit baked emission, not a measured engine output.
  The light follows the nozzle, holds at fixed native time and is removed when
  its gas source is hidden, disabled, stopped, out of range or disposed.
- Gas emission now consumes the shared `scene.imageProcessingConfiguration`,
  using Babylon 8.56.2's public define/uniform/sampler/bind API and its own GLSL
  and WGSL image-processing includes. Exposure, tone mapping, color curves and
  grading are the same configuration used by the PBR solids. The gas shader has
  no private Reinhard or gamma step: processing occurs once in the material, or
  raw linear emission reaches the configured postprocess with PBR's final-clamp
  convention. Display changes leave gas temperature and baked emission inputs
  unchanged. Shared grading textures participate in readiness and retain scene
  ownership. Configuration changes use normal material readiness and the existing
  scene scheduler; hidden plumes request no frames.

The point light affects materials that participate in scene lighting. FOSS
Earth's raster-basemap material explicitly uses `disableLighting = true` and
white emissive color in `createRasterTilesRuntime.ts`; it cannot show this light's
deck patch. No global map-lighting behavior was changed. Deck impingement,
scattering and occlusion remain unmodeled. Visible glow on a particular scenery
source needs a GPU check; this evidence does not claim that check passed.

Run `node scripts/validation/f35b/check-reconstructed-optics.mjs` for the
[offline projection report](optics-report.json). At 4, 8, 16 and 32 samples,
parallel rear-ray projections retain annulus/center luminance ratios of 2.74–3.65
at dry 1000 K and 3.09–3.80 at AB 2500 K. The acceptance threshold of 2 is an
implementation criterion, not a measurement of the source video. This projection
contains no hardware, view perspective, scene background, exposure or white
balance. It is useful to detect a collapsed uniform disk before visual review.

[Related tests](related.log) passed 36 tests in three files for the bake,
profile and runtime. They cover deterministic artifacts, nonzero dry light,
native AB bank selection, two independent metal states, hidden preparation,
held time, resource bounds, texture/light disposal and dark-center mask behavior.
[Typecheck](typecheck.log) and [targeted lint](lint.log) also passed. These logs
precede the final optional hot-hardware attachment-root adjustment and the
addition of the standalone projection script; final integration checks are
recorded by the parent rebuild acceptance. The [bake log](bake.log) records asset
identities. No browser, GPU benchmark, matched rear/oblique comparison or fixed
day/night exposure qualification was run.

The follow-up [image-processing tests](imageprocessing-tests.log) passed all 28
runtime tests after the attachment-root and shared display integration changes.
They verify exposure/ACES/color-curve settings, the raw-linear postprocess path,
unchanged optical state, shared texture ownership, hidden updates and observer
disposal in both declared shader languages. [Typecheck](imageprocessing-typecheck.log)
and [lint](imageprocessing-lint.log) passed. These are software-contract checks,
not GLSL/WGSL GPU compilation or visual exposure/white-balance qualification.
