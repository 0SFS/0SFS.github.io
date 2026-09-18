# SF50 fuel system: per-tank simulation, optionality, and the Fuel tab

Status: **ready for implementation.** Designed and evidence-checked; no code
written. Every open question is either decided below or explicitly deferred in
§12 — none is left for the implementer to guess.
Date: 2026-09-16

Today the SF50 package carries one aggregate 296 gal / 2001 lb tank on the
centreline ([`sf50.xml:121`](../../public/jsbsim-data/aircraft/sf50/sf50.xml)).
Fuel burns and the aeroplane gets lighter, and nothing else about fuel is
modelled: no sides, no lateral CG, no selection, no pumps, no alerting.

This proposal adds a per-tank fuel system with the AFM's automatic tank
selection, makes the whole thing a user choice that is on by default, and gives
it a Fuel tab with a planform diagram of the tank levels.

It deliberately does **not** claim a validated fuel system. Section 7 of the AFM
is a stub that points at the Pilot's Information Manual (PDF p. 537, printed
7-1), which we do not hold. Everything below is built from the limitations,
procedures and servicing sections, which are primary but describe the system
from the outside. Internal architecture is inference and is labelled as such.

## 0. Handoff

Read [`AGENTS.md`](../../AGENTS.md) first; it governs and outranks this
document. Then §2 (boundaries), §5 (where the logic lives) and §11 (order of
work). §1 is reference material to return to, not to read through.

Nothing here has been implemented. The repository is clean of this work.

### Standing rules that will bite

- **Never start a dev, preview or watch server.** If browser verification is
  needed, give the user the exact command and ask them to run it
  (`AGENTS.md` § Development Servers).
- `public/jsbsim-data/aircraft/sf50-g2/` and `sf50-g3/` are **generated**. Edit
  `sf50/sf50.xml` and run `node scripts/build-sf50-variants.mjs`. Never hand-edit
  a generated copy; it is marked "Do not edit this copy".
- The JSBSim package is a pinned in-repo artifact. Do not substitute a live
  source link or rebuild the WASM to make this work; `npm run verify:jsbsim`
  identifies what is installed. No change in this proposal needs a new engine
  build. The one JSBSim-side change we do want is tracked separately and is
  **not** a prerequisite — see §6.
- Do not add a fuel-system validation claim anywhere. This is a modelled
  system, not a validated one (§10).

### Commands

| Purpose | Command |
| --- | --- |
| Full gate | `npm run ci` (lint, test, build) |
| Tests only | `npm test` |
| One area | `npm test -- src/flight` |
| Regenerate variants | `node scripts/build-sf50-variants.mjs` |
| AFM performance check | `node scripts/validate-sf50.mjs` |

### Definition of done for the whole proposal

`npm run ci` green; `validate-sf50.mjs` reproduces its recorded AFM results
within existing tolerances; the `off` rung is trajectory-equivalent to today's
model; and this file's Status line is updated with what was actually built and
what was not.

## 1. Evidence

All page numbers are from the in-repo AFM,
[`planes/Cirrus_Vision_Jet/tests/SF50-POH.pdf`](../../planes/Cirrus_Vision_Jet/tests/SF50-POH.pdf)
(P/N 31452-001 Rev 4, sha256 already pinned in
[`sf50Variants.ts`](../../src/flight/aircraft/sf50Variants.ts)), given as
PDF page / printed page.

