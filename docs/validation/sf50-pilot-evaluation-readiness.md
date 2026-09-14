# SF50 pilot evaluation readiness

Date: 2026-09-13, updated 2026-09-14. Applies to the G1 package
(`aircraft/sf50`).

A former Cirrus test pilot's time is best spent on what only a pilot can judge:
how the airplane responds, how it feels and how much work it takes. Anything a
table or recorder can already tell us should be found and fixed before they fly
it, or they will spend the session rediscovering it. This record lists what
stands between the current simulation and a session worth their time, with the
measurements behind each item and who can do the work.

Status meanings:

- **Blocks** — without it the pilot cannot give useful feedback on the airplane.
- **Weakens** — a session is possible, but their comments will be muddied.
- **Done** — finished and checked.

## What changed on 2026-09-14

- **Done — thrust, drag and idle N1 calibrated** (item 1, item 7's idle half).
  The climb ratio at the AFM's MCT N1 went from 0.85 low down and 1.66 at
  28,000 ft to 0.98 and 1.01, and cruise N1 error from a median of −1.98 to
  −0.54. Held-out ISA+10 cruise rows check no worse than the fitted rows.
  Idle spool speeds are now the ERA22LA404 recorder's 24.3 % N1 / 53.4 % N2.
  [Calibration record](sf50-propulsion-drag-calibration-2026-09-14.md).
- **Done — stall warning and stick pusher** (item 2). AoA-triggered, scheduled by
  flap position, inhibited on the ground. Flown as the AFM demonstrates it, the
  pusher fires at 86.0, 77.1 and 66.0 KCAS against printed 86, 77 and 67, and
  the warning about 5 kt ahead of it.
- **Done — N1, fuel flow, AoA and CAS warnings on the HUD** (item 3), and a
  **flight recorder** with a mark key and CSV export (item 4). Readouts appear
  only for properties the loaded aircraft has, so the C172 shows no N1 box.
- **Done — idle fuel flow** (item 8). `1.2.4-fork.7` is adopted and the package
  declares the recorded 76 lbm/hr; the model idles at 11.28 US gph instead of
  71.44, and the two lowest AFM cruise rows are reachable.
- **Done — test card** (item 6): [SF50 pilot test card](sf50-pilot-test-card.md).
- Still open: real controls (item 5), starting scenarios (item 10), build version
  in the app (item 11), spool-down (item 7's remaining half), landing flare
  distance (item 9), ESP and yaw damper (item 12).

## What changed on 2026-09-13

- **Done — the live site serves the SF50.** `https://0sfs.github.io/` had not
  been updated since 11 September. It now serves all four aircraft; the SF50
  model, engine file, artifact record and WASM binary are byte-identical to the
  published build. The build came from `2b379ccc` plus the working tree's
  uncommitted autopilot, HUD and gamepad work, all of which passed typecheck, 764
  tests and lint first.
- **Done — `npm run deploy` publishes again** (`55f28082`). It had been failing
  silently: `npm run build -- --base=/` appended `--base=/` to the artifact
  verifier, which rejects any argument but `--dist=`, so `gh-pages` never ran.
- **Done — cruise, stall and climb measured against the AFM** with
  [`scripts/diagnose-sf50-steady-flight.py`](../../scripts/diagnose-sf50-steady-flight.py),
  and the climb/cruise disagreement traced to thrust and parasite drag together.
  Results below.
- **Done — idle fuel flow sourced from recorded data**, and JSBSim can now take
  it ([cruise fuel-flow record §7](sf50-g1-cruise-fuel-flow-2026-09-13.md)).

## Blocks

### 1. Climb and cruise: too much thrust, or too little drag, at altitude

**Done on 2026-09-14** — see the
[calibration record](sf50-propulsion-drag-calibration-2026-09-14.md). The
measurements below are what the problem looked like before the fit.

A pilot will see this in the first climb.

**Climb.** Steady rate of climb, gear and flaps up, at the AFM's KIAS and at the
MCT N1 the AFM cruise tables print for the row's weight, altitude and ISA
deviation, against AFM 5-39..5-46. Over the 144 rows inside the MCT tables'
range:

| Pressure altitude | Rows | Model / AFM, median | Model − AFM, median |
| --- | ---: | ---: | ---: |
| 5,000–10,000 ft | 36 | ×1.23 | +442 fpm |
| 12,000–18,000 ft | 48 | ×1.36 | +584 fpm |
| 20,000–28,000 ft | 60 | ×1.51 | +609 fpm |

Examples at 6,000 lb near ISA: 14,000 ft, −10 °C, 158 KIAS: AFM 1,411 fpm, model
1,920. 28,000 ft, −40 °C, 141 KIAS: AFM 764 fpm, model 1,351. Near sea level the
model is close (6,000 ft, 0 °C: AFM 2,059, model 2,063), although rows below
5,000 ft use the 5,000 ft MCT N1.

**Cruise.** N1 the model needs for level flight at each ISA MCT cruise row's TAS,
6,000 lb, against the N1 the AFM prints for that speed:

| Pressure altitude, ft | 5,000 | 10,000 | 15,000 | 17,000 | 19,000 | 21,000 | 23,000 | 25,000 | 27,000 | 28,000 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| AFM TAS, kt | 268 | 288 | 295 | 299 | 304 | 307 | 308 | 307 | 305 | 304 |
| AFM MCT N1, % | 93.8 | 97.2 | 98.1 | 98.5 | 99.4 | 100 | 100.5 | 100.5 | 100.4 | 100.4 |
| Model N1 needed, % | 92.0 | 96.2 | 96.4 | 96.9 | 97.7 | 97.8 | 97.2 | 96.1 | 94.6 | 93.9 |
| Difference | −1.8 | −1.0 | −1.7 | −1.6 | −1.7 | −2.2 | −3.3 | −4.4 | −5.8 | −6.5 |

At MCT the model will therefore cruise faster than the book, most of all high
up. The AFM's MCT also reaches 100.4–100.5 % N1 at 23,000–28,000 ft, above the
model's 100 % ceiling.

Both results say thrust minus drag is too large, and increasingly so with
altitude. The installed thrust map, including its altitude lapse, and the drag
polar are both estimates. Fuel flow at part power already ran 10–20 % high in
the earlier diagnostic.

**Which is wrong.** [`scripts/separate-sf50-thrust-drag.py`](../../scripts/separate-sf50-thrust-drag.py)
writes one equation per AFM condition. At each cruise altitude, the real airplane
balances thrust and drag at the printed cruise TAS and MCT N1, and has a known
excess force in the ISA climb; the model's departure from each is the equation.
With all four AFM weights that is eight equations per altitude, fitted by least
squares to each candidate error:

| Explanation | RMS residual, 10,000–28,000 ft |
| --- | --- |
| Thrust scale only | 33–68 lbf |
| Parasite drag only | 71–102 lbf |
| Induced drag only | 21–38 lbf |
| Thrust scale and parasite drag | **9–11 lbf** |
| Thrust scale and induced drag | 17–33 lbf |
| Parasite and induced drag | 18–26 lbf |
| All three | 6–10 lbf |

The only two-term explanation that fits is thrust **and** parasite drag, with
stable values at every altitude from 10,000 ft up: installed thrust **17–27 %
too high**, and CD0 **0.0045–0.0070 too high** on a model value of 0.025–0.027.
At 5,000 ft thrust is within 3 % and CD0 is right. A third, induced-drag term
lowers the residual only a little and swings wildly at 5,000 ft. The climb
excess is also nearly identical at every weight (150–157 lbf at 15,000 and
28,000 ft) although the model's induced drag rises about 70 % from 4,500 to
6,000 lb, which rules induced drag out as the main cause.

The two errors have opposite signs and partly cancel in cruise, which is why
cruise looks nearly right and climb does not. Correcting either alone makes the
other table worse: with thrust cut by a fifth and drag unchanged, the model could
not reach AFM cruise speed at MCT.

**Next.** Correct thrust above 5,000 ft and CD0 together, alongside idle N1
(item 7): the model derives thrust from N1 through its idle endpoint, so part of
the thrust error may belong to that mapping rather than the altitude lapse. Then
re-run cruise, climb and fuel flow as one set. Owner: aircraft package and
scripts; can start now.

### 2. No stall warning, stick pusher or low-speed awareness

**Done on 2026-09-14**, except the low-speed band on the airspeed tape. The
measurements below are what the thresholds were derived from.

The real airplane defines its stall speed as the speed at which the stick pusher
fires (AFM 2-26). It has STALL WARNING and STICK PUSHER CAS warnings, both
answered with "AOA — reduce, thrust lever — T/O" (3-81), and a low-speed band on
the airspeed tape computed from sensed AoA (2-9). The simulation has none of
these, so a pilot flying slow flight or an approach to stall will meet a bare
aerodynamic stall instead.

The model's aerodynamics are ready for it. Its 1 g idle stall (lift-curve peak,
16.0° AoA) sits below every AFM pusher speed, as a real airplane's aerodynamic
stall must:

| Flaps | AFM pusher speed at 6,000 lb, KCAS | Model aerodynamic minimum | Model below AFM, all four weights | AoA the model needs at the AFM speed |
| --- | ---: | ---: | --- | --- |
| 0 % | 86 | 79.8 | 5.6–6.2 kt | 11.0–11.1° |
| 50 % | 77 | 71.1 | 5.4–5.9 kt | 10.2–10.4° |
| 100 % | 67 | 64.7 | 1.8–2.3 kt | 12.0–12.9° |

The AFM table's bank-angle rows follow load-factor scaling within ±1.4 %, so an
AoA-based pusher at these angles reproduces the whole table. The AoA barely
varies with weight, which is what makes AoA the right trigger. One oddity to
check: the model needs less AoA at 50 % flap than at 0 %, because its flap
effect is a constant lift increment that does not move the stall angle.

**Done.** The package's `Stall Protection` channel triggers on AoA with these
per-flap angles, the warning 5 kt of AoA ahead of the pusher, both inhibited on
the ground, and the HUD shows both as red CAS boxes. Still unknown and worth
asking the pilot: the real warning margin ahead of the pusher, and how hard and
how fast the real pusher pushes. The low-speed band on the airspeed tape is not
built.

### 3. Engine and warning instruments

**Done on 2026-09-14.**

The SF50 is flown by N1. The HUD showed IAS, altitude, vertical speed, heading,
pitch, roll, throttle, flaps, trim and autopilot state, and no N1, fuel flow, AoA
or CAS messages. `src/flight/hud/evaluationInstruments.ts` now adds N1, fuel flow
and AoA chips and a red CAS box carrying STALL WARNING and STICK PUSHER, with
STICK PUSHER outranking the warning. Each readout appears only if the loaded
aircraft has the property, so the C172 shows fuel flow and AoA without an N1 box.
The low-speed awareness band is still not built.

### 4. No flight recorder

**Done on 2026-09-14.**

`flightPerformanceCapture.ts` records frame timing only (`flightPerf=1`).
`src/flight/diagnostics/flightRecorder.ts` now records 44 channels of aircraft
state and the control positions JSBSim actually received, sampled on simulation
time at 20 Hz into a half-hour ring buffer, with a MARK button and the M key, and
CSV export. The file's header carries the build version, the aircraft, the JSBSim
identity and every mark. Samples come from JSBSim properties rather than the
app's input objects, so the record is what physics saw whoever was flying.

### 5. Real controls

Handling feedback depends on the controller more than anything else. The
simulation flies from keyboard or gamepad; the real airplane has a sidestick.
Pick a joystick and throttle (pedals if possible), confirm axis directions and
travel, and decide whether the casual auto-trim assist stays off for the
evaluation (it should). Owner: app input and the gamepad work in progress.

### 6. Test card and briefing

**Done on 2026-09-14**: [SF50 pilot test card](sf50-pilot-test-card.md).

The session needs a card, not an open-ended "what do you think":
pitch and roll response; trim changes with flaps, gear and power; slow flight
and approach to stall clean and in landing configuration; steep turns; approach,
flare and ground handling; engine response. Each with a handling rating. The
pilot should also get the known-issue list below, so they do not spend time on
it. Owner: docs; can be drafted now.

## Weakens

### 7. Engine idle and spool-down

- **Idle N1/N2.** Model 30 % / 60 %. The ERA22 recorder shows ground idle at
  24.3 % N1 and 53.4 % N2 (84 samples, thrust lever at −22°, 3 % thrust). In
  flight, idle N1 ranged 34–53 % at 5,700–13,600 ft, including spool-down.
- **Spool timing** against the CEN21 response candidate, whose effective update
  interval is about one second:

  | | 50 % | 80 % | 90 % |
  | --- | ---: | ---: | ---: |
  | Recorded rise from 25.2 % N1 | 3.4 s | 4.4 s | 5.4 s |
  | Model rise from 30 % N1 | 2.8 s | 5.0 s | 5.7 s |

  | | 80 % | 50 % | 30 % |
  | --- | ---: | ---: | ---: |
  | Recorded decay from 94.7 % N1 | 1.4 s | 3.4 s | 9.4 s |
  | Model decay from 100 % N1 | 0.7 s | 3.1 s | 4.9 s |

  Spool-up is close; spool-down near idle is about twice as fast as recorded,
  partly because the model's idle is higher.

Changing idle N1 also moves the N1-to-thrust mapping, so do it with item 1, not
separately.

### 8. Idle fuel flow is 6.4 times too high

**Done on 2026-09-14.**

Model 71.4 US gph; recorded ground idle 11.24 gph (76 lb/hr). `1.2.4-fork.7` is
adopted and `engine/fj33_5a.xml` declares `<idlefuelflow>76</idlefuelflow>`, so
the model idles at 11.28 gph. The retained fork.6 tarball still reports 71.44 on
the same package, which is the negative control for the adoption
([evidence](evidence/jsbsim/idle-fuel-flow/)).

### 9. Takeoff and landing

All 12 AFM takeoff and landing cases are still marked blocked: payload sits at the
model's empty CG, the brake and flare control law is a project assumption, and the
50-ft height datum and runway friction are unconfirmed. The v6 development pilot
gets takeoff total distance within 2 % (3,244 ft against 3,192) and landing total
distance 11 % short (2,678 ft against 3,011). A pilot will judge rotation and flare
feel regardless, so these can follow the session.

### 10. Starting scenarios

Today the flight starts from `resetFlightLocation`. The session needs repeatable
starts: on the runway at a stated weight and temperature, already trimmed at a
cruise point, and established on approach.

### 11. Build version visible

Feedback has to name the build. The bundle embeds its source version; confirm the
pilot can see it in the app, and that each recording carries it.

### 12. ESP and yaw damper

ESP appears throughout the AFM and is not modelled. A yaw damper is not modelled
either and has not been checked against the AFM. Tell the pilot, or model them.

## Scope

- Evaluate the **G1** package. The G2/G2+/G3 packages remain provisional
  ([variant models](sf50-variant-models.md)).
- Ask about flying experience, not documents. A former Cirrus test pilot may have
  confidentiality obligations, and this project does not request restricted data.
  A pilot's impression finds what is wrong; it does not replace missing
  aerodynamic data (see [flight model proposal](../proposals/sf50-flight-model-v2.md)).

## Order of work

Items 1, 2, 3, 4, 6 and 8 are done. What is left, in order:

1. Real controls: a joystick and throttle, with auto-trim off (item 5).
2. Repeatable starting scenarios (item 10) and the build version where the pilot
   can read it (item 11).
3. Spool-down timing (the rest of item 7).
4. Redeploy and run the whole check set against the deployed build.
5. After the session: landing flare distance (item 9), ESP and yaw damper
   (item 12).

## Reproduce

```sh
# From the app root, with a native JSBSim build that has the Python module:
python3 scripts/diagnose-sf50-steady-flight.py \
  --native-build <jsbsim>/build/<dir> --jsbsim-source <jsbsim> \
  --out build/validation/<new-dir>
```

The 2026-09-13 run used `Felipegalind0/jsbsim` `c70be257` (identical to the app's
`1.2.4-fork.6` for these checks), app `55f28082`, `sf50.xml` SHA-256 `d00da7a5…`
and `fj33_5a.xml` `a201f738…`. Outputs carry printed AFM values and stay in the
ignored `build/validation/sf50-steady-flight-20260913/`. The thrust/drag
separation runs the same way with `scripts/separate-sf50-thrust-drag.py`.

What these checks do not establish: loading uses the model's CG rather than an
AFM loading case; the climb uses AFM cruise-table MCT N1 as a stand-in for the
climb schedule, clamped below 5,000 ft and outside ISA −10 to +20; stall is a
quasi-static 1 g glide, not the AFM's 1 kt/s deceleration; and none of the tables
is an independent validation source.
