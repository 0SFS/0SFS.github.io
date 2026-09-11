# SF50 flight model and the per-aircraft FDM seam

Status: proposal, awaiting approval
Date: 2026-09-11
Scope: per-aircraft JSBSim FDM selection, a Cirrus SF50 flight model, and the
per-aircraft physics constants the seam needs. The C172 is unchanged.

## Problem

OSFS has one flight model and loads it by name. `bootstrapC172p` calls
`sdk.loadModel("c172p")` unconditionally, `createJsbsimRuntime` calls
`bootstrapC172p` unconditionally, and no aircraft identifier exists anywhere on
that path. `AircraftDefinition` describes meshes, a yaw, a model offset and a
blade count — nothing physical. `onAircraftChange` writes a preference and
swaps the mesh; JSBSim is never told the aircraft changed.

So the Vision Jet does not reference the C172's FDM and does not own a copy of
it. There is no SF50 FDM at all, and no seam through which one could be
selected. `grep -l fdm_config` over every XML in the repository returns exactly
one file. This is two pieces of work: author an SF50 FDM, and build the
selection seam that does not yet exist.

## What the engine permits, measured rather than assumed

The obvious design — call `loadModel` again when the aircraft changes — does not
work, and fails in the worst available way. Measured against
`@0x62/jsbsim-wasm` 1.2.4-beta.4 by loading the c172p, stepping it, then loading
a second model (a c172p copy with a 195.7 sq ft wing, synthesised into MEMFS):

| probe | result |
| --- | --- |
| `loadModel` second call, return value | **`true`** |
| `metrics/Sw-sqft` after it | `0` — neither the old 174 nor the new 195.7 |
| `position/h-sl-ft` after it | stale: the pre-load value |
| write `simulation/dt` (FGFDMExec-owned) | succeeds |
| write `ic/h-sl-ft` (FGInitialCondition-owned) | **traps: "function signature mismatch"** |
| `runIc()` | **traps** |
| `run()` | **traps** |

The second load deallocates the models the property tree still points into, so
the surviving nodes hold dangling function pointers. Anything owned by
`FGFDMExec` itself keeps working; anything owned by a reallocated model traps in
WebAssembly. The call reports success first, so the corruption is silent until
the next `ic/` write or step.

Full replacement is clean and repeatable in both directions:

| probe | result |
| --- | --- |
| `destroy()`, `create()`, `loadModel("probe")` | `runIc` true, 60 steps true, `Sw-sqft` **195.7** |
| `destroy()`, `create()`, `loadModel("c172p")` | `runIc` true, 60 steps true, `Sw-sqft` **174** |

**Two conclusions drive the whole design.** The FDM is changed by replacing the
runtime, never in place. And because the broken path returns `true`, the seam
must make a second `loadModel` on a live exec *unreachable* rather than merely
discouraged — a review comment is not enough protection against a failure that
reports success.

A second probe settles the gear property question by observation rather than
recollection. Read before anything writes them, on a freshly initialised c172p:

| property | value | meaning |
| --- | --- | --- |
| `gear/gear-cmd-norm` | 1 | JSBSim owns and publishes it |
| `gear/gear-pos-norm` | 1 | JSBSim owns and publishes it |
| `fcs/gear-cmd-norm` | 0 | identical to `nonsense/not-a-property`: does not exist |

Writing `fcs/gear-cmd-norm = 0` leaves `gear/gear-cmd-norm` at 1. Writing
`gear/gear-cmd-norm = 0` moves the command, and `gear-pos-norm` stays at 1
because the c172p has fixed gear. `gear/gear-cmd-norm` is canonical;
`fcs/gear-cmd-norm` in `resetFlightLocation.ts:62` and the snapshot list in
`safeFlightState.ts:29` address nothing.

## Goals

- An aircraft id selects its own JSBSim FDM, engine and data files.
- The SF50 flies a real SF50 model: turbofan, V-tail ruddervators, retractable
  gear, its own mass and stance, calibrated against published performance.
- Values that are C172 measurements today become per-aircraft, and omitting one
  for a new aircraft is a compile error rather than a silent C172 borrow.
- The C172 boots, flies and tests exactly as it does now.
- Every step is additive and reversible.

