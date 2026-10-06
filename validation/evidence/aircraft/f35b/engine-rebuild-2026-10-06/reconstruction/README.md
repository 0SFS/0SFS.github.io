# Original PW-600 reconstruction: geometry evidence

[Acceptance](acceptance.json) identifies the final assets, source hashes, checks
and limitations. [Asset manifest](asset-manifest.json) retains the generation
inputs and reference provenance. The generator is
`scripts/build-f135-engine.mjs`; `--install` writes both engine exports and the
engine-free derivative airframe, and `--check` verifies exact reproducibility.
The original AF267 GLB and original Blender/archive references remain untouched.

The final full engine has **24,536 triangles / 1,939,040 bytes**; the installed
engine has **13,104 triangles / 1,112,632 bytes**. The installed export has the
same twenty common mesh assemblies and material definitions, including the inlet
face and occluder needed for possible intake views. It contains none of the five
stand-only casing/accessory assemblies. Both are texture-free original geometry.
The derivative airframe has 11,467 triangles. It removes the old `vtol` subtree
and a separate 124-triangle static engine tube in `extras`; all retained source
vertex/image byte slices are unchanged. Remaining `extras` components are kept.

## Source-backed topology and explicit hypotheses

[Kevin Renshaw's Lockheed engineering account](https://www.codeonemagazine.com/c5_article.html?item_id=137)
distinguishes the compact B nozzle and its three-bearing swivel duct from the
longer A/C nozzle. It supports the 95-degree total vector range and rotating
section mechanism. [Rolls-Royce patent EP1775485B1](https://patents.google.com/patent/EP1775485B1/en)
supports three adjacent duct sections, two opposed scarfed circular bearings,
contra-rotation and a final variable-area outlet. Its example uses planes
65 degrees to the duct axis; it is not a production PW-600 drawing.

The authored equal cuts use **23.75 degrees** to their local duct normals,
derived from a symmetric 95-degree mechanism, not measured from production
hardware. With `c = -b`, the chain is
`Rz(a) Ry(β) Rz(b) Ry(-2β) Rz(c) Ry(β)`; the forward, middle and aft
segments have finite lengths of 0.28, 0.48 and 0.28 m. A stable analytic inverse
matches the native pitch/yaw direction, including the 95-degree extension test.
The final aft transition is real geometry, not a coincident rotated opening.
The nozzle's coupled roll follows this mechanism; it is not a measured actuator
schedule.

The compact flaps are 0.55 m long. Throat radii 0.35–0.44 m and exit radii
0.40–0.565 m are independent, provisional geometry inputs. The neutral joint's
minimum axial projection radius is about 0.458 m, so the moving throat remains
the smaller declared restriction. This is a geometric comparison, not a flow
simulation or calibrated A8/A9 schedule. The deep annulus and centerbody provide
visible structure rather than a glowing cap. They do not identify a real F135
component count or locate the main combustor at the nozzle.

The [2017 P&W sheet](https://filecache.mediaroom.com/mr5mr_prattwhitney/177487/download/F135-engine-S16208.pdf)
provides family and variant context. Its combined STOVL-system length must not
be assigned to the isolated main engine. No authenticated PW-600 main-engine
station drawing, nozzle dimensions or aperture endpoints were found. The nominal 5.44 m inlet-plane-to-exit span (5.58 m including the forward
spinner), fan/panel counts, accessories and materials are original modeling
hypotheses. The source profile and numerical stations distinguish these two
extents explicitly. The user image and TurboSquid previews remain qualitative
references; no preview artwork is distributed in these assets.

## Actual exported mesh checks

[Geometry report](geometry-report.json) checks 21 aperture positions at eight
axial stations: all 168 sections cover 360 degrees. Welded inner-wall topology
has no unintended internal boundary. There are 420 checks of actual triangle
area and normals: endpoint normals are unit length, interpolated normals remain
finite and agree with geometric normals by at least 0.999619. Full/installed
common geometry and material values are identical. There are 18,432 radial rays
across four mating joints at three offsets within the bearing seal, with no
misses. Twenty-four vector poses match the native direction.

[Clearance report](clearance-report.json) uses exported airframe triangles posed
by the production rig and exported engine triangles posed by the matching source
solver. Ninety aperture/pitch/yaw combinations, including early door travel and
±10-degree yaw, have no engine/airframe crossings or gross swivel-shell
intersections. Contacts within 1 mm of a mating plane are separately counted;
the 96-sided bearing's chord sag is about 0.284 mm. The test is not a CFD seal or
a proof of containment inside a non-watertight artist mesh.

The engine bay doors retain their exact closed geometry and 90-degree opening.
A provisional virtual hinge 6 cm outboard and a first-quarter opening window
clear the engine and fuselage throughout tested open motion. The original closed
source retains two seam crossings, with a maximum 5.676 mm door-vertex straddle
against a fuselage triangle plane. That unchanged overlap is explicitly excluded
from the pass condition. A new open-door crossing fails the CLI, as do engine or
gross shell crossings.

## Rejected hypotheses and views

The `comparisons/` folder retains the first single-incline reconstruction, which
created a pronounced apparent axial restriction. It was rejected in favor of the
two opposed joints supported by the Rolls-Royce topology. The 90-degree door
baseline had up to 33.1 mm plane straddle when open. A trial 105-degree opening
made it worse, up to 81.1 mm, and was rejected; the virtual hinge clears both
surfaces while preserving the closed pose. Those measurements are local
triangle-plane straddles, not certified physical penetration depths.

A final front projection exposed a missing intake inner barrel. That view is
retained as `comparisons/intake-wall-gap-rejected.png`; the final asset includes
the continuous inward barrel. This small asset correction happened after full
repository CI. Generation/reproducibility, three focused tests, incremental
typecheck, targeted lint and all geometry/clearance checks passed again afterward.
The parent's application receipt records the CI boundary.

The ten PNG/SVG views are CPU orthographic projections of actual exported
triangles with one arbitrary fixed white light. Rear and oblique views cover
closed/intermediate/open apertures; the complete engine also has front, side and
converted views. They demonstrate geometry and provide inspection artifacts.
They do not establish reference-camera matching, thermal appearance, day/night
exposure, GPU pixels, visual realism, performance or energy savings. No browser,
server or GPU run was used for this evidence.
