# Flight tab inventory and repository decisions

Audited from the current source on 2026-10-08. This is a repository-split
proposal, not a record of completed extractions. Every actual tab has a row
below; an existing section, button, dialog or website route is not counted as
another tab.

The flight application registers **21 distinct tabs: twelve flight definitions
and nine shared definitions**. The twelve are declared in
[`FlightControlPanel.tsx`](../../src/flight/hud/FlightControlPanel.tsx#L82).
The same component mounts the shared
[`WindowOverlay`](../../src/flight/hud/FlightControlPanel.tsx#L925), receiving
its elements and sections from
[`createFlightSimApp.ts`](../../src/flight/createFlightSimApp.ts#L2140).
Registration means a tab is available to open, not that every panel is visible
at once. Saved workspace state controls which panels are open.

## All 21 current tabs

“Dedicated” means the proposal includes a repository for that feature.
“Shared” means no additional repository named after this tab; the row explains
the exception to the one-tab/one-repository default. Shared-world owners remain
in the FOSS Earth organization, even when their tab is first implemented here.

| Exact title / ID | Proposed repository or owners | Decision and reason |
| --- | --- | --- |
| Weather / `weather` | `foss-earth/weather`; flight adapter in `0sfs/simulator` | **Dedicated.** The world weather field and its panel remain correct without aircraft. The simulator adapts accepted samples to JSBSim; it does not create a second weather world. |
| Aircraft / `aircraft` | `0sfs/aircraft`, consuming host-registered `F-35B`, `SF-50`, `C172` packages | **Dedicated.** Common selection, manifest/loading contracts and visual installation belong together. Each aircraft has its own repository; the common library does not import a hardcoded fleet. |
| Fuel / `fuel` | `0sfs/fuel` | **Dedicated.** Fuel controls and installation interfaces have an independent flight feature boundary. Tank configuration stays with aircraft; native dynamics stay in JSBSim. |
| Autopilot / `autopilot` | `0sfs/autopilot` | **Dedicated.** Modes, hold controller, engagement/takeover, backend interface and panel. |
| Controls / `controls` | `0sfs/controls`, with globe input from `foss-earth/engine` and devices from gamepad-tools | **Dedicated flight feature, composed tab.** A pilot operates one Controls tab; device handling and globe gestures retain their upstream owners. This is not a second shared Controls tab. |
| Remote Control / `remote` | `0sfs/remote-control` | **Dedicated.** Pairing, transport, phone application and its settings have one lifecycle and release boundary. |
| Sound / `sound` | `0sfs/sound`; registered `0sfs/engine-sound` and `0sfs/wind-noise` plugins | **Dedicated.** Sound owns the panel, audio lifecycle, mixing/propagation and source contracts. Separate source models register their controls here; they do not require duplicate tabs. Engine-specific profiles live in engine repositories. |
| Exhaust / `exhaust` | `0sfs/exhaust` | **Dedicated.** Plume/optical rendering and its controls. Engine definitions supply optical data and aircraft supply installations. |
| Engine / `engine` | `0sfs/engines`, plus individual engine-family repositories | **Dedicated common feature.** Common observations, instruments, control/loading contracts and panel; `F135`, `FJ33` and `IO320` supply their definitions. Keep the existing singular tab label and ID despite the plural repository name. |
| G-forces / `gforces` | `0sfs/g-forces` | **Dedicated.** Pilot-load interpretation, overlays and controls; native vehicle dynamics remain in JSBSim. |
| Logging / `logging` | `0sfs/logging` | **Dedicated.** Flight recorder, channels, history and export. The generic status log belongs to `foss-earth/ui`, not this recorder. |
| Debug / `debug` | `0sfs/simulator` composition; diagnostic implementations with their feature owners | **Shared.** This tab combines frame budget, forces, contacts and aircraft visuals. A separate `debug` repository would either take code away from those owners or merely wrap their sections. The host registers them; proposed developer-only tooling is covered separately below. |
| Location / `location` | `foss-earth/engine`; flight placement callback in `0sfs/simulator` | **Shared.** This is the globe's navigation entry point: search/coordinates produce a destination that camera and surface services resolve. The flight host adds teleport/start placement. A panel-only `location` repository would split that entry point from its navigation contract; independently released search providers could justify a later boundary. |
| Map / `map` | `foss-earth/engine` | **Shared.** Map sources, terrain/imagery selection, residency and authoritative surface queries are the globe engine's central feature and one resource owner. A second `map` repository would currently duplicate the engine boundary. Device/scene/frame services are extracted separately into Renderer. |
| Renderer / `renderer` | `foss-earth/renderer`, with feature-owned section contributions | **Dedicated.** Backend, GPU resources and frame scheduling form a separate lifecycle. Aircraft instrument and external-tank controls keep their flight owners while appearing here. |
| Sky / `sky` | `foss-earth/sky` | **Dedicated.** Shared atmosphere/astronomy/lighting and its panel. |
| Date and time / `time` | `foss-earth/sky`; clock supplied by the host | **Shared with Sky.** Both panels operate the same `sky.time.*` astronomy model. A separate repository would divide one model between two releases; the host retains the authoritative scene/simulation clock. |
| Interface / `interface` | `foss-earth/ui` and `foss-earth/toolbar`; engine-provided position/search services | **Shared composition.** UI owns generic controls/windowing/log presentation, Toolbar owns bottom-bar layout, and features provide displayed values and callbacks. Another `interface` repository would only assemble these same settings; it would have no separate state or lifecycle. |
| Settings / `settings` | `foss-earth/ui`, with host registry construction | **Shared with UI.** Presets, saved-record import/export and diagnostics enumerate the registered settings. They must use the same registry and migrations as feature panels; this is the registry's management view, not another owner of feature settings. |
| About / `about` | `0sfs/about` consuming `foss-earth/about` | **Dedicated.** Flight content/build-manifest adapter and shared viewer have distinct owners. The viewer accepts metadata; it never imports the applications described by the graph. |
| Bug report / `bug-report` | `foss-earth/ui`, with flight diagnostics and reporter configuration | **Shared with UI.** The report composer reads the UI's registered diagnostics and log providers. Keep its form, redaction and report lifecycle with those contracts; flight only supplies its identity and observations. A separate reporting package can be reconsidered if it becomes an independently consumed service. |

These are draft boundary decisions, including the explicit exceptions. They
are not arguments against revisiting a boundary during this brainstorm.
The [split specification](repository-split.md) defines contracts, migration
order and the [proposed dependency graph](repository-split-graph.html).

## Availability and exclusions

All twelve flight tabs are unconditional registrations. Aircraft-dependent
STOVL, afterburner and Engine Simulation controls hide **sections**, not their
parent tabs. ArduPilot's disabled Connect SITL control is a **button** inside
Autopilot, not an additional or disabled tab.

The shared overlay always registers Location. Interface and Settings require
section arrays; Map, Renderer, Sky, Date and time, About and Bug report require
their panel elements. Flight supplies all of these. Missing build metadata or
issue-reporter configuration does not remove About or Bug report. The shared
Controls sections prop is omitted because flight supplies its own `controls`
definition. See the shared
[registration conditions](../../../foss-earth/src/shell/WindowOverlay.tsx#L160).

Flight does **not** supply Scenes, the dynamically titled `360: <image>` tab,
or 360 image settings. Those are covered in the authoritative
[FOSS Earth inventory](../../../foss-earth/docs/proposals/tab-inventory.md)
and the [UMN tour inventory](../../../UMN-VR/UMN-VR.github.io/docs/proposals/tab-inventory.md).

**Dev is proposed, not a current tab.** `foss-earth/dev` owns the `?dev=1`
activation and contribution mechanism; `0sfs/dev` owns flight-specific Dev
views. Existing diagnostic implementations stay with their features. The
current Debug tab remains accounted for independently; extraction must not
silently hide its existing user controls behind a new URL switch.

There are no nested Controls or Remote Control tabs. Input-method controls
are fieldsets; gamepad profiles are a select and expandable details; remote
controls use fieldsets and section contributions. The phone application uses
settings/connection sheets and a scanner dialog, not a tab registry. Those
surfaces stay in `0sfs/remote-control` and do not create extra repository
requirements. The club/flight landing-page navigation and browser/IDE tabs
are outside this in-app feature-tab inventory.

## Keeping the inventory complete

When a tab is added, removed or conditionally registered, update its host's
inventory, record either a dedicated repository or an explicit exception,
and update the graph if ownership or dependencies change. Inventory the host's
supplied props and context filters as well as the shared registry: counting
the registry alone incorrectly gives flight the panorama tabs and misses
its twelve application contributions.
