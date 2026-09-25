# Stage 1 follow-up records

2026-09-19, after the [coordinator review](../../../../../../docs/turbine-initialization/reports/01-review.md).
The original records in the parent directory are unchanged; this directory
holds what the follow-up added or corrected, and
[`../CORRECTIONS.md`](../CORRECTIONS.md) maps each correction to the file it
affects.

Nothing here changed production behaviour. The JSBSim checkout stayed clean on
`candidate/pr1508-off-engine-fuel` at `482da811`, no branch was created or
moved, nothing was pushed, no comment was posted and the app's installed
package was not touched. No engine test suite was rerun: only the checks the
review's corrections depend on were re-measured.

| File | What it is |
| --- | --- |
| `provenance.json` | the three new instrumented builds, why they exist, their hashes, the equivalence check against the originals, the fixture digests and the exact commands |
| `module-identity.txt` | the loaded extension and `FGTurbine.cpp` hash for all six builds in this run |
| `probes.md` | the focused probes as tables, including the corrected last-dispatch/live distinction |
| `probes.json` | the same probes, machine readable, both builds |
| `trace-data.json` | every sample and field of the re-run trace for the three instrumented builds, lossless and machine readable |

## What is new here rather than reproduced

- **live state.** The original diagnostics latch the copied propulsion
  timestep, the executive timestep, the trim status and the phase *during* an
  evaluation. After a public call returns they describe that evaluation, not
  the state the caller has. The follow-up builds add side-effect-free getters
  for the same values and for the suspension flag. This corrects the claim
  that settling leaves the copied timestep at 0.5 s: it does not,
  `FGPropulsion::GetSteadyState()` restores it, and the 0.5 s was the last
  evaluation it performed.
- **fuel matrix.** Usable fuel crossed with fuel freeze, which the original
  records measured only separately, plus what a starvation flag does once the
  tanks are refilled.
- **injection arms.** `Trim()` and a running `Run()` both reach the undefined
  lookup; `Off()` does not. The original record measured only the `Trim()` arm.
- **linearization.** `FGLinearization`'s throttle column at four throttle
  settings on both builds, as the compatibility measurement for the suspended
  numerical-Jacobian path.
- **recovery from the nesting defect.** An explicit `Setdt` restores the
  executive, so the condition lasts until a caller intervenes.
- **configured-function call counts per phase.** Counter deltas across one
  call or one frame, for the shipped F-16 engine and an `<augmethod> 1`
  sandbox copy. This is the table a behaviour-preserving extraction has to
  reproduce, and it is what a constant `copyto` sentinel cannot supply.

## Equivalence

The new instrumented builds are compared two ways, both recorded in
`provenance.json`:

- against their own uninstrumented pair in this run: zero differences among
  2137 compared values, for each of the three pairs;
- against the *original* instrumented builds, over every field the two share
  including the counters and the private members: zero differences among 5137
  compared values, for each of the three pairs.

The three uninstrumented binaries were reused unchanged and reproduce the
first run exactly, so moving the tools into `scripts/` did not change what any
earlier binary measured.

## Reproducing

Tools, all under `scripts/validation/jsbsim/turbine-initialization/`:
`instrument_turbine.py` applies the diagnostics to an unpacked source archive,
`runic_trace.py` runs the sixteen-scenario trace, and `engine_probes.py` runs
the focused probes. `provenance.json` carries the exact commands, the build
directories and the fixture digests. The builds themselves live in the JSBSim
repository's gitignored `build/` and are not distributed with this record.
