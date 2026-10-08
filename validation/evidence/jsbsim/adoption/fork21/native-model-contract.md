# Coupled turbine plant

An `FGTurbine` that contains a `<plant>` element is simulated by one coupled
native model instead of the empirical thrust tables and phase logic. Fuel
delivery, ignition and combustion, the matched gas path, shaft work, nozzle
flow and thrust, and thermal solids then describe one physical transient, and
every observation of it comes from the same accepted state. Engines without
`<plant>` are unchanged.

Sources: `src/models/propulsion/plant/` (the plant, independent of JSBSim),
`src/models/propulsion/FGTurbinePlant.cpp` (the `FGTurbine` adapter),
`utils/turbine_plant/generate_gas_data.py` (offline gas tables). Tests:
`tests/unit_tests/FGTurbinePlantTest.h` (synthetic engine, analytical
components) and `tests/TestTurbinePlant.py` (the adapter on the F16 fixture).

## What is modeled

| Part | Model |
| --- | --- |
| Gas | Three pseudo-species: air, stoichiometric products of the fuel (C12H23 by default), unburned fuel. NASA 7-coefficient polynomials (GRI-Mech 3.0) for the reference; generated Hermite tables for the reduced algorithm; a calorically perfect option for analytical fixtures. Sensible enthalpy from 298.15 K plus burned fuel times the lower heating value, so chemical energy is counted once. No dissociation, CO, NOx or soot. |
| Stations | SAE ARP755: 0, 2, 21, 13, 16, 25, 3, 31, 4, 41, 45, 5, 6, 7, 8, 9, plus lift-fan inlet and exit. |
| Fan, compressor, lift fan | Euler-stage surrogate: work `U(aU - bVa)` finite at zero speed, profile and incidence losses. A one-point surrogate calibrated at the design point, not a measured map; no positive-slope (surge) region. Lift-fan inlet guide vanes scale the work coefficient `a` (pre-swirl), from fully open (1) down to `lift-vane-min`. |
| Turbines | Stodola ellipse capacity and a parabolic velocity-ratio efficiency written as torque, finite at zero speed. |
| Burners | Oxygen-limited; unburned fuel is carried downstream and can burn later. Core efficiency follows a normalized Lefebvre loading; the augmentor uses a constant efficiency. Both scale with the lit fraction during light-around. |
| Mixer | Constant-area mixing at the core stream's static pressure: the core passes its design entry area subsonically; bypass air is injected through its own entry area against that static pressure and may choke there. Mass, energy and momentum are conserved, so streams of unequal total pressure pay their mixing loss. Entry areas are sized at the design point from `mixer-static-pressure-ratio`. One-way: open, or blocked (no bypass flow), solved as an active set. |
| Nozzle | Convergent-divergent with variable-property sonic state; regimes no flow, subsonic, choked with internal shock, overexpanded attached, overexpanded separated (Summerfield, wall pressure 0.4 of ambient), underexpanded or ideal. |
| Shafts | LP, HP and optional lift-fan rotors, implicit midpoint solved jointly with the gas path, so rotor energy change equals mean shaft power times the step exactly. Coulomb, viscous and aerodynamic losses; accessory load; air-turbine starter; slipping clutch to the lift fan. |
| Fuel | Metering valves (exact first-order lag plus rate limit), manifold fill to a prime mass then a first-order primed response, optional drain to dump when shut off. Supply-limited delivery with core priority. |
| Ignition | A flame lights after `ignition-delay-s` of ignitable conditions (equivalence ratio within limits, pressure, augmentor inlet temperature) and spreads over `light-around-time-s`; it blows out outside the limits. Flames change state at the end of a step; burning starts on the next step. |
| Controller | Representative min/max governor in the style of NASA C-MAPSS40k: N1 demand, idle N2, N2 and turbine-exit-temperature limits, acceleration and deceleration ratio-unit limits with back-calculation anti-windup, start schedule, augmentor selection (above `augmentor-minimum-n2`, a corrected speed) then light-off flow then a ramp, nozzle schedule with pre-open and constant corrected flow when lit, and an open-loop `throat-area-trim` input. With a lift system: see below. |
| Solids | Lumped capacities between a gas station (5 or 7), a coolant (bypass or cooling air) and radiation to the surroundings; stream conductance `W cp (1 - exp(-h/(W cp)))` never lets a stream pass the wall temperature. |