| Fact | Value | Source |
| --- | --- | --- |
| Tank count | Four drains: LH wing, LH collector, RH wing, RH collector | 572 / 8-34; preflight 334, 339 |
| Total capacity | 149.25 gal (1009 lb) per side, 298.5 gal (2018 lb) | 49 / 2-13 |
| Usable | 148 gal (1000 lb) per side, 296 gal (2001 lb) | 49 / 2-13; 568 / 8-30 |
| Unusable | 1.25 gal (8 lb) per side, 2.5 gal (17 lb) | 49 / 2-13 |
| Reference density | 6.76 lb/gal at 59 °F (15 °C) | 23 / 1-7; 48 / 2-12 |
| Max allowable imbalance | 15 gal (101 lb) | 48 / 2-12 |
| Fuel temperature limits | −40 °F (−40 °C) to 122 °F (50 °C) | 48 / 2-12 |
| Components | 1 Fuel Control Switch, 2 Fuel Control Valves, 1 ejector pump, 1 electric pump, 1 shutoff valve, 2 quantity indications | 76 / 2-40 |
| Selector positions | LEFT / AUTO / RIGHT; AUTO draws through valve #1, LEFT/RIGHT through valve #2 and command the electric pump on | 281–282 / 3A-57–58; 206 / 3-64 |
| EIS selection display | AUTO: white L or R box. LEFT/RIGHT: cyan MAN box | 206 / 3-64; preflight 333–334 |
| AUTO behaviour | Balances consumption on its own, and keeps balancing during FUEL LOW | 272 / 3A-48; 273 / 3A-49 |
| Electric pump | On for start, on when LEFT/RIGHT selected, and latches on by itself at low fuel pressure. Latch clears only by cycling to L or R and back to AUTO | 274 / 3A-50; 275 / 3A-51 |
| Fuel filter | 20 micron on the FCU, with a bypass. FUEL FILTER BYPASS annunciates *before* the bypass opens | 568 / 8-30 |
| Refuelling | Alternate wings in 75 gal increments; a larger imbalance can vent fuel from the low wing | 48 / 2-12; 569 / 8-31 |

CAS thresholds:

| Message | Severity | Condition | Source |
| --- | --- | --- | --- |
| FUEL IMBALANCE | Warning | imbalance ≥ 50 gal | 204 / 3-62 |
| FUEL IMBALANCE | Caution | imbalance ≥ 15 gal | 272 / 3A-48 |
| FUEL LOW LEFT / RIGHT / TOTAL | Warning | total ≤ 25 gal, or either tank ≤ 5 gal | 205 / 3-63 |
| FUEL LOW LEFT / RIGHT / TOTAL | Caution | low, thresholds not stated in this AFM | 273 / 3A-49 |
| FUEL PRESSURE LOW | Warning | FDU fuel inlet pressure low | 206 / 3-64 |
| FUEL TEMP LOW | Warning / Caution | below the operating limit / low | 207 / 3-65; 280 / 3A-56 |
| FUEL VALVES BOTH FAIL | Warning | both control valves failed; valves hold last commanded position | 208 / 3-66 |
| FUEL PUMP FAIL | Caution | pump failed | 273 / 3A-49 |
| FUEL PUMP ON | Caution | pump latched on by low pressure | 274 / 3A-50 |
| FUEL PUMP ON | Advisory | pump on for start or a pilot L/R selection | 275 / 3A-51 |
| FUEL QTY MISCOMPARE | Caution | sensed and totalised quantity disagree | 275 / 3A-51 |
| FUEL SELECTOR FAIL | Caution | selector position cannot be determined | 276 / 3A-52 |
| FUEL SHUTOFF | Advisory | shutoff valve closed | 277 / 3A-53 |
| FUEL SHUTOFF FAIL | Caution | valve not in commanded position | 278 / 3A-54 |
| FUEL TANK BALANCED | Advisory | balance detected | 279 / 3A-55 |
| FUEL VALVE #1 / #2 / AUTO FAIL | Caution | that valve or the auto selection failed | 281–283 / 3A-57–59 |

The caution-level FUEL LOW thresholds and the probe count behind
FUEL QTY MISCOMPARE are not in this AFM. They must not be invented; see §12.

## 2. What is simulated, and what is not

Simulated: two wing tanks with real lateral arms, so imbalance produces a
rolling moment and a CG shift through JSBSim's own mass balance; unusable fuel;
AUTO/LEFT/RIGHT selection and the valve each position uses; the electric pump
including its latch; fuel shutoff; fuel temperature; the CAS messages above;
and pilot-set fuel load.

Not simulated: collector tanks as separate masses (§12), fuel venting from a
heavy wing during refuelling, the filter bypass as a flow-restriction model
(the message is driven by an injected failure only), boost-pump pressure as a
physical quantity, and probe-level quantity sensing. FUEL QTY MISCOMPARE is
reachable only through an injected failure.

Nothing here is validated against the aeroplane. This is a development model,
in the same sense as the rest of the SF50 package.

## 3. Optionality contract

