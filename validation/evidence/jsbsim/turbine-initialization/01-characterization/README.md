# Stage 1 characterization records

2026-09-19. **Read [`CORRECTIONS.md`](CORRECTIONS.md) first**: the coordinator
review found that the `diag-*` columns here are last-dispatch diagnostics
rather than live state, and one derived claim was wrong because of it. The
files below are unchanged and still say what the binary they name measured;
the corrected and added measurements are in [`follow-up/`](follow-up/).

Retained measurements for
[stage 1 of the turbine initialization plan](../../../../../docs/turbine-initialization/plan.md).
The interpretation is in the [stage report](../../../../../docs/turbine-initialization/reports/01-characterization.md)
and the [decisions](../../../../../docs/turbine-initialization/decisions.md).

Nothing here changed production behaviour. The JSBSim checkout was clean on
`candidate/pr1508-off-engine-fuel` throughout, no branch was created or moved,
nothing was pushed, no comment was posted and the app's installed package was
not touched.

| File | What it is |
| --- | --- |
| `provenance.json` | source identities, build hashes, toolchain, the instrumentation controls and the count of samples differing from master |
| `module-identity.txt` | the loaded extension and `FGTurbine.cpp` hash for each of the six builds |
| `starting-state.txt` | checkout, refs and toolchain recorded before any work |
| `key-measurements.md` | the tables cited in the report, curated from the trace run |
| `trace.md` | the full trace: every scenario, every sample, every build |
| `differences.json` | every recorded value that differs from master, for the two uninstrumented variants |
| `n2norm-spool-rate.txt` | the isolated `N2norm` sensitivity measurement |
| `starvation-nesting-and-stale-tsfc.txt` | the starved-engine flow, the nested-suspension result and the stale `tsfc` |
| `injection-null-lookup.txt` | the stock B747 crash and the control that removes it |
| `stall-recovery.txt` | a compressor stall and its recovery, including what it does not show |
| `trimstatus-variant.diff` | the one-line scratch variant implementing bcoconni's proposal |
| `diag-instrumentation.py` | the scratch counters added to the diagnostic builds, as they were for this run. The maintained helper is now `scripts/validation/jsbsim/turbine-initialization/instrument_turbine.py`, which adds live getters as well |
| `CORRECTIONS.md` | what the review corrected, and where the corrected measurement lives |
| `follow-up/` | the follow-up builds, probes and lossless trace data |

The trace was run twice with the same builds and the same tool: `trace.md` is
byte-identical between the runs and the recorded differences are equal.

Reproduce the trace with `runic_trace.py` and the focused probes with
`engine_probes.py`, both under
`scripts/validation/jsbsim/turbine-initialization/`; the exact commands, build
directories and options are in `provenance.json` and `follow-up/provenance.json`. The scratch
builds live in the JSBSim repository's gitignored `build/` and are not
distributed with this record.

`diag-instrumentation.py` is a characterization aid, not a proposal. It was
applied to unpacked source archives under `build/`, never to a branch, and the
`instrumentation_controls` block in `provenance.json` records zero differences
among 2137 compared values between each instrumented build and its
uninstrumented pair.