### Lift system

An optional shaft-driven lift fan on the LP spool through a slipping clutch,
with its own inlet, guide vanes and nozzle (door), and two roll posts bled
from the bypass duct. The controller adds:

- A lift-mode nozzle opening, `lift-throat-area-factor`, scaled by clutch
  engagement times door opening: opening the nozzle lowers turbine back
  pressure so the LP turbine can drive the fan, and the opening goes away
  with the fan's load, not after it.
- A thrust-split loop holding lift-fan gross thrust at `thrust-split-command`
  times main-nozzle gross thrust (0 disables). The guide vanes act at once in
  either direction while they have travel (they can only take work out of the
  fan); with them fully open, a fan that is too weak is met by opening the
  throat. Closed vanes are washed out (`lift-split-washout-per-sec`) by
  closing the throat, which raises jet thrust, until the vanes are open again
  or the throat is at its minimum. The trim never winds up past the area
  limits and relaxes to 1 when the split is idle. The loop takes authority
  as lift-fan thrust rises from 1 % to 2 % of design thrust (with the clutch
  engaged), relaxing with the rest, so it never switches on and off as a
  lift fan spools through a threshold.
- An LP speed limit, `max-n1` (off by default): with the fan engaged, an N1
  above it opens the vanes and closes the throat, which takes power off the
  LP turbine faster than fuel can when the fan unloads (a closing conversion).
- `bypass-entry-area-factor`: the mixer's bypass entry shrinks with clutch
  engagement and the lift-fan nozzle opening, reaching the factor once the
  opening is `bypass-entry-door-full` (default 1) and moving in proportion
  below it. A declared surrogate for however the real engine holds its fan
  operating line while the nozzle opens in lift mode; 1 disables it. Scaled
  by the clutch alone, an engaged clutch with a nearly closed lift-fan nozzle
  blocked the bypass while the fan took no load (in the F135 configuration,
  1 % conversion at full throttle left the core at 83 % N2); scaled by the
  full opening, the fan was too weak to hold the split at partial
  conversion.

The steady solve holds the commanded split with the throat area as the
unknown; when the answer lies beyond an area limit it holds the limit, and
at the minimum it closes the guide vanes for the rest.

### Ambient

The plant takes the local static pressure and temperature and the total
pressure and temperature at the aircraft from `FGEngine` inputs (that is,
from `FGAtmosphere` and `FGAuxiliary`), whatever set them: a standard
atmosphere with `delta-T`, a temperature profile, or a weather source. It
never reads `atmosphere/delta-T`. Corrected speeds are referred to the fixed
standard-day 288.15 K, a reference, not an assumption about the atmosphere.

## Numerical formulation

Unknowns of the gas path: core flow W25, bypass flow W13, mixer bypass flow
W16 (all scaled by design flows), and the natural logs of the HP and LP
turbine pressure ratios. Residuals: nozzle total pressure, mixer junction,
bypass/roll-post mass split, and each turbine's capacity in squared form.
A transient step adds the end-of-step speeds; the steady solve adds N1, N2,
core fuel, throat area and the lift-fan speed.

- Pressure residuals are divided by a gauge pressure that depends only on
  speed and flight condition: the design nozzle gauge scaled by N1 squared,
  plus ram, at least 1e-3 of ambient. Shaft residuals are divided by design
  turbine torque.
- Damped Newton with an Armijo line search on the 2-norm, Levenberg steps
  for a singular Jacobian, bound projection. The component algorithm uses a
  finite-difference Jacobian each iteration; the reduced algorithm uses the
  tabulated gas and reuses a Broyden-updated Jacobian between steps.
- Each accepted step: controller once, then the reduced algorithm, then the
  component reference; 1, 2 and 4 substeps; then an end-of-step publication
  solve. Every Newton iteration counts against `iteration-cap`; a quarter is
  reserved for publication. A step that cannot be solved within the cap
  keeps the previous accepted state and reports `numerics/failure`; the
  adapter retries on the next step.
- A step that cannot be solved quarters the nozzle's commanded move (and
  the split trim's) for the next step; each accepted step doubles it back
  (`numerics/nozzle-backoff`). A nozzle commanded beyond where the gas path
  has a solution stops there instead of freezing the engine.
