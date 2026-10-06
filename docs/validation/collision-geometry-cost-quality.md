# Aircraft collision geometry cost and accuracy

Measured on 2026-10-05. The geometry results favour complete hull support for a
known plane and retaining resident triangles for arbitrary obstacle coverage.
Observed timings favour query-specific methods, but remain provisional because
P/E core residency and fanless thermal behaviour were not measured. Sparse point sweeps lose
surface coverage. Generated convex compounds preserve coverage much better, but
their empty-space coverage must be controlled before they can determine a crash.

The experiment covers two aircraft and three mesh variants, including a
7,294-triangle SF50. These measurements support choosing algorithms by query
type and measured error, rather than choosing a universal number of probes or
hulls. They do not establish a default for every aircraft or device.

## Measured query costs

The follow-up compared the same encounters within each mesh. Values are median
microseconds per complete aircraft query against one selected environment
collider. These are short translation sweeps, with a fixed orientation during
each sweep. Every table entry has at least five rounds accepted by the original
load filter, but these are exploratory wall-time observations, not qualified
isolated CPU costs or final speed rankings.

| Mesh | Source triangles | Complete hull vertices | Known plane support | Exact dense ground | Exact pole | Exact corner | Exact wall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| C172 LOD3 | 876 | 51 | 0.10 | 132.4 | 1.58 | 1.99 | 339.8 |
| SF50 LOD3 | 1,630 | 100 | 0.16 | 224.2 | 2.77 | 2.78 | 617.2 |
| SF50 HilosRun | 7,294 | 354 | 0.48 | 857.8 | 7.50 | 5.22 | 2,745.3 |

Complete hull support had no missed or excess contacts, and no contact-distance
discrepancies above the 2 mm comparison tolerance, in all 128 ground cases per
mesh. It transforms the plane normal into aircraft space once and takes the
minimum dot product over the complete global hull. It does not cast one ray per
vertex. Its cost therefore follows hull complexity rather than triangle count.

The plane shortcut requires a known plane and valid finite bounds. All aircraft
in these fixtures remain inside the 64 m square ground patch. Applying it to an
unproven local terrain tangent would change the collision geometry and could
miss hills or edges. Terrain classification and acceleration belong in FOSS
Earth; aircraft support geometry belongs in 0sfs.

The higher-detail SF50 is a separate mesh variant with newly generated
encounters. Its row checks scalability, but is not an experiment that changes
triangle count while holding every other geometric detail constant.

## Coverage and false contacts

The initial comparison tested 41 representations per aircraft: exact source
triangles, current body probes, ranked hull-vertex points, triangle partitions
enclosed by convex hulls, axis-aligned boxes, PCA boxes, spheres and capsules,
and CoACD at 16 and 32 hulls with and without a 32-vertex cap.

Point budgets were 6, 12, 24, 48 and 96; shape budgets were 1, 4, 8, 16, 32 and
64. Shape families shared the same whole-triangle partitions. Partitions split
the largest triangle-count cluster at the median centroid along its longest
centroid span. This is a deterministic baseline, not an optimized spatial fit.

Long approaches beginning outside the aircraft expose approximation errors
that short sweeps can hide by starting inside a coarse proxy. Each obstacle
workload contains 128 approaches, half aimed through area-weighted source
surface samples and half through the bounding-box volume. These are constructed
geometry tests, not estimates of real collision frequencies.

| Representation | C172 outside pole misses | SF50 outside pole misses | C172 outside corner misses | SF50 outside corner misses |
| --- | ---: | ---: | ---: | ---: |
| Highest ranked point budget | 101 / 128 | 98 / 128 | 82 / 86 | 79 / 90 |
| 16 enclosing hulls | 0 / 128 | 0 / 128 | 0 / 86 | 0 / 90 |
| 64 enclosing hulls | 0 / 128 | 0 / 128 | 0 / 86 | 0 / 90 |
| CoACD 32 without decimation | 0 / 128 | 0 / 128 | 0 / 86 | 0 / 90 |

The C172's highest point budget contains all 51 global-hull vertices and has
zero plane support gap. It still misses most pole and corner contacts. Even
complete hull-vertex ray sampling cannot cover the aircraft surface. The SF50
96-point candidate has zero error on the 2,048 sampled directions but omits
four global-hull vertices; sampled zero error does not prove completeness.