## Non-goals

- Replacing the c172p data, or resolving its "not to be sold" provenance.
- Systems depth beyond flight: no FADEC schedule modelling, no ITT simulation
  beyond a displayed limit, no electrical or pressurisation model.
- Engine sound, which is a separate task.
- A second mesh stance pass; the visual offset follows the measured stance.

## Design

### 1. An aircraft id maps to its FDM through two registries with one source of truth

`AIRCRAFT_IDS` stays the only place that says which aircraft exist. Add
`src/flight/jsbsim/fdmProfiles.ts`:

```ts
export interface FdmProfile {
  /** JSBSim model name: aircraft/<model>/<model>.xml in MEMFS. */
  model: string;
  engine: "piston" | "turbine";
  /** Sign applied to the normalised yaw command at the physics boundary. */
  rudderSign: 1 | -1;
  stance: {
    staticMeters: number; staticPitchRad: number;
    pitchArmMeters: number; rollArmMeters: number;
  };
  /** Property spellings the HUD reads for this engine type. */
  gauges: { primary: string; secondary: string | null; label: string };
  initialThrottleNorm: number;
}

export const FDM_PROFILES: Record<AircraftId, FdmProfile> = { ... };
```

`Record<AircraftId, FdmProfile>` is the load-bearing choice. Adding an entry to
`AIRCRAFT_IDS` without an FDM profile fails to compile, so a new airframe cannot
quietly inherit the Cessna's physics the way the Vision Jet does today. A
runtime lookup in a single combined table cannot offer that.

The profile lives beside the JSBSim code rather than in `aircraftCatalog.ts`
because its vocabulary is physics — turbine gauge property spellings, stance
lever arms — and the catalog is imported by the panel and the mesh loader. The
one value that must not drift between them is the stance:
`modelOffset.y` is `-1.33` by hand in both catalog entries today, with a comment
warning that it has to equal the physical settle height. The catalog derives it
from the profile instead, so the visual stance cannot disagree with the
simulated one.

Data files become keyed per aircraft in `public/jsbsim-data/manifest.json`:

```json
{
  "files": ["...every file, unchanged..."],
  "aircraft": {
    "cessna-172": ["aircraft/c172p/c172p.xml", "...", "engine/eng_io320.xml", "engine/prop_75in2f.xml"],
    "cirrus-vision-jet": ["aircraft/sf50/sf50.xml", "engine/eng_fj33.xml", "engine/direct.xml"]
  }
}
```

`files` is retained as the union of every aircraft's files, for one specific
reason: the three C172 integration tests read `manifest.files` directly and
write all of it into MEMFS. Keeping the key means those tests keep passing
untouched, and writing a few extra unused files into MEMFS costs nothing. The
app reads `aircraft[id]` so booting the Cessna does not download the jet's XML
and the loading progress count stays truthful. Dropping the redundant union
instead would cost a two-line edit in each of three test files — a decision
gate, not a blocker.

`downloadJsbsimData(baseUrl, onProgress)` gains an aircraft id, and caches
fetched contents in a module-level map so a later swap back is instant and does
not re-enter the network.

### 2. Bootstrap is parameterised by adding a sibling, not by rewriting

New `src/flight/jsbsim/bootstrapAircraft.ts` takes an `AircraftId`, reads its
profile, configures paths, loads `profile.model`, applies initial conditions,
and starts the engine the way that engine type starts:

- piston: `propulsion/set-running`, `propulsion/magneto_cmd`, and the existing
  altitude-scheduled `fcs/mixture-cmd-norm`.
- turbine: `propulsion/set-running` only. A FADEC turbofan has no mixture and
  no magnetos, so neither property is written.

`bootstrapC172.ts` keeps its filename and all three exported symbols —
`bootstrapC172p`, `START_ALTITUDE_AGL_METERS`, `DEFAULT_FLIGHT_START` — and
`bootstrapC172p` becomes a wrapper that delegates with `"cessna-172"`. The three
integration tests import `bootstrapC172p` and are not edited; if delegation
changed the Cessna's boot in any way, they fail. That is the test for this step,
not a claim about it.

### 3. Switching the FDM replaces the runtime behind a stable accessor

