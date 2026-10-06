# Native exhaust contract audit

This audit recommends **no native code, aircraft XML or SDK change** for this
correction. The installed fork.16 implements its declared thermal equations;
the optical consumer assigned more station meaning to the gas observation than
the native model provides. Removing the consumer's assumed expansion is justified.
It does not establish a measured replacement exit or particle temperature.

The [report](report.json) independently reconstructs all **4,171 retained samples**
from the preceding 82,925-step native experiment. Maximum gas-temperature
difference is **1.14e-13 K** and maximum burned-AB-fuel difference is
**2.67e-15 kg/s**. This pass uses the retained observations; it does not rerun
JSBSim. Exact native/app sources, catalog, preceding optical profile and producer
are frozen alongside the report. The canonical native checkout remained clean at
`97fe6ddf1c8a7d9e10dad46a88e60e79e69fae28`.

## What the temperature means

`propulsion/engine[0]/thermal/nozzle-gas-temperature-k` is a cached Kelvin
**imposed gas-bath enthalpy-mixture proxy**. “Nozzle” in the property name does
not identify a calibrated static or total station. See `UpdateThermal()` in the
[native source](0-native-FGTurbine.cpp.txt) and its
[model contract](2-native-turbine-thermal-model.md.txt).

The F135 declares no `base-gas-temperature-k`, so its base is legacy EGT + 273.15.
Normal running EGT is `TAT_C + 363.1 + 357.1 × N2norm`, where
`N2norm = (N2−IdleN2)/(MaxN2−IdleN2)`. Startup/shutdown seek their existing EGT
targets; running EGT itself is algebraic. The thermal gas observer adds no gas
time constant or inventory:

```
Tgas = 298.15 + [mg cp (Tbase−298.15) + η mburned LHV] / [(mg+msupplied) cp]
```

Here `mg` is the authored incoming dry-gas flow, `msupplied` is estimated excess
burner fuel while augmentation is active, and `mburned` is its remaining-oxygen
capacity limit. Fuel sensible enthalpy and dissociation are omitted. No velocity,
kinetic-energy conversion, pressure-work solution, compressor/turbine map, lift-fan
shaft power or nozzle area appears in this equation. Solid heat losses do not
deplete its imposed reservoir. Its local enthalpy accounting is therefore not a
whole-engine energy balance.

