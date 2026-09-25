# Task 03: Use airframe-relative wheel telemetry and drag

## Goal and review context

Keep the internal wheel state and constraint signs, but publish and damp wheel spin relative to the airframe. Answer [4047795134](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047795134) ("export the wheel spin rate measured with respect to the body frame") and [4047828797](https://github.com/JSBSim-Team/jsbsim/pull/1502#discussion_r4047828797) ("There is no "absolute" in JSBSim"). Include the planner-confirmed airborne-frame defect; this was not an inline request.

Read `/Users/felg/gh/0sfs/AGENTS.md` and the JSBSim instructions present in your checkout before editing. Work only in the owning repository. JSBSim scratch belongs in its gitignored `build/`; Retained logs, reports and numerical results belong in `/Users/felg/gh/0sfs/validation/evidence/jsbsim/wheel-spin-review/` (top-level `validation/`, outside `docs/`). Follow `/Users/felg/gh/0sfs/docs/validation/layout.md`; historical evidence moved from `docs/validation/evidence/` to top-level `validation/evidence/` on 2026-09-19 (`/Users/felg/gh/0sfs/docs/validation/evidence-relocation-2026-09-19.md` maps the old prefix), so do not recreate the old docs tree. Retained runnable review tools belong in `/Users/felg/gh/0sfs/scripts/validation/jsbsim/wheel-spin-review/`; permanent engine regressions belong in JSBSim `tests/`. Do not create or copy executable validation source into `docs/`. The existing review tools moved there from the evidence directory on 2026-09-19; `/Users/felg/gh/0sfs/validation/evidence/jsbsim/tool-relocation.md` maps the former tool paths that older records cite. Never use `/tmp`, `/var/folders`, or a harness scratchpad. Never start a dev, preview or watch server. Engine changes belong in JSBSim, with no app workaround.

These are execution instructions for a later, user-launched task. Do not launch another task agent. Never rebase, amend, push, post comments, resolve threads, request review, or edit the GitHub PR body. Do not edit assertions or tolerances to conceal a failure. Only the purposeful regression changes specified below are authorized.

## Starting state and dependencies

Repository: `/Users/felg/gh/Felipegalind0/jsbsim`. Branch: `feature/wheel-spin-dof`. Finish tasks 01–02, including the planner's diff review, first. The original root of this sequence is `24e085bf81b5ef8bab8500ab9d416571753b93cc`.

Your exact starting commit is the full 40-character `commit` in `build/pr1502-handoff/02.json`, written by the planner after reviewing task 02. It is not an arbitrary current branch tip. Future commit hashes cannot truthfully be written before those commits exist. This receipt supplies the exact hash without asking you to choose one. If it is absent or unapproved, stop; do not manufacture approval or execute against a guessed SHA.

```sh
cd /Users/felg/gh/Felipegalind0/jsbsim
test -z "$(git status --porcelain)" || exit 1
git switch feature/wheel-spin-dof
.venv/bin/python - <<'CHECK'
import json, re, subprocess
from pathlib import Path
r = json.loads(Path('build/pr1502-handoff/02.json').read_text())
assert r['task'] == '02' and r['approved'] is True
assert re.fullmatch('[0-9a-f]{40}', r['commit'])
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == r['commit']
subprocess.run(['git', 'merge-base', '--is-ancestor', '24e085bf81b5ef8bab8500ab9d416571753b93cc', r['commit']], check=True)
CHECK
```

Check cleanliness before switching, and tell the user if you switch away from `master`. Read the predecessor receipt's test results. Do not reset or repair an unexpected branch history.

## Change

Edit `src/math/LagrangeMultiplier.h`, `src/models/FGLGear.h`, `src/models/FGLGear.cpp`, and `tests/TestWheelSpin.py`. The planner retains responsibility for the frame/sign derivation and must inspect this diff and the new assertions personally.

1. Add a private `FGColumnVector3 GetWheelSpinAxis(void) const` helper in `FGLGear`. When `WOW`, return the same axis used by the brake row: `vGroundNormal * FGColumnVector3(mT(eX,eX), mT(eY,eX), mT(eZ,eX))`. The ground normal points away from the ground. When not WOW, return `mTGear * FGColumnVector3(sin(SteerAngle), -cos(SteerAngle), 0.0)`. This is gear-up × steered-forward, **not** gear +Y. Standard unsteered level gear therefore has axis `(0,-1,0)`. Use current gear orientation/steering in the air; never reuse a last-contact ground normal. Do not change the ground solver's idealized ground-projected axle into a cambered physical axle.
2. Move `GetWheelSpinRate` out of its inline definition. Return 0 when the DOF is disabled; otherwise `wheelSpin.Rate - DotProduct(in.PQR, GetWheelSpinAxis())`. Add `SetWheelSpinRate(double rate)`, setting `wheelSpin.Rate = rate + DotProduct(in.PQR, GetWheelSpinAxis())` only when enabled. Keep the existing public property name `gear/unit[i]/wheel-spin-rad_sec` and preserve its read/write capability with a getter/setter property tie. A setter is needed because the original property was writable and the regression uses it to seed spin.
3. Keep the internal state and its integration/ground initialization unchanged. In the airborne enabled-wheel branch, for positive `in.TotalDeltaT` and outside trim only, let `bodyRate = dot(in.PQR, axis)`, `relativeRate = wheelSpin.Rate - bodyRate`, and `d = (13.0 + 100.0 * brake) / wheelRadius * in.TotalDeltaT`. Store `wheelSpin.Rate = bodyRate + sign(relativeRate) * max(0.0, abs(relativeRate) - d)`. Keep the disabled-wheel `wheel-speed-fps` decay unchanged. Keep `wheelTreadSlip = 0` airborne. Leave naming/provenance of 13 and 100 to task 04.
4. Use `in.PQR`, not inertial `PQRi` and not a new property lookup. It is the rate already supplied by `FGPropagate::GetPQR` and used in the brake constraint. That getter is documented as ECEF-relative. Therefore replace the internal `Rate` comment with `spin rate about the axle in the ground reference frame [rad/s]`, and explain nearby that it uses the same reference as `in.PQR`. Do not introduce a transported-NED correction or label it inertial. The reply will explicitly discuss this narrower wording with the reviewer. Do not globally remove pre-existing uses of "absolute" in unrelated engine documentation.
5. Document getter/setter semantics in `FGLGear.h`: property rad/s relative to airframe, positive forward rolling, disabled getter 0; internal state kept in the solver reference frame. Document tread slip as unchanged. Change only frame/airborne wording in the class block now; task 04 owns the full model-author explanation.
6. Update `TestWheelSpin.py` intentionally for the new public contract, preserving all opt-in, ground start, touchdown, momentum, brake and rolling-resistance assertions/tolerances. For the momentum estimate, reconstruct the internal state from the new exported rate: on these unsteered level-main-gear fixtures `omega_internal = omega_body - q`; do not quietly treat relative spin as the old state. Explain the standard-axis approximation of that fixture.
7. Add independent regressions to this existing fixture (no test-only production API):
   - Initialize an airborne C172 at `ic/q-rad_sec = +0.4` and again `-0.4`, no speed, zero bank/steer. Before writing, RunIC has reset internal Rate to zero: assert the exported rate is `+q` to `1e-12` (this fails with the old raw-state getter). Write relative spin 0 through the property; immediate readback is 0 to `1e-12`. With full brake, one step and 120 steps keep its magnitude below `1e-10`. The original implementation's internal-state equivalent yields about 0.4 rad/s relative spin after one step; retained `check_airborne_frame.py` reproduces that counterexample.
   - To distinguish a real transform from a cached relative scalar, start a fresh airborne fixture at q=+0.4 and write relative rate 0.7. Its internal state is then `0.7 - 0.4 = 0.3`. Set `ic/q-rad_sec=-0.2` and call `run_ic()` again; assert the exported rate is `0.3 - 0.2 = 0.1` within `1e-12` before advancing time. Plain `RunIC()` does not call `InitializeModels()`/`FGLGear::ResetToIC`; it preserves airborne wheel state. `ResetToInitialConditions` is different. The positive-dt guard must prevent decay during both zero-time evaluations inside RunIC. Also verify a true `reset_to_initial_conditions(0)` resets the wheel state and then reports the zero-state transform against current q.
   - Seed both signs, +100 and -100 relative rad/s, with zero aircraft rate and a first-step dt of 1/120. Let `r_before_damping = seed + q_after - q_before` for this standard -Y axis, and `d = (13 + 100*brake)*dt/R`. Assert the exported result equals `sign(r_before_damping) * max(0, abs(r_before_damping)-d)` within `1e-8`. This accounts for the change in free-aircraft pitch rate while preserving internal spin before damping. Test brake 0, 0.5 and 1; sign is preserved until clamped to zero. For a 0.01 rad/s seed with full brake assert no sign reversal and magnitude below `1e-10` after one step.
   - Add an airborne steer-axis check using the nose gear (make its `max_steer` nonzero in this test's sandboxed XML and set `fcs/steer-pos-deg[0]` after RunIC); at 90 degrees steering the axis is +body X, so a zero internal state exports `-p`, not `+q`. Verify at nonzero p and q before stepping; do not let the airborne centering update invalidate the setup.
   - Preserve the existing one-second spin-down check, but compute the no-brake expectation in the correct frame or use its existing 0.2 tolerance only where the original approximation already justified it. Do not relax that tolerance.

If a fixture does not expose these initial conditions or steering writes as described, stop with the observed source/API evidence; do not change the engine API to accommodate a test.

Out of scope: force/moment summation, general rotor gyroscopic/vector transport dynamics, camber, rotating terrain, brake torque calibration, new XML options, `wheel-speed-fps` redefinition, or app mesh animation.

## Build and test

```sh
cd /Users/felg/gh/Felipegalind0/jsbsim
cmake -S . -B build/pr1502 -DCMAKE_BUILD_TYPE=Release -DBUILD_PYTHON_MODULE=ON \
  -DPython3_EXECUTABLE=/Users/felg/gh/Felipegalind0/jsbsim/.venv/bin/python
cmake --build build/pr1502 -j
ctest --test-dir build/pr1502 -R TestWheelSpin --output-on-failure
```

These commands were verified on the exact original PR head: the wheel target passed. The full-suite command, when required below, is:

```sh
ctest --test-dir build/pr1502 -j8 --output-on-failure
```

It passed 78/78 on the original head when run without competing builds and with loopback access. `TestInputSocket` has a historical `telnetlib3` connection timeout both with and without the PR. In the planning run it first failed with sandbox `PermissionError`, then passed with loopback access. Record the exact cause; do not call every socket failure the historical flake. Request execution-tool loopback permission if necessary. Do not alter socket tests or chase that historical timeout in this task. `TestActuator.test_regression_bug_1503` also failed once while builds/simulations competed for CPU, then passed in the idle full run; its subprocess timeout scales from a timed reference execution. If this same timeout occurs, stop competing jobs and rerun the unchanged test alone once. Any persistent/new failure is a stop-and-report condition, not an accepted regression.

Run the common commands, then the full CTest suite without concurrent work. Run the new frame tests against the pre-task commit in an archived build input (under JSBSim `build/`) if needed to demonstrate their failure; do not change the canonical checkout while tests/builds are using it. Retain failure and success logs in 0sfs evidence. A test that passes the old raw-state property by construction is not a causal regression.

## Acceptance criteria

Property round-trip and nonzero body-rate/sign cases satisfy the specified tolerances; old frame behavior fails at least the getter and airborne locked-wheel regressions. The wheel and full suites pass with unchanged physical tolerances. Internal wheel state, solver Jacobians and ground tread slip keep their previous meaning. At dt=0 or during trim there is no airborne damping mutation. No negative dt spin-up is introduced. The planner checks the axis cross-product and both transformation signs from the actual code before approval; any surprise in contact/airborne transition behavior must be reported.

## Commit and report

Make exactly one JSBSim commit on `feature/wheel-spin-dof`, subject **Report wheel spin relative to the airframe**. Stage only this task's named files. End the commit message with the attribution trailer supplied by your execution harness, if any; do not invent a trailer. Do not commit build output or 0sfs evidence into JSBSim.

Report the full commit hash and parent hash, files/behavior changed, exact build and test commands with exit status and test counts, evidence locations, any uncertainty, and anything noticed but left unchanged. Stop and report on any unpredicted failure rather than improvising a design or relaxing a test. Do not start the next task.

The planner must read `git show --stat` and the complete `git show` diff, inspect the evidence and rerun any check needed to resolve uncertainty. An agent report alone is not acceptance. Only after accepting the diff does the planner write `build/pr1502-handoff/03.json` with `task`, full `commit`, full `parent`, `approved: true`, and `tests`. You must not approve your own receipt.
