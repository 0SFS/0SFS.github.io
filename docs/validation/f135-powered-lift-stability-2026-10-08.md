# F135 powered-lift stability and available lift — 2026-10-08

Execution record for the [powered-lift assignment](../f135-powered-lift-stability-prompt.md).
0sfs owns the aircraft fixtures, force audit and optical handoff. JSBSim owns
the corrected native observations and their SDK distribution.

## Result and scope

**The reported sustained full-conversion 92–107% cycle remains unreproduced.**
The original user flight/settings were unavailable. These are declared fixtures,
not a capture of that session. No controller gain, limiter, bypass surrogate,
aircraft weight, force scaling or optical brightness was tuned to conceal it.

Two independently reproduced native observation defects were corrected:

1. With fuel frozen, accepted plant fuel flow reached the native PPH observation,
   while PPS stayed zero or stale because the tank-debit path was skipped. The
   optical adapter's engine-running gate consequently rejected a burning engine.
2. Reduced integration followed by component end-state publication did not report
   that publication fallback accurately. Refresh observations and failed publication
   could also leave stale algorithm status or omit attempted work.

The changes improve what is observed; they do not establish the cause of the
user's flight instability. The installed correction is fork.21, native/SDK commit
`34eeae66e5c886eec59eaefb516c0848cb504756`, locally committed and not pushed.
The [adoption receipt](../../validation/evidence/jsbsim/adoption/fork21/adoption.json)
and [native contract](../../validation/evidence/jsbsim/adoption/fork21/native-model-contract.md)
retain identities and checks. The source equations, gains, retry order, budgets,
F135 XML, FCS and thermal/optical/audio models are unchanged.

## Identities and reproduction

Entry app HEAD was `3334758682d9852eaac916ea29bb8de4cf8e41ad` in a working
tree with concurrent Engine-tab and phone changes. Entry fork.20 source was
`ea6956b4e9f9bddc04ef22863190ab1a8101e0f8`. The evidence reports include the
executed app-bundle and each input hash; HEAD alone is not a working-tree identity.

| Input/output | SHA-256 |
| --- | --- |
| Installed fork.21 tarball | `001d66fcbd96a828f7bbb11af137d2a655edf83c21a2757ce17c02f4c8c05cdd` |
| Installed fork.21 WASM | `5eb6d42646533da2b900977fa89eca59e199b88372906a70134e8b4441e875d1` |
| Fork.21 native content | `6a8c6adf5d0b48f4f95ad65bd512cd664adaf7ece8207cecfaa57a4934d792ca` |
| F-35B XML, before and after | `f04735c23e22eb78a9c77cded49be6e46975695b28140e3bfead8adb3a50b2f1` |
| F135 XML, before and after | `2aa795c549dcf2e410c7b7a233c9c32af94e2cf6a2c439637edfc5e599fe2101` |
| Installed data manifest, before and after | `35c59594902cba731702fac63bcccf64ffcad8283aabb5daea23598abf8c03be` |

Runnable sources:

```sh
node scripts/validation/f35b/check-f135-powered-lift.mjs --cases=steady-1,idle-entry,steady-hot --algorithm=reduced --hz=120
node scripts/validation/f35b/check-f135-powered-lift.mjs --cases=steady-1,idle-entry,steady-hot --algorithm=component --hz=120
node scripts/validation/f35b/analyze-powered-lift.mjs <report.json> [<report.json> ...]
node scripts/validation/f35b/replay-powered-lift-optics.mjs --trace=<trace.csv.gz> --sample-seconds=0
```

Scripts create dated `build/` directories. Distributed receipts live in
[the retained evidence directory](../../validation/evidence/aircraft/f35b/powered-lift-stability-2026-10-08/README.md).
All retained physics channels can be restored from the lossless archives there;
no per-step downsampling is used. The 25 trace archives (`physics/*/*.f64-delta.br`,
235 MB) are gitignored and kept only on the machine that recorded them; the reports,
manifests and `physics/index.json` in the repository keep their hashes. Earlier runner revisions were not snapshotted,
so their input hashes and executed bundles are retained without claiming that
today's runner bytes reproduce those older receipts exactly.

## Declared conditions and gates

The normal fixture is clean stores, 32,000 lb authored empty weight plus 5,000 lb
fuel, zero initial speed/wind, level attitude, normal aircraft FCS, neutral controls,
ISA, 5,000 ft and full physical conversion. Command 1.0 means the full requested
lever; the existing positive-conversion FCS reheat inhibit clamps native throttle
position to .99. This interlock is recorded and preserved, not bypassed for testing. The sea-level hot/cold variants use
ISA ±30 K. Held fixtures use native hold-down and explicitly frozen tank fuel.
They qualify engine behavior at fixed conditions, **not measured hover acceleration**.
Free fixtures burn fuel unless `fixedFuel: true` is declared.

