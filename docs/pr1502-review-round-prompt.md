# Work prompt: plan the next round on JSBSim PR #1502

Start a fresh conversation with this file. You are the planner for one review
round on [JSBSim-Team/jsbsim#1502](https://github.com/JSBSim-Team/jsbsim/pull/1502),
our wheel spin degree of freedom PR. Your job is to decide what to do and to
write the prompts that cheaper, faster agents will execute. Implementation is
mostly theirs; the judgment is yours.

Everything below was read on 2026-09-18. It is a starting point, not a
conclusion. Refresh the live state before relying on any of it, and treat the
findings marked **unverified** as hypotheses to confirm or reject.

## What you produce

1. **A plan**: for every review thread, whether we accept, accept with a
   change, or discuss, and why. Include the unverified findings below,
   confirmed or rejected with evidence, and the order of work.
2. **Draft replies**, keyed by review comment ID, in the author's voice. Draft a
   top-level comment for the round and an updated PR body as well.
3. **Task prompts** for Sonnet-class agents, one file per task, detailed enough
   that an agent starting cold can finish it without guessing.

Write them in the 0sfs repository:

```text
docs/pr1502/plan.md
docs/pr1502/replies.md        # thread replies, round comment, new PR body
docs/pr1502/tasks/01-<slug>.md
docs/pr1502/tasks/02-<slug>.md
...
```

Then point the #1502 section of `docs/open-upstream-prs.md` at `docs/pr1502/plan.md`.
Do not commit; the user reviews first.

**Do not post, push or launch.** Do not comment on GitHub, resolve threads,
request review, edit the PR body, or push any branch; do not start the task
agents. The user does those after reading your output. Anything sent to GitHub is
public and permanent.

## Rules that apply to you and to every task prompt

The repository rules are in `/Users/felg/gh/0sfs/AGENTS.md`; read it. In short:

- Never write outside the repository you are working in: no `/tmp`, no
  `/var/folders`, no harness scratchpad. JSBSim scratch goes in its gitignored
  `build/` (the `.gitignore` there matches `build*`). 0sfs scratch goes in 0sfs
  `build/`. Evidence worth keeping goes in
  `0sfs/docs/validation/evidence/jsbsim/<topic>/`; `engine-off-trim/` there is
  the pattern: a script plus its logs.
  *Superseded 2026-09-19:* runnable tools now go in
  `0sfs/scripts/validation/jsbsim/<topic>/` and their results in top-level
  `0sfs/validation/evidence/jsbsim/<topic>/`, outside `docs/`; see the
  [validation layout](validation/layout.md), the
  [tool relocation record](../validation/evidence/jsbsim/tool-relocation.md)
  and the [evidence relocation record](validation/evidence-relocation-2026-09-19.md).
- Engine defects are fixed in the engine and its PR, never with 0sfs
  workarounds.
- Never start a dev, preview or watch server.
- Check that the JSBSim checkout is clean before switching it off `master`. Tell
  the user it has been switched.

## Where things are

| What | Where |
| --- | --- |
| JSBSim fork, canonical checkout | `/Users/felg/gh/Felipegalind0/jsbsim` (currently on `master`) |
| PR branch | `feature/wheel-spin-dof`, head `24e085bf`, one commit on `d0d8bc6e` |
| Remotes | `origin` = Felipegalind0/jsbsim, `upstream` = JSBSim-Team/jsbsim |
| Changed files | `src/math/LagrangeMultiplier.h`, `src/models/FGAccelerations.cpp`, `src/models/FGLGear.cpp`, `src/models/FGLGear.h`, `tests/TestWheelSpin.py`, `tests/CMakeLists.txt` |
| Unit tests (CxxTest) | `tests/unit_tests/` |
| Upstream PR tracker | `/Users/felg/gh/0sfs/docs/open-upstream-prs.md` |
| Contribution policy | `/Users/felg/gh/0sfs/docs/jsbsim-upstream-contribution-policy.md` |
| 0sfs's own wheel experiment | `/Users/felg/gh/0sfs/docs/wheel-spin-experiment.md` |

An existing native build configuration to copy (Release, Python module on):

```sh
cd /Users/felg/gh/Felipegalind0/jsbsim
cmake -S . -B build/pr1502 -DCMAKE_BUILD_TYPE=Release -DBUILD_PYTHON_MODULE=ON \
      -DPython3_EXECUTABLE=/Users/felg/gh/Felipegalind0/jsbsim/.venv/bin/python
cmake --build build/pr1502 -j
ctest --test-dir build/pr1502 -R TestWheelSpin --output-on-failure
ctest --test-dir build/pr1502 -j8 --output-on-failure
```

Confirm these work before putting them in task prompts. The PR body records
`TestInputSocket` as flaky on this machine: it times out in `telnetlib3`, with
and without the change. A task prompt must say so, so the agent doesn't chase it.

## State on 2026-09-18

The fork's `master` also contains `24e085bf`, and the installed 0sfs package
(fork.7) was built with it. The branch is 4 commits behind upstream `master`
and still mergeable. CI passed. Upstream squash-merges.

bcoconni (Bertrand Coconnier, maintainer, assigned to the PR) posted an
[analysis](https://github.com/JSBSim-Team/jsbsim/pull/1502#issuecomment-5654721219)
on 2026-09-13. He derives both constraint rows, confirms the code is correct and
the change a good one, and says the code "deserves some clean up and there are a
couple of errors that need to be addressed". Read all of it; it is the best
description of what the PR does. He explains that `Rate` is measured in the NED
frame, so the brake row's condition is `ω = Ω·u_axle`, not `ω = 0`. He also
explains that with the wheel DOF, `rolling_friction` becomes wheel-to-axle
friction instead of tire hysteresis.

Sean McLeod (maintainer)
[replied](https://github.com/JSBSim-Team/jsbsim/pull/1502#issuecomment-5680186393)
on 2026-09-15 that such writeups should be linked by URL from the class or
method they explain.

On 2026-09-18 bcoconni
[requested changes](https://github.com/JSBSim-Team/jsbsim/pull/1502#pullrequestreview-5248857258):
"A few comments that should hopefully simplify and clarify the code. After these
have been implemented, the code should no longer need the lambda function
`moment`, neither the members `LeverArm` or `UseMomentJacobian`. After these have
been discussed/implemented/rejected, I will have some other comments."

His nine threads, with line numbers at `24e085bf`. Fetch the exact wording with
`gh api repos/JSBSim-Team/jsbsim/pulls/1502/comments`.

| Comment ID | Where | He asks |
| --- | --- | --- |
| 4047586942 | `LagrangeMultiplier.h:54` | Rename `InvInertia` to `Jinv`, for consistency (suggestion block). |
| 4047828797 | `LagrangeMultiplier.h:55` | "There is no 'absolute' in JSBSim": describe `Rate` as measured in the NED frame (suggestion block). |
| 4047612197 | `LagrangeMultiplier.h:61` | Remove `LeverArm` now that the moment Jacobian exists. |
| 4047622267 | `FGAccelerations.cpp:256` | Without `LeverArm`, the `moment` lambda goes. |
| 4047650299 (+ reply 4047870001) | `FGAccelerations.cpp:278` | The generalized loop duplicates the legacy one; fold the wheel term into it under `if (mi->Wheel)`. The `continue` to avoid an `else` "is debatable". |
| 4047682190 | `FGLGear.cpp:780` | Move the wheel-DOF `ftRoll.Max` into `ConfigureWheelSpinRows`, where a reader expects it. |
| 4047708987 | `FGLGear.cpp:808` | Call it before the `Constrain` calls on `ftRoll`/`ftSide`, so they clamp to the updated bound. |
| 4047742902 | `FGLGear.cpp:825` | `roll` is a force direction and `axle` is a position from the CG; name them so, using "lever arm" as the code does. |
| 4047795134 | `FGLGear.cpp:914` | Export the spin rate relative to the body frame, not the NED rate: that is what an FCS, anti-skid or a 3D model sees. |

No reply from us exists on any of it.

## Unverified findings from our own review

None of these has been raised by a maintainer. Confirm or reject each from the
code, by derivation or with a test, before planning around it.

1. **The byte-identity claim will probably stop being true.** The PR body says
   aircraft without the wheel elements are unaffected: all 61 scripts in
   `scripts/` and a 1.8 M-row per-step log were byte-identical with and without
   the change. That rests on the separate `generalized` path. Folding the loops
   as asked turns the legacy `DotProduct(U, v1 + v2*r)` into
   `DotProduct(U, v1) + DotProduct(M, v2)` with `M = r × U`, which can differ at
   rounding level for every aircraft. Measure it. Neither the harness nor its
   outputs were kept, so it must be rebuilt: run every `scripts/*.xml` with the
   base and candidate `JSBSim` binaries, each in its own directory under
   `build/`, and compare all outputs. Then decide what the reply and the PR body
   say.
2. **In the air, the spin decays in the wrong frame.** `GetBodyForces` decays
   `Rate` towards 0 while airborne. A wheel at rest relative to the airframe has
   NED rate `Ω·spinAxis`, so a braked wheel keeps turning relative to the
   aircraft whenever the aircraft pitches or rolls. This becomes observable once
   the exported rate is airframe-relative. In the air the ground-frame
   `spinAxis` is not computed, so the axle direction would have to come from the
   gear frame and steer angle.
3. **`100.0 * brake` has no stated source.** The in-air decay is
   `(13.0 + 100.0 * brake) / wheelRadius`. The 13 ft/s² matches the legacy
   `wheel-speed-fps` decay; the 100 is unexplained. The legacy brake force scales
   with normal load, which is zero in the air, so there is nothing to derive it
   from directly. `TestWheelSpin.py` checks airborne spin-down with and without
   brakes, so any change moves that test.
4. **`WheelCoeff` is still badly named.** The 2026-09-13 analysis calls it "not-
   very-well-named". It is the multiplier's Jacobian entry on the wheel DOF.

Already checked and fine: the per-gear force getters (`GetBodyXForce` and so on)
report forces only, which do not depend on the lever arm, so moving the roll
force's moment to the axle does not make reported gear forces inconsistent.

## Decisions that are yours

Give a reasoned answer to each in `plan.md`. Where our view is given, it is an
input, not an instruction.

- **Accept or discuss each thread.** Our view is that all nine are right and
  cheap. Look hardest at the frame change. Export `Rate − Ω·spinAxis`, the
  quantity the brake row already drives to zero, and keep the NED rate as the
  internal state; bcoconni asked only about the export. Say whether the property
  keeps the name `wheel-spin-rad_sec`; nothing upstream depends on it yet.
- **What to say about byte-identity** once you have measured it. If outputs
  change, the PR body's claim must be corrected in the same round, and the reply
  to 4047612197 should give the measurement.
- **Whether findings 2 and 3 go in this round.** He said more comments follow,
  and one of his "couple of errors" may be among them. Fixing them unprompted,
  and saying so in the round comment, is our default. Justify doing otherwise.
- **Whether to separate `ftRoll` and `ftWheelBrake`** into distinct code
  instead of sharing the row machinery. Folding the loops pushes the other way,
  so our default is to rename `WheelCoeff` now and leave the separation to his
  next round.
- **Documentation.** Where the `rolling_friction` reinterpretation is written
  for model authors (the `FGLGear.h` class block is the obvious place). Where
  his analysis is linked by URL, which answers Sean.
- **A CxxTest.** Upstream's `coverage.yml` builds with
  `-DBUILD_PYTHON_MODULE=OFF`, so `TestWheelSpin.py` never counts and Codecov
  reports 0 % patch coverage. The most recent substantive upstream merge (#1491)
  came with a CxxTest. Nobody asked; decide whether it belongs in this round.
- **Push shape.** Our default is to add new commits on `feature/wheel-spin-dof`,
  not rebase or amend. That keeps his threads attached to their lines, and
  squash-merge makes the history irrelevant. The user pushes once, with all
  replies posted together, rather than piecemeal. Rebase only if a conflict
  forces it.
- **What you keep for yourself.** Anything that needs physics judgment, such as
  the airframe-relative rate, the in-air decay frame, or deciding whether a
  changed number is acceptable, may be better done by you than delegated. Say
  which, and why.

## Writing the task prompts

Each file in `docs/pr1502/tasks/` is read by a Sonnet-class agent that has not
seen this file, the PR or this conversation. Each one must contain:

- **Goal** in one or two sentences, and which review thread(s) it answers, with
  the reviewer's words quoted.
- **Starting state**: repository path, branch, the exact commit it must start
  from, and a check that the tree is clean. Name the task(s) that must be
  finished first.
- **The change**, precise enough to execute without design decisions: files,
  functions, the new names, and the math where there is any, with the sign
  conventions spelled out. If a step needs a decision, you have not finished
  planning it.
- **Out of scope**: what not to touch, especially the neighbouring threads other
  tasks own. Never rebase, amend, push, or edit tests to make them pass.
- **Build and test commands**, copied from what you verified, including which
  build directory to use and the `TestInputSocket` caveat.
- **Acceptance criteria** it can check itself: tests that must pass, outputs
  that must match or may change and by how much, and `grep` checks where they
  help (for example, no remaining `LeverArm` or "absolute" in `src/`).
- **Commit**: one commit per task on `feature/wheel-spin-dof`. Upstream subjects
  are short imperative sentences ("Add a per-model execution-enable property").
  End with the attribution trailer the harness supplies, if any.
- **Report**: what changed (with the commit hash), the exact test commands and
  results, anything it was unsure of, and anything it noticed but did not
  change. Tell it to stop and report rather than improvise when something fails
  in a way the prompt did not predict.

Size each task so one agent can finish it in one sitting, and give it one
concern. Most of these edits touch the same four files, so mark the order and
the dependencies. Mark as parallel only tasks with no shared files, such as a
CxxTest or the identity harness. Parallel tasks need their own git worktree
under `build/`; the canonical checkout serves the sequential ones. Plan a
review step by you after each task: read the diff yourself, and don't rely on
the agent's report alone.

A reasonable first task is the baseline, because every later task compares
against it. Build `24e085bf` into its own directory, record the full `ctest`
result, and rebuild the 61-script identity harness with base (`d0d8bc6e`) and
head outputs. Keep the harness as evidence in
`0sfs/docs/validation/evidence/jsbsim/wheel-spin-review/`. (Superseded
2026-09-19: the harness is now in
`0sfs/scripts/validation/jsbsim/wheel-spin-review/` and its evidence in
`0sfs/validation/evidence/jsbsim/wheel-spin-review/`; see the layout note under
the rules above.)

## Drafting the replies

- One reply per thread, keyed by comment ID. Say what was done, name the commit
  by its subject (hashes change if the user reorders), and give the measurement
  where there is one. Where we disagree or only partly accept, say so and why.
  Keep it short; he reads the diff.
- One top-level round comment. It answers the 2026-09-13 analysis: confirm his
  reading, and say where `rolling_friction` is now documented and where his
  writeup is linked. It lists any change we made unprompted (findings 2 and 3)
  and states the byte-identity result plainly.
- An updated PR body, correcting the "unaffected" claim and the "absolute"
  wording, and describing the exported rate.
- Plain, technical and specific. No praise, no filler, no apologies. Don't claim
  anything that was not run.

## Afterwards (not this round)

The fork's `master` carries the old `24e085bf`. 0sfs's `TODO.md` plans to
drive the wheel meshes from `wheel-spin-rad_sec` once an aircraft declares the
wheel DOF, and the airframe-relative rate is what that needs. Bringing this round
to `master` and packaging a new fork build is separate work. Note it in
`plan.md`, but don't plan it.