The highest point budgets also cost about 7–13 microseconds on the outside pole
and corner fixtures, versus roughly 2–4 microseconds for source triangles in the
initial run. The SF50 outside-pole row has only four clean timing rounds, so
its timing is diagnostic rather than part of the performance conclusion. The
other comparisons have eleven or nine clean rounds. More points can lose both
accuracy and speed.

Enclosing hulls avoid those ray gaps but can bridge large empty regions.
The 64-hull partitions reported outside contacts as much as 4.27 m early for
C172 and 4.21 m early for SF50. On outside corner cases, their 95th-percentile
early errors were 3.35 m and 1.60 m respectively, **among contacts exceeding
the 2 mm early-error tolerance**. These are not percentiles of all encounters.
More hulls did not repair the partition criterion.

CoACD without decimation reduced excess corner contacts to one per aircraft
and reduced the conditional corner early-error percentiles to 0.58 m for C172
and 0.60 m for SF50 at 32 hulls. Its worst C172 corner error was still 4.06 m.
Those outside-corner statistics improve on the simple partition. Coverage
failures in other workloads prevent treating it as a certified final contact shape.

Across the eight initial workloads, undecimated CoACD 32 missed one of 780
C172 reference hits and seven of 786 SF50 hits. Capping hulls to 32 vertices
increased those totals to 120 and 82. The paired short and long workloads reuse
approach directions, so these totals are diagnostic counts, not independent
trials or accident probabilities. CoACD preprocessing and inward simplification
must be checked against the original surface, especially its thin features.

Boxes, spheres and capsules preserved much more coverage than points, but
created more excess contacts than hulls at comparable partition budgets. They
are candidates for rejection bounds, with measured fit error governing any use
as final geometry.

## Count and cost budgets

More shapes are not uniformly faster or slower. In the initial C172 run,
increasing partition hulls from 8 to 64 reduced dense-ground cost from 82 to
54 microseconds, while increasing wall cost from 4.85 to 30.2 microseconds.
SF50 showed the same reversal: 120 to 84 microseconds for ground, and 5.17 to
30.2 microseconds for walls. A count alone cannot predict compound traversal,
candidate overlap or the amount of support work.

| Candidate | C172 hull vertices | C172 packed bytes | SF50 hull vertices | SF50 packed bytes |
| --- | ---: | ---: | ---: | ---: |
| Partition hulls 16 | 355 | 12,460 | 565 | 20,020 |
| Partition hulls 64 | 861 | 29,716 | 1,059 | 36,844 |
| CoACD 16 without decimation | 2,349 | 28,636 | 2,958 | 35,944 |
| CoACD 32 without decimation | 3,908 | 47,792 | 4,398 | 53,672 |
| CoACD 32 with 32-vertex cap | 1,022 | 13,160 | 1,020 | 13,136 |

Packed bytes estimate float32 parameters, transforms and explicit uint32
topology when supplied. They exclude JavaScript objects, native acceleration
structures and hull topology generated by the backend. They are not measured
resident memory. CoACD's single recorded generations took about 11–23 seconds
per requested budget with five native workers; partition hull fits recorded
roughly 5–14 ms for these two meshes. Generation times are diagnostic samples,
not repeated timing distributions.

## Exact confirmation

The follow-up tested a whole-aircraft enclosing proxy followed by the whole
resident source mesh whenever the proxy returned a possible contact. This
removes approximation errors when the gate detects the contact, but usually
pays both query costs on these contact-heavy fixtures.

| Short-sweep workload | C172 exact / 16-hull gate plus exact | SF50 exact / 16-hull gate plus exact | SF50 HilosRun exact / 16-hull gate plus exact |
| --- | ---: | ---: | ---: |
| Ground | 132 / 187 µs | 224 / 287 µs | 858 / 777 µs |
| Pole | 1.58 / 3.20 µs | 2.77 / 5.29 µs | 7.50 / 9.95 µs |
| Corner | 1.99 / 3.62 µs | 2.78 / 4.77 µs | 5.22 / 7.31 µs |

The larger mesh's ground workload recorded a lower wall time with the hull
gate. That is consistent with rejecting some noncontacts before an expensive
source query, but the missing core and thermal observations prevent an isolated
causal speed claim. Already-distant misses also recorded low wall times for the
native triangle query.

Both hull gates matched all reference outputs on the smaller meshes. On the
7,294-triangle mesh, each missed one short wall contact on a 5 mm sweep, at
different encounters. The one-box gate matched all references. Mathematically
enclosing fitted geometry does not establish reliable floating-point backend
casts at arbitrarily short distances. The margin reproduction tool records
these numerical cases separately.

