# Rigid aperture correction — 2026-10-06

[Acceptance](acceptance.json), [actual-export report](geometry-report.json),
[airframe clearance](clearance-report.json), and [asset manifest](manifest.json)
record the final original 0sfs source and assets. These are terminal geometry and
NullEngine checks. The CPU projections use a fixed arbitrary white light,
orthographic cameras and no physical optics, exposure or GPU rendering. They do
not qualify the flight app's appearance or measured PW-600 dimensions.

The rejected morph assets and source are preserved in
[rejected-morph-source](rejected-morph-source/snapshot.json). Applying the same
edge/area criterion to their actual exported triangles fails all three moving
meshes: maximum edge strains are 41.25% for the continuous flow wall, 40.94% for
its seal strips, and 40.54% for the external panels. Their total areas change by
17.38%, 21.74% and 14.29%, respectively.
[Measurements](rejected-morph-measurements.json) retain the individual results.

## What the replacement represents

The full/installed architecture, external casing, intake, hot annulus and corrected
three-bearing swivel are preserved. Ten shared swivel/liner/collar meshes
are byte-identical in geometry to the rejected-morph export; the old swivel
coverage evidence remains relevant to those unchanged parts. The aperture now
uses 112 unit-scale rigid transforms and 128 rigid meshes:

- 16 convergent and 16 divergent solid flaps with coincident gas-side hinges;
- 16 convergent gap seals, 16 sliding throat shoes, and 16 divergent gap seals;
- 16 solid slotted external fairings and 16 external fairing seal strips;
- 16 fixed follower pedestals attached to the divergent flaps.

There are no active morph targets, deformed vertices or hidden expanding sleeve.
The full export contains 24,024 triangles in 150 meshes (1,864,304 bytes); the
installed export has 12,592 triangles in 145 meshes (1,037,872 bytes). The
11,467-triangle airframe and its removal boundary are unchanged. More individually
moving meshes mean a different draw-call cost; no performance or energy saving
has been measured or claimed.