The old renderer's `Tstatic=Tstation/[1+(γ−1)M²/2]` is a valid ideal-gas relation
**when the input is established total temperature and the Mach is established**.
Neither prerequisite follows from this observer. The native code contains no
nozzle expansion, so “double expansion” is not a demonstrated native fact; the
demonstrated error is an unsupported station assignment and mode-selected Mach.
[NASA's isentropic equations](https://www.grc.nasa.gov/www/k-12/airplane/isentrop.html)
also show that area ratio alone has subsonic and supersonic branches.

The smallest active optical contract is:

> Use the valid native imposed gas-bath proxy as the declared local particle-bath
> hypothesis, without a further expansion transform. It is not a measured nozzle
> exit static temperature, total temperature, or particle temperature.

Ambient mixing and particle thermal equilibrium remain separately stated optical
approximations. Removing the transform does not validate their coefficients or
prove the dry luminous-exhaust reference has been matched. Keep persistent solid
temperatures and all native baths, state restoration and accepted-time integration
unchanged.

## Mode-only changes versus native changes

| Case | Native gas proxy K | Old assumed Mach | Old optical temperature K |
| --- | ---: | ---: | ---: |
| Idle | 649.60 | 0.8 | 587.55 |
| 99% dry | 1003.13 | 0.8 | 907.32 |
| First AB step, zero supplied/burned AB fuel | 1004.76 | 1.1 | 837.55 |
| AB +0.233 s | 1034.45 | 1.1 | 862.29 |
| Sustained AB | 2363.10 | 1.1 | 1969.83 |
| Dry powered lift | 1003.13 | 0.8 | 907.32 |

Holding the native input exactly at **1003.128 K**, with zero AB excess fuel,
and changing only the old optical AB flag produces **−71.132 K**. That artificial
continuum cooling is independent of engine dynamics. The same flag selected
particle extinction 0.025/0.08 m⁻¹ and fuel-power caps 0.3%/1.5%; removing only
the temperature jump would not remove all mode-selected optical assumptions.
Actual native fuel, gas temperature and nozzle position can legitimately change
with engine state and should not be smoothed by an arbitrary render timer.

The native wall model separately enables its configured effective grey flame
exchange when augmentation is active. At the frozen dry state its extra signed
wall input would be about **2.32 kW**. This is an existing internal wall-bath
assumption, not an exterior light source, excited-species population or proof of
chemical reaction. It remains unchanged in this correction. The core region has
no configured flame term.

At AB cutoff the native supplied/burned AB estimates become zero immediately,
even while total fuel flow winds down. Gas returns algebraically to the dry base;
hot solids retain energy. This is a known reduced-model limitation: no native
downstream transport inventory exists. A render fade would not repair it.

## Available state cannot close a nozzle or chemistry solution

The [actual property inventory](7-app-property-catalog.txt.txt) contains the gas
proxy, legacy EGT, total/supplied/burned fuel observations, spool, augmentation,
nozzle display position, forces and separate solid heat balances. It contains no
reaction-rate, excited-species concentration, quenching/lifetime, soot population,
particle temperature, calibrated exhaust pressure or residence-time observation.
The reported burned fuel is an upstream thermal partition estimate. It is not
an exterior chemical-emission allocation. [NASA's afterburner description](https://www.grc.nasa.gov/www/k-12/airplane/turbab.html)
places its fuel addition and burning inside the aft engine duct; an exterior
reaction zone requires independent evidence.

Important apparent substitutes do not supply those missing quantities:

- `propulsion/pt-lbs_sqft` and `tat-c` are incoming aircraft total conditions,
  not nozzle-inlet conditions. In this stationary stand total/static ambient
  coincide; in flight they do not.
- The F135 flow formula is an authored `120 × (N2/100)² × inlet pressure ratio /
  sqrt(inlet temperature ratio)` kg/s, not flow solved from nozzle choking.
- Native `nozzle-pos-norm` is expressly a display schedule; current rendered
  throat/exit areas are visual geometry, not native flow areas.
- Private EPR is set from `1 + dry thrust/MilThrust`, not a nozzle pressure
  measurement. Bleed is a thrust-loss factor; bypass ratio only affects an
  acceleration estimate. See the [native header](1-native-FGTurbine.h.txt).
- Force divided by mass flow cannot uniquely recover exit velocity without
  the pressure-area term and ram drag. [NASA's thrust equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/thrust-force/)
  retains both effects.

The report includes a deliberately **conditional**, unqualified calculation
combining the old assumed Mach/gamma, native effective cp, authored visual exit
area and scheduled flow. Ideal continuity would imply exit/ambient pressure
ratios about **0.188 at idle**, **1.286 dry**, and **0.733 sustained AB**. These
are not native observations or a nozzle solution. They demonstrate that combining
those independent assumptions does not establish ambient-matched expansion;
unknown backpressure, choking and off-design behavior cannot be skipped.

## Dry STOVL coupling gap

At equal N2 and inlet TAT, the current conventional dry and converted dry gas
proxy is identical. The recorded fuel flows differ, **2.90262 versus 4.42005 kg/s**,
because conversion scales the main-engine TSFC and rear-thrust tables. Auxiliary
engine instances distribute force without separate fuel consumption. No energy
balance transfers shaft work to the fan or diverts bypass enthalpy to roll posts.

Rolls-Royce describes **29,000 hp** transmitted to the LiftFan through its drive
system, approximately **21.63 MW**. This establishes the importance of shaft work,
not a measured value at this simulation point. [Manufacturer description](https://www.rolls-royce.com/media/our-stories/innovation/2016/liftsystem.aspx/1000).
Dividing that rating by this model's dry flow and cp gives about **162 K** as a
dimensional scale only. Subtracting it from today's unidentified gas station
would be unjustified and might count extraction twice relative to the existing
force surrogate.

Lockheed engineer Renshaw's nozzle history explains that exit-area/backpressure
control was critical to making the shaft-driven lift-fan turbine work, and that
AB is not used in X-35B/F-35B hover. The current display-area schedule does not
model that coupling. [Primary nozzle history](https://www.codeonemagazine.com/c5_article.html?item_id=137).
Neither statement determines the real dry particle temperature or explains the
naval footage quantitatively. Keep the operational hover inhibit and preserve
the unresolved external luminous region and deck patch as acceptance constraints.

## Smallest future native flow extension, if data becomes available

Use named boundaries: LP-turbine discharge, bypass mixing plane, augmentor outlet /
nozzle inlet, throat and exit. Each needs an explicit static/total convention.
A useful reduced native nozzle module needs total enthalpy/temperature and total
pressure at its inlet, gas composition/effective properties, physical flow area,
ambient backpressure and a compatible mass-flow boundary. An ideal nozzle
uses `ht = h + V²/2` and `mdot = rho V A`; choking and pressure select the branch.
Do not independently prescribe all of mass flow, inlet pressure and area without
checking compatibility. [NASA T-MATS component treatment](https://ntrs.nasa.gov/api/citations/20150000150/downloads/20150000150.pdf),
sections II.A.6–8, connects nozzle pressure/enthalpy, flow and shaft components.

STOVL additionally needs fan shaft power and bleed/mixing mass-energy paths at
their actual boundaries. Upstream fuel heat, turbine work, losses and downstream
enthalpy must share one accounting scheme; adding shaft extraction below an
already post-turbine station is incorrect. A stateful transport extension also
needs control-volume mass/energy/species inventories and fixed-step persistence.
This cannot be obtained by exporting existing variables under new station names.
No such native implementation is proposed without its missing inputs.

Reproduce this audit with:

```sh
node scripts/validation/f35b/audit-f135-native-exhaust-contract.mjs
```

It defaults to a new dated `build/` directory. The [executed producer](qualification-audit-script.mjs.txt)
and [run log](run.log) are retained. No native suite, WASM build, browser, server,
GPU run or performance measurement was performed. Numerical reconstruction
qualifies this audit's equations only; the appearance objective remains open.