New module `src/flight/settings/fuelSettings.ts`, following
[`groundInteractionSettings.ts`](../../src/flight/settings/groundInteractionSettings.ts)
and [`audioSettings.ts`](../../src/flight/audio/audioSettings.ts) exactly:
versioned parse with migration, a `readOnlyReason` when storage holds a newer
version, a requested/active resolution that never rewrites the user's request,
and `localStorage` persistence that never throws.

```ts
export type FuelModelId = "off" | "tanks" | "system";

export interface FuelSettingsV1 {
  version: 1;
  /** Default "system": the full AFM behaviour. */
  model: FuelModelId;
  /** Unlimited fuel; writes propulsion/fuel_freeze. Independent of `model`. */
  freeze: boolean;
  /** Pilot load applied at the next reset, in usable gallons per side. */
  loadLeftGal: number;
  loadRightGal: number;
  /** Allow editing tank quantities while paused in flight. */
  allowInFlightRefuel: boolean;
}
```

| `model` | Behaviour |
| --- | --- |
| `off` | Today's behaviour. Both tanks are held at priority 1 so JSBSim splits the draw evenly and no imbalance can develop; the Fuel tab shows totals only. This is the compatibility rung, not a cheat. |
| `tanks` | Per-tank quantities, lateral CG and imbalance physics, unusable fuel, FUEL LOW and FUEL IMBALANCE alerting. AUTO keeps the wings balanced. No pump, valve or selector failures; the selector is available. |
| `system` | Everything in `tanks`, plus the electric pump and its latch, the two control valves, fuel temperature, shutoff, and the full CAS set including the failure messages. **Default.** |

`DEFAULT_FUEL_SETTINGS.model` is `"system"`. This differs from sound, which
defaults off because a stored preference cannot satisfy browser autoplay; fuel
has no such constraint, and the AFM behaviour is the point of the feature.

`model` is a **boundary key** in the sense
[`GROUND_BOUNDARY_KEYS`](../../src/flight/settings/groundInteractionSettings.ts)
uses: moving between `off` and the other rungs changes which tank the aeroplane
is drawing from, so it applies at a paused/reset boundary and reports itself as
pending until then. `freeze`, `allowInFlightRefuel` and the CAS presentation
apply immediately.

Resolution, again following the ground-interaction shape, reports a reason
whenever the requested rung is not the active one. The only capability gate at
present: an aircraft whose FDM profile declares no fuel system resolves to
`off` with the reason "This aircraft has no modelled fuel system." Declare that
capability as a new optional field on `FdmProfile` in
[`fdmProfiles.ts`](../../src/flight/jsbsim/fdmProfiles.ts), set for the three
SF50 entries through `createSf50Profile` and absent for the C172, alongside the
existing `stance` and `flapPosition` metadata.

Storage key: `osfs.fuel.v1`.

## 4. JSBSim package changes

Replace the single tank in
[`public/jsbsim-data/aircraft/sf50/sf50.xml`](../../public/jsbsim-data/aircraft/sf50/sf50.xml)
with two, and regenerate the G2/G3 copies with
`node scripts/build-sf50-variants.mjs` (the generated files are marked
"Do not edit this copy").

```xml
<tank type="FUEL" name="Left Wing">
  <description>
    Left integral wing tank. AFM 31452-001 p. 2-13: 149.25 gal (1009 lb)
    total, 148 gal (1000 lb) usable, 1.25 gal unusable per side. The lateral
    arm is a provisional planform centroid; see sf50_reference.md.
  </description>
  <location unit="IN"><x>158.0</x><y>-93.0</y><z>-36.0</z></location>
  <type>JET-A</type>
  <capacity unit="LBS">1009</capacity>
  <contents unit="LBS">500</contents>
  <unusable-volume unit="GAL">1.25</unusable-volume>
  <temperature>59</temperature>
  <priority>1</priority>
</tank>
```

and the mirror image at `y = +93.0`.

Four constraints on this edit:

1. **`x` and `z` stay at the current values.** Holding both tanks at the
   aggregate tank's station means the change is purely lateral and cannot move
   the longitudinal CG, so it cannot perturb the existing pitch calibration.
   Acceptance requires showing that (§10).
