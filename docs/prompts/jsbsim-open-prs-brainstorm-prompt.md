# Fresh conversation: brainstorm how to resolve our open JSBSim PRs

Work in `/Users/felg/gh/0sfs` and `/Users/felg/gh/Felipegalind0/jsbsim`. A
review on 2026-09-14 went through every open PR we have upstream. It found a
defect in two of them, three reviewer comments waiting on us, a scope question
on the large WASM PR, and one finished change with no PR.

I want to **brainstorm with you** the best way to resolve all of it before
anything is changed. Help me think: lay out the real options, say what each
costs, recommend one, and ask for my decision where it's mine to make. Build an
agreed plan with me. Do not start implementing the plan.

## Ground rules for this session

- **Allowed:** read anything. Run read-only `gh` queries. Build and run
  experiments in a scratch directory to answer a question we are weighing, for
  example checking that a proposed guard fixes the defect without breaking the
  existing tests.
- **Not allowed without my explicit say-so:**
  - pushing;
  - posting or editing GitHub comments, PR bodies or reviews;
  - opening, closing or converting PRs;
  - committing;
  - changing, rebasing or resetting any existing branch.
  Drafting a reply or a patch in a scratch file for me to read is fine.
- **Servers:** never start a development, preview or watch server.
- **Unrelated work:** both working trees hold uncommitted work that isn't part of
  this. Do not stage, stash, reset or reformat it.
- **Commit messages:** no attribution lines, if we get to committing.
- **Where changes belong:** native engine and SDK changes go in the jsbsim fork,
  never in packaged binaries under `0sfs/deps` or `node_modules`. Reusable fixes
  follow `docs/jsbsim-upstream-contribution-policy.md`.
- **Reviewers:**
  - Refer to reviewers by their handles, and use they/them unless their pronouns
    are stated.
  - bcoconni has said #1502 has "a couple of errors" without naming them yet.
    Do not guess what they are or present a guess as his.
- **Stale facts:** check live state before relying on anything below. PRs may
  have new comments, CI approvals or merges since this was written.

## Recover context, in this order

1. `docs/validation/jsbsim-open-pr-review-2026-09-14.md`: the review itself.
   It covers the state of each PR, the defect with numbers, the comments waiting
   on us, the #1507 scope question and the missing PR.
2. `docs/jsbsim-upstream-contribution-policy.md`: the readiness gates, the
   workflow, and the "Open PR review: 2026-09-14" section and candidate ledger.
3. `docs/validation/evidence/jsbsim/README.md`, section `engine-off-trim/`, and
   the scripts and logs in that directory.
4. `docs/jsbsim.md`, sections "Trim fuel flow" (including "Known defect") and
   "Idle fuel flow".
