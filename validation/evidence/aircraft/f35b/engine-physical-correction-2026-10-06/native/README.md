# Native F135 thermal accounting evidence

The [local acceptance record](acceptance.json) qualifies the installed
`@felipegalind0/jsbsim@1.2.4-fork.16` artifact from clean JSBSim commit
`97fe6ddf1c8a7d9e10dad46a88e60e79e69fae28`. Native source changes add read-only
signed heat accounting; the existing thermal solve, F135 XML coefficients and
thrust/fuel/spool/EGT/nozzle laws remain unchanged. The
[SDK adoption record](../../../../jsbsim/adoption/fork16-adoption.json) retains
25 native thermal methods, five related turbine targets, 52 SDK cases, 59
identity cases, installed-file verification and the native property contract.
Application checks and the broader correction's scope are recorded separately
in the [combined acceptance](../acceptance.json).

## Traces and numerical checks

- [Report](report.json) and [CSV](trace.csv): 133,577 accepted native steps,
  with 4,750 sampled/boundary rows. Every accepted step is audited; the CSV is
  decimated to a nominal quarter-second spacing and must not be integrated as
  though it contains every heat receipt.
- [Thermal cycle](thermal-cycle.svg): true cold stopped start, idle, 99% dry,
  conventional AB, 99% dry, shutdown and residual cooling.
- [Startup paths](startup-paths.svg): independent cold start, explicit
  already-running equilibrium initialization and retained hot restart.
- [Signed heat balance](heat-balance.svg): separately integrated gas, coolant,
  surroundings and flame transfers compared with solid stored-energy change.
- [Timestep convergence](cooldown-convergence.svg): actual F135 cooling at
  30/60/120/240 Hz compared with an independent explicit RK4 reference, itself
  refined from 1,920 to 3,840 Hz. After 30 s, 240 Hz errors are 0.00370 K for
  the liner and 0.00792 K for the core.

Maximum per-step residual is 2.733e-9 J; independently reconstructed heat rates
agree within 5.821e-11 W. Cold-cycle accumulated residuals are +6.445e-7 J
liner and -5.442e-7 J core. PNG counterparts accompany each SVG, with
[plot provenance](plot-provenance.json) and [Matplotlib dependencies](plot-toolchain.txt).
These are scientific plots of native data, not rendered engine images.

The cold trace reaches Running at 32.52 s, 27.52 s after starter engagement,
with core/liner temperatures 509.76/340.41 K. An additional 60 s at idle gives
622.25/460.10 K. The already-running shortcut instead seeds 622.28/470.25 K,
recording approximately 601,429 J core and 2,185,153 J liner as externally
assigned initial energy, with zero first-step integrated transient heat.
Construction defaults of 288.15 K and the cold first-step atmospheric refresh
to 286.50 K are both retained. A normal hot restart preserves established heat
instead of seeding a new equilibrium.

Lifecycle checks cover repeated reads, hold, suspended integration, zero-time
RunIC, the running shortcut on established state, application snapshot/restore,
stopped-hot hold-down Location relocation and subsequent continuity. A raw
native reset explicitly returns to cold/uninitialized state; recovery and
Location restore the intended retained solid states. Every powered-lift fixed
step keeps AB inhibited.

## What is modeled and what remains uncertain

The [thermal audit](thermal-audit.json) records units, equations, coefficients,
initialization and energy boundaries. Each solid's signed rates are positive
into that solid. Native receipts use the backward-Euler endpoint quadrature;
only the validation tool accumulates them across all accepted steps. Hold can
leave the previous cached receipt visible, so repeated reads do not represent
additional heat.

Gas, coolant and surroundings are imposed reservoirs. The two solids exchange
no direct heat with one another, and their heat is not subtracted from gas or
fuel energy. Native radiative exchange is already included in the wall balance;
optical power diagnostics are observers, not additional thermal losses. The
local balance does not establish global engine conservation.

Core 1,800 J/K and liner 12,000 J/K are provisional effective capacities,
unrelated to rendered shell volumes, nominal visual mass or a measured alloy
specific heat. The [108 sensitivity cases](sensitivity.json), also available
as [CSV](sensitivity.csv), vary one parameter at a time: capacity, conductance,
area and coolant-rise factors, bolometric emissivity, gas bath and flame
emissivity. These stress brackets are not confidence intervals or proposed
retuning. No measured F135 temperature or radiance calibration is claimed.

## Optical observations and frozen qualification

The trace contains absolute solid-emission observations and gas-source bounds
from actual native temperature, fuel/staging and nozzle state. Display defaults
are recorded separately; this headless native experiment has no scene exposure
or renderer. No display input affects native state or physical source power.

The original [helper bundle](qualification-helpers.mjs.txt) and
[entry](qualification-helpers.ts.txt) are retained as text evidence. Later shared
interpolation and fixed geometry metadata changes were checked by
[offline optical recomputation](optical-recheck.json), using the final source
hashes. All 4,750 output rows remained byte-for-byte identical and every native
column was preserved. No thermal steps were rerun. The
[earlier optical recheck](optical-recheck-before-final-geometry.json) remains
retained as well.

Runnable tools live in `scripts/validation/f35b/`: use
`check-f135-physical-thermal.mjs` for native scenarios,
`analyze-f135-thermal-uncertainty.mjs --report=<report.json>` for sensitivities,
`plot-f135-physical-thermal.mjs --report=<report.json> --python=<Matplotlib-enabled Python>`
for plots, and `recompute-f135-trace-optics.mjs --trace=<trace.csv>` for optical
reevaluation. Each defaults to a new dated output directory under `build/`.
No browser, GPU, appearance or performance qualification is included here.
