# Near-ground CPU performance

Investigation: 2026-09-10. Reported on Apple M5: about 60 FPS / 15 W aloft,
40 FPS / 24 W near the ground, with higher CPU usage. Those are user observations;
the automated measurements below do not measure browser FPS or power.

## What currently runs

JSBSim runs at 120 Hz in WebAssembly. It computes the suspension, rolling and
side friction, steering and braking forces. Terrain contact supplies one ground
elevation to that solver; it does not run a second general rigid-body engine.
See [Ground contact](ground-contact.md) for the current realism limits.

Finding that elevation depends on the map:

- Raster: an index of adopted tiles selects cells from the actual rendered
  triangle grid. This direct lookup is already a good fit for a heightfield.
- Google photogrammetry: a vertical ray finds the nearest visible mesh triangle.
  This needs general geometry because buildings and overhangs cannot be described
  by a single terrain heightfield.
- Below 150 m above the sampled surface, five swept aircraft points add up to
  **600 body rays per second**. This is a discrete increase in CPU work at low
  altitude, independent of the extra visible tile detail near the ground.

## Changes in this patch

1. **Reject unreachable mesh bounds before triangle picking.** Babylon's normal
   box/sphere ray tests ignore segment length. A sub-metre probe could therefore
   test every triangle in a distant tile along the infinite ray. The surface query
   now intersects the finite segment with conservative current world-space mesh
   bounds first. Babylon still computes the exact nearest triangle and normal.
   This accelerates body-ray misses; it is not a BVH and still visits scene meshes.
2. **Share identical height queries within one synchronous flight tick.** The
   pre-contact update, terrain contact and body collision were independently
   sampling the same coordinates. A typical two-substep frame now needs three
   distinct height queries instead of six, including the interpolated view.
   Coordinates are never rounded, misses are preserved, and the cache resets
   every tick so tile refinement and provider handoffs remain visible. Body rays
   are never cached. The view's query time is now included in terrain diagnostics.
3. **Avoid unchanged raster corner uploads.** The seam corner pass copies and
   uploads only patches with a changed corner. A corner-only regression fixture
   with three patches writes one patch on repair and none on a repeated pass,
   previously three in both cases. Side-seam work is unchanged.
4. **Skip disabled debug work.** Counting enabled scene meshes now happens only
   when `mapDebug=1`, instead of scanning and allocating every rendered frame.

No physics frequency, probe count, terrain density or visible detail was reduced.
The finite-ray benchmark and its CPU-only results are in the adjacent FOSS Earth
checkout at `benchmarks/collision/`. Its synthetic distant-geometry workload
isolates the avoided triangle work; it does not predict an FPS or wattage gain.

## GPU and open-source options

Moving the five current-step rays onto the GPU is not automatically faster.
The CPU-based flight solver needs their answers before stepping, whereas
[WebGPU buffer mapping is asynchronous](https://gpuweb.github.io/gpuweb/#programming-model-synchronization).
Dispatch and readback coordination may dominate such a small query batch; that
is an architectural expectation to measure, not a measured comparison here.
GPU work is more promising for large independent batches, terrain preprocessing,
or a simulation that already keeps its state on the GPU. A graphics backend
switch alone does not move these JavaScript collision queries onto the GPU.

If profiling still finds triangle picking expensive, the next exact acceleration
is a spatial index of active tiles plus a **bounding-volume hierarchy (BVH)**
inside each dense static tile. Nearby rays would visit only a small subset of
triangles. Build once on tile arrival, preferably in a worker; rebuild/refit when
geometry changes and discard the index when its tile is removed.

Relevant open-source implementations to benchmark before inventing one:

| Option | Fit |
| --- | --- |
| [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh/blob/master/API.md) | Nearest-ray traversal and worker builds; requires adapting its Three.js geometry/math interfaces to Babylon. |
| [TinyBVH](https://github.com/jbikker/tinybvh) | Specialized C++ BVH library supporting WASM/Emscripten; a candidate for a small geometry-query module. |
| [Babylon octrees](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/scene/optimizeOctrees.md) | Already in the engine; benchmark its submesh picking against BVHs, including streaming maintenance. |
| [Rapier scene queries](https://rapier.rs/docs/user_guides/javascript/scene_queries/) | Ray/shape queries become useful for convex aircraft sweeps or multiple rigid objects; a full second physics engine is unnecessary just for the current terrain height query. |

The remaining realism work is separate from this performance patch. Current body
probes account for heading but not pitch/roll, and five points do not cover the
whole aircraft volume. Ground support is one horizontal plane rather than a
normal and contact height per wheel. JSBSim's native
[ground callback](https://jsbsim-team.github.io/jsbsim/classJSBSim_1_1FGInertial.html)
supports contact points and normals; extending the WASM binding is worth exploring
before replacing its gear solver. These capabilities are not implemented here.

## Verify in the game

Add `flightPerf=1` to the existing URL, keeping the same map, aircraft, resolution,
camera, frame cap and quality. Capture a minute aloft and a minute below 150 m on
the same route, distinguishing loading from settled flight. The Debug tab shows
terrain query, body collision and physics-loop CPU times and can copy the trace.
`window.osfsFlightPerformance.snapshot()` exposes the same summary in DevTools.
The physics-loop total includes its terrain/body work; do not add those numbers
again. CPU submission timing is not GPU timing or energy measurement.

For raster streaming, also enable `terrainCapture=1` and inspect
`window.fossTerrainPerformance.snapshot()`. This records geometry preparation,
uploads and raster query work. Google tile traversal and scene rendering still
need a browser CPU profile if they dominate the remaining frame time.

After this comparison, choose the next change from the slowest measured work:
BVH/indexing for remaining collision scans; workers and affected-neighbor seam
updates for terrain preparation; rendering/LOD work for tile traversal or draw
submission. Reducing contact rate or blindly caching nearby heights can miss
obstacles and is not an equivalent-answer optimization.
