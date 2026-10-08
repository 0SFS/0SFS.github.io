# Coupled engine plant: implementation report

Report for the [implementation specification](../proposals/engine-plant-implementation.md),
2026-10-08. Stage-by-stage detail is in the [stage record](engine-plant-stage-record.md);
F135 values and their sources are in the [ledger](f135-engine-plant.md).

## Outcome

The F-35B's F135 is now one coupled engine in JSBSim. Fuel metering, ignition,
combustion, the matched gas path, shafts, nozzle, metal temperatures and the
LiftSystem advance in one transient, with mass and energy ledgers on every
step. Sound and the exhaust optics read the same timestamped state.

The recorded contradiction is gone: 4.1333 s of full wet thrust with zero
burned reheat fuel after a cold start. Reheat thrust now exists only while
reheat fuel burns. The test that had to fail now passes, with the same 1 lbf
invariant against the same engine's own dry counterfactual.

| Dimension | Status |
| --- | --- |
| Implemented system | Done |
| Numerical correctness | Passed on the installed artifact |
| Physical fidelity | A calibration to public ratings with declared hypotheses; not an F135 identification |
| Runtime cost | Bounded and counted, not timed |
| Sound and appearance | Source causality passed; listening and display untested |
| Comparison | The pre-plant engine is selectable and passes its own suite unchanged |
| Upstream readiness | Drafts written, nothing posted |

## Implemented system

- **JSBSim** (`master` `34eeae66`, local, not pushed). An optional `<plant>`
  inside `<turbine_engine>`; empirical turbines are unchanged. It has a
  component reference algorithm and a reduced one (tabulated gas properties,
  Jacobian reuse, component fallback), with hard caps on iterations, substeps
  and memory. A staged, validated state record supports capture and restore.
  The contract is in `doc/turbine-plant-model.md`.
- **SDK.** `1.2.4-fork.21`, built once from that commit and installed
  immutably ([adoption](../../validation/evidence/jsbsim/adoption/fork21/adoption.json)).
  The [fork.20 implementation adoption](../../validation/evidence/jsbsim/adoption/fork20-adoption.json)
  and its original checks remain historical receipts. Fork.21 changes native
  fuel-flow and numerical observations, with no controller/physical tuning.
  fork.17, 18 and 19 are retained and refused, each for a native defect that
  the app tests found.
- **F-35B data.** The F135 is a `<plant>`. The `liftfan` and `sidefan` engines
  are removed: the lift fan and roll posts are the plant's outlets, applied
  once each as external forces, with each inlet's ram drag along the relative
  wind. The FCS commands clutch, lift-fan nozzle, roll posts and a thrust split
  that balances the aircraft about its CG. The hover reheat inhibit is
  unchanged and still native.
- **0sfs consumers:**
  - audio reads burned reheat fuel, with no DSP change;
  - the onset harness and optics read plant stations;
  - the forces overlay draws the external forces;
  - fuel-tank drag, engine start and stop, and the test stand use the plant;
  - snapshots, relocation and saved flights restore the plant's exact state;
  - **Engine → Settings → Simulation**, on the F-35B's Engine tab, names the
    engine model flying and holds the algorithm, iteration cap, substep cap,
    tolerance and reduced-model memory, applied live;
  - the engine monitor's **Live data → Numerics** observations show each step's
    algorithm, fallback, iterations, residuals, memory and energy and mass account.
