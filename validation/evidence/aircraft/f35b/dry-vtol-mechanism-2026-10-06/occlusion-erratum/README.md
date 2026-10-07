# Correction: historical CPU hardware occlusion was not exercised

Discovered 2026-10-06 during the new physical receiver diagnostic. The reconstructed full F135 GLB uses non-indexed triangle primitives. Babylon returns an empty array from `mesh.getIndices()` for these primitives. The old loops in `check-plume-geometry.mjs` and `render-exhaust-continuity.mjs` tested array truthiness and then iterated its length; they therefore built **zero hardware triangles**, while allowing an empty BVH to report no obstruction.

Consequently the hardware-occlusion and opaque-depth qualifications in these retained records are withdrawn:

- `plume-spatial-2026-10-06/geometry-baseline/`: claimed unobstructed tracer paths, lack of false hiding and lack of behind-hardware integration.
- `plume-spatial-2026-10-06/geometry/`: the same claims for the subsequent field and sample placement.
- `exhaust-correction-2026-10-06/posed-optics/`: claimed nearest-triangle clipping, black hardware silhouettes, visible interior/exterior attribution, and ray-budget accuracy as a hardware-clipped result. The 32/64/96/128 errors and images are measurements of the unblocked domain only.

Their JSON, PNG, source snapshots and original execution logs remain unchanged. README notices and the corresponding explanatory documents identify the correction. Historical combined acceptance files are immutable execution records, not authority to continue relying on the withdrawn claims.

The rigid-node poses, attachment positions, native-axis comparisons, source fields and independent spectral/volume integrals are not invalidated by this indexing defect. The separate ruled-support continuity and centerbody/seal containment checks did not use the faulty hardware loop. Their geometric support is still distinct from ray obstruction by thin rings, struts and nozzle walls. GLB structural and collision tools that read the primitive POSITION/index accessors directly are also outside this particular failure.

The active diagnostic loops now synthesize sequential vertex indices for non-indexed primitives and require the full triangle count to match generated asset metadata before constructing a BVH. `check-plume-geometry.mjs` records the count per pose. The legacy `inspect-nozzle-gaps.mjs` loop had the same potential fallthrough and is guarded too; this audit does not claim its retained indexed-original measurements were empty. `gearGeometry.mjs` already rejects empty index buffers explicitly instead of silently succeeding.

These fixes have not retroactively rerun or qualified the old records. New posed optical and receiver records must supply their own source hashes, nonzero triangle inventory, observed opaque hits and convergence results. No browser/GPU qualification follows from a corrected CPU triangle list.
