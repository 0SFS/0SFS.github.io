# F135-PW-600 reconstruction

This is the retained first-reconstruction record. Its aperture morphs, normalized
gas brightness, running stand default and fork.15 adoption are superseded by the
[physical correction](f135-engine-physical-correction.md). Counts and checks below
describe that earlier implementation; they are not current physical acceptance.

The original engine is replaced by an original 0sfs reconstruction generated from
[`profile.json`](../../scripts/f135Engine/profile.json) and
[`source.mjs`](../../scripts/f135Engine/source.mjs). The retained AF267 source and
earlier investigations remain unchanged. This implements the
[rebuild brief](../proposals/f135-engine-rebuild.md); measured PW-600 geometry,
thermal calibration and flight-app GPU appearance remain unqualified.

## Inspecting it

Run `npm run dev` when ready to open the app; this implementation session did not
start a server. Select **F-35B**, then open **Engine → Engine test stand**. The
stand starts on Earth at **MSP / KMSP runway 35**. Use **Location** to relocate it,
normal orbit/zoom to inspect it, **THR** and start/stop for power, and **VTOL** for
conversion. Stand operation retains native hold-down and does not overwrite a
saved flight. Turn the stand off to return to the installed aircraft view.

For the thermal comparison, start cold, allow idle to settle, hold 99% dry,
select full conventional afterburner, return to 99%, and shut down. The Engine
tab plots gas, core-facing metal and cooled nozzle temperatures independently
with N1/N2, fuel, augmentation and nozzle opening; CSV contains the same samples.
Use a longer history window to keep the whole cycle. In converted operation,
afterburner stays inhibited while dry exhaust emission remains available.

Exhaust settings expose sampling, range, intensity, the metal display reference,
and the single nearby scene light's enable, candela reference and range. The
light reference is an appearance input, not measured F135 luminous intensity.
The existing aircraft detail selection controls the generated geometry package;
the model panel reports the combined airframe and installed-engine triangles.

## Source and runtime contract

`npm run build:engine-assets` regenerates the exports and hashes.
`npm run verify:engine-assets` checks byte-for-byte reproducibility and runs as
part of the production build. No third-party preview image is a runtime texture.
The profile records primary B-specific mechanism sources and distinguishes them
from uncertain component dimensions, panel counts and material choices.

The full stand asset contains the inlet/fan, external casing, accessory forms,
augmentation duct, three-bearing swivel duct and layered compact nozzle. Flight
requests only the airframe with the old engine removed and the installed export.
That export retains the shared nozzle, thermal hardware, necessary internal
occlusion and intake-visible geometry. Hidden stand-only casing is not downloaded.

Both variants use identical common mesh data, material identities, bearing
frames and aperture morphs. Separate throat and exit radii describe authored
A8/A9 geometry; the native generic nozzle observer is still a display command,
not a calibrated PW-600 FADEC schedule. A forward axial bearing and two opposed
inclined circular joints articulate the duct; their coupled rotations preserve
native exhaust pitch/yaw, including yaw through conversion. The 23.75° joint
cuts, finite aft transition and component lengths are explicit hypotheses.
The nozzle wall remains continuous beneath overlapping seals and outer panels.
The two engine-bay doors reach 90° during the first quarter of conversion. A
provisional hinge 6 cm outboard preserves the exact closed shape while clearing
both the articulated engine and fuselage. This source-airframe fit is not a
measured door schedule and changes no native thrust or conversion commands.

Loading prepares both flight containers hidden and reveals them together after
readiness. Partial failures and cancellation release every acquired container.
The rig fixes the aperture's shader influencer count before preparation so a
zero-to-positive morph does not introduce a new shader after reveal. It binds
nodes once and changes transforms only when native observations change.

## Native temperature and optical appearance

The accepted native SDK is **1.2.4-fork.15**, clean JSBSim revision
`b58a1855d137466fe8d9f6bc12d4cfd9efcb4b1b`. The generic native turbine model adds
optional independent named solid regions using the existing heat-balance solver.
F135 selects two: core-facing hardware uses the upstream gas bath and the cooled
liner uses augmented downstream gas. Each has its own capacity, gas/coolant heat
transfer, radiative loss and restorable state. There is no render-time thermal
integration or shaft-speed-to-color conversion.

The installed 120 Hz cycle gives approximately **956 K core / 664 K liner** at
99% dry and **960 K core / 1269 K liner** after sustained AB. Returning to dry
converges to the same equilibria. These are outputs of the declared provisional
coefficients, not measured engine temperatures. The native audit deliberately
retains the inherited thrust ratings until the coupled propulsion system can be
qualified; changing its two rating constants alone would not do that.

Gas emission uses offline spectral and spatial tables. The annulus with eight
uneven lobes is an explicit hypothesis from the rear-view evidence, not a count
of injectors or lights. Core and liner material emission independently sample
the physical surface table. The gas mixture permits warmer near-nozzle and
violet-rich downstream regions, plus external dry emission without enabling AB.
One optional unshadowed scene light uses the gas table; it does not represent
eight independent burners.

## Evidence and limits

The [combined acceptance record](../../validation/evidence/aircraft/f35b/engine-rebuild-2026-10-06/rebuild-acceptance.json)
links generated identities, geometric sweeps, application regressions and CI.
[Geometry evidence](../../validation/evidence/aircraft/f35b/engine-rebuild-2026-10-06/reconstruction/README.md)
retains front, rear, oblique and converted CPU views, reference comparisons and
rejected fits. The final assets have 24,536 full-engine triangles and 13,104
installed-engine triangles; flight adds the 11,467-triangle airframe. Actual-mesh
checks pass 168 aperture sections, 18,432 bearing-seal rays and 90 clearance poses.
No new engine/airframe or opened-door crossings remain. Two original closed-door
triangles still overlap the fuselage by at most 5.676 mm; that source seam is
preserved, not claimed repaired.

Full CI passed once: 168 files, 1,817 passing tests and the existing expected
gear-envelope failure. A subsequent front-view inspection found a missing intake
barrel. Its 192-triangle closure passed all affected geometry checks, 31 actual
asset-loader/rig tests and a fresh production build. The
[application record](../../validation/evidence/aircraft/f35b/engine-rebuild-2026-10-06/implementation/application/acceptance.json)
keeps that validation boundary explicit.

[Native acceptance](../../validation/evidence/aircraft/f35b/engine-rebuild-2026-10-06/implementation/native/acceptance.json)
retains eleven installed scenarios and the [cycle plot](../../validation/evidence/aircraft/f35b/engine-rebuild-2026-10-06/implementation/native/thermal-cycle.svg).
[Optical evidence](../../validation/evidence/aircraft/f35b/engine-rebuild-2026-10-06/implementation/optics/README.md)
retains CPU projections of the actual baked data and their limitations.

Terminal mesh projections and NullEngine tests are not flight-render screenshots.
Matched rear/oblique views under fixed day/night exposure, white balance and
actual scene tone mapping still require the separately requested browser/GPU
qualification. The reference videos lack calibrated camera response and complete
engine telemetry; no source image's RGB was converted into a claimed temperature.
The nearby light affects lit materials. FOSS Earth's emissive raster basemap
does not receive local lights, so a deck-like ground patch is not established
for that terrain mode. No device, performance, energy-saving or acoustic tier
qualification is claimed.
