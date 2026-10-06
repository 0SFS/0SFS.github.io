# Optional turbine thermal model

`FGTurbine` owns this opt-in model. An engine without `<thermal>` retains its
existing behavior and has no thermal properties. The extension observes current
native fuel and augmentation; it does not change thrust, fuel, spool, EGT or
nozzle calculations. It is a set of independent effective thermal regions, not a cycle or combustion
chemistry solver. Engine authors must supply appropriate data and uncertainty.

## Configuration

Each field accepts a literal number or an unnamed nested `<function>` using
normal JSBSim expressions. `#` in function property paths resolves to the engine
index. Units are fixed SI as named below; no unit conversion is implicit.

| Required field | Unit/domain |
| --- | --- |
| `gas-mass-flow-kg-sec` | Incoming dry exhaust kg/s, finite nonnegative |
| `gas-specific-heat-j-kg-k` | Effective constant J/(kg K), positive |
| `fuel-heating-value-j-kg` | J/kg, positive |
| `afterburner-efficiency` | Fraction 0–1 |
| `wall-heat-capacity-j-k` | Effective J/K, positive |
| `gas-conductance-w-k` | W/K, nonnegative |
| `coolant-conductance-w-k` | W/K, nonnegative |
| `radiation-area-sq-m` | Surface/view area m², nonnegative |
| `emissivity` | Effective bolometric fraction 0–1 |

Optional `base-gas-temperature-k` defaults to existing EGT + 273.15.
`coolant-temperature-k` and `surroundings-temperature-k` default to TAT + 273.15.
All temperatures must be finite positive Kelvin. Optional
`initial-metal-temperature-k` sets only the first explicit warm initialization;
otherwise that initialization uses thermal equilibrium. Optional
`flame-radiation-area-sq-m` and `flame-emissivity` default to zero and describe
effective incident grey radiation while actual augmentation is active. They do
not assert that transparent gas is a blackbody or define visible emissivity.

Optional positive `stoichiometric-fuel-air-ratio` limits added heat by declared
remaining fuel-burning capacity. Omission leaves combustion unconstrained;
there is no implicit universal fuel chemistry. Invalid constant parameters
reject model loading before engine property bindings. Invalid dynamic values
clear `valid`, publish NaN gas temperature and retain the last wall state.

### Optional additional solid regions

The original flat wall fields and property paths retain their meaning. Each
optional `<solid-region name="core">` inside `<thermal>` adds another independent
solid using the same required wall capacity, gas/coolant conductance, radiation
area and emissivity fields. Each accepts its own optional coolant, surroundings,
initial temperature and flame-radiation fields. Names are unique within the
engine and contain only lowercase ASCII letters, digits and hyphens.

An optional `gas-temperature-k` on either the original wall or an additional
solid selects that solid's gas bath. Omission uses the downstream nozzle gas
energy balance. A core-facing solid upstream of the afterburner can explicitly
use EGT + 273.15, avoiding an unphysical response to downstream heat addition.
This is a declared bath estimate, not a new measured station temperature.

Every region has independent native state and warm/cold initialization. They
exchange heat with declared baths, not directly with one another. All parameter
functions are evaluated once per calculation. Invalid input in any region clears
the shared `valid` flag and preserves every solid; candidate states are committed
only after all regions validate. Storage is allocated once during engine load.
No solid-region element means exactly the original single-wall model.

## Balance and limitations

During actual augmentation, supplied burner fuel is the positive excess of
current native total fuel above dry demand (`max(idleFuel, dryThrust * TSFC)`).
This partition is an estimate, particularly during native fuel transients, not
a separate fuel sensor. The dry demand is sampled at the current operating
point; opt-in augmented operation evaluates TSFC without changing the native
fuel calculation. A stochastic TSFC expression therefore has an additional
evaluation while the observer is enabled.

With the optional stoichiometric ratio `s`, incoming air is estimated as
`max(incomingGas - coreFuel, 0)` and burned burner fuel is bounded by
`max(s * air - coreFuel, 0)`. All supplied fuel mass, including unburned excess,
remains in the outgoing mass denominator. No fuel is removed from the native
engine. This simple capacity limit assumes core fuel burns completely and is
not an oxygen species or dissociation model.

Using effective constant specific heat `cp` and enthalpy reference 298.15 K:

```
Tgas = 298.15 + [mg * cp * (Tbase - 298.15) + eta * mburned * LHV]
                  / [(mg + msupplied) * cp]
```

Fuel sensible enthalpy, separate fuel/gas heat capacities and dissociation are
neglected. Zero dry flow with active augmentation is invalid rather than a
division or invented flame temperature. Without augmentation the base gas
schedule passes through, including its existing startup/trim discontinuities.

The wall balance is
`C dTw/dt = Hg(Tgas-Tw) + Hc(Tcoolant-Tw) + sigma*epsilon*A(Tsur^4-Tw^4)`
plus optional `sigma*epsilonFlame*AFlame(Tgas^4-Tw^4)` during augmentation.
`sigma = 5.670374419e-8 W/(m² K⁴)`. A monotone bounded backward-Euler scalar
solve integrates only accepted positive-time, non-trim native calculations.
Temperatures stay inside the previous-state/bath bracket, including large
timesteps. A hot wall may continue heating after shutdown if its gas bath is
still hotter. This lump does not model spatial gradients, film-flow transport,
stress, metal failure or optical gas composition.

## Properties and lifecycle

All paths are under `propulsion/engine[n]/thermal/`:

