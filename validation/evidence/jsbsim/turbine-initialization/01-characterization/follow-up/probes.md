# Stage 1 follow-up: focused probes

Two builds: `live` is upstream `master` and `live-candidate` is the
reviewed stage-0+2 repair, each with the stage-1 diagnostics plus the
new side-effect-free live getters. Identities and the equivalence check
against the original instrumented builds are in `provenance.json`.
Machine-readable records: `probes.json`.

## live-state: what a public call leaves behind

`latched` is the last-dispatch diagnostic, written during an evaluation.
`live` is read now, through a getter with no side effects. Where a call
restores something after its final evaluation, only `live` describes
what the caller has.

| point | latched phase | latched engine dt | live phase | live engine dt | live exec dt | suspended |
| --- | --- | --- | --- | --- | --- | --- |
| loaded | off | 0.000000 | off | 0.008333 | 0.008333 | no |
| after RunIC(), engine off | trim | 0.000000 | trim | 0.000000 | 0.008333 | no |
| after propulsion/set-running = -1 | run | 0.500000 | run | 0.008333 | 0.008333 | no |
| after 240 normal frames | run | 0.008333 | run | 0.008333 | 0.008333 | no |
| after RunIC(), engine running | trim | 0.000000 | trim | 0.000000 | 0.008333 | no |
| after one normal frame following RunIC() | run | 0.008333 | run | 0.008333 | 0.008333 | no |
| after SuspendIntegration(), before any Run() | run | 0.008333 | run | 0.008333 | 0.000000 | yes |
| after one suspended Run() | trim | 0.000000 | trim | 0.000000 | 0.000000 | yes |
| after ResumeIntegration(), before any Run() | trim | 0.000000 | trim | 0.000000 | 0.008333 | no |
| after one resumed Run() | run | 0.008333 | run | 0.008333 | 0.008333 | no |

## nesting: SuspendIntegration() keeps one saved timestep

| inner call | dt before | after outer suspend | after inner call | after outer resume | after an explicit Setdt |
| --- | --- | --- | --- | --- | --- |
| RunIC | 0.008333 | 0.000000 susp | 0.000000 susp | 0.000000 susp | 0.008333 |
| set-running | 0.008333 | 0.000000 susp | 0.000000 susp | 0.000000 susp | 0.008333 |

The outer `ResumeIntegration()` restores 0, not the caller's timestep.
An explicit `Setdt` recovers it, so the condition persists until a
caller intervenes rather than being unrecoverable.

## starvation: the published rate follows ConsumeFuel(), not the engine

| point | published gph | published pps | running | N2 | fuel used lb |
| --- | --- | --- | --- | --- | --- |
| running | 3448.87 | 6.3229 | 1 | 100.000 | 9.8796 |
| starved +1 frames | 3448.87 | 6.3229 | 1 | 100.000 | 9.8796 |
| starved +120 frames | 3448.87 | 6.3229 | 0 | 60.843 | 9.8796 |
| starved +1200 frames | 3448.87 | 6.3229 | 0 | 0.670 | 9.8796 |
| starved +7200 frames | 3448.87 | 6.3229 | 0 | 0.029 | 9.8796 |
| after refilling the tanks, +1 frame | 0.00 | 0.0000 | 0 | 0.029 | 9.8796 |

Refilling the tanks restores the published rate on the next frame, so
the stale value lasts exactly as long as `ConsumeFuel()` keeps
returning early.

## fuel-matrix: usable fuel crossed with fuel freeze

| tanks | fuel freeze | after set-running | after RunIC | after 120 frames |
| --- | --- | --- | --- | --- |
| full | off | running 1, N2 100.00, 17797.6 lbf | running 1, N2 100.00, 20037.5 lbf, 1933.75 gph | running 1, 19883.8 lbf, 4.245 lb used, tanks 2995.8 lb |
| full | on | running 1, N2 100.00, 17797.6 lbf | running 1, N2 100.00, 20037.5 lbf, 0.00 gph | running 1, 19883.8 lbf, 0.000 lb used, tanks 3000.0 lb |
| empty | off | running 1, N2 100.00, 17797.6 lbf | running 0, N2 100.00, 0.0 lbf, 0.00 gph | running 0, 0.0 lbf, 0.000 lb used, tanks 0.0 lb |
| empty | on | running 1, N2 100.00, 17797.6 lbf | running 1, N2 100.00, 20037.5 lbf, 0.00 gph | running 1, 19857.3 lbf, 0.000 lb used, tanks 0.0 lb |