The [numerical reproduction](../../validation/evidence/collision/geometry-cost-quality-2026-10-05/query-margins.json)
finds identical analytic wall support for the source and proxy at both missed
contacts. Direct child queries find contacts while the compound misses;
different transform rounding prevents attributing this solely to traversal.
Query margins of 0.1–2 mm restore both gates, but the 16-hull case misses again
at 3 and 5 mm. Increasing a margin is not a demonstrated conservative fix.
These compound sweeps should not be the sole rejection gate until the numerical
behaviour is resolved.

A whole-proxy then whole-mesh gate does not test a hierarchy that localizes the
exact query to a small set of triangles. That is the next useful comparison for
dense arbitrary surfaces.

## Compute budget ladder

The objective is a portfolio of the best methods at increasing budgets, not
one winning primitive family. Compile candidate representations from a stable
collision source once, then select combinations by coverage, approximation
error, memory and qualified query cost for each aircraft and query class.
The tested families provide candidates; they do not yet establish a complete
optimal ladder.

| Budget stage | Candidate methods | What the stage resolves |
| --- | --- | --- |
| Fast path at every budget | Complete hull support for a proven plane and valid finite extent | Exact translation contact for that surface without traversing terrain triangles |
| Minimal general work | Whole-aircraft swept bounds, such as an enclosing box or sphere | Reject clearly separated regions; overlap remains a possible contact |
| More spatial detail | Complete part bounds, with boxes, capsules or convex hulls fitted to fuselage, wings, tail and gear | Reduce empty-space coverage while keeping every source part represented |
| Focused refinement | Nested primitive/convex bounds and validated decomposition candidates | Spend additional work only on regions that could touch; reduce approximation error |
| Detailed contact | Source triangles in reached hierarchy leaves | Confirm contacts and contact locations against the collision source |

These are stages of resolved work, not an obligatory order of backend calls.
A small obstacle can go directly to a triangle query when that is cheaper than
intermediate proxies. Plane support can finish a query at any budget. Spheres,
capsules, boxes and hulls are competing candidates within the ladder, not an
assumed ascending cost order. CoACD is one offline fitting candidate and needs
coverage repair before use as an enclosing rung.

The plane path and global source-triangle queries were tested. Semantic part
fitting and localized hierarchy refinement still need comparison; the tested
whole-proxy then whole-source query is not that refinement. P/E scheduling and
thermal observations are required before assigning compute thresholds to rungs.

Every selected hierarchy cut must cover every source triangle. Refinement must
not introduce holes or add new overcoverage: enclosing traversal parents must
contain the child geometry, including its outward margins. Independently fitted
boxes or capsules may require separate nested traversal bounds. Keep inward
coverage error, excess spatial coverage and temporal error separate.

If the budget ends at an overlapping coarse bound, the result remains possible
or approximate contact with its declared limits. Do not silently turn it into
a clear result or an exact collision. The runtime needs an explicit policy for
budget exhaustion. Rotation, articulated motion and temporal subdivision form
an additional accuracy axis, rather than a final expensive rung required only
by the highest budget.

Expose actual work/time budgets, resident-memory bounds and permitted error in
real units. Record shape count and total vertices as representation facts, not
as universal compute units. Offline fitting effort is a separate budget: more
preparation can improve a cheap runtime representation.

Retaining the complete resident mesh was evaluated only up to 7,294 triangles.
Larger sources need explicit resident-memory and triangle budgets, an error
limit, and declared behaviour when cost, error and coverage cannot all fit the
requested budget. A complete hierarchy cut preserves mathematical coverage;
it does not promise arbitrary fidelity or runtime cost at every count.

Improve partitioning before increasing counts. Start with articulated parts
and reliable connected components, then evaluate splits by reduced fit error
and measured query cost. Simplify enclosing hulls outward and verify original
triangle coverage. These are proposed generator improvements; this experiment
measured the median-centroid baseline and the stated CoACD configuration.

The existing [generated geometry proposal](../proposals/generated-collision-geometry.md)
should retain automatic asset extraction, provenance and reproducibility, while
replacing ranked point count as its general accuracy control. Whole hull
vertices remain useful for plane support, not as proof of obstacle coverage.

## Method and limits

