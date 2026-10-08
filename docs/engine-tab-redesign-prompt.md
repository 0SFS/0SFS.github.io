# Redesign Engine around settings and live variables

Date: 2026-10-08. Implementation handoff requested by the user. Work in
`/Users/felg/gh/0sfs`; read `AGENTS.md` and each edited owner's instructions first.
Preserve concurrent work. Implement the redesign and its checks, not just a mockup.

## Product direction

The user likes the current **Engine history** plots and their latest/min/max
values, but the Engine tab duplicates these with separate text-reading sections
(Spools and thrust, Temperatures and oil, Fuel, Commands and flags, Engine plant
numerics, Air data). Replace that organization with one variable-driven view.

There are exactly two large collapsible sections:

1. **Settings** — the settings and actions currently homed in Engine, grouped
   sensibly inside it.
2. **Live data** — every available variable's chosen representation in one
   wrapping paragraph grid, with plots first and compact readings afterward.

Default Live data open and Settings closed, preserving the user's subsequent
choice. Keep settings, simulation controls and live observations distinct.
Do not recreate a separate Engine history section beside duplicate text readings.

The user's original wording calls the history displays “tables”; preserve their
useful content (current value, history, range and time), rather than replacing
them with a conventional row/column data table.

## Read and audit

- `src/flight/hud/engineMonitor.ts`, `engineMonitorModel.ts`, `engineHistory.ts`,
  `engineMonitor.css` and their tests.
- `src/flight/hud/FlightControlPanel.tsx` and `FlightControlPanel.engine.test.tsx`.
- `src/flight/settings/flightParameters.ts`, the parameter-section integration
  and `docs/proposals/flight-settings.md`.
- `src/flight/hud/engineSummary.ts` and the phone consumer of engine readings,
  to preserve their contracts.
- `docs/validation/engine-plant-report.md` and the latest stage record.
- FOSS Earth's `docs/ui-layout.md`, `docs/render-on-demand.md`,
  `docs/proposals/settings.md` and `docs/ci-cd.md`.

The October 8 follow-up, commit `33347586`, fixed the missing Simulation controls,
added the empirical/coupled model choice and live numerical observations. Preserve
that functionality. Inventory current source rather than reintroducing the old
“registered but never rendered” bug or the earlier missing diagnostics.

## Ownership

**0sfs** owns engine variable definitions, native sampling, engine history and
state, aircraft-specific grouping/defaults, the Engine tab and its integration.
**FOSS Earth** owns general panel/section/layout/input behavior and any new
general-purpose plotting or telemetry presentation primitive that a globe app
would actually use. Name the owner before each new module. Keep engine semantics
out of shared code and use public sibling exports. Do not move the entire engine
history into FOSS Earth merely because a graph can be drawn generically.

## One variable registry

Use one authoritative registry for compact readings, plots, groups and export.
Unify today's curated rows, history subset and relevant discovered properties;
do not maintain independent duplicated lists that drift. Each variable needs:

- Stable ID, native path or explicit derived source, aircraft/engine identity,
  label and a concise physical meaning/station description.
- Native and display unit, dimension, conversion, precision and numerical type
  (continuous, counter, flag, enumeration or text).
- Availability/validity dependencies. Distinguish an unavailable observation,
  invalid sample, zero, held value and stale data.
- Expected display range, its source and validity conditions, or an explicit
  unknown range. Keep expected range distinct from observed min/max, a control's
  legal bounds and an operational limit.
- Semantic family, default presentation and compatible default plot group.
- Sampling/history eligibility and any cost category needed by the recorder.

Prefer profile/native metadata for ranges. Clearly label a provisional plotting
envelope; never invent a real F135 safe operating range. Unknown ranges remain
usable as standalone plots with declared automatic scaling. Preserve meaningful
values outside the expected envelope rather than clamping or hiding them.

Deduplicate equivalent aliases using metadata, not label spelling. For example,
the same temperature in K and °C is one quantity with a unit choice; mass and
volume fuel flow remain distinct unless a justified density conversion exists.
Preserve gas versus metal and total versus static temperature distinctions.
The reader must be able to tell which engine and station a trace describes.

Known numerical observations include actual algorithm, iterations/evaluations,
fallback, residuals, resident bytes and mass/energy accounting. Keep them available
alongside other variables. Requested solver settings belong in Settings; actual
solver observations belong in Live data. Make published numeric properties
discoverable, and provide a compact representation for nonnumeric diagnostics.
No hidden requirement that only today's small history subset can ever be plotted.

## Compact and plotted states