The sustained gates were declared before correction: 20 s settling allowance,
60 s observation after it, N1/N2 span ≤1 percentage point, outlet force-sum span
≤2% of mean, no rejected attempts, no reheat burning and independent accepted-step
energy ≤1e-5 / mass ≤1e-6. These are engineering gates, not manufacturer criteria.
Every native attempt plus the initialized sample is retained for the complete 80 s.
The idle-entry command occurs at 2 s; its 20–80 s tail supplies 60 s after transition.
The earliest bounded suffix is reported separately, so a transient is not erased
by choosing a later averaging window. Drift, ordinary/detrended RMS and crossing
period candidates are in the analysis; tiny numerical crossing periods are not
evidence of a physical controller cycle.

Coverage includes .98/.99/1.0, zero-time equilibrium followed by integration,
dynamic idle-to-full conversion, ±1% state spool perturbations, both algorithms,
60/120/240 Hz, sea-level/5,000-ft/cold/hot, full-conversion wind at 60 kt,
free entry/climb/descent/ground contact, attached stores and fuel load variants.
The 0/.01/.10/.25/.5/.75/1 conversion sweep remains separate from full-conversion
qualification. A synthetic native full-demand fixture runs 60 s with both
algorithms and perturbations; it verifies the declared generic plant, not F135
identification. Held F135 fixtures keep the real FCS split, which is effectively
constant with controlled attitude; no diagnostic override enters production.

## Stability and competing explanations

The [post-correction force/stability analysis](../../validation/evidence/aircraft/f35b/powered-lift-stability-2026-10-08/after-analysis.json)
and [component analysis](../../validation/evidence/aircraft/f35b/powered-lift-stability-2026-10-08/component-analysis.json)
show no sustained full-conversion cycle in the admitted held cases.

| Fork.21 reduced fixture, 20–80 s | Mean N1 / N2 (%) | N1 / N2 span (percentage points) | Total gross force span (lbf) |
| --- | --- | --- | --- |
| Initialized, 5,000 ft ISA | 98.26649 / 106.03442 | 0.00000692 / 0.00001215 | 0.00764 |
| Idle-entry, 5,000 ft ISA | 98.26664 / 106.03738 | 0.001351 / 0.010321 | 1.54291 |
| Initialized, sea-level ISA | 98.85986 / 107.00000 | 0.0001665 / 0.0000405 | 0.09460 |
| Initialized, sea-level ISA+30 K | 91.74833 / 107.00000 | 0.0001426 / 0.0000117 | 0.05348 |

Idle-entry meets its suffix envelope from 9.8 s, or 7.8 s after the command.
Its tail RMS is 0.000162 percentage points N1, 0.002814 N2 and 0.20198 lbf
gross force. The ±1% perturbations meet the envelope from 0.325 / 0.050 s and
return near the initialized sea-level point. Corrected-spool demand is not the
same quantity as physical spool speed; hot-day N1 near 92% with physical N2 at
107% is a stable active-limit operating point here, not two channels oscillating
between those endpoints.

The declared physical N2 limiter governs the hot sea-level fixture and reduces
available lift. Fuel/limiter/throat/split/vane observations settle together rather
than sustaining a large cycle. No numerical rejection/frozen accepted state or
fallback explains these fixtures. Reduced and component share the controller
and physical assumptions; their agreement cannot validate those assumptions.
The [comparison receipt](../../validation/evidence/aircraft/f35b/powered-lift-stability-2026-10-08/comparison.json)
keeps matched before/after, algorithm and refinement differences, including
transient and sustained windows rather than steady endpoints alone. All 60
shared selected physical channels match fork.20 and fork.21 exactly across
9,601 samples in the steady, idle-entry and hot reduced fixtures. Reduced versus
component at 120 Hz differs in the tail by at most 0.00002826 percentage points
N1, 0.00003119 N2, 0.024269 lbf gross and 0.001841 K T4.