The browser ran CPU/WASM Rapier 0.21.0 in headless Chrome 154.0.8037.95 on an
Apple M5 with 10 logical cores and 16 GiB RAM. A post-run topology query reports
four `Super` cores and six `Efficiency` cores; the user reports a fanless Mac.
Topology does not identify the core or frequency executing a sample. QuickHull
was 3.1.2. CoACD was
1.0.14 with NumPy 2.5.3 and Python 3.14.7. Benchmark dependencies are isolated
under `build/tools/`; no runtime dependency or application behaviour changed.

Each workload uses 128 deterministic cases with seed 20261005. Short distances
are 0.005, 0.25 and 1.5 m. Outside diagnostic paths are twice the aircraft
bounding-box diagonal plus 2 m; they are not 120 Hz displacements. The ground
collider contains 32,768 flat triangles. Obstacles are an 8 cm square pole, a
15 cm corner cuboid and a 10 cm thick wall.

Geometry and colliders remain resident during timing. Queries include pose
updates, JavaScript/WASM calls, all point rays or native compound traversal,
and closest-hit selection. They exclude construction, streaming, world chunk
selection, geodetic conversion, rendering, angular motion and JSBSim response.
No solver step or GPU work runs. Resident colliders avoid rebuilding shapes or
convex hulls inside each measured query.

After warm-up, a one-time calibration targets 20 ms, with a maximum of 1,000
repetitions. Actual measured blocks can be shorter as execution conditions and
optimization change; some plane-support medians span only 6–12 ms.
Eleven rounds alternate candidate order. A disturbed round can
retry twice. Accepted rounds exclude observed input during the round, CPU
load above 2.5 occupied cores, nonnormal memory pressure, more than 16 MiB of
new compression, or any swap-out. All raw samples and rejection reasons are
retained. Rows with fewer than five accepted rounds are omitted from even the
exploratory timing comparisons here. More accepted rounds do not repair the
missing core and thermal observations. Block-average p95 describes throughput variation, not frame
tail latency; no thermal or mobile qualification is implied.

The user continued using the Mac during these runs. The filter identifies
observed interference; it does not subtract other applications' cost or prove
that an accepted block was isolated. Core migration, effective frequency and
thermal throttling can affect accepted blocks too. All timing rankings remain
provisional; the recorded geometry coverage findings do not depend on clock
speed. Further speed qualification is deferred until instrumentation can account
for these effects during parallel use, or the user offers suitable exclusive
time with the same core and thermal checks. The shared
[benchmark interference policy](../../../foss-earth/docs/validation/benchmark-interference.md)
requires unobservable or insufficient timing to remain unqualified and defers
metrics that cannot be attributed reliably during parallel use.

Plane reference casts are checked against independently calculated source
support. Obstacle casts use original triangles and a reverse-pair consistency
check in the same Rapier backend; that is not an independent obstacle oracle.
Exact rows have zero relative error by definition. Sources contain open
boundaries, so the reference is first surface contact, not filled-solid
containment. The file-default rigid poses are used. LOD3 gear is included; the
HilosRun source is the gear-up flight model without landing gear geometry.
`Propeller_Disc` is excluded. Existing body probes omit gear contacts handled
elsewhere in the simulator, so their misses cannot be read as whole-simulator
landing failures. Live CG offsets and animated parts remain integration work.

## Evidence and reproduction

The [retained evidence directory](../../validation/evidence/collision/geometry-cost-quality-2026-10-05/README.md)
contains compressed raw results and replay fixtures, readable summaries,
source snapshots, dependency locks, CoACD outputs and worker verification.
The initial [summary](../../validation/evidence/collision/geometry-cost-quality-2026-10-05/baseline-summary.json)
and [follow-up summary](../../validation/evidence/collision/geometry-cost-quality-2026-10-05/followup-summary.json)
keep quality counts, timing medians and accepted-round counts together.

Runnable tools live in [scripts/validation/collision](../../scripts/validation/collision/run.mjs).
The evidence README gives commands to replay captured fixtures and generate
new proxy comparisons. Outputs default to dated folders under `build/`.

Typecheck and lint passed before the final application checks. Vitest found no
related application tests for these standalone benchmark tools; the benchmark
itself checks its plane references and reverse casts. The full CI run passed
1,291 tests and failed two concurrently edited F-35B app tests in
`createFlightSimApp.test.ts`. A targeted rerun reproduced both failures. The
separate build check then failed on three audio TypeScript errors in
`createFlightAudio.ts`, also outside this change. Application source was not
modified for the collision experiment. The
[retained check logs](../../validation/evidence/collision/geometry-cost-quality-2026-10-05/checks/ci.log)
preserve the results; this checkout is not claimed to pass CI.
