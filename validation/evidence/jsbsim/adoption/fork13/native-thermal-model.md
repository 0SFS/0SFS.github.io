# Optional turbine thermal model

`FGTurbine` owns this opt-in model. An engine without `<thermal>` retains its
existing behavior and has no thermal properties. The extension observes current
native fuel and augmentation; it does not change thrust, fuel, spool, EGT or
nozzle calculations. It is an effective thermal lump, not a cycle or combustion
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

Reads do not advance state. Zero-time RunIC and artificial positive-time trim
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
Consumers should gate wall observations by both `valid` and `initialized`.

`FGTurbineTemperatureTest` covers native observer access, legacy equivalence,
analytic timestep convergence, energy residual, large-step bounds, radiation,
heat capacity, augmentation partition/oxygen limit, dynamic invalid inputs and
cold/warm/trim/reset/state restoration. These establish software behavior only.
