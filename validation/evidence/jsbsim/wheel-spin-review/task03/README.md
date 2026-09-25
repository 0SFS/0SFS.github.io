# Task 03 agent record — awaiting planner review

Planner update, 2026-09-19: task 03 is now accepted; see [review.md](review.md).
The agent's pre-review record below retains its original findings and results.

Written 2026-09-18 America/Chicago by the executing agent. This is not an
approval; the planner's review and `build/pr1502-handoff/03.json` are separate.

- Commit: `18e8454e4d7cb5d9e2ffb381bf15e96510c973a0`
- Parent: `bcf7d272bcedebcf75a3631e005287a3dcc1c8e5` (approved task 02 receipt)
- Subject: **Report wheel spin relative to the airframe**
- Files: `src/math/LagrangeMultiplier.h`, `src/models/FGLGear.h`,
  `src/models/FGLGear.cpp`, `tests/TestWheelSpin.py` (+179/−20).
  [show-stat.txt](show-stat.txt), [show.diff](show.diff),
  [commit-message.txt](commit-message.txt). `git show --check` passed.

## Commands and results

Canonical checkout, run in this order with no other builds or tests running:

| Command | Exit | Result | Log |
| --- | --- | --- | --- |
| `cmake -S . -B build/pr1502 -DCMAKE_BUILD_TYPE=Release -DBUILD_PYTHON_MODULE=ON -DPython3_EXECUTABLE=…/.venv/bin/python` | 0 | configured | [configure.log](configure.log) |
| `cmake --build build/pr1502 -j` | 0 | built, no warnings | [build.log](build.log) |
| `ctest --test-dir build/pr1502 -R TestWheelSpin --output-on-failure` | 0 | 1/1 (9 methods ok) | [wheel-ctest.log](wheel-ctest.log) |
| `ctest --test-dir build/pr1502 -j8 --output-on-failure` | 0 | 78/78, 11.38 s | [full-ctest.log](full-ctest.log) |

`TestInputSocket` (2.97 s) and `TestActuator` (2.59 s) passed on the first
run in the default tool sandbox, so no loopback escalation or rerun was needed.

The full suite ran before the commit, on a working tree identical to it. After
committing, `cmake --build build/pr1502 -j` compiled 0 objects
([post-commit-build.log](post-commit-build.log)) and the wheel target passed
again ([post-commit-wheel-ctest.log](post-commit-wheel-ctest.log)).
Binary hashes: [binaries.sha256](binaries.sha256).

## Do the new tests catch the old behaviour?

**Pre-task engine.** `git archive bcf7d272 | tar -x -C build/pr1502-task03-pre-source`
was built the same way into `build/pr1502-task03-pre`, with the task 03
`tests/TestWheelSpin.py` copied in (SHA-256 `5c4c481a…648d`, identical to the
committed file). Configure/build exit 0; wheel CTest exit 8
([pre-wheel-ctest.log](pre-wheel-ctest.log)):

| Method | Pre-task | Fails at |
| --- | --- | --- |
| `test_airborne_brake_holds_wheel_to_airframe` | FAIL | getter check: 0.0 != +q (0.4) |
| `test_run_ic_keeps_spin_state` | FAIL | 0.7 != 0.1 after RunIC |
| `test_airborne_drag_acts_on_relative_spin` | FAIL | ±100 case, off by Δq = 0.0158 |
| `test_airborne_axle_follows_steering` | FAIL | unsteered getter check: 0.0 != q |
| five existing tests | ok | — |

On the pre-task engine the locked-wheel method stops at its getter check, so
its damping assertions never run. The raw-state property would pass those by
construction. [pre-airborne-frame.log](pre-airborne-frame.log) reproduces
[`check_airborne_frame.py`](../../../../../scripts/validation/jsbsim/wheel-spin-review/check_airborne_frame.py)
on this build: relative spin 0 → 0.4000000074950578 rad/s after one braked
airborne step, identical to `../airborne-frame.log`.

**Mutant: new getter/setter with the old absolute damping.** This shows the
damping assertions catch the airborne-frame defect independently of the
getter change. Source is the pre-task archive plus [engine.diff](engine.diff)
(equal to the committed `src` diff), then
[make_mutant.py](../../../../../scripts/validation/jsbsim/wheel-spin-review/task03/make_mutant.py);
the only difference from task 03 is [mutant-vs-task03.diff](mutant-vs-task03.diff).
Built into `build/pr1502-task03-mutant`; wheel CTest exit 8
([mutant-wheel-ctest.log](mutant-wheel-ctest.log)):

| Method | Mutant | Observed |
| --- | --- | --- |
| `test_airborne_brake_holds_wheel_to_airframe` | FAIL | 0.4000000074950578 after 1 step |
| `test_airborne_drag_acts_on_relative_spin` | FAIL | 0.01 seed: 0.0158 left, not 0 |
| `test_airborne_spin_down` | FAIL | braked unit[2]: 0.0692 != 0 |
| `test_touchdown_spin_up` | FAIL | before contact: −0.0036 != 0 |
| run_ic, steering, three others | ok | expected: they test the transform, not damping |

