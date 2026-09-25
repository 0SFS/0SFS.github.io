# Corrections to the original stage-1 records

2026-09-19, from the [coordinator review](../../../../../docs/turbine-initialization/reports/01-review.md).
**The files in this directory are unchanged.** Each one still says what the
binary it names measured. This note records where the *interpretation* was
wrong and where the corrected measurement lives, in
[`follow-up/`](follow-up/).

| File | What it says | Correction |
| --- | --- | --- |
| `starvation-nesting-and-stale-tsfc.txt`, block B | "after set-running (not suspended) engine dt=0.500000" | The 0.500000 is the *last-dispatch* diagnostic: it is the timestep the final settling evaluation used. `FGPropulsion::GetSteadyState()` restores `in.TotalDeltaT` before returning, and a live read gives 0.008333. See `follow-up/probes.md`, live-state. The block's other three observations — the suspended executive, the nesting result and the stale `tsfc` — are unaffected and reproduce |
| `starvation-nesting-and-stale-tsfc.txt`, block A | the published rate is still 3448.87 gph 7200 frames after the tanks empty | Correct, and now scoped: the stale value lasts exactly as long as `ConsumeFuel()` keeps returning early. Refilling the tanks restores the published rate on the next frame. See `follow-up/probes.md`, starvation |
| `starvation-nesting-and-stale-tsfc.txt`, block C | the executive is left suspended after a nested `RunIC()` | Correct. Now also recorded: an explicit `Setdt` recovers it, so the condition persists until a caller intervenes rather than being unrecoverable |
| `injection-null-lookup.txt` | the stock B747 crashes through `RunIC()` | Correct, and incomplete: a running `Run()` reaches the same lookup and also terminates, while `Run()` with the engine off does not. See `follow-up/probes.md`, injection-load |
| `trace.md`, `differences.json`, `key-measurements.md` | the sixteen-scenario trace | Unchanged and reproduced byte for byte. The `diag-*` columns in them are last-dispatch fields; read them as "what the last evaluation saw", not as state after the call returned |
| `provenance.json` | "instrumentation_controls" | The phrasing "reproduces on 0 of 2137 values" in the stage report was backwards. The measurement is zero differences among 2137 compared values per pair; the JSON field names already say this |

Two claims in the stage report that these files do not themselves make, also
corrected there and in the decisions:

- the `GetTrimStatus()` variant breaks the measured initialize-running path;
  it does not stop all turbine starts. The retained `starts` trace in
  `trace.md` shows both variants reaching `set-running == 1` through the
  starter and cutoff.
- on master, N1, N2 and the corrected TSFC are updated on the frame after
  `RunIC()` by the trim-finished block; the fuel flow is not, and seeks toward
  its target over further frames — 149.05 to 150.29 gph against a 585.52 gph
  steady value on the 737.
## Second round, 2026-09-20

From the [follow-up review](../../../../../docs/turbine-initialization/reports/01-follow-up-review.md).
The files in this directory and in [`follow-up/`](follow-up/) are again
unchanged; the corrected readings live in
[`follow-up-2/`](follow-up-2/).

| File | What it says | Correction |
| --- | --- | --- |
| `follow-up/probes.md`, linearization | "Every other entry of the throttle column is zero on both builds" | False. The `Q` row is 0.002461264, 0.004922528 and 0.007383792 at throttle 0.3, 0.6 and 0.9 — a physical pitching response to a thrust line offset from the centre of gravity. The `Beta` row is roundoff at 1e−17. The table of N1/N2/thrust/`Vt` values above that sentence is correct and reproduces. The retained `follow-up/probes.json` always held the whole column; see `follow-up-2/probes.md` §4, which re-reads it without a new run |
| `follow-up/probes.md`, starvation and fuel-matrix | the measured rows | Unchanged and correct. What was wrong was the *conclusion* drawn in the decisions — "stale starvation is not stale". `ConsumeFuel()` recomputes `Starved` only on frames where it gets past its freeze and trim-status early returns. `follow-up-2/probes.md` §3 measures the frozen case: a restart fails on 2000 lb of usable fuel until one unfrozen frame runs |
| `follow-up/probes.md`, fuel-matrix | the empty-and-frozen cell keeps running at full thrust | Correct, and now explained the same way: the engine keeps running because the flag was never recomputed, not because a residual inventory is modelled |
