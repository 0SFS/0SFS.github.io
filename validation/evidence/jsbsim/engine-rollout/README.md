# SF50 rollout clock evidence

These logs are the causal controls for
[`engine-cutout-rollout-2026-09-16.md`](../../../../docs/validation/engine-cutout-rollout-2026-09-16.md).

- `restore-before.log`: the real-WASM SF50 restore regression fails because
  simulation time changes from one second to zero.
- `restore-after.log`: the same regression passes after retaining executive
  time in `safeFlightState.ts`.
- `rollout-before.log`: the deterministic touchdown/refinement scenario sees
  15 clock rewinds on the unmodified base.
- `rollout-after.log`: the same three rollout cases pass after the fix.

The before runs temporarily used `safeFlightState.ts` from application base
`7f2d307270b34e965467d11b2285ba9bebda4a46`. The after runs changed only the
clock capture/restore behavior under investigation. Both used installed
`@felipegalind0/jsbsim@1.2.4-fork.7`, tarball SHA-256
`58afaf9fa575ec61838ba794b7b4a0919b8eaf516c7261e571700e8367b5217b`.