A compact variable is one intrinsic-width horizontal item: **label value unit**.
Clicking or keyboard-activating it expands that variable into a plot. The plot
shows current value, expected range and units, observed min/max, a readable time
axis and sample validity. Preserve the informative content of today's history
cards. Provide an obvious, accessible collapse control.
Compact readings also retain accessible access to the expected range, meaning
and provenance through inline details/help; a pointer-only tooltip is insufficient.

Text values remain compact/detail text; never graph meaningless numeric codes.
Flags and enums default compact and can opt into a labeled step/event history
where useful. Monotonic counters use their actual units and explicit scale.
Missing samples break a trace instead of connecting across unavailable data.
Historical “latest” must not masquerade as current if the current sample is invalid
or capture is off; compact current readings use the same current sample as plots.

Opening/collapsing a plot changes presentation. It does not reset engine state,
change a command, alter simulation speed or imply engine data is physically zero.
Retain already captured history across presentation changes within the selected
recording budget. Expanding a previously unrecorded variable starts at the first
real available sample; do not fabricate a past trace.

## Default combined plots and manual separation

Variables with the **same displayed units and similar expected ranges** should
share a plot by default when comparing them is meaningful. N1 and N2 are the
obvious initial example. Similar dimensions alone are insufficient: a tiny mass
residual must not share an axis with tank fuel merely because both use kg.

Choose groups from metadata and expected ranges, never from currently observed
min/max. Group membership must not flicker as throttle, altitude or history
changes. Use deterministic defaults; record a concrete range-compatibility rule
and exceptions in tests. A sensible starting rule is overlapping expected ranges
with spans within a factor of two, inside a compatible semantic family. That is
a UI heuristic, not physics; explicit reviewed group metadata can be clearer.
Unknown ranges do not automatically merge.

Each combined plot has one truthful shared vertical axis, one time axis and
clearly distinguished/labeled traces, including a current value and range for
each member. Avoid independent normalization that makes unlike values appear
equal. Use line style/labels as well as color. No unlabeled dual axes.

Provide inline **Separate** and **Group compatible traces** actions. A user can
separate one member, regroup compatible variables or collapse just one member to
a compact reading. Collapsing a whole combined plot produces its individual
compact readings. Restore the saved grouping when explicitly expanded/regrouped
by **Group compatible traces**; an automatic rebuild must not override the user's
split choice. Clicking one compact member expands only that variable. It may join
its saved group if those companions are already plotted, but must not expand
other compact companions without an explicit group action.
Each variable appears exactly once in Live data, whether a group member or a
standalone plot/compact item. Never duplicate grouped members as readouts below.

## One paragraph grid and subgroup collapse

Use one wrapping flow of intrinsic-width items, following the repository's
paragraph-grid rules. Plot cards have a useful preferred width, shrink to the
available panel width and wrap. Compact readings size to their content. No fixed
columns, masonry library, viewport-width tiles, or table layout for this grid.

The visible ordering is deterministic:

1. Expanded plot items, grouped by semantic family.
2. Compact variable items, grouped by semantic family.

Suggested families are Rotation/propulsion, Gas and solids, Fuel, Controls,
Numerics and Environment. These are organizational labels within the single
variable view, not a second set of duplicate text dashboards. Keep meaningful
engine identity within each family for aircraft with multiple engines.

Each family within a presentation band can collapse to a single text-sized
toggle such as **› Fuel**. Hide that band's children while preserving each
variable's plot/compact/group state. Expanding restores them. Where a family
occurs in both bands, accessible names distinguish “Fuel plots” and “Fuel values.”
Define persisted keys by band and family so collapsing one does not unexpectedly
erase the other. A collapsed group occupies only its label's width; it must not
retain an empty full-width box. Open group markers can provide a paragraph break
without imposing independent column grids.

Use DOM order matching visual order for keyboard and assistive technologies.
Preserve focus when toggling or regrouping moves items. Do not reorder cards on
every numerical update. Size changing digits predictably with tabular numerals.
Use real buttons/details semantics and `aria-expanded`; keyboard activation must
work without stealing unrelated flight controls. Follow `controlTakesKey` and
pass unused pointer/keyboard gestures through under the shared input contract.

Conceptual layout (not fixed rows or columns):

```text
› Settings
⌄ Live data
  ⌄ Rotation plots   [ N1 + N2 history, current values, ranges ]
  ⌄ Gas plots        [ Gas-temperature history ] [ Metal-temperature history ]
  › Fuel plots
  ⌄ Controls values  [ Throttle 99 % ] [ AB burning off ] [ Starter off ]
  ⌄ Numerics values  [ Iterations 8 ] [ Fallback no ] [ Memory 22.8 KiB ]
  › Environment values
```