The ±100 drag cases pass on the mutant: when |seed| is much larger than the
decrement, absolute and relative damping agree. Only the 0.01 clamp case
separates them.

## Numbers behind the assertions

[frame_values.py](../../../../../scripts/validation/jsbsim/wheel-spin-review/task03/frame_values.py)
prints them ([frame-values.json](frame-values.json), task 03 build). The
commands below name its current path. The recorded run used the byte-identical
file at `docs/validation/evidence/jsbsim/wheel-spin-review/task03/`; this record
moved to `validation/evidence/` on 2026-09-19 and nothing was rerun. See the
[tool relocation record](../../tool-relocation.md) and the
[evidence relocation record](../../../../../docs/validation/evidence-relocation-2026-09-19.md).

```sh
cd /Users/felg/gh/Felipegalind0/jsbsim
.venv/bin/python /Users/felg/gh/0sfs/scripts/validation/jsbsim/wheel-spin-review/task03/frame_values.py \
  . build/pr1502
.venv/bin/python /Users/felg/gh/0sfs/scripts/validation/jsbsim/wheel-spin-review/task03/frame_values.py \
  build/pr1502-task03-pre-source build/pr1502-task03-pre --landing-only
```

- Locked wheel, q = ±0.4: after RunIC the property reads ±0.4; after writing 0
  it reads 0. It stays exactly 0.0 for all 120 braked steps while q drifts to
  −0.43 / −0.69.
- RunIC: 0.1 − 6e−17 after re-init at q = −0.2. After
  `reset_to_initial_conditions(0)` it reads −0.2 (= q).
- Steering: p = 0.3, q = 0.4. Unsteered it reads 0.4 (+q); at 90° it reads
  −0.3 (−p).
- Drag errors are 2.3e−10 (brake 0), 1.1e−9 (0.5) and 2.0e−9 (1), each
  proportional to the decrement. JSBSim converts M→FT with 3.2808399; the test
  uses 1/0.3048, a relative difference of 1.52e−9. That is within the 1e−8
  tolerance with 5× margin.
- Spin-down: q goes 0 → 0.0692 over the second. The correct-frame expectation
  82.0583 matches to 2.7e−8 (the same conversion constant). The old
  expectation, 81.9891, is 0.069 off but still inside the unchanged 0.2
  tolerance. The exact braked-unit[2] check is what detects the frame there.

## Transition behaviour (for the planner's attention)

- **Touchdown slip changed slightly.** Airborne wheels now follow the
  airframe's rotation, so they reach the ground with state −q (rather than 0)
  and the first tread slip is larger by R·q. On the landing fixture the slip
  at touchdown is 92.7948 ft/s vs 92.7356 pre-task, a difference of 0.0593.
  That is about R·q from the step before (0.72 ft × 0.0818 = 0.0591); the
  small remainder is the builds' slightly different approach states.
  ([frame-values-pre-landing.json](frame-values-pre-landing.json)). The
  landing tests pass with unchanged tolerances.
- **The property jumps at the contact row.** It reads 0.0652 there: q changed
  by that much during the step, and the solver's spin acceleration applies from
  the next step.
- **Airborne relative spin is exactly zero only while the drag can hold it.**
  That holds while the airframe's rate about the axle changes by no more than
  the decrement per step (about 0.15 rad/s per step for unbraked C172 mains).
  Faster changes leave a real nonzero relative spin.
- **The spin axis switches at contact changes (analysis, not tested).** In
  contact it is ground normal × projected roll direction; in the air it is gear
  up × steered forward. The two coincide for unsteered wheels with zero bank on
  level ground, at any pitch. With bank, or with both steering and pitch, they
  differ, so the reported rate can step when contact changes, while the
  internal state stays continuous. The task forbids changing the ground axle.

## Noticed, left unchanged

- **Stale WOW while the gear moves.** `WOW` is only updated when gear
  position is above 0.99. If a retractable gear starts retracting while `WOW`
  is true, `WOW` stays true. The axis then keeps the last contact frame, there
  is no airborne damping, and the state is frozen. This predates the task.
- **Guards not separately tested.** No test covers the trim guard; that
  rests on code inspection. The RunIC test cannot tell whether the dt > 0
  guard is present, because the old formula at dt = 0 changes the state only
  by rounding. The mutant's RunIC test passes for this reason.
- **Snapshot for mid-step reads.** Getter and setter use the `in.PQR`
  snapshot from the last ground-reactions input load. A read between models
  pairs it with the matching spin state; only a same-frame steering write
  would use the new steering with the previous `in.PQR`.
- **Test fixture changes.** Added `hover()`, `CRUISE`, and a `max_steer`
  parameter to `load_c172p`. The steering test sets NOSE max_steer to 90 so
  the 90° command is in range. The shipped c172p nose already has 10, so
  `fcs/steer-pos-deg[0]` exists either way.
- **Downstream.** No other code on this branch reads the getter or property.
  In 0sfs, only `TODO.md` mentions `wheel-spin-rad_sec`; no app code reads it.
- **For task 04.** The provenance of 13 and 100 remains with task 04.

Scratch sources, builds and fixture sandboxes stay in JSBSim `build/`
(`pr1502-task03*`); nothing there is cited as reviewable except the copies here.
