# Collision algorithms and compute backends

2026-09-10. This comparison separates **finding contact geometry** from **solving
the aircraft's response**. JSBSim still runs the aircraft and landing gear on the
CPU in WebAssembly. A GPU ray query alone does not move that solver to the GPU.

There is no finite list of every possible algorithm, implementation and hardware
combination. The matrix below covers the practical browser-compatible families
for this simulator and labels unmeasured candidates. Specialized height queries,
exact triangle rays, approximate volumes and full rigid-body solvers are different
workloads, so their timings must not be presented as interchangeable.

## Comparison matrix

| Geometry/query algorithm | CPU execution options | GPU execution options | Current evidence / fit |
| --- | --- | --- | --- |
| Direct raster triangle lookup | JavaScript today; WASM possible | Compute over a resident heightfield | Already fast in production; earlier CPU fixture median 0.88–0.94 µs/query. Specialized vertical terrain query, not arbitrary building collision. |
| Triangle scanning with finite mesh bounds | Babylon JavaScript today; typed-array or WASM loops possible | Compute ray/triangle tests plus nearest-hit reduction | Production baseline measured. Cheap when mesh bounds reject the ray; dense reachable geometry still requires scanning. |
| Uniform grid / spatial hash with ray traversal | JavaScript or WASM | Compute traversal | Unmeasured. Good candidate for short rays through uniform geometry; cell size, duplicated triangle references and highly uneven density need evaluation. |
| Submesh octree | Built into Babylon | Custom compute traversal | Unmeasured. Small integration burden, but subdivision and spatial quality affect both build and query time. [Babylon documentation](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/scene/optimizeOctrees.md). |
| BVH with median/centre splits | JavaScript, WASM scalar/SIMD | WebGPU software traversal | Same-tree CPU/GPU prototypes available in FOSS Earth's `benchmarks/collision/`; benchmark results below. A benchmark kernel is not a production tile-streaming backend. |
| BVH with surface-area heuristic (SAH) | JavaScript / WASM; worker build | CPU-built tree uploaded to GPU, or GPU builder | Unmeasured here. Spend more on building to reduce later traversal. [three-mesh-bvh API](https://github.com/gkjohnson/three-mesh-bvh/blob/master/API.md). |
| Morton-code / linear BVH (LBVH) | CPU / worker construction | Parallel compute construction and traversal | Unmeasured. Potentially useful when frequent tile replacement makes build time dominant. [Karras paper](https://developer.nvidia.com/blog/parallelforall/wp-content/uploads/2012/11/karras2012hpg_paper.pdf). |
| Native BVH libraries | TinyBVH compiled to WASM, scalar or SIMD | Depends on library/kernel integration | Unmeasured here. Include bridge/copy cost, not native AVX headline timings. [TinyBVH](https://github.com/jbikker/tinybvh), [Emscripten SIMD](https://emscripten.org/docs/porting/simd.html). |
| Parallel preparation/query batches | Workers, WASM threads | Compute workgroups | Unmeasured as a production pipeline. Workers can build resident tile indices without blocking the main thread. Shared-memory WASM threads require deployment headers and synchronization. [Emscripten pthreads](https://emscripten.org/docs/porting/pthreads.html). |
| Convex/shape sweeps and rigid-body contacts | Rapier or Jolt WASM, with scalar/SIMD/threaded options depending on build | Would require an appropriate separate GPU implementation | Unmeasured. Improves aircraft-volume collision coverage; more work than five point rays. Explicitly separate scene-query timing from full solver timing. [Rapier queries](https://rapier.rs/docs/user_guides/javascript/scene_queries/), [JoltPhysics.js](https://github.com/jrouwe/JoltPhysics.js). |
| Signed-distance field / voxel distance volume | Precomputed volume lookup or traversal | Compute sampling and generation | Unmeasured; changes accuracy and memory requirements. Thin features, surface signs and tile rebuilds matter. [GPU distance fields](https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-34-signed-distance-fields-using-single-pass-gpu). |
| Depth/ID-buffer picking | CPU reads rendered result | Rasterized GPU picking | A different query: screen visibility and depth resolution do not cover arbitrary aircraft sweeps. Not a drop-in replacement. [Babylon picking](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/mesh/interactions/picking_collisions.md). |
| Hardware ray tracing | Not applicable | Native acceleration structures / ray-query hardware | Not a portable standard browser WebGPU backend at this investigation date; extension work is ongoing. [WebGPU issue](https://github.com/gpuweb/gpuweb/issues/535). |

The earlier direct-raster and finite-ray numbers are retained in FOSS Earth's
`benchmarks/terrain/README.md` and `benchmarks/collision/results.json`. They use
different fixtures and must not be ranked against each other as the same task.

## Measured CPU/GPU comparison

Measured on Apple M5 using an isolated **headless** Chromium process with its
hardware Metal GPU verified through Chromium diagnostics and WebGPU adapter
information. The runner uses an offline file and does not control the user's
browser or cursor.

Median milliseconds **per batch**, including GPU upload, dispatch and CPU readback:

| Workload | Rays | Production CPU | CPU linear scan | CPU BVH | GPU linear scan | GPU BVH |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| dense-local-hit | 1 | 0.44375 | 0.0953125 | 0.000167847 | 8.1 | 0.3 |
| dense-local-hit | 5 | 2.25 | 0.5 | 0.000805664 | 9 | 0.4 |
| dense-local-hit | 128 | 56.2 | 12.3 | 0.0214844 | 11.4 | 0.4 |
| dense-local-hit | 1024 | 465.8 | 98.3 | 0.2125 | 17.8 | 0.5 |
| distant-miss | 1 | 0.000198364 | 1.65939e-05 | 1.67847e-05 | 0.4 | 0.4 |
| distant-miss | 5 | 0.000976562 | 6.56128e-05 | 6.56128e-05 | 0.6 | 0.6 |
| distant-miss | 128 | 0.025 | 0.00158691 | 0.00158691 | 0.6 | 0.6 |
| distant-miss | 1024 | 0.2 | 0.0126953 | 0.0126953 | 0.5 | 0.6 |

The five implementations use the same 32,768-triangle fixture and validate each
fresh ray batch against the production picker. The prototypes use identical
packed data; production also performs its normal coordinate/metadata work.
Short CPU batches are repeated to exceed browser timer precision, so their
figures are hot-cache averages. These numbers are neither FPS nor power readings.

The full methodology, setup instructions, preparation costs and raw samples are
in the adjacent FOSS Earth checkout's
[benchmark README](../../foss-earth/benchmarks/collision/README.md) and
[results-gpu.json](../../foss-earth/benchmarks/collision/results-gpu.json).
Other algorithms in the matrix above remain unmeasured; the table does not claim
to benchmark every library, build option or possible GPU kernel.

## Measurement requirements

The offline comparison uses identical local-coordinate Float32 geometry and rays,
including dense reachable surfaces and rays whose finite segments miss the entire
mesh. It checks hit/miss, distance and normals against the production picker.
The CPU and GPU BVH prototypes consume the same tree and triangle layout.

GPU timings must include uploading each new ray batch, command encoding and
submission, copying output, awaiting readback, and copying results into CPU-owned
memory. The CPU solver cannot use a result still resident on the GPU.
[WebGPU synchronization](https://gpuweb.github.io/gpuweb/#programming-model-synchronization).
Tree construction, upload and pipeline compilation are separate one-time costs
to amortize over a tile's useful lifetime. Measure 1 and 5 rays, not only large
batches that the current single-aircraft loop cannot produce independently.

These tests run from the terminal. Hardware adapter information must confirm an
actual GPU; software fallbacks cannot stand in for M5 GPU performance. Headless
measurements still exclude concurrent gameplay rendering, loading, battery draw
and frame pacing. They inform the next implementation, not an FPS or watts claim.

## Hardware generalization

The M5 result is evidence for a CPU default on this tested workload, not a reason
to make the architecture permanently CPU-only. The nearby-hit CPU BVH advantage
is about 497 times for five rays, but only 2.35 times for 1,024 rays. These are
prototype query ratios with repeated hot-cache CPU batches, not game speedups.
CPU speed, GPU speed, browser/driver overhead, memory, rendering contention and
terrain rebuilding can all move the crossover. No cross-device or energy result
has been measured here.

Validate on older/lower-power CPUs, mobile devices, integrated GPUs and discrete
GPUs before generalizing. Auto should calibrate representative workloads on the
actual device and retain CPU fallback and a user override once both production
backends meet the same correctness contract. M5 CPU throttling alone cannot
represent other machines. The benchmark does not verify claims about which CPU
has the fastest single-thread performance.

## Automatic selection and user override

An eventual **Auto / CPU / GPU** control should select a real validated query
backend and show which one is active. It should be independent of the WebGL/WebGPU
graphics setting and of the passive/arcade impact response.

Before enabling GPU for active flight, both paths need the same revision,
floating-origin, finite-segment and nearest-hit contract. A GPU result must carry
the queried aircraft state and terrain generation; late results from replaced
tiles or old aircraft positions must never be applied to current-step physics.
Device loss and unavailable GPU support must fall back to the CPU. A manual GPU
override cannot make a missing or late result safe.

Auto should compare end-to-end latency for the actual query batch and include
preparation/memory costs. Keep a backend until sustained evidence warrants a
switch; do not toggle each frame. Re-evaluate under rendering and streaming load.
No game CPU/GPU selector is exposed by this patch: the GPU kernel is a benchmark
prototype, while gameplay still has one synchronous CPU collision backend.
Adding a switch before integrating and validating the second path would not
provide the requested choice.

The immediate crash fixes, optional arcade launches and regression evidence are
documented in [Near-ground performance](near-ground-performance.md#crash-response-follow-up).