The first refinement runs changed `setDt` after model loading; native FCS
components had cached 120 Hz at construction. Actual conversion then took
5 / 2.5 / 1.25 s at 60 / 120 / 240 Hz. Those transient differences are
input-trajectory-confounded and are not admitted as plant convergence evidence.
The runner now sets the rate before model loading and checks actual full-conversion
time against the authored 0.4/s actuator. The
[corrected refinement analysis](../../validation/evidence/aircraft/f35b/powered-lift-stability-2026-10-08/refinement-analysis.json)
retains matching 2.5 s conversion travel at all rates; actual position differences
are at most 1.33e-14. On a shared time grid, reduced 60→120 / 120→240 Hz
entry startup differences shrink from 0.58491 to 0.36657 percentage points N1,
0.53280 to 0.34704 N2 and 218.20 to 161.36 lbf gross. Tail force differences
are only 0.03300 / 0.02188 lbf. Component 120→240 Hz is similarly bounded.
Station-4 startup differences shrink from 18.17 to 11.49 K; those transients
are not fully converged temperature observations. The error ratios establish
neither first- nor second-order convergence. The supported claims are shrinking
startup errors and reproducible, stable equilibria, not exact transient identity.
All earlier confounded receipts remain labeled.

Free full-power trajectories change altitude, inlet state, ram force, fuel and
aerodynamic demand. Their force/spool trends are not admitted as fixed-input
stability failures or steady optical baselines. Initial force matching at 20%
fuel selects about .95799 throttle at 5,000 ft, but is not an altitude controller:
the burning-fuel trajectory climbs approximately 265 ft in 80 s. The additional
[fixed-fuel free-flight isolation](../../validation/evidence/aircraft/f35b/powered-lift-stability-2026-10-08/fixed-hover-analysis.json)
separates that mass change. It retains exactly 34,620 lb but climbs from 5,016.94
to 5,096.65 ft over the tail, slowing from 1.437 to 0.651 ft/s upward. Its
mean net inertial up force is −133.86 lbf, N1/N2 spans 0.02846/0.01738 percentage
points and gross-force span 84.61 lbf (0.245%). It is a residual climb, not a
zero-velocity equilibrium. Its initial native body wdot is −0.111298 ft/s²:
matching thrust to gravitational force alone omits the rotating-frame requirement
for stationary Earth-relative flight.

The subsequent [rotating-frame hover isolation](../../validation/evidence/aircraft/f35b/powered-lift-stability-2026-10-08/rotating-hover-analysis.json)
trims native Earth-relative body wdot to zero at initialization, with the same
normal FCS, frozen 20% clean fuel, ISA and 5,000 ft. Its predeclared 20–80 s
engineering criteria were altitude span ≤5 ft, absolute vertical speed ≤0.1 ft/s,
pitch/roll ≤0.05 rad, no contact/rejection/reheat and the same independent
conservation gates. All pass: altitude span 0.02395 ft, maximum vertical speed
0.001183 ft/s, pitch 9.36e-7 rad and roll 2.20e-13 rad. Requested throttle is
0.95567056, leaving 4.43 percentage points to full lever. This is a steady
modeled hover with available control authority, not identification of the user's
load or real F135 performance. The diagnostic initialization changes no runtime
force or controller equation.
Hot free fixtures at 15/20% fuel descend into contact. Impact and contact forces
are segmented by the analyzer and are not engine oscillation measurements.

The known 1%-conversion force discontinuity and 10%-conversion/60-kt unstable
flight remain open. The latter has large attitude/force changes and ground
contact; its whole-run spectrum does not isolate a plant-only limit cycle.
An early attempted wind fixture did not retain wind through RunIC and is excluded
as 60-kt evidence; the later `held-wind-60kt` uses the initialized wind correctly.
Early free-case `passed: false` labels in original reports applied a held-case
gate; the later analyzer explicitly declines equilibrium qualification for free
flight. These original observations are preserved, not silently relabeled.

## Dimensional lift and load ledger

At zero speed and level attitude, the force reconstruction adds the native main
nozzle, the fan and two roll posts, all signed inlet/external reactions, aerodynamic
and contact forces. JSBSim's applied total excludes gravity; gravity is added
once. Upward components use the recorded attitude. Force and moment reconstructions
agree with native totals to about 1e-8 lbf and 1e-10 lbf ft in the analyzed corpus.
For free smooth flight, projected ECI acceleration agrees with `(applied + gravity)
/ mass` to about 1.35e-8 ft/s²; finite-difference velocity error is qualified
separately and grows at impacts. Earth-relative acceleration is not substituted
for inertial acceleration. Hold-down suppresses motion and cannot verify measured
acceleration against unrestrained force/mass. Earth-relative hover does not require
zero net inertial force: the qualified rotating-frame fixture has 34,510.34 lbf
applied up, 34,630.07 lbf gravitational magnitude and −119.73 lbf net up, supplying
the inward corotation acceleration (ECI radial −0.111271 ft/s²). Its body-relative
up acceleration is near zero. Initial trim and frame choice are explicit; this
does not introduce another force or duplicate weight.

