# SF50 rollout engine-cutout investigation — 2026-09-16

The automated reproduction did not produce a native engine cutout. It did find
an application timeline defect during terrain or body-contact recovery that is
consistent with the reported audible symptom. JSBSim kept the turbine running,
but the recovery code reconstructed the aircraft with `RunIC` without restoring
simulation time. Every recovery therefore rewound `simulation/sim-time-sec` to
zero. The audio owner treats a rewind as a new epoch and resets/fades the DSP,
which can interrupt the sound even while thrust, spool state, fuel flow, and the
native running flag remain continuous.

The fix is in `safeFlightState.ts`: capture the SDK executive time and restore
it with `setSimTime()` immediately after `resetToInitialConditions(2)`, before
the two zero-time evaluations. A teleport or explicit reset still starts a new
timeline through its existing path.

## Exact inputs

- Application base: `7f2d307270b34e965467d11b2285ba9bebda4a46`
- Installed package: `@felipegalind0/jsbsim@1.2.4-fork.7`
- Tarball SHA-256:
  `58afaf9fa575ec61838ba794b7b4a0919b8eaf516c7261e571700e8367b5217b`
- Aircraft: production `sf50-g2` XML and FJ33-5A/direct engine package
- Integration rate: 120 Hz, `dt = 0.008333333333333333 s`
- Initial state: sea-level short final, 100 KCAS, 3 degree descent, gear down,
  full flap, running engine at idle, and 1,000 lb of fuel

`src/flight/physics/rolloutEngine.integration.test.ts` flies the approach to
touchdown and rollout against three deterministic surfaces:

1. a flat runway;
2. stationary roughness composed of 6 mm and 2 mm sinusoidal heights with 6 m
   and 1.5 m wavelengths;
3. a refined plane that alternates by 0.1 m every two seconds after touchdown,
   increments the terrain revision, and exercises the app's state-recovery
   path.

The generated files under `build/validation/rollout/` record every frame. Each
row includes actual `dt`, N1, N2, fuel flow, `set-running`, cutoff, starter,
stalled and seized flags, dynamic pressure, calibrated and ground speed, fuel,
thrust, monitor phase, audio combustion, terrain height/revision, and every
gear's compression and WOW state. `FGEngine::Starved` and turbine phase are not
bound by this package; the log records starvation as `null` and derives monitor
phase from the same readable signals as the app. A missing property is never
recorded as false.

## What the rollout established

| Surface | Result | Lowest qbar | Contact reconstruction | Engine outages |
| --- | --- | ---: | ---: | ---: |
| Flat | stopped | 0.00003 psf | 0 | 0 |
| Rough | decelerated below 20 kt | 1.32 psf | 0 | 0 |
| Refinement | stopped | effectively 0 psf | 15 restores / 30 `RunIC` calls | 0 |

All three cases kept `set-running = 1`, combustion true, and fuel flow above the
app's `1e-4 lb/s` threshold. The refinement case retained idle N1/N2 and fuel
flow through all 15 ground changes. Its simulation clock had 15 rewinds before
the fix and none afterward.

The physical roughness case intentionally uses a stationary spatial profile.
It decelerates well below the relight threshold but does not satisfy the
benchmark's one-foot-per-second stop criterion within 90 seconds because
intermittent WOW reduces brake application. It still covers the reported slow
roll and bump regime without moving the runway beneath a stopped aircraft.

## Hypotheses resolved

**H1 — relight below qbar 30 psf:** the turbine code does require qbar above 30
psf for a starter-free relight, but no flameout happened. The test passed from
33.86 psf through zero, so this gate never became active. At sea-level standard
density, 30 psf is about 94 KEAS, rather than 105 knots.

**H2 — zero-length frames:** normal fixed-step calls remain at 120 Hz. Terrain
revision and visible-mesh recovery do call `RunIC`, so zero-time turbine
evaluation is real. A running SF50 survived it in every test. The installed
#1505/#1508 trim defect did not shut this running engine down; it remains the
separate shut-off-engine defect already tracked in the open-PR review.

**H3 — starvation:** the production G2 model started with 1,000 lb in its one
aggregate tank and finished the refinement case with 999.08 lb. Native fuel
selection has no acceleration/unporting path, and no readable state changed as
if fuel had been lost.

**H4 — gear force propagation:** same-revision roughness did not change running,
combustion, spool state, or fuel flow. The wheel-spin experiment reads SDK
state for presentation and writes nothing back to propulsion. Visible-mesh
contacts use the same causally tested restore function.

## Causal regression

`src/flight/audio/simulationResetAudio.integration.test.ts` runs the installed
WASM SF50 for one second, performs three production `captureSimulation` /
`restoreSimulation` sequences, and reads the real audio adapter after each.

Before the fix it fails on the first restore:

```text
expected +0 to be close to 0.9999999999999989
```

The exact before/after outputs are retained under
[`evidence/jsbsim/engine-rollout/`](evidence/jsbsim/engine-rollout/).

With the fix, the clock remains at the captured time, advances by one fixed
step afterward, and native running and combustion stay true through all three
restores. The broader rollout regression also fails before the fix because it
observes 15 clock rewinds, then passes afterward with none.

Run the focused evidence with:

```sh
npm test -- src/flight/audio/simulationResetAudio.integration.test.ts \
  src/flight/jsbsim/sf50.integration.test.ts \
  src/flight/physics/rolloutEngine.integration.test.ts
```

Result after the fix: 32/32 focused tests passed. The repository-wide suite
passed 965/965 tests, and `npm run lint` and `npm run build` both passed.

## Ownership and upstream assessment

This was caused by the app using JSBSim's reset API as an in-flight contact
recovery without preserving the public executive clock. The installed SDK
already exposes `getSimTime()` and `setSimTime()`, so no JSBSim or SDK change is
needed and no upstream tracker entry was added. The open #1505/#1508 defect is
unchanged by this fix.

This automated evidence establishes native engine continuity in the three
tested rollout cases and the audio timeline failure on state recovery. It does
not establish that the timeline failure was the sole cause of the original
observation: the user's SF50 variant, terrain provider, and whether the symptom
included measured thrust loss were not available during this run.
