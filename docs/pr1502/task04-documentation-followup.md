# Task 04 follow-up: clarify two mathematical conditions

Completed and accepted at `9d0794e93a340957d068ad6e2413d066d3c768dd` on
2026-09-19. The planner wrote 04.json; task 05 may start. Original execution
instructions below are retained as the record of the requested changes.

The planner reviewed commit `8924c17603aa322cdde684440ada1a061e137e7d`.
Its runtime change and validation are accepted, but two sentences need the
precise wording below before task 04 approval. This is a small continuation
for the task 04 agent, not task 05. Do not launch another agent.

Read `/Users/felg/gh/0sfs/AGENTS.md` and the original
`docs/pr1502/tasks/04-model-documentation.md`. Its ownership, scratch and
public-action restrictions still apply. Work in
`/Users/felg/gh/Felipegalind0/jsbsim`, on `feature/wheel-spin-dof`, starting at
exactly `8924c17603aa322cdde684440ada1a061e137e7d`. Check branch, full HEAD and
`git status --porcelain`; stop if HEAD differs or the tree is dirty. Do not
switch or repair history. There is intentionally no approved 04.json yet.

## Exact changes

Edit only the class documentation in `src/models/FGLGear.h`.

1. Replace the paragraph fragment beginning "The decrement per step is
   finite:" through "body motion." with:

   ```text
   The decrement per step is finite. On a positive-time airborne step
   outside trim, damping reaches zero relative spin only if the decrement
   is at least the magnitude of the relative spin immediately before
   damping. Once the wheel has stopped relative to the airframe, it can
   stay stopped only while the decrement can absorb the magnitude of
   subsequent changes in the airframe rate projected on the current axle.
   This approximation does not enforce a rigid brake lock under arbitrary
   body motion.
   ```

   The existing text conflates stopping a spinning wheel with retaining zero
   relative spin. The code uses `max(0, abs(relativeRate) - decrement)`, not
   a comparison against signed body-rate change. For example, pre-damping
   relative spin 2 rad/s and decrement 1 rad/s leave 1 rad/s. If the previous
   relative spin was zero and the body-rate projection changes by −2 rad/s,
   the same residual remains: the relevant change is its magnitude.

2. Replace the sentences starting "The two coincide when the ground" through
   "steered with the gear leg tilted." with:

   ```text
   The two coincide when the ground normal lies in the plane spanned by
   gear up and steered forward and has a positive component along gear up.
   This includes unsteered gear without \<orientation> in wings-level,
   upright contact over level ground. The axes can differ when banked or
   steered with the gear leg tilted.
   ```

   Coplanarity alone is insufficient: reversing the ground normal reverses
   its cross product without changing that plane. Writing
   `n = a * up + b * forward`, the normalized ground axis is
   `sign(a) * (up cross forward)` for nondegenerate unit orthogonal gear
   directions. Positive `a` is the missing qualification; `a = 0` makes
   the rolling projection degenerate. This is a documentation correction,
   not a request to alter contact handling or add inverted-gear physics.

Preserve the rest of the documentation, constants, link, solver, tests and
all tolerances. Do not amend the existing commit or introduce behavior changes.

## Verification, commit and report

Run `git diff --check` and inspect the complete diff: only these two comment
fragments may change. The planner already independently verified 150 object
hashes and the candidate executable/Python-module hashes against approved
task 03, and inspected the passing 78/78 suite. A comment-only follow-up needs
no rebuild, simulation, full-suite rerun or new test. If you do run a check,
record it honestly; do not claim previous runs used the new commit.

Make one new commit, subject **Clarify wheel spin limits and axis alignment**.
Stage only `src/models/FGLGear.h`. Use a harness attribution trailer only if
one is supplied. Never rebase, amend, push or take any GitHub action. Do not
write 04.json or start task 05.

Report the full commit and parent hashes, exact changes and checks, and clean
working-tree status. Keep any retained report under 0sfs
`validation/evidence/jsbsim/wheel-spin-review/task04/`; scratch stays in the
owning repository's build/. Preserve the original task 04 logs and hashes.
Stop and report rather than making additional design decisions. The planner
will review this small follow-up and issue 04.json for its new HEAD.