| Property | Access/meaning |
| --- | --- |
| `nozzle-gas-temperature-k` | R, cached Kelvin gas estimate |
| `metal-temperature-k` | R, persistent Kelvin wall state |
| `metal-temperature-state-k` | RW, exact wall state for validated restoration |
| `initialized` | R, wall has accepted initialization/restoration |
| `valid` | R, current inputs/numerics valid; not calibration evidence |
| `afterburner-fuel-flow-kg-sec` | R, supplied excess burner fuel |
| `afterburner-burned-fuel-flow-kg-sec` | R, heat-releasing burner fuel |

Reads do not advance state. Executive integration suspension takes precedence
over a stale positive engine-input timestep (including InitRunning). Zero-time
RunIC and artificial positive-time trim
search do not initialize or age the wall. Explicit `InitRunning` on a new state
marks warm initialization pending; the first real step uses final operating
inputs to seed equilibrium or the declared initial temperature. Ordinary cold
startup heats gradually and is not seeded merely because Running becomes true.
The first accepted cold step takes its ambient from current initial conditions,
which may differ from construction atmosphere.

`ResetToIC` explicitly resets cold and uninitialized. To preserve warm hardware
across same-flight recovery, capture initialized wall state and restore the RW
property immediately after reset, before RunIC/InitRunning. Its setter accepts
finite positive Kelvin, establishes initialization and cancels pending warm
seeding; rejected values leave state unchanged. Gas is algebraic and refreshes
from the next evaluation. Repeated InitRunning on established state retains it.
Additional regions publish the same three solid-specific properties beneath
`thermal/<name>/`: read-only `metal-temperature-k`, read/write
`metal-temperature-state-k`, and read-only `initialized`. Capture and restore
each initialized solid independently; restoring one never initializes or
reseeds another. The original properties still refer only to the original wall.
Consumers should gate each solid by shared `valid` and its own `initialized`.

## Signed local heat accounting

Each solid publishes the following additional read-only fields under its existing
prefix (`thermal/` for the original wall, `thermal/<name>/` for another region):

| Field | Unit and meaning |
| --- | --- |
| `gas-bath-temperature-k`, `coolant-bath-temperature-k`, `surroundings-bath-temperature-k` | K, evaluated imposed bath inputs |
| `heat-capacity-j-k` | J/K, effective capacity evaluated for this calculation |
| `gas-heat-flow-w` | W, `Hg*(Tgas - Tsolid)` |
| `coolant-heat-flow-w` | W, `Hc*(Tcoolant - Tsolid)` |
| `surroundings-radiation-heat-flow-w` | W, `sigma*epsilon*A*(Tsur^4 - Tsolid^4)` |
| `flame-radiation-heat-flow-w` | W, optional `sigma*epsilonFlame*AFlame*(Tgas^4 - Tsolid^4)` while actually augmented, otherwise zero |
| `net-heat-flow-w` | W, sum of the four signed rates, positive into the solid |
| `step-seconds` | s, interval integrated by this calculation, zero for initialization/non-integration |
| `step-stored-energy-j` | J, `Cstep*(Tnew - Tprevious)` during a transient step |
| `step-heat-transfer-j` | J, `step-seconds * net-heat-flow-w`, backward-Euler endpoint quadrature |
| `step-energy-residual-j` | J, stored change minus integrated heat |
| `initialization-energy-j` | J, externally assigned initial stored-energy change; never counted as integrated heat |
| `heat-balance-valid` | True only for an accepted transient heat integration step |

The four heat rates use the native solver's endpoint temperature and the same
once-evaluated inputs used in that solve. They are not extra sources fed back
into the solver. Dynamic coolant conductance is an effective heat-transfer term;
no distinct inter-region conduction, coolant mass-flow state, fuel sensible heat,
dissociation or finite gas-reservoir depletion is added by these diagnostics.

Warm `InitRunning` first seeds equilibrium or a declared initial temperature.
That potentially large change is external initial energy, not a simulated cold
start. A genuinely cold first step can likewise refresh construction atmosphere;
that refresh is recorded separately from subsequent integrated heat. Both keep
existing initialization semantics. An explicit state restoration establishes a
new initial condition and clears diagnostics, without creating a heat pulse.

Non-integrating engine calculations publish instantaneous rates but zero step
energy and false `heat-balance-valid`. Reads do not calculate or transfer heat.
Executive hold may skip engine calculation entirely, leaving the last cached
receipt visible: consumers must accumulate receipts only when native simulation
time advances, never on repeated reads or renderer frames. Invalid inputs clear
all diagnostic receipts and retain all physical solid temperatures atomically.

For constant capacity, `C*(Tend - Tstart)` equals the sum of transient heat
receipts up to the recorded numerical residual (plus separately assigned initial
energy where applicable). When an engine supplies a dynamic capacity function,
the model freezes its effective C once per step; it does not integrate a
material-specific `C(T)` enthalpy law. The receipt is then the local discrete
model's storage term, not proof of an exact temperature-dependent material energy
function. F135's two declared capacities are constants.

Gas/coolant/surroundings temperatures are prescribed reservoirs. Solid energy is
not subtracted from their enthalpy or from native fuel consumption. The optional
AB gas energy estimate remains independent. Thus these local wall balances do
not assert conservation of the entire engine, nor license counting the same
fuel/gas energy again as a closed global budget.

`FGTurbineTemperatureTest` covers native observer access, legacy equivalence,
analytic timestep convergence, energy residual, large-step bounds, radiation,
heat capacity, augmentation partition/oxygen limit, dynamic invalid inputs and
cold/warm/trim/reset/state restoration. Additional tests cover independent
indexed regions, preserved suspension/trim/reset restoration, afterburner bath
isolation, atomic invalid-input retention, and safe name/config rejection.
Signed-accounting cases independently reconstruct all four heat terms, verify
read-only indexed properties, separate initialization/restoration from heat,
check invalid-input atomicity, and compare integrated energy/timestep convergence
with a closed-form linear heat-balance solution. These establish software
behavior only.