| Clean 37,000 lb, command 1, conversion 1 | Plant applied up (lbf) | Actual gravity magnitude (lbf) | Net up (lbf) | Empirical applied up, same fixture (lbf) |
| --- | --- | --- | --- | --- |
| Sea-level ISA | 42,038.74 | 37,028.48 | +5,010.26 | 39,169.60 |
| 5,000 ft ISA | 36,304.43 | 37,010.76 | −706.33 | 34,361.96 |
| Sea-level ISA+30 K | 32,775.13 | 37,028.48 | −4,253.35 | 35,950.77 |
| Sea-level ISA−30 K | 42,803.60 | 37,028.48 | +5,775.12 | — |

The 5,000-ft plant outlets are 16,390.80 lbf main, 16,896.87 fan and 1,508.38
each roll post. With CG x=368.52 in, the main aft arm is 175.76127 in and fan
forward arm 170.49714 in. Their balance ratio is 1.030875, distinct from the
1.194 calibration ratio. Gross force is not generally net aircraft lift: the
60-kt held wind case also has aerodynamic lift and inlet drag, and reports
36,628.08 lbf gross versus 38,116.63 lbf applied up.

The empirical model is a four-carrier table-force sum, without the plant's separate
inlet drag and solved shaft/conservation paths. At identical fixture conditions
the plant is higher by 2,869.14 lbf sea-level ISA and 1,942.47 lbf at 5,000 ft,
but lower by 3,175.64 lbf hot sea level. Matched-empirical-thrust plant cases are
separately retained; they do not replace the identical-command comparison.

Clean internal fuel capacity is 13,100 lb. Thus 20% means 2,620 lb fuel / 34,620
lb total and 30% means 3,930 / 35,930 lb. Their 5,000-ft held net up forces are
+1,674.36 / +363.98 lbf. Attached external tanks change the denominator to
19,082 lb and add 600 lb dry stores. The standard 5,000 lb fuel is 38.17% clean
capacity, or 26.20% of attached capacity. Per-tank masses and attachment flags,
not a HUD percentage alone, determine the comparison. The old user threshold
is not reproduced by these ISA fixtures. A hot-day deficit is demonstrable,
conditional on the authored engine model, and cannot be generalized to the
uncaptured flight's load or atmosphere.

## Native correction and independent closure

`FGTurbine`/`FGTurbinePlant` publish accepted mean metered PPS as well as PPH,
independently of whether tanks are debited. Frozen/zero-time observations remain
valid without withdrawing fuel. Normal tank withdrawal still follows the accepted
fuel mass receipt. Native tests cover frozen and normal debit, zero-time publication,
and every energy/mass term rather than substituting a HUD fuel-flow reading.

`Plant` distinguishes integration from final publication: `step-algorithm`,
`step-iterations`, `publication-iterations` and `publication-fallback-reason` now
accompany aggregate diagnostics. The published algorithm names the closure
actually used. Real constrained-cap tests cover component publication fallback,
rejected publication preserving accepted state/work and nozzle back-off.
`control/throat-command-sq-m` exposes commanded versus actual actuation.

Raw/cumulative accepted-step air-in, fuel-in, outflow, dump, manifold storage,
mass residual and scale observations permit an independent mass check. The
analyzer recomputes energy from thirteen exported source/sink/storage Joule terms
and mass from the exported integrated kg terms. Fork.21 reduced main fixtures
have worst independently reconstructed relative energy ≤2.46e-7 and mass ≤2.53e-16;
component fixtures ≤2.38e-7 / ≤2.55e-16. All satisfy the stated gates. Each
80 s / 120 Hz case has 9,600 accepted steps and no rejected attempts or fallback.
The earlier `componentSteps: 1` count includes the zero-time initialization's
component closure; it is not an integration fallback. New runner counts separate
accepted integration and publication phases.

The six corrected refinement cases independently close 86,400 accepted steps,
with no failures, worst relative energy 2.42e-7 and mass 2.86e-16. Entry meets
the sustained suffix envelope from 9.80–9.8167 s. This conservation qualification
does not remove the transient temperature/refinement limitation above.

Across all fifteen retained fork.21 traces, the
[phase-count receipt](../../validation/evidence/aircraft/f35b/powered-lift-stability-2026-10-08/physics/accepted-phase-counts.json)
verifies 172,800 advancing accepted steps with no failure or accepted fallback.
The rotating-frame hover independently closes energy at 2.49e-7 and mass at
2.30e-16. Twenty-five complete per-step traces, 278,425 rows and twenty original
run reports are retained losslessly; archive storage is approximately 246 MB.