The values in this sketch illustrate layout only. Do not hardcode them or
promote them into expected engine values.

## Settings, actions and persistence

Settings contains the already-homed Simulation, monitor/history display and
engine-test-stand controls, organized within the one parent. Preserve model
selection, currently running model/SDK identification, reload-required state,
save-before-reload and the native algorithm/cap/tolerance/memory controls.
Preserve conditional availability on coupled versus empirical and other aircraft.
Put cold/running initialization and test-stand navigation here without a duplicate
copy under Live data. Do not move global simulation or other tabs' settings into
Engine as part of the redesign.

Keep history export/clear actions close to the data they affect, once. Preserve
transition/event information, raw-property discovery and audio-source diagnostics
without recreating duplicate live readouts. Organize nonnumeric events as a
collapsible supplementary item within Live data; numeric audio observations can
use the registry with explicit source/time meaning. A raw-property search can
select/focus the existing variable instead of displaying a second dashboard.

Persist top-level/group collapse, per-variable presentation, chosen plot grouping
and any explicit plot range. Key by stable IDs and appropriate aircraft/model
capability, including multiple engine indices. Changing engine model must not
reuse a same-named variable with a different meaning blindly. Preserve choices
for temporarily unavailable metrics so they return if the model supports them.
Validate storage, migrate useful old `osfs.engineMonitor.v1` preferences and
survive malformed/unknown/removed entries. Keep settings IDs and values intact.

Layout state is separate from simulation and history data; do not persist an
unbounded time series. If implementing reset, say exactly whether it resets
layout or engine state, and preserve normal flight controls and phone readings.

## Sampling, compute and history

One native read batch/cache per update feeds current values, history, plots and
other existing consumers where applicable. Plotting a variable must not duplicate
its native reads; a combined plot must not duplicate its members' histories.
Use bounded storage and preallocated/reused work where useful.

Keep existing history window, sampling ceiling and optional thermal-accounting
capture settings. Before broadening the recorded catalog, define a visible
history storage/metric budget with units, bounds, default and reason. Show actual
capture state; exceeding a budget requires a defined user-visible admission rule.
Do not silently sample all published properties at full physics rate. Compact
variables still need current values, but may not need retained history.

The recommended initial policy is to retain history for plotted variables and
the existing explicitly enabled recording set. Collapsing a plot may retain its
bounded buffer; expose whether hidden variables continue capture. Preserve the
user's recording choice independently of view collapse. No silent history holes
caused by minimizing a subgroup that claims to remain recorded.

Closed/offscreen/hidden plots do no SVG/canvas/path generation. Paused unchanged
data draws nothing. Opening a plot uses existing captured samples immediately;
do not add wall-clock polling loops. Decimate dense visible histories only if
needed, preserving extrema/events and keeping export at the captured resolution.
Any draw, capture, memory or decimation budget is a named setting in the proper
owner. Measure resource counts separately from timing; do not claim speed from
fewer DOM elements alone.

## Acceptance

Write focused tests covering behavior rather than snapshots of every div:

- Exactly the two top-level sections; Simulation controls still rendered with
  current values and correct model applicability; no duplicate settings/variables.
- A compact variable expands/collapses; combined plots share units/axis, separate
  a member and regroup; manual decisions survive fresh samples and reloads.
- Same-unit incompatible/unknown ranges stay separate; unit changes convert
  values/ranges correctly; out-of-range values remain visible and invalid data
  stays a gap. Gas, metal, command and measured-state semantics remain explicit.
- All plot items precede compact items regardless of family; subgroup collapse
  produces only a text-sized toggle and restores children without changing mode.
- Migration, corrupt storage, model/aircraft replacement, missing variables,
  nonzero engine indices, time rewind, hold, pause, history clear and disposal.
- Shared sampling, storage limits, no repeated hidden plot work, current values
  while capture is off, CSV correctness, retained event transitions and unchanged
  phone/HUD reading contracts.
- Accessible controls, focus retention and the shared input pass-through rules;
  inspect the actual wrapping behavior when a viewing run is authorized.

Read the current CI/CD policy. Use `npm run typecheck`, related tests and lint,
with logs under `build/`; final `npm run ci` once. Run owner checks for shared
changes. Respect file-backed test dependencies and avoid overlapping suites.
No server, GPU/browser run, phone-layout check or benchmark is authorized solely
by this saved prompt; preserve current restrictions and report visual layout
qualification separately. Do not change engine physics, exhaust brightness,
audio synthesis or CI architecture in this UI task.

Update the Engine UI documentation and report how the variable registry, grouping,
layout persistence, recording budgets and migration work. Preserve concurrent
files/hunks and summarize any remaining unverified appearance or input behavior.
