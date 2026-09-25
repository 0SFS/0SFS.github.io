# Work prompt: fix and test the shut-off-engine regression in JSBSim PR #1505

Implement this task; do not stop at a plan. Keep the change small enough for
independent review. This is a native-engine correction to
[PR #1505](https://github.com/JSBSim-Team/jsbsim/pull/1505), not the larger
turbine initialization redesign.

This is stage 0 of the [broader implementation plan](turbine-initialization/plan.md).
Its narrow scope is deliberate: the remaining plan covers #1508, shared
calculations, explicit operations, native callers and SDK/app adoption. Finish
this regression repair independently; do not expand it into those later stages.

## Outcome and boundaries

During `RunIC()`, an off turbine that reaches `Trim()` must retain its
existing N1/N2 instead of acquiring the throttle's steady running speeds.
A running turbine must still report the correct steady N1/N2 immediately,
without waiting for time to advance. Preserve the existing trim thrust
calculation, including augmentation.

Fix and test **#1505 only**. Leave the patch uncommitted for review on its
existing local PR branch. Do not push, post comments, edit the GitHub PR,
request review, merge into fork master, rebase #1508, build a release package,
or change the app's installed dependency. Local editing, building and testing
are the work; publication and downstream adoption are later tasks.

The user already posted
[our acknowledgment](https://github.com/JSBSim-Team/jsbsim/pull/1505#issuecomment-5744958064).
Do not post it again. Sean explained why the zero-time turbine phase runs
without an aircraft trim request; he did not request this fix or approve the
PR. The regression was our own finding.

## Read and establish the starting state

Read these in the 0sfs repository, `/Users/felg/gh/0sfs`:

- `AGENTS.md` and `docs/validation/layout.md`.
- `docs/open-upstream-prs.md`, specifically #1505/#1508.
- `docs/jsbsim-upstream-contribution-policy.md` and the checkout/build
  guidance in `docs/jsbsim.md`.
- The defect and evidence sections of
  `docs/validation/jsbsim-open-pr-review-2026-09-14.md`.

Work on engine source in `/Users/felg/gh/Felipegalind0/jsbsim`. Read any
applicable instructions there. The following state was verified on
2026-09-19; inspect it again before changing branches:

| Item | Expected state |
| --- | --- |
| Canonical checkout | Clean, on `feature/wheel-spin-dof` at `499c3832` |
| Branch to repair | `fix/turbine-trim-spool` |
| #1505 original head | `07eba55fcd6fed530f6f404e857765c3224541fb` |
| #1505 parent/base | `14c19022943f5850daf2c6b90554050b3139b853` |
| #1508, for context only | `fix/turbine-trim-fuel-flow`, `7511df10cda909c32dfc378dfde204eb44dc5a48` |
| Python interpreter | `/Users/felg/gh/Felipegalind0/jsbsim/.venv/bin/python` (3.14.7 when checked) |
| CMake | 4.4.3 when checked |

Record `git status --short`, branch, HEAD and the PR branch hash. Refresh the
live #1505 head and comments with read-only GitHub calls. If the PR has
changed, inspect what changed before assuming this prompt still applies. If
the fix is already present, verify it instead of duplicating it. Report any
material scope conflict. If network access is unavailable, use the verified
local head and disclose that the remote refresh was unavailable.

Require a clean JSBSim checkout before switching to `fix/turbine-trim-spool`.
Do not stash, discard, reset or overwrite someone else's changes. Tell the
user when you switch. Use the existing PR slice because this task repairs
that PR; do not base the patch on fork master, which contains unrelated
integration work. No worktree is needed for sequential work. If another agent
is actively using this checkout, coordinate ownership before switching it.

0sfs already has unrelated uncommitted work. Preserve it. All scratch,
generated fixtures, raw logs and binaries belong in the owning repository's
gitignored `build/`; never use `/tmp`, `/var/folders` or a harness scratchpad.
Do not start a server or a visible browser. Do not follow procedures in
`docs/old/` or execute historical commands that write outside these repos.

## Understand the defect before editing

Read the PR diff and these paths at the PR head:

- `src/models/propulsion/FGTurbine.cpp`: `Calculate()`, `Trim()`, `Off()`,
  `InitRunning()` and the first positive-time transition out of `tpTrim`.
- `tests/TestTurbineTrimSpool.py`, `tests/TestTurbine.py`,
  `tests/JSBSim_utils.py`, `tests/CMakeLists.txt`.
- `scripts/f16_test.xml` and the aircraft, IC and engine XML it references.

The zero-time trigger predates this PR. `Calculate()` selects `tpTrim` when
`in.TotalDeltaT == 0`, independently of aircraft trim selection; starvation,
stall and seizure can subsequently override that selection. Do not alter
this dispatch or the meaning of `RunIC()`.

#1505 replaced a temporary local N2 with a write to the member N2 and added
a write to member N1. Those writes currently happen even when `Running` is
false. Upstream's later positive-time transition already checks
`Running && !Starved` before initializing running spool speeds.

**Implementation trap:** simply wrapping the two existing assignments in
`if (Running)` leaves the rest of `Trim()` reading stale member N2 for an
off engine. That changes thrust and the `AugMethod == 1` threshold.

Use a clearly named local steady N2, computed unconditionally from the
existing formula. Use that local value for the normalized thrust calculation
and the augmentation threshold. Copy it into member N2 and update member N1
only when `Running` is true. At this PR head `Trim()`'s `N2norm` is a local
variable; keep it local. Verify every N2 use in the method. Keep equations,
operation order and other behavior unchanged. Add one short comment
explaining why zero-time evaluation must preserve off-engine spool state.

Do not zero the spools for an off engine: shutdown and windmilling can leave
legitimate residual rotation. Do not return early from `Trim()` for an off
engine: its existing hypothetical thrust is outside this fix. Do not add a
new public setting, change start/stop semantics, or implement
`docs/proposals/jsbsim-turbine-evaluation.md`. In particular, commanding
cutoff immediately before `RunIC()` while `Running` is still true is a
separate lifecycle question; do not claim this guard settles it.

## Regression tests: write these before the production change

Extend `tests/TestTurbineTrimSpool.py` using `JSBSimTestCase` and the stock
F-16 fixture. Keep the existing running-engine test and its expectations.
Extract a small fixture helper if needed; avoid unrelated test refactoring.
Load the model and IC without script events, as the existing test does.

1. **Never started.** Create the FDM without calling `set-running`. Assert
   `propulsion/engine[0]/set-running == 0`. Set a nonzero throttle, snapshot
   N1/N2 and time, call `run_ic()`, and assert success, unchanged time,
   unchanged N1/N2 and still not running. Repeat at another throttle to
   catch repeated initialization. Use separate assertions for both spools.
2. **Started, then shut down with residual spin.** Initialize normally with
   `propulsion/set-running = -1`, run at throttle command 0.35, command
   `propulsion/cutoff_cmd = 1`, then advance until the engine is actually
   off. The retained reproduction uses 2 seconds running and 10 seconds
   after cutoff at `dt = 1/120`. Assert `Running == 0` and residual N2 is
   positive before taking the comparison snapshot. Call `run_ic()` and
   verify it preserves that residual N1/N2 and simulation time. Repeat to
   ensure no delayed reset. Do not force N1/N2 through property writes.
3. **Following frames.** For both off cases, advance time after the
   zero-time checks and verify the engine stays off with finite spool
   values. With fuel flow already settled to zero, verify it does not
   acquire new fuel flow or additional fuel use. Do not assert that an
   airborne off engine must remain at zero or always slow down: the model
   permits windmilling. The bad #1505 head is the negative control for
   initialization and the thrust compatibility reference, not an expected
   post-reset spool trajectory.
4. **Running behavior.** Preserve the existing idle/intermediate/full/idle
   sweep and first integrated idle-sample continuity check. Verify normal
   `InitRunning()` still succeeds through the public `set-running` path;
   it sets `Running` before its zero-time calculation. Assert the running
   flag as well as spool values.

The F-16 FCS maps throttle command 0..1 to position 0..2. Follow the existing
test's independent position check and dry-throttle clamp. Do not assume
command 0.35 means position 0.35. Compare off-engine pre/post values directly
with a tight explained tolerance, rather than hardcoding historical numbers.
Historical N2 values (85.9% after the bad initialization, about 0.57% before
the shutdown reset) are diagnostic context, not portable expected constants.

Also record a small **before/after thrust comparison** for zero-time
off-engine evaluation at dry and augmented throttle. Exercise `AugMethod 1`
as well as the stock fixture's method; use a sandbox copy of the engine XML
for the alternate method, leaving repository aircraft/engine data unchanged.
This catches accidentally using stored N2 in the augmentation threshold.
Verify that the selected case actually activates augmentation on the
unpatched baseline and that thrust remains unchanged with the fix. This is
compatibility characterization, not a claim that powered thrust from an off
engine is physically correct. Retain the small comparison helper under
`0sfs/scripts/validation/jsbsim/engine-off-trim/` if it is needed to reproduce
the evidence; otherwise express it in the native regression test fixture.

## Build and prove the regression causally

Use a new dated directory, for example JSBSim
`build/pr1505-off-engine-20260919/`, with separate `before/` and `after/`
builds. Choose a fresh suffix if that path already exists. Set `TMPDIR` to a
created subdirectory there for tools that use the system temporary directory.
Run test processes from their build directory so JSBSim's test sandboxes and
simulation output stay under `build/`.

The following command pattern matches this repository's configuration.
Replace the example date consistently. These builds have not been run as
part of preparing this prompt:

```sh
cd /Users/felg/gh/Felipegalind0/jsbsim
cmake -S . -B build/pr1505-off-engine-20260919/before \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_DOCS=OFF -DBUILD_SHARED_LIBS=OFF \
  -DBUILD_PYTHON_MODULE=ON \
  -DPython3_EXECUTABLE=/Users/felg/gh/Felipegalind0/jsbsim/.venv/bin/python \
  -DCYTHON_EXECUTABLE=/Users/felg/gh/Felipegalind0/jsbsim/.venv/bin/cython
cmake --build build/pr1505-off-engine-20260919/before -j8
```

Before editing `FGTurbine.cpp`, run the expanded spool test against that
unmodified native implementation. At least the never-started and residual
spin tests must fail on their spool-preservation assertions; an import,
fixture, startup or build failure is not a reproduction. Save the individual
failure output and the baseline thrust measurements. The pre-existing
running-engine test must still pass.

Set an absolute `PYTHONPATH` to the selected build's `tests` directory when
running CTest or a direct Python probe. Example:

```sh
PYTHONPATH=/Users/felg/gh/Felipegalind0/jsbsim/build/pr1505-off-engine-20260919/before/tests \
  ctest --test-dir build/pr1505-off-engine-20260919/before \
  -R '^TestTurbineTrimSpool$' --output-on-failure
```

Log `jsbsim.__file__` and the compiled `jsbsim._jsbsim.__file__` from the
same environment used by the tests, and hash the extension. They must resolve
inside the selected build, not to an installed package or an older build.
The expected package location is `<build>/tests/jsbsim/`. Check CTest lists
the expected target; a successful run containing zero tests is not a pass.

Now implement the production fix. Configure/build `after/` with the same
options and interpreter, point `PYTHONPATH` at `after/tests`, and rerun the
same test source and thrust comparison. All cases must pass. Do not rebuild
`before/` after changing the C++ source and then call it the original binary.

Run the original 11-target focused suite on the final candidate:

```sh
PYTHONPATH=/Users/felg/gh/Felipegalind0/jsbsim/build/pr1505-off-engine-20260919/after/tests \
  ctest --test-dir build/pr1505-off-engine-20260919/after --output-on-failure \
  -R '^(TestModelLoading|TestInitialConditions|TestPythonDefaultLoggerFiltering|CheckSimTimeReset|TestHoldDown|CheckTrim|TestEngineIndexedProps|TestTurbine|TestTurbineTrimSpool|TestGndReactions|TestPlanet)$'
```

Record actual counts, test-method results, commands, exit statuses and
tolerances. If the test source changes after the baseline run, rerun it
against the retained baseline extension too. If final production code changes,
rebuild and rerun affected checks. Investigate failures; do not weaken
assertions to obtain green results. Broaden tests only for a concrete concern.
Python tests exercise the native engine, but do not establish C++ line
coverage in upstream's Python-disabled coverage job; do not claim otherwise.

Existing reproductions are useful references:
`0sfs/scripts/validation/jsbsim/engine-off-trim/native_check.py` and
`check.mjs`; their measurements live in
`0sfs/validation/evidence/jsbsim/engine-off-trim/`. The Python script assumes
`<source>/build/tests` and calls `tempfile.mkdtemp()` without a directory.
Do not run it unchanged against the wrong build or let it write outside the
repository. The permanent tests above should use the normal test sandbox.

## Reviewable deliverables and completion

Leave the implementation and tests uncommitted on `fix/turbine-trim-spool`.
Expected engine diff: `FGTurbine.cpp` and `TestTurbineTrimSpool.py`; touch
other files only when directly required and explain why. Do not switch away
with those changes or stage unrelated files.

Write a concise report at
`0sfs/docs/validation/pr1505-off-engine-regression.md`, with retained logs,
measurements and provenance under a new dated subdirectory of
`0sfs/validation/evidence/jsbsim/engine-off-trim/`. Include:

- Original HEAD, parent, final working diff, source/test SHA-256 values,
  compiler/CMake/Python versions, build options and extension hashes/paths.
  Describe the final candidate as uncommitted; do not attribute its results
  to the unchanged HEAD alone.
- Both expected failures on the original implementation, candidate passes,
  focused-suite results and the dry/augmented thrust comparison.
- What changed and why; numerical tolerances; any limitation or unresolved
  failure. Link retained evidence, not disposable `build/` output as though
  another checkout could read it.

Update only the relevant #1505 portion of `docs/open-upstream-prs.md` with
the local candidate status and report link, preserving unrelated edits.
Leave #1508 and downstream adoption explicitly pending. Do not check off a
combined #1505/#1508 task as complete when only #1505 has been repaired.

The remaining #1508 work is separate: it carries #1505 and additionally
writes member `N2norm`, TSFC and fuel flow during trim. It needs the corrected
spool patch carried over, its own guarded-state implementation, off-engine
fuel regressions and its existing `TestTurbineTrimFuelFlow` checks. A pass on
#1505 proves none of those. Likewise, the installed fork.7 package remains
unchanged: app reset/bootstrap/restore and WASM validation must happen on a
later identified integration candidate before claiming the app is fixed.

Finish with a short summary naming the branch, changed files, before/after
test results, report location and remaining follow-ups. Do not claim upstream
acceptance, publication, app repair or completion of the broader turbine
proposal.