### a starvation flag after the tanks are refilled

| point | running | N2 | published gph |
| --- | --- | --- | --- |
| starved | 0 | 99.583 | 3448.87 |
| refilled-without-a-frame | 0 | 99.583 | 3448.87 |
| after-run-ic | 0 | 99.583 | 3442.56 |
| after-set-running | 1 | 100.000 | 3442.56 |
| after-120-frames | 1 | 100.000 | 2691.08 |

## stale-tsfc: the published corrected TSFC while the engine is off

| point | N2 | member N2norm | published tsfc |
| --- | --- | --- | --- |
| running | 100.000 | 1.0000 | 0.7171 |
| cut off +120 frames | 60.590 | 1.0000 | 0.7171 |
| cut off +1200 frames | 1.493 | 1.0000 | 0.7171 |
| cut off +2400 frames | 1.262 | 1.0000 | 0.7171 |

## n2norm-spool-rate: the first Run() frame, member N2norm forced

| forced N2norm | N2 before | N2 after | delta N2 | ratio to N2norm = 0 |
| --- | --- | --- | --- | --- |
| 0.00 | 53.0000 | 53.0692 | 0.06921 | 1.000 |
| 0.25 | 53.0000 | 53.1209 | 0.12093 | 1.747 |
| 0.50 | 53.0000 | 53.1850 | 0.18503 | 2.673 |
| 1.00 | 53.0000 | 53.2206 | 0.22055 | 3.187 |

One frame only: `Run()` recomputes `N2norm` after seeking the spools.

## stall-recovery

| point | N2 | member N2norm | thrust lbf | phase | internal flow pph | running |
| --- | --- | --- | --- | --- | --- | --- |
| running | 100.000 | 1.0000 | 9488.06 | run | 6325.2 | 1 |
| stalled 5 s | 60.640 | 1.0000 | 0.00 | stall | 757.6 | 1 |
| cleared +1 | 60.590 | 1.0000 | 0.00 | stall | 757.6 | 1 |
| cleared +60 | 53.000 | 0.0000 | -1086.59 | run | 757.6 | 1 |
| cleared +300 | 53.000 | 0.0000 | -1094.50 | run | 757.6 | 1 |
| cleared +600 | 53.000 | 0.0000 | -1130.66 | run | 757.6 | 1 |
| cleared +1200 | 53.000 | 0.0000 | -1276.41 | run | 757.6 | 1 |

Not shown: whether tpRun is reachable with N2 below IdleN2, which is what would make the unbounded N2norm negative.

## linearization: the compatibility measurement

`FGLinearization` suspends integration around the numerical Jacobian,
and `FGStateSpace::run()` calls `FGEngine::InitRunning()` on every
perturbation, so the turbine is on its zero-dt steady path throughout.
A turbine contributes no state to `x`: spool states are added only for
propeller thrusters.

| build | throttle | N1 | N2 | thrust lbf | B row for Vt |
| --- | --- | --- | --- | --- | --- |
| live | 0.0 | 30.00 | 60.00 | 379.25 | 0.000000 |
| live | 0.3 | 51.00 | 72.00 | 1070.35 | 2.770804 |
| live | 0.6 | 72.00 | 84.00 | 3143.67 | 5.541608 |
| live | 0.9 | 93.00 | 96.00 | 6599.21 | 8.312412 |
| live-candidate | 0.0 | 30.00 | 60.00 | 379.25 | 0.000000 |
| live-candidate | 0.3 | 51.00 | 72.00 | 1070.35 | 2.770804 |
| live-candidate | 0.6 | 72.00 | 84.00 | 3143.67 | 5.541608 |
| live-candidate | 0.9 | 93.00 | 96.00 | 6599.21 | 8.312412 |

Every other entry of the throttle column is zero on both builds. The
zero at zero throttle is arithmetic: the steady thrust term is
proportional to the square of the normalized spool, whose derivative
at idle is zero.

## injection-load: a declared but undefined Injection lookup