- Integration and end-state publication report their Newton work separately,
  including unsuccessful attempts. `numerics/algorithm` names the algorithm
  that produced the published gas-path outputs; `numerics/step-algorithm`
  names the one that integrated the accepted step. A reduced step may publish
  with the component reference, and its publication fallback is reported even
  when integration needed no fallback. Failed publication keeps the accepted
  state and counts its work against the same step cap.
- Zero-time calls (run_ic, trim, suspended integration) solve the steady
  operating point at the present controls for a running, fuelled, unstalled
  engine, and otherwise only refresh outputs from the unchanged state
  (`numerics/fallback-reason` 5 when no steady point was found).
- The steady solve is a continuation: from the present state of a running
  engine, otherwise from the design point at the design ambient, the controls
  and flight condition (N1 demand, clutch, door, roll posts, ambient and ram
  conditions) are blended to their present values, halving the stride on a
  failure down to 1/256. An augmentor demand is reached as a second
  continuation from the dry point.

## Conservation

The step ledger closes by construction up to the solver residual: air and
fuel enthalpy in, chemical release, starter work, outflow enthalpy (nozzle,
roll posts, lift fan), accessory, friction, clutch and radiation losses, dump,
and the stored rotor, solid and manifold energy. `ledger/energy-relative` is
the residual over the sum of the absolute terms; `ledger/mass-relative` the
same for mass. Fuel debited from the tanks is exactly `ledger/fuel-in-kg`:
the engine meters against `FGPropulsion::AvailableFuel()` (the selected feed
tanks of the first priority that has fuel) and the debit is spread over those
tanks without loss.

The read-only mass receipt publishes `ledger/air-in-kg`, `fuel-in-kg`,
`outflow-kg`, `dump-kg`, and signed `manifold-stored-kg`, plus signed
`mass-residual-kg` and the nonnegative `mass-scale-kg`. Independently reconstruct
the residual as manifold storage minus air and fuel in plus outflow and dump.
The normalization divides its absolute value by `max(1e-9, mass-scale-kg)`.
The scale sums inflow, outflow, dump and absolute manifold storage changes
over every substep; with one substep it is the sum of those published terms
(taking the absolute value of storage). With several substeps the signed net
storage may hide opposing changes, so the published scale retains their full
sum. `cumulative-mass-residual-kg` and `cumulative-mass-scale-kg` accumulate these
accepted step receipts only. Repeated reads and zero-time calls add no mass.

## Configuration

All quantities are SI and named with their unit. Absent optional elements keep
the defaults in `TurbinePlant.h`. Tables are one `x y` pair per line.

```xml
<turbine_engine name="...">
  <!-- empirical elements may remain; they are unused when <plant> is present -->
  <augmethod>2</augmethod>          <!-- throttle above 1 is the augmentor demand -->
  <plant name="...">
    <gas-model>thermally-perfect</gas-model>
    <fuel><lower-heating-value-j-kg>43.2e6</lower-heating-value-j-kg></fuel>
    <design>
      <mass-flow-kg-sec>100</mass-flow-kg-sec>   <!-- or <thrust-n> to size the flow -->
      <bypass-ratio>0.6</bypass-ratio>
      <overall-pressure-ratio>25</overall-pressure-ratio> <!-- fan ratio from the mixer balance -->
      <turbine-inlet-temperature-k>1800</turbine-inlet-temperature-k>
      <fan><efficiency>0.86</efficiency></fan>
      <compressor><efficiency>0.86</efficiency></compressor>
      <hp-turbine><efficiency>0.89</efficiency></hp-turbine>
      <lp-turbine><efficiency>0.90</efficiency></lp-turbine>
    </design>
    <lp-shaft><inertia-kg-m2>6</inertia-kg-m2><design-speed-rad-sec>1000</design-speed-rad-sec></lp-shaft>
    <hp-shaft><inertia-kg-m2>2.5</inertia-kg-m2><design-speed-rad-sec>1500</design-speed-rad-sec></hp-shaft>
    <starter>...</starter> <core-fuel>...</core-fuel> <augmentor-fuel>...</augmentor-fuel>
    <core-combustion>...</core-combustion> <augmentor-combustion>...</augmentor-combustion>
    <controller>
      <fan-speed-demand>0 0.55
        1 1.0</fan-speed-demand>
      ...
      <lift-throat-area-factor>1.4</lift-throat-area-factor>   <!-- with a lift system -->
      <lift-split-gain-per-sec>12</lift-split-gain-per-sec>
      <lift-split-washout-per-sec>1</lift-split-washout-per-sec>
      <lift-vane-min>0.4</lift-vane-min>
      <max-n1>1.04</max-n1>
    </controller>
    <solid name="liner">...</solid>
    <lift-system>                     <!-- optional -->
      ...
      <bypass-entry-area-factor>1</bypass-entry-area-factor>
      <bypass-entry-door-full>1</bypass-entry-door-full>
      <clutch-command>fcs/lift-fan-clutch-norm</clutch-command>
      <thrust-split-command>fcs/lift-split</thrust-split-command>
      <door-command>fcs/lift-fan-door-norm</door-command>
      <left-roll-post-command>...</left-roll-post-command>
      <right-roll-post-command>...</right-roll-post-command>
    </lift-system>
    <augment-demand>property</augment-demand>  <!-- optional, overrides augmethod -->
    <throat-area-trim>property</throat-area-trim>  <!-- optional nozzle trim, 0.5..2 -->
    <numerics><algorithm>reduced</algorithm><iteration-cap>24</iteration-cap></numerics>
  </plant>
</turbine_engine>
```