`jsbsim.sdk` is captured at construction by five long-lived collaborators —
`createFixedStepPhysicsLoop`, `createTerrainContact`,
`createVisibleMeshCollision`, `createWheelSpinExperiment`, and the two debug
overlays — plus roughly thirty inline uses in `createFlightSimApp` closures.
Replacing the runtime while any of them holds the old pointer is the WASM trap
above, reached from five directions.

Those collaborators take `getSdk: () => JSBSimSdk` instead of `sdk`, and read it
at each use. Inside each module the change is mechanical (`sdk.` becomes
`getSdk().`) and the property is fetched at the point of use, so a stale capture
becomes unrepresentable rather than merely avoided. The alternative — a
`rebind(sdk)` method on each — adds five mutable fields that a sixth
collaborator can forget to register with, which is the silent failure again. The
cost is one closure call per property access: `readFlightState` performs about
fourteen reads per step, so about 1.7k extra calls per second at 120 Hz, far
below measurable.

A `FlightModelHost` owns the current runtime and is the only thing that may
construct or destroy one:

```ts
interface FlightModelHost {
  getSdk(): JSBSimSdk;
  getAircraftId(): AircraftId;
  swap(id: AircraftId): Promise<void>;
  dispose(): void;
}
```

`swap` pauses the physics loop, captures the flight state with the existing
`captureSimulation` snapshot plus position and attitude, disposes the old
runtime, creates a new one for the target aircraft, restores the snapshot
through the existing `restoreSimulation` path, resets the loop, and resumes.
Babylon, terrain, tile cache and camera are untouched — the boot code already
builds the JSBSim runtime as a promise independent of the renderer, so nothing
about the world depends on which FDM is loaded.

Two details the snapshot has to handle. Restoring across airframes carries
kinematics, not configuration: throttle and trim are normalised and transfer,
but a mixture value means nothing to a turbine and is dropped by engine type.
And a state valid for a C172 can be outside the SF50's envelope or vice versa —
a 67 kt restore into a jet whose clean stall is 86 kt. `swap` therefore
restores, runs the existing `invalidFlightStateReasons` check, and on failure
falls back to the aircraft's own bootstrap initial conditions rather than
handing the loop a state it will immediately fault on.

**This is staged.** Stage 1 selects the FDM at boot from the stored preference
and ships the SF50 model; the panel switches the mesh immediately and says the
flight model applies on reload. Stage 2 adds `swap` and removes the reload. The
SF50 FDM — the actual deliverable — is therefore not blocked behind the riskiest
refactor in this document, and Stage 2 can be approved, deferred or dropped on
its own. The cost of stopping after Stage 1 is that changing aircraft needs a
page reload to change the physics, which is worth stating plainly if the panel
is going to be demonstrated.

### 4. Where the C172's constants go

| today | location | becomes |
| --- | --- | --- |
| `STATIC_STANCE_METERS = 1.33` | `safeFlightState.ts:76` | `profile.stance.staticMeters` |
| `STATIC_PITCH_RAD = 2.48 deg` | `safeFlightState.ts:80` | `profile.stance.staticPitchRad` |
| pitch arm `4.5`, roll arm `5.5` | `aircraftClearanceMeters` | `profile.stance.*ArmMeters` |
| `modelOffset.y = -1.33` (x2) | `aircraftCatalog.ts:133,148` | derived from the profile stance |
| `-controls.rudder` | `applyFlightControls.ts:29` | `profile.rudderSign * controls.rudder` |
| mixture schedule, magnetos | `bootstrapC172.ts`, `resetFlightLocation.ts` | `profile.engine === "piston"` |
| `engine-rpm`, `power-hp` | `flightHud.ts`, `aircraftAnimation.ts` | `profile.gauges` |

`aircraftClearanceMeters(roll, pitch)` gains the stance as an argument. Every
caller already sits downstream of a known aircraft.

The SF50's stance is **measured, not chosen** — the same method that produced
the C172's 1.33 m. Drop the finished FDM onto a known terrain elevation, let the
gear settle, and read the reference-point height and pitch. The number goes into
the profile afterwards; a guessed stance is what makes repositioning bounce.

