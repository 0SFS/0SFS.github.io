# Application validation

The final source passed these checks on 2026-10-06:

| Command | Result | Log |
| --- | --- | --- |
| `npx tsc -b` | Passed, incremental | [typecheck-final.log](typecheck-final.log) |
| `npx vitest related --run --maxWorkers=50% <changed files>` | 63 files / 782 tests passed | [related-final.log](related-final.log) |
| `npm run lint` | Passed, incremental | [lint-final.log](lint-final.log) |
| `npx vitest list --filesOnly` | 169 active test files; no evidence snapshots | [test-discovery-final.log](test-discovery-final.log) |
| `npm run ci` | One run passed: 169 files, 1,832 passed tests, one existing expected failure; production build and artifact verification passed | [ci-final.log](ci-final.log) |
| `git diff --check` | Passed | [diff-check-final.log](diff-check-final.log) |

Related inputs were `createEngineExhaust.ts`, `engineGasOptics.ts`,
`engineExhaustProfiles.ts`, `createAircraftEngineVisuals.ts`,
`createFlightSimApp.ts`, `flightParameters.ts`, `scripts/build-exhaust-optics.mjs`
and `scripts/exhaustOptics/bake.mjs`. The existing Vitest configuration caps
workers at 50%. No other suite ran concurrently. Empty successful TypeScript,
lint-target and whitespace logs mean no diagnostics, not omitted commands.

The existing expected failure is the F-35 main-gear selected-skin containment
condition. Canvas/localStorage environment messages and Vite chunk-size warnings
are retained in the logs. This task does not change ground collision or gear.

Earlier [47-test renderer/integration run](renderer-focused.log) and
[incremental TypeScript check](typecheck-integration.log) predate final field
defaults and clustered quadrature. The final related/CI runs cover the final
code. No code changed afterward; only documentation and retained records were
finished. Source and log identities are in the [combined record](../acceptance.json).
Integration source snapshots use `.txt` so they cannot become executable tests.

The [evidence audit](evidence-audit.log) checks final report inputs, snapshots,
retained inventories, native XML/package and rigid assets against their existing
records, local documentation links, and preservation of unrelated tracked
changes present at task entry. The native checkout's [status](native-status-final.log)
is clean. The [legacy evaluator recheck](../native/legacy-evaluator-recheck.log)
matches all 4,171 archived uniform-source rows exactly without rerunning native
state. This does not make the old approximation physically calibrated.

No browser, GPU, server or benchmark was run. NullEngine tests do not compile
or execute the GLSL/WGSL fragment shaders. CPU volume images are independent
numerical projections; actual flight-render appearance remains unqualified.