- **Engine model choice.** Engine → Settings → Simulation can also fly the F-35B's
  empirical engine, the aircraft unchanged from before the plant, for
  comparison. It applies on reload, and a saved flight resumes under either
  ([below](#comparing-with-the-empirical-engine)).
- **Not done:** the local linear algorithm is deferred with reasons in the
  stage record.

The first version of this report said Engine → Simulation held these settings.
It did not show them: the settings were registered, but the Engine tab draws
its sections by name and did not draw this one, and they were set to appear
only under Show all parameters. A user found it in the running app. The tab
now draws the section, its settings are main-level, and a panel test checks
both. The monitor's numerics rows were the gap listed here before.

The October 8 Engine-tab redesign keeps those controls under **Settings →
Simulation** and puts the actual numerical observations in **Live data**,
alongside the engine's other variables. [The monitor design](../engine-monitor.md)
describes the registry, plot grouping, layout persistence and recording budget.
This changes presentation, not engine dynamics or the native solver settings.

Preserved behaviour, each checked by existing or new tests:

- the dry multiplier and the Exhaust tab's Afterburner section;
- default-on Med sound with a saved Off;
- the rigid nozzle and separate metal temperatures;
- working controls and the native hover reheat inhibit;
- state recovery and the aircraft lifecycle;
- the C172 and Vision Jet's empirical engines.

## Numerical correctness

| Check | Result |
| --- | --- |
| Native suite (fork.20 commit) | 90/90, including 33 plant methods: analytical nozzle, mixer and burner fixtures; per-step energy ≤ 1e-5 and mass ≤ 1e-6; timestep convergence; reduced against reference; lifecycle |
| SDK build / identity and artifact | 52/52 / 63/63; 14 installed files verified |
| App integration on fork.20 | 23 files, 238 tests |
| Reheat onset ([evidence](../../validation/evidence/aircraft/f35b/engine-plant/ab-onset/report.json)) | Wet thrust without burned reheat fuel: 0 s in all three cases (was 4.1333 s); reheat heat only from burned fuel; worst step energy residual 1.2e-7 |
| Reduced against component ([evidence](../../validation/evidence/aircraft/f35b/engine-plant/algorithms/report.json)) | Five held-out trajectories: worst 1.3e-6 of full scale in force, spool and fuel; 0.0014 K in station and metal temperatures; every event in the same step |
| Lifecycle | Zero-time converted initialization dry at 0–300 kt; snapshot restore exact, foreign record refused; RunIC on a stopped engine changes no spool state |
| Full CI | See [Checks](#checks) |

## Comparing with the empirical engine

Engine → Settings → Simulation → Engine model switches the F-35B between the coupled plant
and its earlier empirical engine. The empirical files are byte-identical to the
F-35B package at 0sfs `d92a928a`, the last commit before the plant, and that
commit's own F-35B integration suite passes against them on fork.20: 66 of 66
tests. The only changes to the suite load the empirical model, its package and
its F135 path ([evidence](../../validation/evidence/aircraft/f35b/engine-plant/empirical-model/report.json),
`scripts/validation/f35b/check-f135-empirical-engine-model.mjs`).

At a fixed throttle the two give nearly the same thrust; both are fitted to the
same ratings. They differ in transients. On a sea-level static stand, in
simulation time from each command:

| Step | Coupled plant | Empirical |
| --- | --- | --- |
| Idle thrust | 1,816 lbf | 1,325 lbf |
| Idle to intermediate, 10 / 50 / 90 % | 0.59 / 1.38 / 4.45 s | 1.28 / 2.12 / 2.55 s |
| Intermediate to maximum | Reheat first burns at 1.25 s; 90 % at 2.39 s; 40,992 lbf | All of it in one 1/120 s step; 43,000 lbf |
| Maximum to idle, 10 / 50 / 90 % | 0.10 / 0.28 / 1.18 s | 0.01 / 0.07 / 0.38 s |

The empirical engine keeps its recorded defect: 4.1333 s of full reheat thrust
with no reheat fuel burned after a cold start. Its lift fan and roll posts are
force carriers that share out the main engine's upward force at once.

## Physical fidelity

The plant meets the published intermediate (27,000 lbf) and maximum
(41,000 lbf) ratings. These are regression tests. It also meets the hover split
(16,750 + 20,000 + 2 × 1,950 lbf). The LiftSystem shaft power, which was not a
target, comes out at 28,200 shp against the published 29,000.

Everything inside the engine is a hypothesis or a fit to totals. The
sensitivity runs show the ratings cannot identify the cycle: thrust moves under
0.2 % for any perturbation tried. The outputs the exhaust consumes are
uncertain:

- **Dry nozzle temperature.** ±56 K for ±5 % turbine inlet temperature; ±30 K
  for cooling fraction.
- **Reheat onset.** 0.76–1.72 s for a 1–3 kg reheat manifold prime mass.

Calibration choices made where the app showed a defect:

- a deceleration schedule that keeps the core lit through any throttle chop;
- a start schedule with ignition margin, giving windmill relight to 30,000 ft;
- a sub-idle acceleration schedule for a 15–26 s ground start.

Known limits are in the [ledger](f135-engine-plant.md#limits):

- inlets ignore their orientation;
- N1 overshoots on a throttle step at partial conversion;
- the main-thrust trade at 1 % conversion;
- 10 % conversion at 60 kt is not covered.

## Runtime cost

No wall-clock time was measured; the handoff does not authorize timing.

Work per accepted 120 Hz step, counted:

- **Reduced algorithm:** mean 10–12.5 residual evaluations, at most 49.
- **Component reference:** mean 24–31, at most 65.

Both stay within the iteration cap, with no substeps and no failures in the
corpus. Resident data is 22.8 KiB, inside the 1 MiB default budget. Storage is
preallocated. Timing p50/p95/p99 against the legacy engine is pending an
authorized run.

## Sound and appearance

On the shipped DSP, deliberate reheat sound starts with the first burned reheat
fuel in Low, Med and High, never before. The base jet sound changes from
selection, when the nozzle pre-opens, at or below dry thrust. Internal reaction
light starts on the first burn and stays inside the engine.

None of this establishes what a listener hears or a display shows. Listening,
display, GPU and appearance checks are untested. The visual exhaust was not
retuned: no fades, delays, temperature ramps, colour changes, light relocation
or brightness boosts.

## Upstream readiness

[Drafts](../proposals/jsbsim-turbine-plant-upstream.md) propose three slices:

1. the reference plant;
2. the `FGTurbine` opt-in;
3. the lift system.

Nothing is pushed or posted.

## Checks

0sfs, on the final working tree:

- incremental `npx tsc -b` and `npm run lint` clean;
- related Vitest 1,066 tests, with six layout expectations then updated and
  rerun green;
- full `npm run ci`, once:
  - lint passed;
  - tests: 187 of 188 files, 2,052 passed, plus the existing expected failure
    (stowed F-35B main-gear clearance);
  - one failure, a 5 s timeout in `scripts/build-f135-engine.test.mjs`. That is
    the 3D engine-asset generator, untouched by this work; rerun alone it passed
    4/4 in 6.0 s;
  - the production build, which CI skips after a test failure, then passed on
    its own, with the installed and emitted SDK and audio artifact checks.

After the Engine → Simulation and engine-model fix, on the working tree:
`tsc -b` and lint clean; HEAD with only this change typechecks on its own;
related Vitest 1,012 tests; one `npm run ci`, 2,064 passed plus the same
expected failure, with the same 5 s timeout in
`scripts/build-f135-engine.test.mjs` (4/4 alone in 7.2 s); the production build
then passed on its own and ships both F-35B data packages.

Leftover sandboxes from interrupted native Python test runs remain in the
JSBSim build directory (`build/turbine-plant-20261008/tests/tmp*`, seven
folders, 2026-10-08 01:34–01:35). They were not deleted; build folders are
deleted only with the user's agreement.

## Sustained powered-lift follow-up, 2026-10-08

The [powered-lift record](f135-powered-lift-stability-2026-10-08.md) preserves
the original fork.20 observations and installed fork.21 receipts. The reported
full-conversion 92–107% cycle remains unreproduced under explicit held/free
fixtures; no user session was captured. Fixed-condition 80 s trajectories,
both algorithms, command .98/.99/1, perturbations and timestep refinement
remain separate from changing free-flight conditions and partial-conversion failures.

Fork.21 corrects accepted fuel-flow PPS under frozen/trim fuel and phase-specific
fallback/work publication, and adds raw mass closure and commanded-throat
observations. It does not tune the physical/controller model. Independent mass
and energy gates pass. The fixed clean 37,000 lb lift ledger is +5,010 lbf net
sea-level ISA, −706 lbf at 5,000 ft ISA and −4,253 lbf hot sea level: available
lift depends on load, atmosphere, geometry and the unqualified physical limiter.
No duplicate/missing lift force was found.

The exact optical replay is retained separately from physical qualification.
Frozen-source validity is fixed, but metal thermal equilibrium and real dry
brightness remain unqualified. User AB synchronization acceptance is preserved;
no new device acceptance is claimed. The complete app CI run had one concurrent
Engine-help failure; the failing file passed its targeted rerun, and production
build passed. Read the new record for all check limitations rather than extending
the earlier fork.20 full-CI claim to the current dirty tree.

The rotating-frame free-hover isolation in that record holds 20% clean fuel at
5,000 ft ISA with normal FCS and .95567056 throttle. Its 60 s observation meets
the predeclared engineering hover gates (altitude span 0.02395 ft), while mass
and energy close independently. This is a declared numerical fixture, not the
user's captured flight or real F135 qualification. Matching gravitational force
alone is separately retained and does not supply the required corotation balance.
