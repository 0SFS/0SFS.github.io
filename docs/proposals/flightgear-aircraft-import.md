# Importing aircraft from FlightGear

Status: **Proposed**
Date: 2026-09-19
Reviewed checkout: OSFS `dd6b9315`, dirty
Evidence: [adding aircraft from FlightGear](../flightgear-aircraft.md) and
[its records](../../validation/evidence/aircraft/flightgear-inventory-2026-09-19/)

This proposal does not authorize implementation, does not change the app, and
does not settle the licence question in
[Licences](../flightgear-aircraft.md#licences). It is a plan to argue with.

## Intended result

Adding an aircraft becomes a reviewable data change rather than a code change:

```sh
npm run import:aircraft -- --package dr400 --variant dr400-dauphin
npm run check:aircraft -- robin-dr400
```

The first command writes an aircraft package — flight model, mesh, rig
bindings, profile, credits and licence record — under `public/aircraft/` and
`public/jsbsim-data/`, plus the mapping file that produced it. The second flies
it headless in the JSBSim build 0sfs ships and leaves evidence a reviewer can
read in a minute. Nothing under `src/` changes for the new aircraft.

Today the opposite is true: `AircraftId` is a closed union, and each aircraft
needs hand-written entries in the catalogue, the FDM profile, the data
manifest, the info list and the rig. That hard-coding, not the supply of
aircraft, is what limits the fleet. The measurement behind this proposal is
that **140 FlightGear JSBSim variants across 98 packages already stand, make
thrust and fly in our own engine**, with no per-aircraft work at all.

## Non-goals

- Nasal interpretation. Systems come across as a mapping file of defaults, or
  not at all.
- Cockpits, instruments, FlightGear sounds, liveries.
- YASim. Aircraft whose only flight model is YASim are out of scope, except
  where a JSBSim flight model exists elsewhere for the same type.
- Fidelity. Passing the checks is not "flies like the aircraft", and no
  imported aircraft should claim calibration.
- Replacing the procedural Cessna 172 and Vision Jet meshes, or changing how
  either flies. Stages 1 to 3 are refactors that must be provably behaviour-free.

## What constrains the design

- **Choosing an aircraft already reloads the page**
  (`createFlightSimApp.ts:1415`), so a package can be fetched at boot and no
  hot-swap machinery is needed.
- **Licences vary per aircraft** and some forbid use outright (`f104` is
  CC-BY-NC-SA). The import must refuse to proceed without a recorded licence.
- **FlightGear exteriors are 12k–64k triangles** against ~1,000–1,500 for ours,
  so an imported mesh is an opt-in HD level with generated levels beneath it —
  except for the older FlightGear models that are already small enough.
- **The two existing aircraft are the regression suite.** Every refactor stage
  below is accepted only if their generated packages reproduce today's
  constants exactly.

## Stage 0 — The licence decision (blocks shipping, not work)

Yours to make, and it is two questions: does aircraft data shipped with the app
combine with AGPL code into one work, and for each aircraft is the grant
GPL-2.0-or-later rather than GPL-2.0-only. FlightGear's FGAddon policy has been
GPLv2+ since August 2015, 143 of 180 packages state something themselves, and
37 rely on the policy alone.

What the import tool enforces regardless of the answer: an aircraft is rejected
unless its package records a licence, its source revision, and its authors; and
any aircraft whose own files contradict FGAddon's policy (non-commercial,
"not to be sold") is refused with that reason printed.

## Stage 1 — Aircraft packages as data

The core change, and the one worth doing even if no FlightGear aircraft is ever
imported.

**New file `src/flight/aircraft/aircraftPackage.ts`**: the package type and a
validator in the style of `resolveAircraftDataFiles` — explicit checks, clear
errors, no new dependency. One package per runtime aircraft:

```jsonc
{
  "id": "dhc-6-300",
  "schema": 1,
  "label": "de Havilland Canada DHC-6-300 Twin Otter",
  "summary": "Twin turboprop utility aircraft. Imported flight model; not calibrated.",
  "provenance": {
    "source": "FGAddon dhc6, revision 18298, variant dhc6jsb",
    "authors": ["Syd Adams", "Christian Thiriot", "Bo Lan", "…"],
    "licence": "GPL-2.0-or-later (docs/COPYING; FGAddon policy GPLv2+)",
    "url": "https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/dhc6/"
  },
  "fdm": {
    "model": "dhc6jsb",
    "files": ["aircraft/dhc6jsb/dhc6jsb.xml", "aircraft/dhc6jsb/Engines/PT6A-27.xml", "…"],
    "sharedSystems": ["systems/hydrodynamics.xml"]
  },
  "profile": {
    "engines": 2,
    "engineKind": "turboprop",
    "gauges": { "primary": "propulsion/engine[0]/n1", "secondary": null, "label": "N1 %" },
    "stance": { "staticMeters": 1.489, "staticPitchRad": 0.0005, "pitchArmMeters": 4.6, "rollArmMeters": 5.9 },
    "rudderSign": 1,
    "flapPosition": { "property": "fcs/flap-pos-norm", "fullTravel": 1 },
    "initialGearDown": true,
    "initialThrottleNorm": 0.35,
    "runwayPresets": { "departure": {  }, "arrival": {  } },
    "bodyCollisionProbes": [{ "name": "nose", "left": 0, "up": 0.2, "forward": 4.06 }]
  },
  "shim": { "propulsion/refuel": 1, "/controls/ice/wing/lift-coefficient": 1 },
  "controls": { "elevator": ["fcs/elevator-cmd-norm"], "throttle": ["fcs/throttle-cmd-norm[0]", "fcs/throttle-cmd-norm[1]"] },
  "lods": [{ "id": "hd", "path": "aircraft/dhc-6-300/hd.glb", "triangles": 28491, "autoFromMeters": 0, "optIn": true, "credit": {  } }],
  "rig": [{ "node": "L.aileron", "source": "aileronLeft", "axis": [1, 0, 0], "pivot": [-7.76, 0.1, 0.76], "factorRad": 0.35 }]
}
```

