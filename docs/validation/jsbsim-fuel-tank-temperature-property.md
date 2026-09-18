# Upstream candidate: tie FGTank temperature to a property

Readiness: **submitted with evidence**
Upstream state: open — [PR #1511](https://github.com/JSBSim-Team/jsbsim/pull/1511)
Downstream adoption: local source
Recorded: 2026-09-16. Implemented and verified: 2026-09-16.

Tracked under [the contribution policy](../jsbsim-upstream-contribution-policy.md).
The branch was prepared, built and tested locally, then pushed and submitted
with the user's explicit authorization on 2026-09-16. The evidence is in
[the implementation record](#implementation-record) below.

## The gap

`FGTank` models fuel temperature. `FGTank::Calculate` runs a heat balance
against total air temperature using a heat capacity of 900 J/lbm/K, a transfer
factor of 1.115 W/ft²/K and a surface area derived from tank capacity
(`Area = 40·(Capacity/1975)^⅔`), for any tank that declares an initial
`<temperature>` in its configuration.

`FGTank::bind` ties twelve properties and **none of them is temperature**
(`src/models/propulsion/FGTank.cpp:470`). `GetTemperature_degC()`,
`GetTemperature()` (°F) and `SetTemperature()` all exist and are all
unreachable from the property tree. The result is an asymmetry: a model author
can set an initial fuel temperature from XML but can never read the value back,
write it, log it, or drive a system from it.

There is a second, smaller defect alongside it. `FGTank::Debug(0)` prints
`"Initial temperature: " << Temperature << " Fahrenheit"`
(`FGTank.cpp:550`), but `Temperature` was converted to Celsius at
`FGTank.cpp:234`, before `Debug(0)` is reached. The printed value is Celsius
labelled Fahrenheit.

## Why it belongs upstream

General usefulness gate: the gap is not application-specific. Any model with a
fuel temperature limit, a fuel-temperature gauge, a fuel-icing or anti-ice
system, or a cold-soak CAS message needs to read this value, and today none of
them can. The computation already exists and is already correct-shaped; only
the exposure is missing.

Our own use is the SF50's FUEL TEMP LOW warning and caution
(AFM 31452-001 PDF 207 / printed 3-65, and 280 / 3A-56) against the −40 °C
limit (48 / 2-12). Without the tie we model fuel temperature a second time in
TypeScript, which is duplicated physics we would rather delete. That is a
motivation, not a justification — the justification is the asymmetry above.

## Prior art

Searched `JSBSim-Team/jsbsim` on 2026-09-16 for open or closed PRs and issues
covering tank temperature and fuel density: none found. The only recent PR
touching `FGTank.cpp` is #1405 (logging redesign), merged.

Re-run immediately before the branch was cut, on 2026-09-16, over issues and
PRs in any state for `tank temperature`, `FGTank`, `fuel temperature property`
and `temperature-degC`. Unchanged: no candidate prior art. `temperature-degC`
returns nothing at all; the `FGTank` hits are #1405 and unrelated reports
(#1466 brushless DC motor, #377 fuel feed, #759 unit round-off, #141 unusable
fuel, and two build reports). This remains a snapshot; re-check again if
submission is delayed.

## Proposed change

Additive only, no behaviour change for existing models:

1. In `FGTank::bind`, tie `propulsion/tank[i]/temperature-degC` read/write to
   `GetTemperature_degC` / `SetTemperature` — **only when the thermal model is
   active**, i.e. when `Temperature != -9999.0`. A tank that declares no
   `<temperature>` gains no property. See the decision below.
2. Fix the `Debug(0)` unit label.
3. Document the property in the `FGTank` class documentation, next to the
   existing `<temperature>` default entry, stating that it exists only for
   tanks that declare an initial temperature.

No `temperature-degF` property, and no unconditional tie. Both are rejected
below with reasons, not deferred.

### Decided: the tie is conditional, and Celsius only

A tank that declares no `<temperature>` holds `Temperature = -9999.0`, a
sentinel meaning "thermal model inactive" (`FGTank.h:186` documents it; it is
the only use of that sentinel anywhere in the engine). Three ways to expose
that, and the choice is ours to make:

| Option | Verdict |
| --- | --- |
| Always tie; inactive tanks read −9999 | **No.** A property named `temperature-degC` that reads −9999 is not a temperature. Every consumer that does not know the sentinel plots or logs garbage. |
| Always tie; return NaN when inactive | **No.** NaN is still a `double`, so it does not stop an unguarded consumer; it turns an obviously wrong number into silently poisoned arithmetic that propagates through every downstream FCS component. JSBSim's only NaN use is `FGTable` filling unused elements to trap illegal access — a poison value, never checked with `isnan`, never returned to mean "absent". NaN as a null would be a new convention. *(Corrected 2026-09-16: an earlier version of this row claimed JSBSim had no NaN at all and that the only `isnan` was vendored GeographicLib. `FGTable.cpp` uses `quiet_NaN()` in seven places. The verdict is unchanged.)* |
| Tie only when the thermal model is active | **Yes.** |

The conditional tie matches existing JSBSim practice: `FGTurbine::bindmodel`
ties `n1`, `n2` and `seized`, which a piston engine simply does not have.
Property-tree shape already reflects what a model actually computes, so a
consumer discovering the catalog learns the truth without a magic number.

It is strictly additive: a tank with no `<temperature>` keeps exactly the
property set it has today.

The cost is that a tank which started without a temperature cannot be given one
at runtime, because there is no property to write. That is accepted. The
thermal model needs a starting value and the configuration file is where it
belongs; a mid-run activation from an arbitrary initial temperature has no use
case we can name. If one appears, adding an always-present property later is
backward-compatible, whereas removing one is not.

**Celsius only.** `FGTank::Calculate` works in Celsius against `in.TAT_c`, so
that is the native unit. A degF property is also actively hazardous here:
`GetTemperature()` applies `CelsiusToFahrenheit` with no sentinel guard, so an
inactive tank would read −17966.2 — the constructor's conversion at
`FGTank.cpp:234` is guarded precisely to stop that, and an unguarded getter
would undo the care. Adding `temperature-degF` later is compatible; shipping a
second writable alias now is scope we do not need.

## Implementation record

Owning repository: `/Users/felg/gh/Felipegalind0/jsbsim`. Work happened there,
not in 0sfs.

| | |
| --- | --- |
| Branch | `feature/tank-temperature-property`, pushed to `origin` 2026-09-16 |
| Upstream base | `29d2d6b8031569655560e260850c42314ab83ef0` — `upstream/master`, "Add PteroSim to the Applications and Usages list (#1509)" |
| Candidate | `2a2383ae92183b5d5bf1e283c95d060b3ef21386` — "Publish the fuel tank temperature as a property" |
| Shape | exactly one commit on the upstream tip; four files, +239 −1 |
| Pull request | [#1511](https://github.com/JSBSim-Team/jsbsim/pull/1511), open, non-draft, mergeable |
| Fork adoption | merged into the fork's `master` as `f0d1023a` on 2026-09-16 |

Files: `src/models/propulsion/FGTank.cpp` (conditional tie in `bind`; unit label
and sentinel handling in `Debug`), `src/models/propulsion/FGTank.h` (class documentation),
`tests/TestFuelTankTemperature.py` (new), `tests/CMakeLists.txt` (registration).

### Base: upstream/master, not the fork's master

The handoff said "branch from `master`" while also forbidding stacking on the
line of work behind #1505 and #1508. Those two instructions conflict for the
fork's local `master`, which is 42 commits ahead of upstream and *contains*
`fc13a97b` (#1505) and
`6c3547be` (#1508), as well as the `wasm/` subtree and the wheel-spin and
Emscripten work. Branching there would have stacked the change on the blocked
line and produced a PR diff full of unrelated fork material.

Branched from `upstream/master` instead, which is what "the correct upstream
base" means in the policy's focused-scope gate. This costs nothing: `FGTank.cpp`
and `FGTank.h` are byte-identical between `upstream/master` and the fork's
`master`, so the change is the same either way. Only `tests/CMakeLists.txt`
differs, and only by the fork's own four extra test registrations, which do not
belong in an upstream PR. No existing branch was deleted, moved or rewritten.

### Toolchain

| | |
| --- | --- |
| Host | macOS 27.0 (26A428), arm64 |
| Compiler | Apple clang 21.0.0 (clang-2100.3.34.2), `/usr/bin/c++` |
| CMake | 4.4.3, Unix Makefiles |
| Options | `-DCMAKE_BUILD_TYPE=Release -DBUILD_PYTHON_MODULE=ON -DSYSTEM_EXPAT=OFF` |
| Python | 3.14.7, the repository's own `.venv` |
| Build directory | `build/tank-temp` |

`telnetlib3` was missing from that venv and was installed into it. It is a
declared test dependency in `python/requirements.txt`; its absence is an
environment gap, not a finding. Nothing else in the environment changed.

### CTest on exactly these inputs

**79/79 passed** on candidate `2a2383ae` built in `build/tank-temp`, with the
working tree identical to the commit. An earlier run was 78/79, the single
failure being `TestInputSocket` aborting at `import telnetlib3` before reaching
any JSBSim code; installing the declared dependency resolved it.

### Before/after, same build directory, same test file

`src/models/propulsion/FGTank.{cpp,h}` were reverted to the base while
`tests/TestFuelTankTemperature.py` and its registration were kept, the tree was
rebuilt in place, and the test was rerun. This isolates the source change as the
only variable.

| Test | Base `29d2d6b8` | Candidate `2a2383ae` |
| --- | --- | --- |
| `test_temperature_property_follows_the_thermal_model` | **ERROR** — `KeyError: 'No property named propulsion/tank[0]/temperature-degC'` | pass |
| `test_temperature_relaxes_towards_the_air_temperature` | **FAIL** — the temperature never moves; the write lands on an untied node the tank never reads | pass |
| `test_startup_message_reports_celsius` | **FAIL** — `'Initial temperature: 15 Celsius' not found in` output containing `Initial temperature: 15 Fahrenheit`; and, with only the sentinel hunk reverted, the tank without a temperature still reports `-9999` | pass |
| `test_no_temperature_property_without_an_initial_temperature` | pass | pass |

The `Debug` before/after is literal: at 59 °F configured, the base prints
`Initial temperature: 15 Fahrenheit` — the Celsius value under the wrong label —
and the candidate prints `Initial temperature: 15 Celsius`. The test also
asserts the string `Fahrenheit` appears nowhere in the startup output, which is
safe because no other runtime log message in the tree contains it.

The fourth row passing on both sides is intended, not a weak test: it is the
regression that would catch a later change to an unconditional tie. It fails on
any tree that publishes the property for a tank without `<temperature>`.

### What the test actually checks

`TestFuelTankTemperature.py` uses stock `c172x` via `CopyAircraftDef`, whose two
fuel tanks both lack a `<temperature>`, so one can be given an initial
temperature and the other left without. No SF50 or other local asset is
involved.

- **Conditional tie.** With 59 °F on tank 0 only, `propulsion/tank[0]/temperature-degC`
  reads exactly 15.0, `propulsion/tank[1]/temperature-degC` raises `KeyError`,
  and the property catalog contains exactly one entry, `propulsion/tank/temperature-degC (RW)`.
  With no temperature on either tank, the catalog reports `No matches found`.
- **Writability and use.** The test writes a temperature 90 °C above the air and
  then steps; the subsequent relaxation starts from the written value. This
  matters because the write assertion *alone* is not a regression — on the base,
  `set_property_value` silently creates an untied node that reads its own value
  back forever. Only the stepping distinguishes a real tie from that.
- **Direction and no overshoot.** At *every* one of the 12,000 steps the fuel
  temperature is lower than the previous step and still above the air
  temperature.
- **Magnitude.** The endpoint is bracketed against the closed-form relaxation
  `TAT + (T₀ − TAT)·exp(−t/τ)` with `τ = m·c/(2·k·A)`. The aircraft is held down
  with its engine stopped, but TAT still drifts 8.394 → 8.454 °C and contents
  130 → 129.935 lb over the run, so the check uses the coldest/lightest and
  warmest/heaviest cases as bounds rather than a single value with an invented
  tolerance. Measured 97.282060 °C against a bracket of 97.281563 – 97.282863:
  a 1.3 × 10⁻³ °C window around a 1.11 °C drop, roughly 855× tighter than the
  effect it checks.

### Merged into the fork's master

`master` is at `f0d1023a`, a `--no-ff` merge of the candidate. It is independent
of the blocked #1505/#1508 line, so nothing about that blockage applies
downstream.

Because the branch sits on `upstream/master`, the merge also took in the two
upstream commits the fork was behind: `4e695159`, which is upstream's landing
of our PR #1504, and `29d2d6b8`, a README entry. `4e695159` contributes
**nothing to the tree** — its patch is byte-identical to the fork's own
`b0332970`, so git absorbs it as history only. The entire content delta to
`master` is our four files plus one README line. `master` is now level with the
upstream tip.

**84/84 CTest passed** on the merged `master`, including the fork's own
`TestTurbineTrimSpool`, `TestTurbineTrimFuelFlow`, `TestTurbineIdleFuelFlow` and
`TestWheelSpin` alongside the new test.

The merge happened twice, and the history shows it. `95d418fc` merged the
earlier `8e15dd81`, before the `Debug` sentinel handling was added. Amending the
branch made the two commits siblings on `upstream/master` rather than one
following the other, so the revised branch conflicted with the merge already in
`master`. The repair was `f0d1023a`, a second merge resolving
`src/models/propulsion/FGTank.cpp` and `tests/TestFuelTankTemperature.py` in
favour of the branch. That resolution was verified rather than assumed: the
resulting tree is `8ed425775140f653555bc242d88589494f370762`, byte-identical to
`git merge-tree f9082ee1 feature/tank-temperature-property`, so `master` holds
exactly what a clean re-merge onto `f9082ee1` would have produced. The lesson
for next time is to settle the design before merging a candidate downstream.

### Additional check, not in the test suite

Concorde is the only stock aircraft that really declares tank temperatures: 17
tanks, 4 of them with `<temperature>`. Loaded on the candidate it publishes
exactly 4 temperature properties, on tanks 0–3. `CheckScripts` and
`CheckAircrafts` already exercise it and pass.

### Submission

The user authorized pushing and submission explicitly on 2026-09-16, per step 5
of the contribution workflow. The branch was pushed to
`origin/feature/tank-temperature-property` at `2a2383ae`, matching the local
candidate exactly, and [PR #1511](https://github.com/JSBSim-Team/jsbsim/pull/1511)
was opened against `JSBSim-Team/jsbsim:master`: open, non-draft, mergeable, four
files, +239 −1.

Upstream CI started on its own, unlike #1505–#1508, whose workflow runs are
still held at `action_required` awaiting maintainer approval. Check results are
not yet in; CI success is not maintainer approval, and review remains open.

`origin/master` has **not** been pushed. The fork merge `f0d1023a` is local.

## Reviewed and settled

Two judgement calls were flagged for the user rather than decided silently. Both
were settled on 2026-09-16 before submission.

**The `Debug(0)` unit label stays in this PR.** It is a separate defect from the
property tie, and the contribution policy says not to bundle one into a feature
PR. The user decided to keep it: it is in the same function, about the same
value the change exposes, and a reviewer reading `Debug(0)` for the tie will see
it regardless. The PR says so plainly rather than hiding it.

**The `-9999.0` sentinel is disclosed, and no longer escapes.** The user
objected that the value is arbitrary and that unguarded consumer code could
read it as a measurement. That objection is the argument *for* the conditional
tie: with no property tied there is nothing to read, and absence is the property
tree's own way of expressing "no value", which is stronger than any in-band
number. The remaining exposure was `Debug(0)`, which printed
`Initial temperature: -9999 Celsius`; it now says
`Initial temperature: not set, fuel temperature is not modeled`. After this the
sentinel is not visible anywhere outside `FGTank`, and the PR body states this
explicitly rather than leaving a reviewer to find it.

The deeper fix — `std::optional<double>` or an explicit flag in place of the
sentinel — is deliberately **not** in this PR. It changes the public contract of
`GetTemperature_degC`, `GetTemperature` and `SetTemperature`. Neither getter has
a single caller inside the JSBSim tree, so the upstream blast radius is small,
but `FGTank` is linked against by embedders such as FlightGear, so it is a
public change and an API decision for the maintainers. A separate upstream issue
is drafted to ask their preference before any code is written.

## Relationship to the SF50 work

[The fuel system proposal](../proposals/sf50-fuel-system.md) §6 specifies a
TypeScript fallback so it does not block on upstream review. If this candidate
lands and reaches an installed artifact, the fallback is deleted rather than
kept alongside.
