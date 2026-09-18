# Work prompt: SF50 flaps retract and redeploy on bumps

Execute this task when the user starts a fresh conversation with this file.
Work in `/Users/felg/gh/0sfs`. Reproduce the reported flap discontinuity, determine
its cause, and implement a focused fix with a regression that fails before and
passes after. Read the current `AGENTS.md` before making changes.

## User observation and boundaries

During a landing the user observed: "the flaps would reset up and slowly lower
when i hit a bump." This is an observed motion, not an established diagnosis.
The exact SF50 variant, flap setting, terrain provider, and bump trigger were
not recorded. Determine whether the command changes, native actuator position
resets, or only the visual animation changes.

The engine sounded fine on the user's latest landing after commit `c1405f0e`
(`Preserve simulation time across contact recovery`). Keep that behavior. The
user considers contact recovery good enough and explicitly does not want its
architecture redesigned or optimized. A narrow repair to flap continuity is
in scope; replacing terrain/contact recovery is not. The separate camera-zoom
audio bug belongs to another prompt.

Read `docs/validation/engine-cutout-rollout-2026-09-16.md` for prior evidence and
the user's deferred architectural concerns. The earlier engine-cutout prompt
is historical context, not this task's instructions.

## Reproduce before fixing

Use the installed JSBSim package; identify the current artifact with
`npm run verify:jsbsim`. Prefer a deterministic Node/Vitest test using the real
WASM, following the existing rollout and SF50 integration tests.

Trace commanded flaps, native physical flap position, and the value consumed
by the aircraft animation immediately before a bump, through any recovery,
on the next accepted physics step, and for several seconds afterward. Record
simulation time, actual dt, terrain revision, and whether recovery occurred.
Include partially extended flaps or flaps already moving, where preserving the
command alone cannot establish preservation of actuator state.

Distinguish ordinary rough terrain from a terrain-revision correction and
visible-mesh contact. Reuse the existing rollout scenario where useful; prove
which path triggers the defect rather than assuming every bump calls reset.
If synthetic recovery reproduces it but the original flight remains unknown,
state that limit explicitly.

## Starting points and hypothesis

- `src/flight/physics/safeFlightState.ts`: `captureSimulation` and
  `restoreSimulation`; the current snapshot includes flap command and gear
  position, but does not explicitly include physical flap position. This is a
  hypothesis to test, not a proven cause or prescribed patch.
- `src/flight/physics/terrainContact.ts` and `visibleMeshCollision.ts`: callers
  of recovery. `fixedStepLoop.ts` also restores after an invalid step.
- `src/flight/jsbsim/fdmProfiles.ts`: flap position properties and units differ
  by aircraft. Avoid assuming every model uses a normalized writable position.
- `src/flight/jsbsim/resetFlightLocation.ts`: existing treatment of physical
  flap position during explicit repositioning; compare its behavior without
  assuming it solves contact recovery.
- `src/flight/input/applyFlightControls.ts` and control ownership in
  `src/flight/createFlightSimApp.ts`: possible command changes.
- `src/flight/aircraft/aircraftAnimation.ts`: reads `fcs/flap-pos-deg` for the
  visual surfaces. Trace it alongside the native actuator output.
- `public/jsbsim-data/aircraft/sf50-g2/sf50-g2.xml` and the selected model's XML:
  flap actuator, rate limits, and normalized/degree outputs.
- `src/flight/jsbsim/sf50.integration.test.ts`,
  `src/flight/physics/rolloutEngine.integration.test.ts`,
  `src/flight/validation/sf50RolloutScenario.ts`, and
  `src/flight/audio/simulationResetAudio.integration.test.ts`: existing controls.

If actuator internals overwrite a restored output on the next step, an
immediate post-reset assertion alone will miss it. Check continuity over time
and retain normal flap travel toward the pilot's command. Do not hide a native
discontinuity by smoothing only the mesh or by forcing commanded position.

## Scope, validation, and handoff

Preserve unrelated working-tree changes. Follow repository ownership rules:
an app state-capture defect belongs here; a reusable native/SDK defect belongs
in `/Users/felg/gh/Felipegalind0/jsbsim`, following the contribution policy.
Do not edit captured build sources or silently replace the installed artifact.
Keep the known shut-off-engine trim defect separate from this investigation.

The result should include a deterministic before/after regression, a focused
fix, and a short evidence record explaining the trigger and affected state.
Check settled and moving flaps, the next and subsequent physics steps, and
appropriate aircraft compatibility if a shared restore function changes.
Retain clock monotonicity and the passing engine/gear recovery contracts. Run
relevant tests, lint, and the build as appropriate; report skipped coverage.

Prefer terminal/headless verification. Follow `AGENTS.md` on servers and GUI
use; this prompt does not authorize starting a development server. Do not
publish or modify upstream PRs as part of this handoff. If the only viable fix
requires redesigning contact recovery, report that boundary with evidence
instead of expanding the task.
