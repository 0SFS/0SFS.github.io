# Task 7: expose native operations, adapt the app and adopt a package

Require reviewed native acceptance from stage 6. Read [plan](../plan.md),
[contract](../contract.md), [validation](../validation.md), decisions,
`docs/jsbsim.md`, the sound spec/ledger where relevant and JSBSim
`wasm/docs/centralized-builds.md`. Execute the three parts sequentially;
the coordinator may hand them to separate agents at the part boundaries.
This task prepares local SDK/app adoption; no npm publication, push, site
deployment or upstream messaging is included.

## A. SDK and real WASM

Expose the reviewed initialization/refresh/capture/restore capabilities in
JSBSim's bindings and `wasm/src/sdk/jsbsim-sdk.ts`/types. Preserve existing
SDK methods as documented adapters where required. Native code owns physics
and state validation; TypeScript does not reconstruct internal turbine state.
Avoid generated-file-only changes that vanish on the next bindings build.

Extend `wasm/test/` with real-runtime tests for cold/running/refresh operations,
per-engine behavior, history roundtrip and continuation, errors, incompatible
model/version, repeated operations, reload and destroyed-owner rejection.
Compare representative native/WASM scenarios and run existing SDK lifecycle,
runtime and source-contract tests. Dirty `build:dev` output is diagnostic;
record its identity and do not label it an eligible release artifact.

## B. App intent and recovery

Adapt `bootstrapC172.ts` (the shared bootstrap despite its name),
`resetFlightLocation.ts`, `physics/safeFlightState.ts` and their callers/tests.
Audit `fixedStepLoop.ts`, `terrainContact.ts` and `visibleMeshCollision.ts`:
their correction/recovery operations must preserve turbine history, while a
new departure/arrival preset intentionally establishes a scenario state.
Keep C172 support and existing terrain/contact/actuator intent intact.

Include native engine state in same-model simulation snapshots and use the
new preserve-history evaluation path after restoration. Preserve clock and
selected tank/control state. Do not introduce disk persistence or promise
whole-aircraft bitwise resume; the current snapshots are in-memory recovery
records. Handle absence of turbine capability for piston engines deliberately.
Do not silently fall back to restarting an unsupported turbine snapshot.

Test every SF50 runtime package with real WASM: engine on/off bootstrap,
new preset initialization, location-only changes, partial startup/shutdown,
windmilling, terrain support correction, invalid-state recovery, repeated
restore and immediate first readback. Compare the subsequent engine trajectory
with an uninterrupted control at matched inputs. Snapshot capture occurs in
the fixed-step path: measure its allocation/call overhead and bound it using
an engine-owned efficient representation, not hundreds of app property reads.

Inspect first engine-monitor/audio snapshots and epoch handling. Starter fuel
before Running latches must remain audible in telemetry; a restored off
engine must not gain combustion from initialization. Use native truth for
any required combustion signal. Do not hide native defects with app spool,
flow or Running writes. No DSP change is expected; follow its build/provenance
rules if a demonstrated need requires one.

## C. Identified package and local adoption

After SDK review, produce a clean committed integration candidate containing
the accepted native and SDK source. Choose a new unused package version,
build with the locked toolchain, run checks and pack through the supported
immutable build pipeline. Record actual tarball and distribution hashes.
Follow `docs/jsbsim.md`; a different WASM hash alone is not a defect.

Copy the new tarball into 0sfs `deps/` without replacing the old one. Update
dependency declaration, lock and build-identity expectations together. Preserve
the prior package and matching declaration/lock/identity rollback record.
Test the app against the installed candidate; no source symlink or production
dependency override. Run artifact verification, relevant real integration
tests, full app suite, production build and headless loaded-asset verification.
Do not start a server. Use test discovery/counts to reject false zero-test
passes. Run focused lint on authored changes and required project checks.

On failed adoption, restore only this task's dependency/identity changes using
the recorded prior versions, preserving unrelated edits, and report the failed
candidate. Retain its evidence; do not promote it because native tests passed.

## Exit

Write `reports/07-sdk-and-app.md` with separate native readiness, SDK results,
package identity, app adoption and upstream state. Retain byte verification,
roundtrip/trajectory evidence, measured snapshot overhead and rollback metadata.
Update the tracker, `docs/jsbsim.md`, the relevant audio ledger statements and
TODO only where the evidence supports completion. Do not claim device audio
qualification, whole-aircraft checkpointing, calibration or upstream acceptance.