### 5. How the C172 stays identical

- `c172p.xml`, `eng_io320.xml`, `prop_75in2f.xml`, `reset00.xml`, `reset01.xml`
  and the three `c172*.integration.test.ts` files are not edited. If anything
  appears to require it, the work stops and asks.
- `bootstrapC172.ts` is edited only to delegate, keeping its exported names and
  behaviour. The integration tests are the check.
- The C172's profile transcribes today's constants verbatim: stance 1.33 m,
  pitch 2.48 deg, arms 4.5 / 5.5, `rudderSign: -1`, piston gauges, mixture on.
- A new test asserts the C172 profile still equals those literals, so a later
  edit to the profile table cannot quietly retune the Cessna.
- `npm run ci` (lint, test, build) is green at every commit.

## The four hazards

**Gear property name.** Canonicalise on `gear/gear-cmd-norm`, the spelling
JSBSim publishes, and fix `resetFlightLocation.ts:62` and the snapshot list in
`safeFlightState.ts:29`. Inert today; the moment the SF50 retracts, a reposition
would restore gear state into a property nothing reads.

**Stance constant.** Per-aircraft, measured, as in section 4.

**Magneto and mixture writes.** Conditional on `profile.engine`, in both
`bootstrapAircraft` and `resetFlightLocation`. The piston branch keeps its
current code path unchanged rather than being refactored around.

**HUD engine gauges.** The panel reads `propulsion/engine/engine-rpm` and
`power-hp`, which a turbine does not publish, so the jet would show zeros. The
profile names what to read — N1 and N2 percent and thrust for the turbine, RPM
and horsepower for the piston — and the HUD renders the profile's label. This is
in scope for this pass because the panel is what gets looked at. The ITT and N2
limits (877 °C for 10 s, 862 °C for 5 min, N2 100% at about 22,500 rpm) are
displayed as limits against N2; ITT itself is not simulated.

## The SF50 FDM

POH-primary, from `planes/Cirrus_Vision_Jet/agent_workspace/measurements/sf50_reference.md`
and the factory three-view it derives from (AFM P/N 31452-001 Rev 4, Figure 1-1).

**Metrics.** Wing area 195.7 sq ft certificated; span 38.70 ft (11.796 m); MAC
5.21 ft (1.589 m, from the measured root 1.968 m and tip 1.134 m, taper 0.576);
dihedral 4.81 deg. The V-tail's 4.481 m projected span at 38.7 deg dihedral
gives a 6.32 m^2 (68.0 sq ft) panel area, whose horizontal- and
vertical-equivalent areas are `S cos^2 G` = 41.4 sq ft and `S sin^2 G` = 26.6 sq
ft. Tail arm 13.6 ft, quarter-chord to quarter-chord.

The Olejniczak and Nowacki planform is a fallback only, for what the POH does
not draw. Its half-span implies 10.8 m against a certificated 11.796 m, so its
dihedral (7.4 deg) and MAC (1.718 m) both run high by about the same 8%.

**Frame.** The FDM datum is the nose tip, x positive aft, converting from the
reference document's working-Y by negation. The TCDS A00018CH datum (89 in
forward of the forward cabin bulkhead) needs the bulkhead station, which the
three-view does not call out; the offset between the two is recorded when it is
established, and nothing in the FDM depends on it because only relative
positions matter. Weight-and-balance figures quoted against the TCDS datum are
converted at the point of use.

**Mass.** MTOW 6,000 lb, max ramp 6,040, MLW 5,550, MZFW 4,900, empty about
3,550, usable fuel 296 gal (about 1,983 lb), max aft baggage 300 lb. Inertias
are estimated by radii of gyration from the measured geometry and then tuned
against the roll and pitch response targets, which is the only honest route
without a manufacturer figure.

**Engine.** One Williams FJ33-5A as `<turbine_engine>` with
`<thruster type="direct">`: `milthrust` 1846 lbf, takeoff equal to max
continuous, `bypassratio`, `tsfc`, `bleed`, `idlen1`/`idlen2`,
`maxn1`/`maxn2`, `n1spinup`/`n2spinup`, `augmented 0`, `injected 0`, and
`IdleThrust`/`MilThrust` function tables over mach and density altitude.