| build | arm | result |
| --- | --- | --- |
| live | run-ic | terminated by signal 11 |
| live | run-off | survived |
| live | run-running | terminated by signal 11 |
| live | run-ic-with-function | survived |
| live | run-running-with-function | survived |
| live-candidate | run-ic | terminated by signal 11 |
| live-candidate | run-off | survived |
| live-candidate | run-running | terminated by signal 11 |
| live-candidate | run-ic-with-function | survived |
| live-candidate | run-running-with-function | survived |

`run-off` survives because `Off()` never reads the lookup. Both paths
that do read it — `Trim()` through `RunIC()` and `Run()` with the
engine running — terminate the process on the stock B747, and both
survive once the engine file defines an `Injection` function.

## function-calls: configured TSFC and ATSFC evaluations per phase

Counter deltas across one call or one frame, so these are evaluations,
not presence. `stock` is the shipped F-16 engine (`<augmethod> 2`);
`augmethod1` is a sandbox copy with `<augmethod> 1`. The F-16 doubles
the throttle command, so command 0.6 is position 1.2 and requests
augmentation.

### stock

| step | phase | engine evaluations | master TSFC | master ATSFC | candidate TSFC | candidate ATSFC |
| --- | --- | --- | --- | --- | --- | --- |
| load then RunIC(), engine off | trim | 2 | 0 | 0 | 0 | 0 |
| one frame, engine off | off | 1 | 0 | 0 | 0 | 0 |
| RunIC() at a dry throttle, engine off | trim | 2 | 0 | 0 | 0 | 0 |
| propulsion/set-running = -1 | run | 124 | 123 | 0 | 123 | 0 |
| one running frame, dry | run | 1 | 1 | 0 | 1 | 0 |
| RunIC(), running, dry | trim | 2 | 0 | 0 | 2 | 0 |
| first augmented frame | run | 1 | 1 | 1 | 1 | 1 |
| second augmented frame | run | 1 | 0 | 1 | 0 | 1 |
| RunIC(), running, augmented | trim | 2 | 0 | 0 | 2 | 2 |
| one stalled frame | stall | 1 | 0 | 0 | 0 | 0 |
| one seized frame | seize | 1 | 0 | 0 | 0 | 0 |
| one frame after cutoff | off | 1 | 0 | 0 | 0 | 0 |
| one cranking frame | spinup | 1 | 0 | 0 | 0 | 0 |

### augmethod1

| step | phase | engine evaluations | master TSFC | master ATSFC | candidate TSFC | candidate ATSFC |
| --- | --- | --- | --- | --- | --- | --- |
| load then RunIC(), engine off | trim | 2 | 0 | 0 | 0 | 0 |
| one frame, engine off | off | 1 | 0 | 0 | 0 | 0 |
| RunIC() at a dry throttle, engine off | trim | 2 | 0 | 0 | 0 | 0 |
| propulsion/set-running = -1 | run | 124 | 1 | 122 | 1 | 123 |
| one running frame, dry | run | 1 | 0 | 0 | 0 | 0 |
| RunIC(), running, dry | trim | 2 | 0 | 0 | 2 | 0 |
| first augmented frame | run | 1 | 1 | 1 | 1 | 1 |
| second augmented frame | run | 1 | 0 | 1 | 0 | 1 |
| RunIC(), running, augmented | trim | 2 | 0 | 0 | 2 | 2 |
| one stalled frame | stall | 1 | 0 | 0 | 0 | 0 |
| one seized frame | seize | 1 | 0 | 0 | 0 | 0 |
| one frame after cutoff | off | 1 | 0 | 0 | 0 | 0 |
| one cranking frame | spinup | 1 | 0 | 0 | 0 | 0 |

Reading it: `Off()`, `SpinUp()`, `Stall()` and `Seize()` evaluate
neither parameter. A dry running frame evaluates TSFC once. The first
augmented frame evaluates *both*, because `Augmentation` is still
false when `if (!Augmentation)` is tested, and later augmented frames
evaluate only ATSFC. With `<augmethod> 1` a frame can evaluate
neither, when `Augmentation` is latched true from the previous frame
and the throttle has since fallen below the 99 % threshold. `Trim()`
evaluates nothing on master and, on the repaired candidate, once per
`Calculate()` for a running engine — twice per `RunIC()`, which makes
two model passes — and nothing for an engine that is off.

