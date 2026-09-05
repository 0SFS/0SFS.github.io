# FOSS Earth Relationship

## Current Structure

Flight Sim and FOSS Earth are separate sibling repositories:

```text
parent-directory/
├── flight-sim/
└── foss-earth/
```

Flight Sim originated from FOSS Earth and still contains a divergent copy of much of its globe runtime. New reusable UI is consumed through the FOSS Earth package boundary instead of being copied again.

## Local Package Link

Flight Sim declares:

```json
"foss-earth": "file:../foss-earth"
```

The npm lockfile marks `node_modules/foss-earth` as a link resolved to `../foss-earth`. Therefore:

- The sibling checkout must exist before installing Flight Sim dependencies.
- Source edits in the sibling package are available through the link.
- Vite may need a restart when package exports or optimized dependencies change.
- `npm install` should be rerun when either package manifest or the lockfile relationship changes.

This local dependency is convenient for developing both repositories together, but it is not a reproducible remote version pin. CI and deployments must check out both repositories in the expected layout, or the dependency must later be changed to a published package or pinned Git revision.

## Imported Surfaces

Flight Sim imports only public FOSS Earth package exports:

| Export | Purpose |
| --- | --- |
| `foss-earth/shell` | Configurable bottom HUD/application bar |
| `foss-earth/shell.css` | Shared shell styling |
| `foss-earth/windowing` | Panel, tab, and workspace primitives |
| `foss-earth/windowing.css` | Shared windowing structure |

The shell is adapted in `src/flight/hud/createFlightHudBar.ts`. The windowing primitives are composed with flight-specific Weather, Aircraft, Location, and Debug content in `src/flight/hud/FlightControlPanel.tsx`.

Flight controls, JSBSim integration, aircraft behavior, instruments, and flight-specific UI remain local to Flight Sim.

## Updating From Upstream

Update and test FOSS Earth:

```sh
cd ../foss-earth
git switch main
git pull --ff-only
npm install
npm run ci
```

Then refresh and validate Flight Sim:

```sh
cd ../flight-sim
npm install
npm run ci
```

If an upstream change adds a new package surface, FOSS Earth must expose it in its `package.json` `exports` map. Flight Sim should consume that public export rather than import internal paths.

## Diverged Globe Code

Updating the linked package only updates code imported from the package exports above. It does not update inherited files under `flight-sim/src`, even when similarly named files exist in FOSS Earth.

For a globe-runtime change that Flight Sim needs:

1. Determine whether the behavior should become a reusable FOSS Earth export.
2. Prefer extracting a stable package API when both applications need it.
3. Otherwise compare and port the relevant change manually into Flight Sim.
4. Preserve Flight Sim-specific rendering, controls, and JSBSim behavior.
5. Run both repositories' tests after shared changes.

Avoid copying the complete FOSS Earth source tree over Flight Sim. The repositories have intentionally diverged, and a blanket copy can remove flight-specific behavior.

## Longer-Term Direction

The current arrangement shares UI primitives but still duplicates much of the globe runtime. A future package extraction could make both applications consume one rendering/globe core, leaving each repository responsible only for its product-specific composition.