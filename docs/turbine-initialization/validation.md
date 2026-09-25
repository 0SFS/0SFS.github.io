# Turbine initialization validation

Required by the [plan](plan.md). These are planned checks; no new runtime
result is claimed by this document. Every stage report identifies its tested
source and distinguishes regression evidence, compatibility measurements and
unrun coverage.

## Baselines

Keep separate identities for upstream before our PRs (`14c1902`), original
#1505 (`07eba55f`), original #1508 (`7511df10`), corrected PR slices, the
fork integration immediately before the redesign, and each candidate. Build
from pinned source archives under JSBSim `build/` or clean recorded branches.
Do not use fork master to prove an upstream-only candidate.

Run the same expanded tests against the bad and fixed implementations to
prove the introduced off-engine regressions. The bad PR head is a negative
control for spool/fuel state, not a correct expected post-reset trajectory.
For structural extraction, compare the exact pre-extraction and extracted
implementations; for behavioral corrections, identify each intended difference.

Import Python from the selected build's `tests/` via absolute `PYTHONPATH`.
Log both `jsbsim.__file__` and the compiled extension path/hash. Native tests
must be registered and actually discovered; zero tests is not success.
Use the repository test sandbox and set external temporary paths inside
`build/`. Stock fixtures and redistributable sandbox XML variants only.

## Required coverage

| Group | Cases and assertions | Layers |
| --- | --- | --- |
| Off | Never started at nonzero throttle; repeated initialization; shutdown with residual spin; first and later frames; no new running target | C++ core, Python API, real WASM |
| Commands and supply | Cutoff immediately before refresh while `Running` is stale; explicit restart; empty/unselected/unusable fuel; refill; freeze; conflicting IC/live commands | C++, Python |
| Starting and faults | Starter-only, fueled start before running latch, abort, windmill/airstart, starvation/stall/seizure individually and representative simultaneous precedence | C++, Python |
| Steady running | Idle/intermediate/max dry/augmented/idle; order independence; immediate N1/N2/flow/TSFC/gauge consistency; no deferred first-frame repair | C++, Python, WASM |
| Ordinary dynamics | Throttle steps and ramps, startup/shutdown, density dependence, bleed, augmentation transitions, injection on/exhausted; preserve spool/fuel rates | C++, fixed-input comparison |
| Configured functions | Default and custom property-dependent TSFC/ATSFC; cached pre-functions; `copyto`; custom spool rates; order/count checks where observable | Native XML fixtures |
| Engine options | AugMethod 0/1/2, inactive/active augmentation, bleed and injection effects, default idle fuel flow; configured idle flow on fork integration | C++, Python |
| Histories | Refresh preserves continuous history; cold reset sets documented defaults; warm initialization is explicit; injection duration stays frozen during zero-time work | C++, Python |
| Fuel/time | No elapsed sim/engine duration, tank debit, fuel-related mass change or cumulative fuel use during refresh/trim with unchanged external inputs | C++, Python, WASM |
| Multi-engine | Mixed running/off/faulted turbines; per-engine and all-engine startup; no unintended changes to neighbors | Python, C++ |
| Trim and failure | Success; nonconvergence; unsupported state; invalid input; controlled exception; accepted force/derivative coherence; rollback contract | C++, Python, script comparison |
| Scheduling | Nested suspension; already suspended entry; copied engine dt; propulsion rate other than 1; repeated RunIC; saved IC running requests and CLI/script trim | C++, Python |
| Restore | Same-model roundtrip during start, shutdown, windmilling and running; subsequent engine trajectory compared with uninterrupted control; bad identity/version/NaN rejected before mutation | C++, WASM, app |
| Other engines | Existing piston/turboprop and shared executive/propulsion tests; representative non-turbine scripts | Python, script comparison, C172 app checks |
| App | All SF50 runtime packages: cold/running bootstrap, location changes, preset restart, terrain/contact recovery and invalid-state recovery; first telemetry/audio snapshot | Real WASM/app integration, headless browser |

