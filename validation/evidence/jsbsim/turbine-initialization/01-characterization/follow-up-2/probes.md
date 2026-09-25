# Three focused probes for the follow-up review

2026-09-20. Three factual questions the
[follow-up review](../../../../../../docs/turbine-initialization/reports/01-follow-up-review.md)
left open, each measured once on a binary whose identity was already verified.
`probes.json` is the machine-readable record and `provenance.json` carries the
commands and hashes. Nothing else was rerun and nothing was rebuilt.

Both builds agree everywhere below except one value, noted where it occurs.

## 1. What `RunIC()` seeds the derivative history with

`FGFDMExec::Run()` copies the accelerations into `FGPropagate::in` at model
index 0 and recomputes them at model index 14. `RunIC()` then calls
`FGPropagate::InitializeDerivatives()`, which assigns `in.vPQRidot` and
`in.vUVWidot` into all five history slots. The value it assigns is therefore
the one copied *before* the engine state was accepted.

F-16 at 20 000 ft and 300 kt, running 600 frames at throttle 0.9, then throttle
to 0.0 and one `RunIC()`:

| Quantity | Copied at the top of `RunIC()`'s `Run()` — what is seeded | Held after `RunIC()` returns | Difference |
| --- | --- | --- | --- |
| `udot-ft_sec2` | 21.858659 | −7.728663 | −29.587322 |
| `vdot-ft_sec2` | 0.009136 | 0.071862 | 0.062726 |
| `wdot-ft_sec2` | −1.305017 | 18.627212 | 19.932229 |
| `pdot-rad_sec2` | 0.000135 | −0.000194 | −0.000329 |
| `qdot-rad_sec2` | 0.000535 | −0.148932 | −0.149467 |
| `rdot-rad_sec2` | 0.0000060 | 0.0000525 | 0.0000465 |

A second `RunIC()` with nothing changed in between lands within 0.03 ft/s² of
the first, because by then the copied value and the recomputed one describe the
same engine state.

The derivative history itself is not a public property, so this probe shows the
two candidate values and the source order decides which one is used:
`Propagate->in.vPQRidot` is written only by `FGFDMExec::LoadInputs(ePropagate)`
and by `FGFDMExec::SetHoldDown`, and neither runs between `eAccelerations` and
`InitializeDerivatives()`.

The only value that differs between the builds is the member N2 after the
`RunIC()` at throttle 0.0: master leaves it at 100.0 and the candidate assigns
the steady 53.0. That is the repair under test.

## 2. Which runtime writes survive `RunIC()` and a scenario reset

F-16. Each field is written through its property, then `RunIC()`, then
`ResetToInitialConditions(0)`. Every field survives `RunIC()`; the reset is
where they part.

| Property under `propulsion/engine[0]/` | Loaded | Written | After a scenario reset | Survives the reset |
| --- | --- | --- | --- | --- |
| `MaxN1` | 100.0 | 99.0 | 99.0 | **yes** |
| `MaxN2` | 100.0 | 97.0 | 97.0 | **yes** |
| `bleed-factor` | 0.0 | 0.25 | 0.25 | **yes** |
| `pitch-angle-rad` | 0.0 | 1.5 | 1.5 | **yes** |
| `yaw-angle-rad` | 0.0 | 1.5 | 1.5 | **yes** |
| `InjectionTimer` | 0.0 | 1.5 | 1.5 | **yes** |
| `InjWaterNorm` | 0.0 | 0.5 | 0.0 | no |
| `InjN1increment` | 0.0 | 1.5 | 0.0 | no |
| `InjN2increment` | 0.0 | 1.5 | 0.0 | no |
| `x-position`, `y-position`, `z-position` | 0.0 | 1.5 | 0.0 | no |
| `reverser-angle-rad` | 0.0 | 1.5 | 0.0 | no |

Read against the source, the split is not a policy:

- `FGTurbine::ResetToIC()` zeroes `InjN1increment` and `InjN2increment`, which
  are **configuration** loaded from `<injection-N1-inc>`/`<injection-N2-inc>`.
  A scenario reset therefore destroys them rather than restoring them. No
  shipped engine defines either element, so no shipped aircraft is affected
  today;
- it sets `InjWaterNorm` to 0.0, while `FGTurbine::Load` sets it to 1.0 when
  `<injection-time>` is present. A scenario reset empties the water instead of
  replenishing it;
- it does not touch `MaxN1`, `MaxN2` or `BleedDemand`, so a runtime override of
  those survives a reset that is supposed to restore the scenario;
- `FGThruster::ResetToIC()` re-seats the acting location on `vXYZn` and leaves
  the orientation alone, so a gimballed nozzle keeps a runtime angle across a
  reset while a moved acting point does not;
- `EPR`, `OilPressure_psi` and `InjectionTimer` are not written by either
  `ResetToIC`, so they carry the previous flight's value into the new scenario.
  `InjectionTimer` is in the table above; `EPR` and `OilPressure_psi` are not
  tied to properties and were read in the source, not measured.

## 3. Refilling the tanks while fuel freeze is on

`FGPropulsion::ConsumeFuel()` returns on `FuelFreeze` and on trim status
**before** it walks the tanks, and `SetStarved()` is only reached after that
walk. F-16, started, 240 frames at throttle 0.6, tanks emptied, 120 frames,
tanks refilled to 2000 lb, then `propulsion/set-running = -1` and 120 frames:

| Arm | Freeze during the refill | After the refill | After the restart request |
| --- | --- | --- | --- |
| thawed | off | not running, 1999.97 lb | **running**, N1 100.0, 19576.3 lbf |
| frozen | on | not running, 2000.00 lb | **not running**, N1 0.42, N2 0.28, 0.0 lbf |
| frozen, then one thawed frame | on, cleared before the restart | not running, 2000.00 lb | **running**, N1 100.0, 19576.3 lbf |

A single unfrozen frame between the refill and the restart is the whole
difference. While the freeze lasts, the latched `Starved` is never recomputed,
the published rate stays at its last written value — 3448.87 gph in all three
arms while the engine is stopped — and the restart fails on tanks that hold
2000 lb of usable fuel.

The same early return applies to trim status, so an initialization that reads
the flag rather than the tanks inherits the same staleness.

## 4. The linearization throttle column, in full

Not a new run. This is [`follow-up/probes.json`](../follow-up/probes.json)
re-read, because the prose beside the earlier table said "every other entry of
the throttle column is zero on both builds" and that is false. The `Q` row is a
physical pitching response to a thrust line offset from the centre of gravity,
and it is three orders of magnitude below the `Vt` row rather than absent.

Every entry of `B`'s throttle column, the sandbox 737 at `cruise_init`, both
instrumented builds, identical to the last bit:

| State | throttle 0.0 | throttle 0.3 | throttle 0.6 | throttle 0.9 |
| --- | --- | --- | --- | --- |
| `Vt` | 0 | 2.7708039266919706 | 5.541607853384126 | 8.312411780080167 |
| `Q` | 0 | 0.0024612639773144425 | 0.004922527954633222 | 0.0073837919319491106 |
| `Beta` | 0 | −1.1293772630057337e−17 | 7.905640841040136e−17 | 7.905640841040136e−17 |
| `Alpha`, `Theta`, `Phi`, `P`, `Psi`, `R`, `Latitude`, `Longitude`, `Alt` | 0 | 0 | 0 | 0 |

`Vt` and `Q` are the physical response and both scale linearly with throttle.
`Beta` is roundoff at the 1e−17 level and is not a coupling. Stage 5 compares
the whole column and must distinguish the two: a tolerance that hides the
`Beta` roundoff must not also hide the `Q` response.