Fork.20 does not export enough integrated mass terms for independent whole-plant
mass qualification; the retained analyzer says unavailable. Tank withdrawal
alone closes only fuel-supply bookkeeping. No missing or duplicate force outlet
was found, and energy/fuel accounting was not changed to increase available lift.

## Optical handoff and physical uncertainty

The [optical receipt](../../validation/evidence/aircraft/f35b/powered-lift-stability-2026-10-08/optics/README.md)
retains exact evaluator inputs and outputs with separate accelerating and tail
states. Before correction the frozen idle-entry replay is invalid throughout
because PPS is zero. After correction, all 9,601 native samples are valid, with
no reheat/CH/C2 contribution or power cap. Source Y peaks at 0.009498876 cd at
80 s; 20–80 s mean is 0.009452723 cd, peak/tail ratio 1.004883. This is evaluator
source intensity, not a rendered pixel-luminance or carrier-video brightness match.

Gas/spool stability does not mean fully equilibrated metals: over that tail T7
changes about +0.788 K, core metal +1.939 K and liner +170.484 K. Early reaction
table clamps are retained. The older burning-fuel free-full replay has peak/tail
ratio 1.437574 under changing flight conditions; it remains a fork.20 trajectory
even where a later optics report replays it. Neither trace authorizes a brightness
adjustment. No optical or sound parameter was changed, and no viewing/listening
or GPU/device validation was performed. The user's acceptance of AB synchronization
remains scoped subjective acceptance.

The production adapter still supplies T7 total state and lagged station-5 EGT
as its upstream temperature observation, not a complete station composition and
nozzle-static optical model. F135 temperatures, inertias, bypass-entry factor .07,
inlet orientation behavior, split authority and FADEC schedules remain hypotheses
or fits. The declared 107% physical N2 limit is not independently identified from
public F135 control data.

[NASA C-MAPSS40k, sections 5–6](https://ntrs.nasa.gov/api/citations/20100037768/downloads/20100037768.pdf)
provides a generic MIN/MAX fuel-selection and inactive-integrator tracking example;
it supplies no F135 gains or schedules. [Rolls-Royce's LiftSystem description](https://www.rolls-royce.com/products-and-services/defence/aerospace/combat-jets/rolls-royce-liftsystem.aspx)
gives combined 40,000 lbf, 29,000 shaft hp and 95° swivel in 2.5 s. These public
constraints do not identify this installed geometry or its hot/high performance.
The modeled stable hot deficit is evidence about the authored plant, not measured
F135 fidelity.

## Checks and remaining work

The [check logs](../../validation/evidence/aircraft/f35b/powered-lift-stability-2026-10-08/checks/)
and adoption receipt retain successful and failed attempts:

- Native full suite: 89/90 passed in the sandbox; local socket permission prevented
  `TestInputSocket`. Only that test rerun with approved access passed, covering all
  90 targets. Plant regression targets passed; SDK source contracts 20/20 and
  mandatory built-artifact tests 52/52 passed.
- Installed and production-distribution SDK verification passed for all fourteen
  files; production build passed. Incremental typecheck and lint passed.
- New four-case sustained tests first failed specifically on zero frozen-fuel PPS,
  after their stability checks passed; all four pass on fork.21. Existing AB,
  shutdown/restart, snapshot/lifecycle and empirical coverage was retained.
- Related run: 183 passed, one Engine-model label punctuation expectation failed
  after concurrent UI edits. The semantic assertion was adapted and its six-test
  file passed. One CI attempt was stopped to avoid overlapping another session.
- One completed full app run: 194/195 files, 2,109 passed and one expected failure;
  a concurrent Engine-tab help-collapse case failed. Only that file was rerun
  against the then-current tree: 30/30 passed. The production build completed
  separately. **The original completed full CI run was not green.**

Remaining closure requires the actual oscillating session's initial/saved state,
model/algorithm settings, native per-step controls, fuel/stores/CG, atmosphere and
entry sequence. Isolate that trajectory before changing controller physics or
calling its optical tail steady. Retain partial-conversion failures and investigate
the bypass/split/actuator interaction separately. Physical hot/high lift and
temperature qualification requires independent constraints, not calibration to a
fuel percentage. Device AB/glow acceptance remains subsequent user confirmation.
The generic telemetry/fallback change is committed locally as a separable native
candidate; no PR message or push was made by this assignment.