Use boundary-focused fixtures, not every Cartesian combination. Each group
needs at least one causal case for its changed behavior and appropriate
boundary cases. Core engine behavior needs CxxTest coverage even when Python
is disabled upstream. Python tests verify real public entry points; mocks
cannot establish native behavior or package correctness.

Prefer invariant and independent analytical expectations. The F-16 throttle
command maps to twice the position and >1 requests augmentation; validate the
mapping before asserting spool targets. Do not duplicate production formulas
into tests without an independently justified expected result. A fixed-input
steady case checks no initial repair; moving-aircraft comparisons allow
environmental evolution with stated tolerances. Give every numeric tolerance
units and justification before accepting a difference.

## Build and suite progression

Use the Release/Python/Cython configuration in the
[#1505 prompt](../pr1505-off-engine-regression-prompt.md), with fresh dated
paths and the source/toolchain pinned in the report. Build a separate
`BUILD_PYTHON_MODULE=OFF` configuration with CxxTest available and run its
native tests. Do not copy historical test counts as expectations.

At each change, run its focused tests plus relevant adjacent targets. The
known starting targets include `TestTurbine`, `TestTurbineTrimSpool`,
`TestTurbineTrimFuelFlow`, `TestTurboProp`, `TestEngineIndexedProps`,
`CheckTrim`, `TestInitialConditions`, `TestICOverride`, `TestSuspend`,
`CheckSimTimeReset`, `TestHoldDown`, `TestModelLoading` and
`TestGndReactions`; presence depends on the selected slice. Final native
acceptance runs the full discovered Python/native suites with Python ON and
the native suite with it OFF, once on each changed final source candidate.
Classify any failure against the identical baseline rather than broadly
waiving a historically flaky test.

Reuse the shipped-script comparator at
`scripts/validation/jsbsim/wheel-spin-review/compare_scripts.py` with an
explicit output path. If turbine-specific traces are needed, add an owning
tool under `scripts/validation/jsbsim/turbine-initialization/`, without
rewriting the retained wheel tool. Inventory current scripts rather than
hardcoding the historical count of 61. Run common fixtures against base and
candidate binaries; separately test any deliberately migrated fixtures.
Compare trim outcomes, numerical output and first divergence. Explain
changed off-engine solutions, non-turbine differences, new failures and
nonfinite results. Byte differences alone do not diagnose a physics defect.

## WASM and adoption

Build native and SDK from one identified integration revision. Dirty
diagnostic candidates may establish preliminary behavior only; stable app
adoption requires a clean source and eligible immutable package. Follow
`docs/jsbsim.md` and JSBSim `wasm/docs/centralized-builds.md` at execution
time. Choose an unused fork version then; do not assume fork.8 is available.

Run real-WASM operation/capture/restore tests, SDK lifecycle and existing
runtime tests, and matched native/WASM scenarios with explained tolerances.
Reject unsupported engine types/state versions and model reload/destroyed
handles cleanly. Test repeated calls and per-engine ownership.

After installing a new tarball under `deps/`, update the declaration, lock
and identity expectations together. Run `npm run verify:jsbsim`, relevant
real app integration tests, the full app test suite and `npm run build`.
Verify the loaded bytes using `scripts/check-jsbsim-browser-artifact.mjs`,
which uses headless request interception without a server. Keep the old
tarball and matching rollback files. Changing WASM hashes between builds is
not itself a regression; record and verify the bytes actually adopted.

Check audio-adapter telemetry during starting and shutdown: fuel can flow
before `Running` latches. Do not substitute that flag for combustion or mask
bad engine state with app spool/flow writes. If a semantic mismatch requires
native combustion state, expose the minimum truthful signal in JSBSim/SDK
and test it. DSP work is not expected; if needed, follow the audio build and
provenance rules. No listening/device qualification is implied by these tests.