[Hamstra and McCallum §§2.2.1/6.2.2](https://onlinelibrary.wiley.com/doi/full/10.1002/9780470686652.eae490)
support internal convergent/divergent flaps, fairings and the compact B nozzle.
[United Technologies patent US5232158A](https://patents.google.com/patent/US5232158A/en)
supports hinged flaps, interposed seals and sliding/centering restraints. It is a
generic nozzle patent, not a PW-600 production drawing. The retained
[B reference and variant ledger](../../engine-rebuild-2026-10-06/reconstruction/README.md)
continues to limit how the A footage, artist previews and B observations are used.
The specific count, lengths, seal restraint, fairing follower, alloy, thickness
and command schedule here are original approximations. No unmeasured production
actuator law is claimed.

## Reduced kinematics and physical bounds

The native normalized observer `u` is clamped to [0,1]. It drives two linear
**angle** cams: convergent angle 30° → 11.537°, divergent angle 9.594° → 24.624°.
Both main flap lengths are fixed at 0.300 m. For convergent angle `c`, divergent
angle `d`, inlet radius `R0` and fixed lengths `Lc,Ld`:

```
R8 = R0 - Lc sin(c)       Z8 = Lc cos(c)
R9 = R8 + Ld sin(d)       Z9 = Z8 + Ld cos(d)
```

`F135_Exhaust` follows `Z9`; it is not kept at the previous fixed 0.55 m plane.
The primary exit moves from 0.555612 to 0.566657 m aft of the nozzle root while
radius changes from 0.400 to 0.565 m. The old nominal length field in the general
geometry inventory is not used to pose these parts. The renderer receives the
actual current exit radius; native thrust/area scheduling remains independent.

A gap strip lies between two planar flaps separated by half-angle `h=π/16`.
For fixed strip half-width `w`, its root radius is `(R0-w sin(h))/cos(h)` and its
convergent angle is `atan(tan(c)/cos(h))`. Its two long edges therefore stay on
the adjacent flap planes. The analogous divergent construction uses `R8,d`.
The 0.295 m convergent seal keeps its shape; a separate 0.020 m rigid throat shoe
slides along it and ends exactly at the moving hinge. Overlap remains
13.52–14.76 mm. This replaces an initially considered fixed seal overhang, which
would have moved the minimum flow area downstream of the intended throat.

Main flaps have 4 mm relieved hinge backs, eliminating intersecting square solid
ends while keeping the gas-side hinge continuous. A follower fixed to each
divergent flap drives its fairing through a real slot in the exported solid.
The slot spans 0.518–0.568 m along the fairing; the follower runs at approximately
0.540–0.548 m. External seals use the same bisecting-plane relationship. These
are positional constraints, not a solved elastic/contact-force or hydraulic
actuator model. No seal flexibility, thermal expansion, pressure deflection or
hysteresis is fabricated.

The actual wall is a polygon with main-flap and seal faces, not a circle.
Independent 512-ray integration gives approximately 0.381904 → 0.608193 m² at
the throat and 0.501246 → 1.007974 m² at the primary exit. It agrees with the
analytical polygon section within 0.01%. The `throatArea/exitArea` runtime values
are those analytical geometry areas. They are **not calibrated aerodynamic
A8/A9**, discharge coefficients or a PW-600 FADEC schedule. Divergent seals extend
slightly beyond the primary flap tips; the terminal metal boundary is staggered.

Main flap nominal thickness is 2 mm (with hinge relief), solid fairings 1.5 mm,
and the surface-only seals declare 0.7 mm. The declared 8,200 kg/m³ density is an
uncalibrated material hypothesis. Closed-solid volumes are measured and invariant;
open surface meshes have no asserted enclosed volume. Their separate nominal mass
uses area × thickness × density. The roughly 52.58 kg total moving-metal estimate
is a consequence of those invented dimensions, **not measured F135 mass**. Neither
it nor these visual volumes determine JSBSim's effective lumped thermal capacities.

## Checks and limits

- 21 apertures × 24 conversion/yaw poses = 504 actual-export rigid poses.
  Maximum edge change is 1.19e-15 m, per-triangle area change 2.22e-16 m², and
  closed-solid signed-volume change 2.53e-16 m³. All scales remain one.
- 134,400 radial and oblique rays find the intended internal leaf wall, including
  sections 0.1 mm either side of the moving throat. Main hinge error and seal
  edge plane error are below 1e-7 m; minimum lateral seal overlap is 9.24 mm.
- All moving leaf meshes have zero noncoplanar self-intersections over all 21
  apertures. No hinge-intersection exception is needed after solid-end relief.
  Coplanar thin-sheet sliding overlap and tangential contact are intentional.
- Full and installed common geometry/materials and every mechanical pose are
  identical. Finite unit normals and nondegenerate, correctly oriented triangles
  are checked on the actual final GLBs. External seal windings face outward.
- The production Babylon rig matches the exported-hierarchy diagnostic at 168
  combined states, every one of the 112 rigid nodes and four basis points each,
  within 2 µm (float32 world matrix tolerance). Invalid/missing commands and
  unchanged render-only observations retain the last pose without new writes.
- The separate actual-airframe check samples 150 aperture/conversion/yaw cases.
  It requires zero engine/airframe intersections, zero gross swivel/fairing
  intersections, and zero opened-door/fuselage intersections. The pre-existing
  closed source door seam remains explicitly excluded: two triangle crossings,
  maximum 5.676 mm local plane straddle. No new airframe or door fit was authored.

The accepted scripts exit nonzero on failed criteria. They assess geometry, not
engineering seal leakage, structural loading, cooling passages or manufacturability.
The 1 µm intersection tolerance excludes tangency and coplanar contacts; the
area integration offsets shared-edge stations by 10 µm to avoid numerical edge
hits. These tolerances are stated in the reports and are not measurement errors
for the real engine. A finite sweep and analytical contact constraint establish
this reduced mechanism, not complete PW-600 flight certification.

[Rear closed](installed-rear-aperture-0.png),
[rear half-open](installed-rear-aperture-0.5.png),
[rear open](installed-rear-aperture-1.png),
[oblique half-open](installed-oblique-aperture-0.5.png),
[full side](full-side.png), and [full converted](full-converted.png)
are CPU views of the accepted triangles. They preserve the mechanical contrast
between inner leaves, external seals, bearing casing and deep annular hardware.
Flight-app day/night contribution-separated views, camera-matched reference fit,
actual exposure and real GPU performance still require separately requested runs.

Reproduce with `node scripts/build-f135-engine.mjs --check`,
`node scripts/validation/f35b/check-f135-reconstruction.mjs`, and
`node scripts/validation/f35b/check-f135-clearance.mjs`. Omit `--out` for a fresh
dated `build/` directory. Source copies and final GLBs are retained beside this
record. Archived code filenames end in `.txt` so test discovery cannot execute
them; `acceptance.json` maps each unchanged snapshot to its original repository
path. Restore that path when reproducing an archived source version; focused test/lint/bytecheck logs are under [logs](logs/).