The thrust line comes from the measured dorsal nacelle — intake lip top at
z = 2.643 m, bore about 0.55 m, nozzle centre near z = 2.07 m — placing it
roughly 1.0 to 1.3 m above the CG, with thrust along the body axis. At 1,846 lbf
and a 1.15 m arm that is about 7,000 lbf ft nose-down at full power, which is
the documented low-speed pitch-power coupling falling out of real geometry.
**No upward thrust vectoring is added.** Cancelling the couple would invert the
aeroplane's most recognisable handling trait. The verification is that the
moment has the right sign and order of magnitude, not that it disappears.

**V-tail FCS.** No elevator and no rudder channel. A ruddervator channel sums
pitch and yaw: left = pitch + yaw, right = pitch - yaw, each surface clipped to
its mechanical travel after the sum. The TCDS gives pitch +20 / -15 deg and yaw
+/-9 deg. Whether those are per-axis authorities that add, or a hard stop on
total travel, is not stated; the model starts with per-axis limits and a total
clip at their sum, and the clip is revisited if a travel figure surfaces. The
aerodynamics carry combined V-tail terms — symmetric deflection for `Cmde`,
antisymmetric for `Cndr` with its attendant roll — not separate horizontal and
vertical tail contributions.

**Limits.** VMO 250 KIAS, MMO 0.53, VO 150, VFE 190, VLE 210 / VLO retract 150,
VS1 86, VS0 67, VR 90, VX 91, ceiling 31,000 ft for the G2+.

**Calibration targets**, sea level ISA, tuned until reproduced: takeoff ground
roll 2,036 ft and 3,192 ft over 50 ft; landing 1,628 ft; climb to FL280 in about
20 min burning about 214 lb over 64 nm; max cruise 300 to 311 KTAS at FL280 to
FL310 at about 462 pph; best economy 242 KTAS at about 315 pph to 1,200 nm;
glide ratio 14.7:1. Each becomes a headless integration test that flies the
manoeuvre and asserts the number within a stated tolerance, so the tuning is
reproducible rather than a remembered session.

## Licensing record

`ASSET_LICENSES.md` gains an entry per source actually used: the authored FDM
XML as original project work; the geometry inputs as the project's own
measurements of the POH figure, with the PDF itself recorded as a manufacturer
document that is not ours to redistribute; and the MATEC paper under CC BY 4.0
if any fallback value is taken from it. The new FDM carries no "not to be sold"
restriction, so unlike the c172p it is not a release blocker.

## Staged implementation

1. **Profiles and parameterised boot.** `fdmProfiles.ts`, `bootstrapAircraft.ts`,
   `bootstrapC172.ts` delegating, keyed manifest. No behaviour change; C172
   tests green.
2. **Per-aircraft constants and the four hazards.** Stance, rudder sign, gear
   property, piston-conditional writes, HUD gauges.
3. **SF50 data.** `sf50.xml`, `eng_fj33.xml`, `direct.xml`, catalog and profile
   entries. The jet boots and flies its own model; stance measured and recorded.
4. **Calibration.** Tune to the performance targets; add the performance tests.
5. **Stage 2, separately approved.** The accessor seam and `swap`.

## Acceptance criteria

- `loadModel` is called exactly once per `JSBSimSdk` instance, structurally.
- Booting either aircraft loads only its own data files.
- The three C172 integration tests pass unedited, and the C172 profile test
  pins today's constants.
- The SF50 reproduces each calibration target within its stated tolerance.
- Full power at low speed produces a nose-down pitching moment.
- Ruddervators deflect within limits and produce combined pitch and yaw.
- The SF50 parks on its own measured stance with the gear down, and repositioning
  does not bounce it.
- The HUD shows N1, N2 and thrust for the jet, RPM and power for the Cessna.

## Open questions

1. Ruddervator limits: per-axis authorities that add, or a hard stop on total
   travel? Starting with the former.
2. Is Stage 2 in scope now, or is a reload acceptable for changing the flight
   model? This changes what the panel says.
3. The manifest's redundant `files` union: keep it to leave the three C172 test
   files untouched, or drop it and edit two lines in each?