5. `AGENTS.md` (0sfs), the "Repository ownership and dependency work" section.
6. The live PRs and their comment threads:
   - [JSBSim #1502](https://github.com/JSBSim-Team/jsbsim/pull/1502): read
     bcoconni's long analysis in full.
   - [#1504](https://github.com/JSBSim-Team/jsbsim/pull/1504)
   - [#1505](https://github.com/JSBSim-Team/jsbsim/pull/1505)
   - [#1506](https://github.com/JSBSim-Team/jsbsim/pull/1506)
   - [#1507](https://github.com/JSBSim-Team/jsbsim/pull/1507)
   - [#1508](https://github.com/JSBSim-Team/jsbsim/pull/1508): Sean's comment.
   - [0x62/jsbsim-wasm #8](https://github.com/0x62/jsbsim-wasm/pull/8): Sean's
     benchmark question.
   - [Discussion #1501](https://github.com/JSBSim-Team/jsbsim/discussions/1501):
     turboprop trim, which Sean is also looking at.
7. Source, only as each topic needs it:
   - `src/models/propulsion/FGTurbine.cpp`: `Calculate()`, `Trim()`,
     `InitRunning()` and `Run()`.
   - `src/models/FGLGear.cpp` and `src/models/FGAccelerations.cpp` on
     `feature/wheel-spin-dof`.
   - In 0sfs, `src/flight/jsbsim/resetFlightLocation.ts` and
     `src/flight/model/flightModelDriver.ts`.

## State at hand-off (verify before use)

- **jsbsim fork:**
  - checked out on `feature/jsbsim-package-rename` at `fea68802`, clean;
  - upstream `master` is `14c19022`;
  - PR branches exist locally and on `origin`: `feature/wheel-spin-dof`,
    `fix/emscripten-portability`, `fix/turbine-trim-spool`,
    `fix/model-reload-lifetime`, `feature/wasm-package`,
    `fix/turbine-trim-fuel-flow`, `feature/turbine-idle-fuel-flow`.
- **0sfs:**
  - installs `@felipegalind0/jsbsim@1.2.4-fork.7`;
  - fork.7 contains the #1505 and #1508 changes and `<idlefuelflow>`.
- **Native Python module for experiments,** built from a Git archive of any ref:

  ```sh
  git -C /Users/felg/gh/Felipegalind0/jsbsim archive <ref> | tar -x -C <scratch>/<name>
  cmake -S <scratch>/<name> -B <scratch>/<name>/build -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_PYTHON_MODULE=ON \
    -DCYTHON_EXECUTABLE=/Users/felg/gh/Felipegalind0/jsbsim/.venv/bin/cython \
    -DPython3_EXECUTABLE=/Users/felg/gh/Felipegalind0/jsbsim/.venv/bin/python
  cmake --build <scratch>/<name>/build --target _jsbsim --parallel 5
  # then: .venv/bin/python docs/validation/evidence/jsbsim/engine-off-trim/native_check.py <scratch>/<name>
  ```

- **CTest:** after building `_jsbsim`, run the Python regressions from that build,
  for example
  `ctest --test-dir <scratch>/<name>/build --output-on-failure -R 'TestTurbine|CheckTrim|TestHoldDown|TestModelReload'`.
- **App-side check:** `docs/validation/evidence/jsbsim/engine-off-trim/check.mjs`
  with `OSFS_JSBSIM_PACKAGE` and `OSFS_JSBSIM_DATA_ROOT` set.

## What to brainstorm

Start with a short overview of the topics and a proposed order, and say why that
order. Then take them one at a time. For each topic, give me:

- the options;
- what each option costs, and what it risks with reviewers or the app;
- your recommendation;
- the decisions you need from me.

Where an experiment would settle a question, propose it, and run it if it's
cheap.

### 1. The shut-off engine defect in #1505 and #1508

- **Defect:** both PRs assign spool speeds (and, in #1508, fuel flow) inside
  `Trim()` for every engine, but `Trim()` runs for shut-off engines too.
- **Direction in the review:** assign only when `Running`.
- **Open design questions:**
  - Does a `Running` guard in `Trim()` match upstream's own split, where the
    block that runs once trim finishes commits spool state only for running
    engines?
  - Does it hold for `InitRunning()` and for starved, stalled and seized
    engines?
  - Does it keep every existing #1505 and #1508 test passing?
  - Should trim thrust for a shut-off engine change too? That is existing
    upstream behaviour: master reports 9,163.8 lbf for a dead F-16 engine
    during RunIC. Changing it would widen scope and alter existing trims.
- **Regressions to add:** an engine that never started, and an engine that was
  cut off and then put through RunIC.
- **Delivering the fix:**
  - amend #1505 and rebase #1508, or add follow-up commits so reviewers see the
    change;
  - what to say on each PR;
  - how and when a fixed package (fork.8) reaches the app;
  - how to verify the location reset and the sound after it.
- **Sean's suggestion:** set fuel flow in the trim-finished block instead. That
  avoids the defect but gives a stale value to callers reading straight after
  RunIC, which two of #1508's tests and the SF50 cruise sweep do. How do we
  answer him? Is there a design that satisfies both? He's also looking at
  turboprop trim (#1501): is there a useful way to coordinate or help there?

### 2. #1502 and bcoconni's review

- **What we owe:** a reply to a careful analysis he invited questions on.
- **Pre-empt or wait:** do we address his clarity points now, or wait for his
  named errors first?
- **Clean-up options to weigh:**
  - separate explicit Jacobian entries or row types instead of `WheelCoeff`
    meaning 1 in one row and −R in the other;
  - relative versus absolute spin rate;
  - documenting that `rolling_friction` becomes axle friction with the wheel DOF.
- **Our own observation:** in the air, the spin decays toward absolute zero
  instead of locking to the airframe when braked. Is that worth raising
  ourselves?
- **Coverage:** a CxxTest for the generalized friction solve would give real
  coverage, since upstream's coverage job skips Python tests. What would it test?
- **Reply draft:** how to structure the reply so it's useful to him and doesn't
  bury him.

### 3. SDK #8 and Sean's cache-only benchmark

- **What he asked:** how much of the speed-up does a plain path-to-node cache
  give without batching?
- **Designing a fair comparison:** consider embind per-call overhead,
  string-conversion cost, and the gear-contact reader's separate value.
- **What we do with the answer,** including if cache-only turns out nearly as
  good.
- **Where these APIs land:** once the SDK is in JSBSim `wasm/`, 0x62's repo or a
  later JSBSim follow-up? 0x62 hasn't engaged on #8.

### 4. #1507 scope

- **Size:** 6,429 lines across 51 files, with a new hosted workflow, an
  MIT-licensed subtree in an LGPL repository, and a provisional `@jsbsim/wasm`
  identity.
- **Maintainer position:** none has agreed to an in-tree SDK yet. Our #1504
  comment promised a plan for smaller PRs.
- **Options:**
  - leave it as is;
  - convert it to a draft and open an RFC or discussion;
  - post a plan comment;
  - split it, for example into the CMake option and toolchain, the bindings
    generator, the TypeScript SDK, and CI.
- **How to raise the decisions only maintainers can make** without overloading
  them.

### 5. Turbine idle fuel flow, which has no PR

- **State:** `c70be257` is tested, in use by the SF50, and merges cleanly onto
  `master`.
- **Timing:** submit it now, or after the #1505/#1508 fix lands, given that the
  trim fuel-flow floor interacts with it?
- **Upstream conventions:** check the element name and units, and look for
  earlier discussion of `IdleFF` (closed issue #196).
- **Readiness:** what exact-candidate verification it still needs.

### 6. Reviewer load and sequencing

- **Load:** six JSBSim PRs from us in four days, four with CI waiting for
  approval.
- **Order:** which PRs to push forward first, and which to hold or mark as
  drafts.
- **CI approval:** whether and how to ask for workflow approval politely.
- **Output:** a sensible order for the replies and fixes.

### 7. Smaller loose ends (brief)

- **Turbine properties:** the candidate to publish FGTurbine phase, cranking and
  gauge properties. It is in the policy doc's candidate ledger and the audio
  ledger §10, and isn't implemented. Does it fit with the #1505/#1508 fix?
- **Attribution lines:** #1502's and #8's PR bodies end with a "Generated with
  Claude Code" line; the later PRs don't. Leave it, or tidy it?
- **Stale PRs:** four old open PRs in personal repos from 2023–2025, two of them
  WIP drafts. Close them?

## What the session should produce

A plan we have agreed. For each item it should say:
- the decision;
- the steps;
- the checks;
- what gets posted, and where.

When we agree, write it to `docs/validation/jsbsim-open-pr-plan-2026-09-14.md`,
or the next free date, and link it from the policy doc's "Open PR review"
section. Drafts of GitHub replies can go in that file for me to edit. Keep your
messages short; I'll ask for depth where I want it.