`<plant>` and `<thermal>` are mutually exclusive. The complete element list is
`ReadPlantConfig()` in `plant/TurbinePlantXML.cpp`; `tests/TestTurbinePlant.py`
contains a complete synthetic engine.

## Properties

Under `propulsion/engine[n]/plant/`, all read-only unless marked:

- `nozzle/` gross thrust (lbs and N), mass flow, exit velocity, Mach, static
  pressure and temperature, exit area, regime, choked, throat area, position.
- `lift-fan/`, `roll-post[0]/`, `roll-post[1]/` gross thrust, mass flow, exit
  velocity and temperature; lift-fan speed, shaft power, clutch torque.
- `ram-drag-lbs` (captured air times airspeed, along the free stream; apply it
  as a WIND-frame external force), with its parts `inlet-ram-drag-lbs` and
  `lift-fan/ram-drag-lbs` to apply at each inlet; `captured-air-kg-sec`,
  `net-thrust-lbs`.
- `control/` limiter (0 N1, 1 acceleration, 2 deceleration, 3 N2 max, 4
  turbine-exit temperature, 5 idle, 6 start, 7 off), `split-trim`,
  `split-vane`, and the actuator positions `clutch`, `lift-nozzle`,
  `roll-post[0]`, `roll-post[1]`.
  `throat-command-sq-m` is the controller's throat command after numerical
  nozzle back-off; at zero time it is the unchanged or solved throat area.
- `station/<st2|st21|...|liftfan-exit>/` total temperature and pressure, mass
  flow, fuel-air ratio, unburned fraction.
- `shaft/`, `fuel/`, `combustion/`, `solid/<name>/`, `ledger/`, `numerics/`,
  `events/` as named in `FGTurbinePlant.cpp`.
- `numerics/step-algorithm` is -1 when no step was accepted by the current call,
  including zero-time calls. `step-iterations` and `publication-iterations`
  sum to `iterations` for an attempted transient step; a refresh has only
  publication work. `publication-fallback-reason` uses the same codes as
  `fallback-reason` and records the first publication failure when it was
  retried with the component reference. A failed publication clears `converged`
  and invalidates the current ledger; sequence and accepted time do not advance.
- `settings/` (read-write, validated, applied at the next step): `algorithm`
  (0 component reference, 1 reduced), `iteration-cap` (1..32, default 24),
  `subdivision-cap` (1..16, default 4), `tolerance` (1e-9..1e-3, default 1e-6),
  `closure-budget-bytes` (65536..16 MiB, default 1 MiB; the reduced tables
  take 21 KiB). An invalid value is ignored.
- The throttle is the FCS throttle position (`fcs/throttle-pos-norm[n]`), also
  through set-running: `FGPropulsion::SetEngineRunning` forces its own copy of
  the inputs to full throttle, which a plant engine does not take as a control.
- `state/` (read-write): the full plant state as named numbers, preceded by
  `schema-version` and `config-digest`. Reading gives the accepted state.
  Writing stages a record; writing `state/commit` = 1 restores it after
  checking the schema, the configuration digest and every value, then
  refreshes outputs. `state/commit` reads 1 when accepted, -1 when rejected.
  Commit after the last run_ic: a zero-time call re-solves a running engine's
  steady point.