2. **Default contents stay at 1000 lb total**, split 500/500, so a default
   flight starts at the same weight it does today.
3. **Do not add a `<density>` element.** `<type>JET-A</type>` already sets
   6.74 lb/gal through `FGTank::ProcessFuelName`, and it is applied *after*
   `<density>` and deliberately overrides it ("A named fuel type will override
   a previous density value", `FGTank.cpp:237`). An explicit `<density>` would
   be silently ignored. JSBSim's 6.74 differs from the AFM's 6.76 reference at
   59 °F by 0.3%, which is well inside the spread of real Jet A; the UI should
   convert with the tank's own `density-lbs_per_gal` rather than a constant, so
   displayed gallons stay consistent with the mass JSBSim is actually carrying.
   `<temperature>` is added because `FGTank` only runs its thermal model for a
   tank that declares an initial temperature, and the element is **degrees
   Fahrenheit** (converted to Celsius at load, `FGTank.cpp:234`).
4. **The lateral arm is provisional and must be derived, not guessed.** ±93 in
   is roughly 0.40 semi-span (semi-span is 232.2 in), which is where the
   chord-weighted centroid of a tapered wet wing falls. Replace it with a value
   integrated from the traced planform in
   [`sf50_reference.md`](../../planes/Cirrus_Vision_Jet/agent_workspace/measurements/sf50_reference.md)
   and record the derivation there, as the rest of that geometry is.

### What this breaks

- [`sf50.integration.test.ts:201`](../../src/flight/jsbsim/sf50.integration.test.ts)
  reads `propulsion/tank/contents-lbs`, which the property tree resolves to
  tank 0 — the left wing. With AUTO alternating sides, a short run may drain
  only the right tank and the assertion becomes wrong in a way that still
  sometimes passes. Change it to `propulsion/total-fuel-lbs`.
- [`flightModelDriver.ts:228`](../../src/flight/model/flightModelDriver.ts)
  requires `fuelLb` to name every discovered tank. Callers that pass one entry
  must pass two.
- [`validate-sf50.mjs`](../../scripts/validate-sf50.mjs) already parses tanks
  generically and splits the 1500 lb scenario load in proportion to capacity,
  so it becomes 750/750 with no code change. That symmetric split, at an
  unchanged `x`, is why the AFM scenarios should reproduce.
- [`tankRows`](../../src/flight/hud/engineMonitorModel.ts) already discovers
  per-tank properties, so the Engine tab gains both tanks for free.

## 5. Where the logic lives

**The tank geometry goes in the XML; the selection, pump, valve and CAS logic
goes in TypeScript.** New module `src/flight/systems/fuelSystem.ts`.

The SF50 package already carries stall protection as an XML FCS channel, so the
precedent runs the other way and the split needs a reason. It is this: stall
protection produces a *surface command*, and has to sit inside the FCS to pass
through the same lag and limit chain as the pilot's input on the same step.
Fuel selection produces a *discrete tank priority*, which has no force path of
its own — JSBSim reads it once per step in `FGPropulsion::ConsumeFuel`. Nothing
is lost by writing it from outside the step, and three things are gained: the
latching state machine and the CAS debounce become plain functions that vitest
can test without the WASM runtime; the settings rung can be changed at runtime
without reloading the aircraft package; and the failure injections need no
XML-side switch.

The controller is driven from the accepted fixed step in
[`createFlightSimApp.ts:1582`](../../src/flight/createFlightSimApp.ts),
inside the existing `applyInputs()` closure that
[`createFixedStepPhysicsLoop`](../../src/flight/physics/fixedStepLoop.ts) calls
once per accepted step. Pre-step it writes the selection; post-step, from the
`onStep` callback beside `flightAudio.publishStep()`, it samples quantities for
the CAS and the UI. Presentation never feeds back into the pre-step write.

### Property contract

Verified against the pinned fork at `/Users/felg/gh/Felipegalind0/jsbsim`.

| Property | Direction | Note |
| --- | --- | --- |
| `propulsion/tank[n]/contents-lbs` | read/write | Write only at a load or reset boundary |
| `propulsion/tank[n]/pct-full` | read | Percentage of **total** capacity, not usable |
| `propulsion/tank[n]/priority` | read/write | The whole selection mechanism. `SetPriority` also sets `Selected`; priority 0 removes the tank from the feed entirely |
| `propulsion/tank[n]/density-lbs_per_gal` | read | For the lb↔gal conversions the UI shows |
| `propulsion/tank[n]/external-flow-rate-pps` | read/write | Not used in this phase; see §12 |
| `propulsion/total-fuel-lbs` | read | |
| `propulsion/engine[0]/fuel-flow-rate-pps` | read | Endurance and the burning test |
| `propulsion/fuel_freeze` | **write only** | Has no getter; the controller must hold its own copy |
| `propulsion/cutoff_cmd` | read/write | The fuel shutoff valve |
| `propulsion/tat-c` | read | Drives the fuel temperature model |

`FGPropulsion::ConsumeFuel` selects, among the engine's feed tanks, every tank
that is selected, has contents above unusable, and sits at the lowest priority
number present; it then splits the demand equally among them. So:

| Selector | Left priority | Right priority |
| --- | --- | --- |
| AUTO, feeding left | 1 | 2 |
| AUTO, feeding right | 2 | 1 |
| LEFT | 1 | 2 |
| RIGHT | 2 | 1 |
| `model: "off"` | 1 | 1 |

Priority 2 on the unselected side is deliberate: when the selected tank reaches
unusable, JSBSim falls through to the other tank instead of flaming out. That
models the aeroplane, where both wings feed one engine. A genuinely stuck valve
starving the engine is the *valve failure* path (§6), not the normal one.

`ConsumeFuel` returns early during trim and when `fuel_freeze` is set, so no
fuel burns while the trimmer runs. Note the open defect recorded in
[`AGENTS.md`](../../AGENTS.md): PRs #1505/#1508 assign spool speeds and fuel
flow in `Trim()` even for a shut-off engine, so a zero-time reset can leave a
brief burn. Fuel accounting must not be made to paper over that; it is an
engine fix.

## 6. The fuel system state machine

Pure, DOM-free, no SDK types. One `step(input, dtSeconds): FuelSystemState`
called per accepted step, in the shape
[`engineMonitorModel.ts`](../../src/flight/hud/engineMonitorModel.ts) uses.

**AUTO.** Feed the fuller side. Switch when the other side is fuller by more
than a hysteresis band; without a band the selection would chatter at 120 Hz
around equality. Proposed band: 1.0 gal, with a minimum dwell of 10 s on a
side. Both are presentation-free constants in the module and both are tunable;
neither is an AFM figure and both must be commented as ours. AUTO keeps
balancing during FUEL LOW (273 / 3A-49) — do not add a low-fuel inhibit.

**LEFT / RIGHT.** Hold the commanded side. Commands the electric pump on, and
routes through valve #2, so a #2 failure makes these positions ineffective
while AUTO keeps working, and a #1 failure does the reverse (281–282).

**Electric pump.** States `off`, `on` (start, or a pilot L/R selection →
advisory) and `latched` (low pressure → caution). The latch clears only on the
transition sequence AUTO → L or R → AUTO, exactly as the AFM describes; a
direct write to AUTO must not clear it.

**Fuel pressure.** We have no pressure model, and must not pretend to. Define a
single derived boolean, `inletPressureLow`, true when the feeding tank is at or
below unusable, or the feeding side's valve has failed, or the unporting timer
below is active. It drives the pump latch and FUEL PRESSURE LOW and nothing
else. Name it in the code as a derived condition, not a pressure.

**Unporting.** The AFM warns against excessive pitch attitudes and lateral
acceleration at low fuel because they uncover the fuel inlet (205 / 3-63).
JSBSim models nothing of the kind. Model it in the controller: when the feeding
tank is below an uncovering threshold (proposed 10 gal) and either |lateral
acceleration| exceeds a threshold or pitch is beyond a band, start a timer;
while it runs, `inletPressureLow` is true, and past a short grace period
(proposed 4 s, standing in for the collector's reserve) set the engine's
`propulsion/cutoff_cmd` for the duration to produce a flow interruption. All
four numbers are ours, not the AFM's, and must be labelled so in the module and
in the Fuel tab's own text.

**Fuel temperature.** JSBSim already models this, and models it reasonably.
`FGTank::Calculate` runs a heat balance against total air temperature with a
heat capacity of 900 J/lbm/K and a transfer factor of 1.115 W/ft²/K, over a
surface area derived from capacity on a documented wing-tank shape —
`Area = 40·(Capacity/1975)^⅔`, about 25.6 ft² for a 1009 lb tank. It runs only
for tanks that declare an initial `<temperature>`, which §4 now does.

The only gap is that `FGTank::bind` ties no temperature property, so
`GetTemperature_degC()` is unreachable from the SDK. Two paths:

- **Preferred:** the fork change tracked in
  [`jsbsim-fuel-tank-temperature-property.md`](../validation/jsbsim-fuel-tank-temperature-property.md)
  adds the tie, and the controller reads `propulsion/tank[n]/temperature-degC`.
  That deletes a model rather than writing one.
- **Fallback, until that tie is in the installed artifact:** a first-order lag
  on `propulsion/tat-c` per side, time constant on the order of 20 minutes,
  seeded from ambient at reset.

The controller reads the property when the catalog has it and falls back
otherwise — the same discovery-and-`null` discipline
[`engineMonitorModel.ts`](../../src/flight/hud/engineMonitorModel.ts) already
applies to absent properties. Either way, drive FUEL TEMP LOW from the −40 °C
limit (48 / 2-12). Do not block this proposal on upstream review.

**Failure injection.** Under `model: "system"`, a Fuel tab section can arm
valve #1 fail, valve #2 fail, both valves fail, auto-selection fail, selector
fail, pump fail, shutoff fail, quantity miscompare and filter bypass. Failures
are session state, never persisted — a saved failure that survives a reload is
a bug report waiting to happen. A failed valve holds its last commanded
position (208 / 3-66).

## 7. CAS

There is already a CAS line: `.flight-eval__cas` in
[`evaluationInstruments.ts`](../../src/flight/hud/evaluationInstruments.ts),
which shows STICK PUSHER above STALL WARNING. Do **not** add a second banner
competing with it.

Extract `src/flight/hud/casModel.ts`: a message list with
`severity: "warning" | "caution" | "advisory"`, a stable ordering (severity
first, then a declared priority within severity), and a debounce so a message
must hold its condition for a minimum time before appearing and before clearing
— an imbalance oscillating across 15.0 gal must not flicker. Move stall
warning and stick pusher onto it unchanged, with the pusher keeping its place
above stall warning, and add the fuel messages. The HUD line renders the
highest-ranked active message; the Fuel tab lists every active fuel message
with its condition.

Colour follows the AFM: warnings red, cautions amber, advisories white, against
the existing HUD palette in
[`evaluationInstruments.css`](../../src/flight/hud/evaluationInstruments.css).

## 8. The Fuel tab

Add `"fuel"` to `FlightPanelTab`, `TAB_DEFINITIONS` and `TAB_ICONS` in
[`FlightControlPanel.tsx`](../../src/flight/hud/FlightControlPanel.tsx) —
`Fuel` from lucide-react, placed after `engine`. New component
`src/flight/hud/FuelPanel.tsx`, driven by a `FuelPanelState` on the panel
snapshot and an `onAction` discriminated union, exactly as
[`SoundSettingsPanel.tsx`](../../src/flight/hud/SoundSettingsPanel.tsx) and
`GroundInteractionSettingsPanel` are. No new state lives in the component.

Sections, in order:

1. **Diagram** — below.
2. **Quantities** — per side: gallons, pounds, percentage of usable; total;
   imbalance with its sign and the 15 gal limit; endurance at the current fuel
   flow, or "—" when not burning.
3. **Selector** — a three-position LEFT / AUTO / RIGHT control. Reproduce the
   EIS convention: AUTO shows a **white** box on the side actually feeding;
   LEFT and RIGHT show a **cyan** MAN box. That is what the preflight check on
   PDF 333–334 has the pilot verify, and getting it right is most of what makes
   the panel feel like the aeroplane.
4. **Pumps and valves** (`system` only) — electric pump state including the
   latch, with the L/R→AUTO clearing sequence named in the hint text; shutoff.
5. **Load** — per-side gallon inputs plus "fill both", "fill to tabs", "equalise".
   Applied at the next reset, or immediately while paused if
   `allowInFlightRefuel` is on. The 75 gal alternating-fill note from
   48 / 2-12 belongs here as a hint.
6. **Simulation** — the `model` ladder with its resolution reason, the freeze
   toggle, and the failure injection list.

### The diagram

Inline SVG in the React component. No new dependency and no runtime asset
fetch: the planform outline is a small normalised path committed as a TS
constant, traced from the same three-view already in the repo
(`measurements/ref_SF50_three_view_1200dpi.png`) that the FDM geometry came
from, so the drawing and the model agree about where the wing is.

- Top-down planform, nose up, on the panel's dark ground.
- Two tank polygons spanning the wet-wing region, drawn with the same lateral
  arm the XML uses, so the picture cannot disagree with the physics.
- Level shown by a clip rectangle sweeping span-wise, tip toward root, in
  proportion to **usable** quantity. State in the panel text that this is a
  legibility convention and not a fuel-surface model — it is not what the
  liquid does in a slip.
- Unusable fuel drawn as a distinct hatched sliver at the root that never
  empties, because "8 lb you cannot have" is exactly the kind of thing a
  picture explains and a number does not.
- Tank fill colour by CAS state: normal, caution, warning.
- The feeding side marked by a highlighted line from that tank to the engine.
  Under `model: "off"`, both lines are lit and the selector section is hidden.
- Imbalance shown as a small centred bar under the planform with the 15 gal
  limit ticked.

Accessibility and testability, matching how the panel already labels its
telemetry groups: `role="img"` on the SVG with an `aria-label` carrying the
same numbers the Quantities section shows, and every number also present as
text, so the panel is usable without the drawing and `FuelPanel.test.tsx` can
assert on text rather than on path geometry.

Sizing: the panel is `min(460px, calc(100vw - 24px))` wide. The diagram is a
`viewBox` scaled to width with a fixed aspect ratio, and must stay legible at
the narrow end.

## 9. Load, reset and boundary semantics

- `resetFlightLocation.ts` writes the configured load to both tanks before
  `RunIC`, alongside the existing flap and gear presets.
- Runway presets keep today's default of 1000 lb total unless the user has set
  a load.
- Changing `model` between `off` and `tanks`/`system` takes effect at the next
  pause or reset and reports as pending until then; the other settings are live.
- `freeze` writes `propulsion/fuel_freeze` immediately. Because that property
  is write-only, the controller owns the authoritative copy and re-asserts it
  after any reset.
- The flight recorder gains `fuel_left_lb` and `fuel_right_lb` columns in
  [`FLIGHT_RECORDER_CHANNELS`](../../src/flight/diagnostics/flightRecorder.ts)
  beside the existing `fuel_lb`, so a pilot's imbalance comment is tied to what
  the model did.

## 10. Testing and acceptance

Unit, no WASM:

- `fuelSettings.test.ts` — parse, migrate, reject a newer version, clamp
  loads, resolution reasons, the read-only path. Mirrors
  `groundInteractionSettings.test.ts`.
- `fuelSystem.test.ts` — AUTO alternation including hysteresis and dwell;
  no chatter when the tanks are exactly equal; the pump latch sets on low
  pressure and clears **only** through L→AUTO; each valve failure disables the
  right selector positions and leaves the others working; every CAS threshold
  asserted at its exact AFM value (15, 50, 25, 5 gal) and one step either side;
  debounce suppresses a flickering condition.
- `casModel.test.ts` — ordering, and that stick pusher still outranks stall
  warning.
- `FuelPanel.test.tsx` — levels and the aria label track the state; the AUTO
  box is white and the MAN box cyan; the `off` rung hides the selector.

Integration, against the real SDK, in `sf50.integration.test.ts`:

- Both tanks are discovered and total 2018 lb capacity, 2001 lb usable.
- Writing `propulsion/tank[1]/priority = 2` makes tank 0 drain and tank 1 hold.
- An imbalance produces a rolling moment of the right sign, and none when
  balanced.
- A tank stops at its unusable quantity and the feed falls through to the other
  tank rather than starving.
- Longitudinal CG at a given total fuel load matches the pre-change model, to a
  tight tolerance. This is the guard for constraint 1 in §4.

Acceptance:

- `npm run ci` passes.
- `node scripts/validate-sf50.mjs` reproduces the recorded AFM takeoff and
  landing results within their existing tolerances. A change in those numbers
  means the split moved something it should not have, and blocks the work.
- With `model: "off"`, a fixed-input run matches the pre-change model's
  trajectory over a fixed number of accepted steps.

No claim of fuel-system validation is to be added to
[`sf50-performance.md`](../validation/sf50-performance.md) or the variant
records. This is a modelled system, not a validated one, and the panel says so.

## 11. Milestones

Each is independently shippable and leaves the tree green. Do them in order;
1 and 2 together are the risky part, because they touch physics and everything
after is additive.

**1. Two tanks.** Edit `sf50/sf50.xml` per §4, regenerate the variants, fix the
three broken callers under "What this breaks", derive the lateral arm and
record it in `sf50_reference.md`. Selection stays fixed at priority 1/1, so the
aeroplane flies exactly as it does today.
*Done when:* the five integration assertions in §10 pass, `validate-sf50.mjs`
is unchanged from its recorded results, and `npm run ci` is green.

**2. Settings.** `fuelSettings.ts` with the three-rung ladder, resolution and
persistence; the `FdmProfile` capability field; wired onto the panel snapshot.
No behaviour change yet — `off` and the others all still run priority 1/1.
*Done when:* `fuelSettings.test.ts` covers parse, migration, newer-version
rejection and every resolution reason, and the `off` rung is proven
trajectory-equivalent to milestone 1 over a fixed number of accepted steps.

**3. Selection and alerting.** `fuelSystem.ts` with AUTO, LEFT/RIGHT, unusable
handling, imbalance and FUEL LOW. Extract `casModel.ts` and move stall warning
and stick pusher onto it unchanged.
*Done when:* `fuelSystem.test.ts` and `casModel.test.ts` pass, the pusher still
outranks stall warning on the existing HUD line, and an imbalance is visible as
a rolling moment in flight.

**4. The Fuel tab.** Quantities, selector, load, and the diagram. The diagram
ships in this milestone, not after it — it is the point of the feature.
*Done when:* `FuelPanel.test.tsx` passes, the panel is legible at 400 px, and
every number in the diagram is also present as text.

**5. The `system` rung.** Electric pump and latch, both valves, shutoff, fuel
temperature, failure injection, remaining CAS messages.
*Done when:* every CAS message in §1 is reachable, each by a named condition or
a named injected failure, and failures do not survive a reload.

**6. Cleanup.** Recorder columns, and update this file's Status line and §12
with what was actually built.

## 12. Deferred, and what would be needed

- **Collector tanks as real masses.** `FGTank` supports transfer through
  `external-flow-rate-pps`, and its own documentation warns that flow must be
  stopped before the source empties "to prevent phantom fuel being created", so
  a transfer controller has to clamp against the source quantity every step.
  Deferred because a collector holds a few gallons on the aircraft centreline:
  its CG contribution is invisible, and the one behaviour it would buy —
  keeping the engine running briefly after the wing outlet uncovers — is
  modelled directly by the §6 grace timer, which JSBSim could not produce from
  tank geometry in any case. Revisit if a source ever gives collector capacity
  and the real reserve time; the grace timer would then be replaced, not
  supplemented.
- **Caution-level FUEL LOW thresholds** and the **probe count** behind
  FUEL QTY MISCOMPARE. Both come from Section 7, which this AFM does not
  contain (537 / 7-1). A secondary flashcard source claims eight probes; that
  is not evidence. Add them to
  [`sf50-cirrus-questions.md`](../validation/sf50-cirrus-questions.md) and to
  the owner data request, and leave the caution unimplemented until a primary
  source or the PIM arrives — an invented threshold in a CAS table is worse
  than a missing message.
- **The tank temperature property tie** is tracked separately as an upstream
  candidate, not deferred: see
  [`jsbsim-fuel-tank-temperature-property.md`](../validation/jsbsim-fuel-tank-temperature-property.md).
  It is a prerequisite for the preferred fuel-temperature path in §6, and the
  fallback exists so this proposal does not block on upstream review.
- **Refuelling vent-off from a heavy wing**, and the filter bypass as a real
  flow restriction.
