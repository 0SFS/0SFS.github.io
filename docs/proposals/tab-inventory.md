# Tab inventory across 0sfs, FOSS Earth and the UMN tour

Audited from the current source on 2026-10-08. This coordination overview lists
**every current tab in all three applications**, with its proposed repository
or a reason to share one. Repository destinations are proposals, not completed
extractions. Sections, buttons, dialogs and website routes are not counted as
additional tabs.

| Application | Current tab IDs | Jump to its table | Dependency graph |
| --- | ---: | --- | --- |
| 0sfs | 21 | [Flight tabs](#0sfs-flight-tabs) | [Flight graph](repository-split-graph.html) |
| FOSS Earth | 13 | [Globe tabs](#foss-earth-tabs) | [FOSS Earth graph](../../../foss-earth/docs/proposals/repository-split-graph.html) |
| UMN tour | 13 | [Campus tabs, including `UMN-VR/about`](#umn-tour-tabs) | [UMN graph](../../../UMN-VR/UMN-VR.github.io/docs/proposals/repository-split-graph.html) |

The FOSS Earth and UMN tables below summarize their own detailed source audits,
which remain authoritative in those repositories. This overview coordinates
the split; it does not move shared or campus code into 0sfs.

## UMN tour tabs

**13 current IDs: 11 available on the globe, nine inside a panorama.** The
campus host uses FOSS Earth's shared tab implementations and supplies its own
scene, photographs and build identity. Its proposed About contribution has a
dedicated `UMN-VR/about` repository. See the
[UMN source audit and exact registration conditions](../../../UMN-VR/UMN-VR.github.io/docs/proposals/tab-inventory.md).

| Exact title / ID | Proposed repository or owners | Decision and reason |
| --- | --- | --- |
| Location / `location` | `foss-earth/engine` initially | **Shared, provisional.** Search/coordinates feed the globe navigation and placement services. A separate provider/search boundary remains open; UMN needs no campus-specific copy of that implementation. |
| Map / `map` | `foss-earth/engine` initially | **Shared, provisional.** Sources, terrain/imagery, residency and surface queries share one resource lifecycle. A narrower Map extraction remains undecided and needs explicit surface/readiness interfaces. |
| Renderer / `renderer` | `foss-earth/renderer` | **Dedicated shared feature.** Device, backend, scene resources and frame scheduling remain generic globe infrastructure. |
| Sky / `sky` | `foss-earth/sky` | **Dedicated shared feature.** The tour uses the same astronomy, atmosphere and lighting model. |
| Date and time / `time` | `foss-earth/sky`, with a host-supplied clock | **Shared with Sky.** Both tabs operate the same astronomy/time model. |
| Controls / `controls` | `foss-earth/engine` input/camera + gamepad-tools | **Composed tab.** Globe gestures and controller handling retain their existing owners; no flight-controls package is needed. |
| Interface / `interface` | `foss-earth/ui` + `foss-earth/toolbar` | **Composed tab.** Generic widgets/log presentation and bottom-bar layout have separate owners; world services supply positions and search results. |
| Settings / `settings` | `foss-earth/ui`, with host services | **Shared with UI.** Presets, saved records, App files and Diagnostics manage one application-wide registry and its services, not another copy of feature settings. |
| About / `about` | **`UMN-VR/about`**, consuming `foss-earth/about` | **Dedicated campus feature.** Campus tab code, project information, credits/links, authored dependency-graph metadata and manifest adapter live here. `UMN-VR/tour` supplies resolved build data; the adapter never imports the tour runtime. |
| Bug report / `bug-report` | `foss-earth/ui`; campus identity/report destination in `UMN-VR/tour` | **Shared with UI.** The report form consumes registered diagnostic providers. Campus-specific identity is supplied as data. |
| Scenes / `scenes` | `foss-earth/scenes`; campus content in `UMN-VR/tour` or optional `UMN-VR/twin-cities-content` | **Dedicated scene feature.** Manifest validation, placements, groups/links and navigation compose the 360 viewer; photographs and platform imports remain UMN-owned. |
| `360: <photograph title>` / `panorama` | **`foss-earth/360`**, consuming separate image-representation repositories | **Dedicated top-level viewer.** Owns the active-image tab and shared presentation. Each data structure owns its own loading/sampling code; photographs remain UMN-owned. |
| 360 image settings / `panorama-settings` | `foss-earth/360`, with representation-owned sections | **Shared viewer controls.** Camera/entry settings share the active-view lifecycle. Data-structure-specific controls live with their representation and appear here through registration. |

Location, Map, Sky and Date/time are globe-only; the two image tabs are
panorama-only. The other seven tabs work in both contexts. **Dev and Weather
are proposed additions, not current UMN tabs.** `UMN-VR/tour` would register
its campus Dev panels through `foss-earth/dev`; shared Weather belongs to
`foss-earth/weather`. The club website and campus tour are separate proposed
application repositories, not extra tab IDs.

## FOSS Earth tabs

**13 current IDs: 11 available on the globe, nine inside a panorama.** These
are the same shared IDs used by the campus host, with FOSS Earth's own content
and build identity. The
[FOSS Earth source audit](../../../foss-earth/docs/proposals/tab-inventory.md)
owns the detailed shared-boundary decisions and source references.

| Exact title / ID | Proposed repository or owners | Decision and reason |
| --- | --- | --- |
| Location / `location` | `foss-earth/engine` initially | **Shared, provisional.** Navigation/placement stays with the globe; an independent provider/result/search package remains undecided. |
| Map / `map` | `foss-earth/engine` initially | **Shared, provisional.** Terrain/imagery, streaming and surface queries are the globe's central resource owner. A narrower Map repo needs surface-query, readiness/revision and renderer-resource contracts first. |
| Renderer / `renderer` | `foss-earth/renderer` | **Dedicated.** Owns device/scene/backend lifecycle and frame scheduling; consumes no globe implementation. |
| Sky / `sky` | `foss-earth/sky` | **Dedicated.** Astronomy, atmosphere, stars and physical lighting, with host-supplied time/terrain interfaces. |
| Date and time / `time` | `foss-earth/sky` | **Shared with Sky.** Its dials edit the same astronomy model and instant. |
| Controls / `controls` | `foss-earth/engine` input/camera + gamepad-tools | **Composed tab.** World gestures and device handling are separate responsibilities with established owners. |
| Interface / `interface` | `foss-earth/ui` + `foss-earth/toolbar` | **Composed tab.** Windows/widgets and bottom-bar layout remain separate; values and callbacks come from feature owners. |
| Settings / `settings` | `foss-earth/ui`, with host services | **Shared with UI.** Presets, saved-record validation, App files and Diagnostics manage registered state and services; they do not own every feature implementation. |
| About / `about` | `foss-earth/about`, with globe-owned build data | **Dedicated.** Generic About presentation, provenance and dependency-graph viewer. The globe supplies its actual installed manifest. |
| Bug report / `bug-report` | `foss-earth/ui` | **Shared with UI.** Form, report-provider contracts and diagnostic presentation share one infrastructure owner. |
| Scenes / `scenes` | `foss-earth/scenes` | **Dedicated scene feature.** Schema, loader, placements, groups/links and navigation orchestrate the 360 viewer without owning its image formats. |
| `360: <title>` / `panorama` | **`foss-earth/360`**, consuming separate image-representation repositories | **Dedicated top-level viewer.** This is the active image's view. Equirectangular, cubemap, tiled-cubemap and preview-sheet implementations have their own repositories. |
| 360 image settings / `panorama-settings` | `foss-earth/360`, with representation-owned sections | **Shared viewer controls.** Common camera/entry settings live with the viewer; format settings and behavior live with their respective image repositories. |

The globe/panorama availability rules match UMN's. **Dev and Weather are
proposed shared features; there is no current shared Debug tab.** Performance
debug and Frame budget are Renderer sections. The bottom toolbar is proposed
as `foss-earth/toolbar`; its buttons open the existing tabs.

## 360 image data structures

**`foss-earth/360` is the top-level viewer repository.** The two image tabs
compose several implementation repositories; tab ownership does not collapse
the data structures into one package. Current records and source mappings are
audited in [FOSS Earth's image repository proposal](../../../foss-earth/docs/proposals/image-repositories.md).

| Data structure or shared responsibility | Proposed repository | Decision |
| --- | --- | --- |
| Whole 2:1 equirectangular image | `foss-earth/equirectangular` | Separate schema, direction/UV mapping, loading/sampling, preparation and tests. |
| Whole six-face cubemap | `foss-earth/cubemap` | Separate face conventions, orientation/seam math, six-face loading/sampling and preparation. |
| Six quadtrees of cubemap tiles, gnomonic warp | `foss-earth/tiled-cubemap` | Separate tile addressing/LOD, selection, scheduling, atlas/display table and preparation. |
| Six quadtrees of cubemap tiles, equi-angular warp | `foss-earth/tiled-cubemap` | Explicit second projection variant of the same stored tile structure; shares the tile scheduler, not a second copy. |
| One sheet packing many cube previews | `foss-earth/preview-sheets` | Separate sheet/placement extension, packing/loading and individual-face fallback. |
| Common image contracts, cache and resource accounting | `foss-earth/images` | Shared foundation with no imports of concrete formats or the viewer. |
| Orb/immersive presentation, active-image and settings tabs | `foss-earth/360` | Top-level composition consumes representation packages and their common contracts. |
| Scene envelope, placements, links and Scenes tab | `foss-earth/scenes` | Scene composition consumes the viewer; the viewer does not import scene or globe implementations. |

These are repository boundaries beneath existing tabs, not additional tab IDs.
JPEG/PNG are codec choices; preview/immersion are roles. Neither is a separate
image data structure. The packed preview sheet and runtime tile atlas are
different structures: preview transport belongs to `preview-sheets`, and the
tiled representation's GPU addressing belongs to `tiled-cubemap`.

## 0sfs flight tabs

The flight application registers **21 distinct tabs: twelve flight definitions
and nine shared definitions**. The twelve are declared in
[`FlightControlPanel.tsx`](../../src/flight/hud/FlightControlPanel.tsx#L82).
The same component mounts the shared
[`WindowOverlay`](../../src/flight/hud/FlightControlPanel.tsx#L925), receiving
its elements and sections from
[`createFlightSimApp.ts`](../../src/flight/createFlightSimApp.ts#L2140).
Registration means a tab is available to open, not that every panel is visible
at once. Saved workspace state controls which panels are open.

### All 21 current flight tabs

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
| Location / `location` | `foss-earth/engine` initially; flight placement callback in `0sfs/simulator` | **Shared, provisional.** Search/coordinates feed globe navigation and surface services; flight adds teleport/start placement. A separate provider/result/search repository remains undecided in the FOSS Earth audit. |
| Map / `map` | `foss-earth/engine` initially | **Shared, provisional.** Map sources, terrain/imagery, residency and surface queries share one globe resource owner. A narrower Map extraction remains undecided and needs explicit surface/readiness interfaces. Device/scene/frame services are extracted separately into Renderer. |
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

### Flight availability and exclusions

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
and update this combined overview alongside the owning project's source audit.
Update the graph if ownership or dependencies change. Inventory the host's
supplied props and context filters as well as the shared registry: counting
the registry alone incorrectly gives flight the panorama tabs and misses
its twelve application contributions.