Legacy names map the same state: `n1`, `n2`, `egt-degc` (a first-order gauge on
station 5), `augmentation` (augmentor fuel is burning), `nozzle-pos-norm`,
`fuel-flow-rate-pps`, `thrust-lbs` (nozzle gross thrust), and
`thermal/nozzle-gas-temperature-k`, `thermal/valid`,
`thermal/afterburner-fuel-flow-kg-sec` (delivered spray),
`thermal/afterburner-burned-fuel-flow-kg-sec`, and for each solid
`thermal/[<name>/]metal-temperature-k`, `metal-temperature-state-k`
(read-write) and `initialized`; the first solid is also the unnamed wall.

`fuel-flow-rate-pps` is the accepted step's mean metered flow in lb/s, or the
steady metered flow on a zero-time call. It is published with the engine
observations even when fuel is frozen; freezing tank debit does not freeze the
flow observer. The separate `fuel-used-lbs` observation accumulates debited fuel.

## Lifecycle

| Operation | Plant |
| --- | --- |
| Load | Derives the design point; an unrealizable design is a load error. Cold state at ambient. |
| ResetToIC | Cold state; solids at ambient but not established. |
| set-running (InitRunning) | Steady running point at the present controls; solids not yet established take their equilibrium there, established or restored solids keep their temperature. |
| run_ic, trim, suspended integration | Steady point for a running eligible engine, otherwise refresh. Solids not yet established follow the local ambient. |
| Time step | Controller, fuel, actuators, flames, coupled solve, ledger, publication. |
| Fuel frozen or trim | Unlimited supply, nothing debited. |
| Starved | Supply zero: metering stops, flames blow out. |
| Seized | HP rotor stops (its energy dissipated), flames quenched, fuel shut. |

## Validation

`utils/turbine_plant/validation.json` freezes the metric definitions and gates.
Results for the synthetic engine (FGTurbinePlantTest): analytical nozzle and
turbomachinery within 1e-8; cold start to augmentor and shutdown at 120 Hz with
per-step energy closure within 1e-5 (worst about 6e-6 on the first step from
rest, cumulative about 1e-9) and mass about 1e-15; augmentor thrust exceeds that
of the same state without augmentor spray by at most the spray's momentum until
fuel burns; changing only selection labels leaves evaluation bit-identical;
the reduced algorithm stays within 1% of design thrust and 5 K of the reference;
60/120/240 Hz stay within 1% of design thrust of a 1920 Hz reference. The
momentum mixer conserves mass, energy and impulse to 1e-9 and raises entropy;
uniform streams mix without loss. A steady start at 1500 m and Mach 0.4
agrees with the settled transient. The thrust split is held to 1e-3 by vanes
with the throat at its minimum, and by the throat with the vanes open; the
steady solve finds the same points, and a cut in the split is taken by the
vanes within 0.5 s. With the LP speed limit, the overspeed of an unloading
lift fan beyond the limit is less than half of that without it.

The synthetic fully converted fixture also holds full demand for 60 seconds
after 0 and both signs of a 0.5% spool-speed perturbation, with the component
and reduced algorithms. Its final 30-second spool ripple is below .001
percentage point, outlet thrust ripple below .01% of design thrust, and final
speeds within .01 percentage point of the steady point; independent per-step
ledger bounds remain 1e-5 energy and 1e-6 mass. This synthetic point is N2
limited; it is a controller regression, not F135 or free-flight qualification.

## Limits

- The controller samples once per accepted step from the previous step's
  sensors; its error is first order in the step.
- Solids use an explicit step at the step-start temperature: energy-consistent,
  conditionally stable (stable when the step is small against capacity over
  conductance, true for realistic solids at 120 Hz).
- No volume dynamics, no surge or rotating stall dynamics, no natural
  convection at rest, no dissociation. Maps are surrogates; a configured engine
  is a calibrated approximation, never a measured one.
- The lift-system control (vanes, throat trim, LP limit) and the bypass entry
  surrogate are representative, not a published FADEC. The N2 limit shares the
  governor's integrator; `max-n2-gain` much above 10 limit-cycles against the
  N1 loop.
- The nozzle back-off has no native test: no synthetic configuration reaches
  a nozzle command without a gas-path solution.
