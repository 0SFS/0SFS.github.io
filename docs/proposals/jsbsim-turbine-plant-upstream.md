# JSBSim coupled turbine plant: upstream contribution drafts

**Status: drafts, not posted.** No branch is pushed, no PR opened, no comment
written. Publishing needs the user's instruction; the rules are in the
[contribution policy](../jsbsim-upstream-contribution-policy.md). The existing
upstream PRs (#1502, #1505, #1506, #1507, #1508, #1511) are independent of
this work and untouched by it.

## Source

The fork's `master` at `ea6956b4` holds the work as eleven commits on top of
`97fe6ddf`. Five of them only bump the fork's WASM package version
(`b238cd58`, `fc0f62e9`, `05afe579`, `70c76c99`) or record a check
(`ea6956b4`, which belongs with its fix). Outside `wasm/`, the native footprint
is 25 files and about 8,000 lines:

- the plant itself under `src/models/propulsion/plant/`, plus its generated gas
  tables;
- a 573-line `FGTurbinePlant.cpp` adapter;
- small edits to `FGTurbine`, `FGEngine` and `FGPropulsion` (69 changed lines);
- tests, the generator and the documentation.

Nothing in it names the F135 or 0sfs. The F135 values stay in 0sfs.

## Proposed series

Each slice would be rebased onto upstream `master`, without the fork's
`wasm/` version bumps. The fixes found later (`886271e3`, `7d771426`,
`592c3729`) are folded into the slice they correct rather than sent as
follow-ups.

1. **Plant reference, no JSBSim wiring.** `plant/` sources, gas data and its
   generator (`utils/turbine_plant/`), the synthetic fixture and
   `FGTurbinePlantTest`. It is self-contained and testable alone, and
   introduces nothing an existing aircraft can reach.
2. **Opt-in `<plant>` behind `FGTurbine`.** XML loading, properties, the
   staged state record, zero-time policy, supply and debit through
   `FGPropulsion`, `tests/TestTurbinePlant.py`, `doc/turbine-plant-model.md`.
   Empirical turbines are byte-for-byte unchanged unless `<plant>` is present.
3. **Lift system.** Clutch-driven fan, roll posts, momentum mixer, split loop
   and LP limit. It could merge into slice 2 if reviewers prefer fewer PRs;
   kept apart, it isolates the most configuration-specific control.

### Draft description, slice 1

> Adds an optional component-level turbofan model under
> `src/models/propulsion/plant/`. It covers fuel metering and ignition,
> oxygen-limited burners, a matched gas path (fan, compressor, turbines with
> ellipse capacity, mixer, augmentor, convergent–divergent nozzle), shafts,
> thermal solids, and mass and energy ledgers on every accepted step. It ships
> a component reference algorithm and a reduced one (tabulated gas properties,
> Jacobian reuse, component fallback) under a hard iteration cap.
>
> Nothing in JSBSim calls it yet. Tests use an openly specified synthetic
> engine, not a real one:
>
> - analytical nozzle, mixer and burner fixtures to 1e-8;
> - per-step energy closure to 1e-5 and mass to 1e-6;
> - timestep convergence;
> - reduced against reference;
> - augmentor thrust only from burned fuel;
> - cold-inlet augmentor permission.

### Draft description, slice 2

> Lets a `<turbine_engine>` carry a `<plant>` block that replaces its thrust,
> fuel flow and spool calculation, while keeping the legacy observations
> (`n1`, `n2`, `egt-degc`, `augmentation`, `nozzle-pos-norm`, fuel flow) from
> the same accepted state. Without `<plant>` nothing changes.
>
> The plant takes its throttle from the FCS position, including through
> `set-running`, because `SetEngineRunning` writes full throttle into its own
> input copy. A zero-time call solves a steady point for a running engine.
> State can be captured and restored through a validated record under
> `propulsion/engine[n]/plant/state/`.

## Before posting

- Rebase each slice onto current upstream `master` and run the full native
  suite there. The fork's 90/90 pass is on the fork.
- Check the generated `TurbinePlantGasData.inc` regenerates byte-identically
  from `utils/turbine_plant/generate_gas_data.py` on a clean checkout.
- Confirm reviewers want a new optional model rather than changes to the
  empirical turbine. The discussion on #1505 and #1508 (shared running and
  steady calculations) is about the empirical model and is unaffected.
- Replace any wording that relies on 0sfs evidence with the portable tests
  above.
