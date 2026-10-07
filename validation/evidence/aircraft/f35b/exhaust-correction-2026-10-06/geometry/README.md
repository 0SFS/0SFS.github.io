# Actual rigid-engine gas continuity

**Related evidence correction, 2026-10-06:** this support-mapping report is
unaffected, but the separate posed optical images did not actually include
hardware triangles because their script skipped non-indexed meshes. Their opaque
depth claims are unqualified; see the
[occlusion erratum](../../dry-vtol-mechanism-2026-10-06/occlusion-erratum/README.md).

`report.json` passed 36 actual-export poses: aperture 0/0.5/1, pitch 0/45/90/95 degrees, yaw −10/0/10 degrees. Both full and installed GLBs produce identical support. The six interior sections are the fixed augmentor, forward/middle/aft bearing ducts, convergent nozzle and divergent nozzle; exterior support begins at the same exit ring. No mesh, rigid-part transform or GLB was changed by this task.

The support reads live rigid node transforms and inverts the authored ruled ring lofts. Coordinates use metres in `F135_Engine`; signed flow distance is zero at the moving exit, negative inside and positive outside. Root translation/rebasing does not affect the domain. The physical flow-domain knots are byte-identical across pitch/yaw at each aperture, so vectoring alone does not recompute radiometry. The actual aperture geometry changes path length/radius and therefore the optical domain.

Maximum tested interface-position mismatch is 7.64504e−8 m, interface flow-distance mismatch 8.09905e−8 m, and inverse-coordinate error 5.04932e−8. The initial normalized endpoint tolerance was too strict for Babylon Float32 transforms and rejected 72 interface points; its report and sources are retained in `rejected-endpoint-tolerance/`. The correction uses a physical 1 µm endpoint tolerance, not altered geometry or hidden overlap.

The opaque centrebody is excluded piecewise, including its finite tip. Ruled-section angular-average Jacobians are passed to the single global optical budget as area factors. Circular envelope volumes, including the 6 m exterior support and subtracting the centrebody, are 8.81037/10.88982/13.25985 m³ at the three apertures. The actual nozzle support is additionally clipped by the 16 rigid seal planes. Thin opaque rings/struts and these seal clips can reduce escaped rays; the optical circular-domain budget remains a conservative upper bound, not a claim that every budgeted photon escapes. The intended separate opaque-triangle qualification was not exercised in the retained posed images; see the correction above.

`focused.log` is the focused exported-asset test before an additional explicit pose-invariant-domain assertion was added; `check.log` includes that final assertion. The parent's related/full checks cover the final test source. `lint.log` is the final focused ESLint pass. Retained source snapshots end in `.txt` to avoid test discovery.

This establishes a supported interior-to-exterior geometry and CPU mapping. It does not establish GPU shader execution, depth texture precision, F135 chemistry/temperature calibration, terrain response, or the observed real-world exhaust/deck appearance.