**Where each field comes from** is already established: the stance from the
smoke test's ground settle, the engine kind from the engine element, the
collision probes from the model's STRUCTURE contacts, the model offset from the
FDM's visual reference point minus the CG, the rudder sign from a rudder step.
See [The profile](../flightgear-aircraft.md#3-the-profile).

**Migration, file by file:**

| File | Change |
| --- | --- |
| `aircraftIds.ts` | `AircraftId` becomes `string` validated against the loaded registry; `isAircraftId` checks the registry. Stored preferences keep working because the ids do not change |
| `aircraftCatalog.ts` | Families, variants and LOD ladders read from packages; the pure-data character and the LOD selection rules stay |
| `fdmProfiles.ts` | `getFdmProfile` reads the package's `profile`; the C172 and SF50 profiles move into their generated packages verbatim |
| `hydrateJsbsimData.ts` | File list from the package; `public/jsbsim-data/manifest.json` becomes generated output rather than a hand-edited file |
| `sf50Variants.ts` | Stays as the evidence record it is; the three variants become three packages that cite it |
| `info/aircraft.ts` | Generated from the registry, ending the "keep in sync by hand" comment it carries today |
| `createFlightSimApp.ts` | Loads the package beside the existing JSBSim data fetch; the seven `getFdmProfile` call sites keep their shape |

**Acceptance:** a test asserts the generated `cessna-172`, `cirrus-vision-jet`,
`-g2` and `-g3` packages deep-equal today's `FDM_PROFILES`, `AIRCRAFT_FAMILIES`
and manifest entries. `npm run ci` green. No visual or physics change, and the
JSBSim runtime parity check unchanged.

## Stage 2 — More than one engine, and more engine kinds

`applyFlightControls` writes `fcs/throttle-cmd-norm` (engine 0 only) and there
are 31 other `engine[0]` references outside tests. Change: throttle, mixture
and magneto writes loop over `profile.engines`; the HUD gauge row and the audio
adapter take the engine list from the package; `engineKind` gains `turboprop`,
`electric` and `none`, each with a gauge set and an audio fallback.

**Acceptance:** C172 and SF50 property writes are byte-identical (test);
a twin drives both engines (test against the DHC-6 package); the audio
adapter's turbine path is untouched for the SF50.

## Stage 3 — Rig bindings as data

`aircraftAnimation.ts` binds fixed node names with axes in code. Replace the
table with the package's `rig` array: node, source, axis, pivot, travel and
optional window (the gear/door sequencing already expressed for the SF50).
Sources are an enumerated list (`elevator`, `aileronLeft`, `flap`, `rudder`,
`gearPos`, `propellerRpm[n]`, …), so a package cannot invent behaviour.

This is also what removes the single-`Propeller` limit and accepts FlightGear's
arbitrary hinge axes, which it gives us as data.

**Acceptance:** the built-in packages reproduce today's rig exactly — a test
samples control positions and asserts identical node transforms before and
after. That test is the safety net for the whole stage.

## Stage 4 — The converter, flight-model half

`scripts/aircraft/import-flightgear-aircraft.py`, reusing the scan machinery
already written (`scripts/validation/aircraft/scan-flightgear-aircraft.py`):
fetch the package by range requests, resolve the variant's `-set.xml`, copy the
flight model's file closure, derive the profile, and write the package plus a
mapping file.

**The mapping file** is the per-aircraft human input, kept in the repository at
`planes/imported/<id>/import.json`:

```jsonc
{
  "package": "dhc6", "variant": "dhc6jsb", "revision": 18298,
  "propertyDefaults": { "/controls/ice/wing/lift-coefficient": 1 },
  "controls": { "elevator": ["fcs/elevator-cmd-norm"] },
  "engineStart": { "propulsion/set-running": -1, "fuelFeed": "tanks 0,1" },
  "exclude": ["Models/floats.ac"],
  "licence": { "statement": "GPL-2.0-or-later", "evidence": "docs/COPYING" }
}
```

Defaults are generated (the heuristics in the smoke harness: 0, or 1 for a
multiplied factor or a `serviceable` flag, never for a position or failure) and
then edited by a person. The generated file records which values were guessed,
so review has something to look at.

**Shared systems:** `public/jsbsim-data/systems/` gains the JSBSim files
FlightGear serves as the global systems path, under JSBSim's LGPL-2.1 with its
notice. Nine models here load only because of them.

**Acceptance:** `npm run check:aircraft -- <id>` runs the smoke checks plus a
takeoff and a landing, writes to `validation/evidence/aircraft/<id>/`, and
fails on: no licence record, a property default the mapping does not mention,
non-finite state, or a stance that disagrees with the mesh by more than 0.1 m.

## Stage 5 — Three aircraft, by hand, in public

Prove the pipeline on three that already fly and whose licences are stated:

| Aircraft | Variant | Why this one | Licence |
| --- | --- | --- | --- |
| Cessna T-37 | `t37` | 0.9 MB, 4,735 triangles, twin turbine, trims at 120 kt — the cheapest complete test | GPL-2.0 (`COPYING`) |
| Robin DR400 Dauphin | `dr400-dauphin` | GA piston 0sfs does not have, 28,503 triangles | GPL-2.0 (`COPYING`) |
| DHC-6-300 Twin Otter | `dhc6jsb` | Twin turboprop; exercises `engineKind`, two propellers and a 159 MB source package | GPL-2.0 (`docs/COPYING`) |

The Cessna 172R and 182RG are more tempting still (1,385 and 6,316 triangles)
but state no licence of their own, so they wait on Stage 0.

Fly each yourself before the next one. If the third costs materially more than
the second, the pipeline is not ready for Stage 7.

## Stage 6 — The model pipeline

Promote the feasibility converter to a real one: evaluate `select` conditions
for the variant, convert SGI `.rgb` and DDS textures, generate levels with a
mesh simplifier, keep the FlightGear mesh as the opt-in `hd` level with its
credit, and emit a thumbnail. Node names are preserved, which is what makes the
rig bindings possible.

**Acceptance:** each level's triangle count recorded in the package and shown
in the UI as now; the gear/flap/propeller bindings verified by the data
equivalent of `verify_rig.py`; no level ships without its credit.

## Stage 7 — The queue

The inventory's 98 packages become a queue. Per aircraft: mapping file, run the
check, record the licence, look at it, commit. Reject rather than fight: an
aircraft that needs more than its mapping file is a bug report for later, not a
blocker.

## What happens to what exists

- `public/jsbsim-data/manifest.json` becomes generated; its current content is
  reproduced exactly at Stage 1.
- `planes/Cessna_172/` and `planes/Cirrus_Vision_Jet/` are untouched. Authored
  aircraft and imported aircraft produce the same package format, which is the
  point: [aircraft-assets.md](../aircraft-assets.md) keeps describing how ours
  are made.
- `ASSET_LICENSES.md` gains one row per imported aircraft.
- `AIRCRAFT_IDS` stops being a compile-time union. Anything that relied on
  exhaustiveness gets a runtime check instead; the stored preference keys are
  unchanged.

## Risks and open questions

1. **Licence (Stage 0)** — yours. Everything else is reversible; this is not.
2. **Per-aircraft tuning could swallow the saving.** If the median import needs
   more than an afternoon, the answer is fewer aircraft, better chosen, not a
   bigger converter. Measure it over Stage 5's three.
3. **Mesh weight.** A 28k-triangle default is 20× ours. Decide whether imported
   aircraft default to a generated level and keep HD opt-in (my recommendation),
   or ship heavy and let Auto sort it out.
4. **Auto-trim on heavy aircraft.** The stand-in pilot needed trim to hold an
   airliner level. 0sfs's auto-trim gains may need to be per-package.
5. **Losing the compile-time union** weakens a guarantee TypeScript gives us
   today. The validator and the golden-values test are the replacement; if that
   trade feels wrong, the alternative is code generation of the union at build
   time, which keeps the guarantee and costs a build step.
6. **Upstream fixes.** The J3 Cub's `-32.5.0` and the C182S's missing engine
   file are one-line fixes that belong in FGAddon. Contributing them back is
   cheap goodwill and shrinks our patch set.

## Effort, roughly

| Stage | Size |
| --- | --- |
| 1. Packages as data | 2–3 days, mostly the migration and its golden-values tests |
| 2. Engines | half a day |
| 3. Rig as data | 1–2 days, most of it the equivalence test |
| 4. Converter, FDM half | 2 days, reusing the scan and smoke tools |
| 5. Three aircraft | half a day each, plus flying them |
| 6. Model pipeline | 2–4 days, and the least predictable |
| 7. Queue | an hour or two per aircraft |

Stages 1 to 3 are worth doing on their own merits. Stage 4 onwards is only
worth starting once Stage 0 has an answer.

## Questions for the owner

1. The licence stance in Stage 0, and whether "policy only" aircraft (37 of
   180) are acceptable or must be skipped.
2. Default mesh policy: generated levels with FlightGear's mesh as opt-in HD, or
   FlightGear's mesh as the default level?
3. Is losing the compile-time `AircraftId` union acceptable, or should the
   union be generated at build time?
4. Is the first batch the right three, and is three the right number before
   Stage 7?
