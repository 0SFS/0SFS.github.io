# Engine settings and live variables

The Engine tab has two large collapsible sections: **Settings**, initially
closed, and **Live data**, initially open. Settings contains the existing
Simulation, monitor display, history capture and test-stand controls. Live data
contains each observation once, either in a plot or as a compact **label value
unit** reading. The compact HUD and phone engine instruments keep their existing
reading contract.

The default view keeps its text to observations, units, axis/time markings,
recording counts and actions. Explanations appear only after activating the
adjacent **?** button. This includes variable meaning/range/provenance, phase
reasoning, shaft animation assumptions, capture policy and test-stand background.
Plot controls live in a separate **Plot options** disclosure, initially closed.

0sfs owns the native engine observations, their semantics, recording and flight
integration. FOSS Earth owns the shared panel, settings controls, paragraph-grid
layout and input behavior. A general plotting primitive belongs in FOSS Earth
only when a globe application would want it; engine history remains in 0sfs.

## Variable identity and meaning

[`engineVariables.ts`](../src/flight/hud/engineVariables.ts) supplies the compact
readings, plot metadata, semantic families and CSV columns. It combines the
existing curated metadata with published readable native properties, including
numerical diagnostics. Stable IDs are canonical native paths, including a
nonzero engine index. Alias declarations identify native getters that publish
the same quantity; temperature unit aliases do not create another variable.
Model capability distinguishes observations with different meanings.

Plant metered fuel mass flow remains separate from the native per-step
`fuel-flow-rate-pps` accounting observation. Staged restore-record temperatures
also remain separate from temperatures of the current accepted physical state:
staged values can change before `state/commit`. Matching units or similar names
do not make these sources aliases.

Missing readiness dependencies produce an unavailable observation; nonfinite
samples are invalid. Both remain distinct from a physical zero. Current readings
identify native hold and unavailable simulation time. When the native plant
reports a failed solve, finite physical observations of rotation, gas/solids and
fuel are marked **stale**: their published getters may retain the last accepted
state. The current retained number remains visible with its stale label, while
that capture becomes a history gap. Failure, algorithm, iteration and other
numerical diagnostics remain readable as the latest native solve attempt even
when physical-state validity is false. Mass/energy ledgers continue to require
their accepted-accounting validity flag. These distinctions use native flags;
the monitor does not invent a wall-clock freshness limit or poll for one.

Expected ranges have a source or are explicitly unknown. N1/N2 use their native
configured `MaxN1`/`MaxN2` when available, otherwise an explicitly provisional
0–120% plotting envelope. Piston RPM uses the profile's native engine XML maxrpm.
A provisional plotting envelope is a display aid, never an F135 operational
limit. Expected range,
observed minimum/maximum and a setting's legal bounds are separate quantities.
Values outside an expected envelope remain visible. Unknown ranges use declared
automatic plot scaling. Gas/metal, total/static, commanded/measured and separate
engine identities remain explicit; mass and volume fuel flow are separate
quantities unless a justified conversion exists.

## Presentation and grouping

Expanded plots precede compact readings in one wrapping paragraph grid, with a
deterministic semantic-family order in each band. Plot cards have a preferred
width and shrink to their available panel; compact readings use their content
width. Family collapse is independent for plots and values. A collapsed family
occupies only its text toggle and preserves the children's presentation state.

Activating one compact reading expands that variable. Each plot includes the
current observation, units, observed min/max, native simulation-time axis and
validity. Its **?** tooltip explains the expected range and source, meaning and
provenance; compact readings have the same accessible help. Missing observations break
traces; the last historical sample does not impersonate a current reading when
capture is off or the current observation is invalid.
Engine observations keep their engine number in plot captions; aircraft-wide
observations such as Total fuel keep their own title.

Compatible traces may share a truthful vertical axis. Compatibility requires the
same engine index, semantic family and display unit, overlapping known or
provisional envelopes, and envelope spans within a factor of two. This is a UI
heuristic, not physics, and never depends on changing observed extrema. Unknown
or incompatible ranges remain separate. A reviewed default group joins N1 and
N2; no other family automatically merges merely because its dimensions match.
Trace labels and line styles supplement color. **Separate**, **Group compatible
traces** and per-member collapse are
explicit presentation actions; a sample update must not undo a manual choice.
Expanding one compact member never silently expands compact companions.

Text remains text. Flags and enums use labeled step/event history only where
their values carry a meaningful history; meaningless numeric codes are not
continuous measurements. Counters retain their actual units and scale.

**Plot options** offers a display-unit dropdown and, for continuous observations,
a single track with two thumbs for the explicit plot envelope. The shared track
comes from FOSS Earth. **Auto** returns to the expected envelope or
automatic observed scaling when the range is unknown. **Expand ×2**
widens the editor's selectable span without changing the physics, expected range
or stored envelope. Changing units converts both the stored envelope and its
displayed values. Observations outside the envelope continue to expand the plot
axis; the envelope never clamps a value.

## Settings, actions and recording

**Settings → Simulation** preserves engine-model selection, the model and SDK
actually flying, reload-required feedback, and the native algorithm, iteration,
substep, tolerance and memory controls. Their existing setting IDs and conditional
availability remain unchanged. Cold/running initialization and test-stand
navigation also belong in Settings. The normal flight controls and phone
readings remain independent of plot presentation.

The five native requested solver-setting readbacks map to their existing
parameter IDs: algorithm, iteration cap, substep cap, tolerance and reduced-model
memory. They have one home in Settings and are excluded from Live data readings
and capture. Native-property search keeps them discoverable; selecting one opens
Settings and focuses its existing control. The actual algorithm, work, fallback
and residual observations remain in Live data.

History clear and CSV export appear once beside the data they affect. Clear removes
samples while keeping their bounded recording slots; releasing compact histories
frees slots for other variables. Neither action changes engine state or layout. Transition
events and audio-source diagnostics remain available as supplementary Live data
items. Raw-property discovery selects an existing registry observation rather
than adding another dashboard containing duplicate readings.

The visible recording line shows capture state, sample count, admitted/allowed
metrics, allocated/allowed KiB and any budget refusal. **?** holds the capture
policy and admission explanation, so the numbers remain legible without a
paragraph beside them. **Recording suspended** identifies when the current
visibility and thermal policy leaves no admitted buffer eligible to capture.

The history window is 1–600 simulated seconds, default 60. The sampling ceiling
is 0–30 Hz, default 5; zero disables capture and retains its bounded buffers until
**Clear history** is explicitly used. Capture follows advancing
native simulation time, without duplicate paused samples or fabricated catch-up
samples. Backward simulation time starts a new record. Optional solid heat
accounting retains its accepted-step meaning: display samples cannot reconstruct
all native fixed-step energy receipts.

Recording has visible controls in Settings → History sampling:

| Setting | Bounds | Default | Purpose |
| --- | --- | --- | --- |
| `osfs.engineMonitor.historyMetrics` | 1–256 metrics | 32 | Limit how many variables retain history |
| `osfs.engineMonitor.historyMemoryKiB` | 64–65,536 KiB | 4,096 KiB | Limit allocated numeric sample-buffer payload |
| `osfs.engineMonitor.hiddenHistory` | On/off | On | Keep admitted hidden observations recording independently of view collapse |

The byte reading counts the recorder's typed numeric arrays, not total JavaScript
heap overhead. Capacity is derived from history seconds and Hz; each retained
metric stores its value and simulation timestamp in two Float64 arrays and a
trace-break marker in a Uint8 array: 17 bytes per allocated slot. Existing admitted
buffers retain their slot. New requests enter in deterministic registry order,
with plotted requests ahead of compact default recordings. A request that cannot
fit waits with an explicit budget message; it does not silently evict another
buffer. **Release compact histories** frees retained compact buffers and leaves
them released until explicitly expanded again. Lowering a limit refuses buffers
that no longer fit, visibly, rather than exceeding it.

Current compact observations remain available with capture disabled.
Presentation collapse retains bounded captured data and does not silently change
the recording choice. With hidden capture explicitly disabled, hidden plots and
compact histories suspend capture; separately enabled thermal accounting keeps
its explicit recording choice. Expanding a previously unrecorded observation
begins at its first real available sample, and resuming suspended capture breaks
the trace across the uncaptured interval.

One per-update native read cache feeds current observations, recording and the
existing HUD/phone reading. Grouping does not duplicate native reads or buffers.
Closed, hidden and offscreen plots generate no paths; paused unchanged data
does no plot work. Opening a plot uses retained samples without a wall-clock
polling loop. CSV contains captured-resolution values, real timestamps and
explicit units, with empty cells for invalid observations.

## Persistence and input

[`engineMonitorLayout.ts`](../src/flight/hud/engineMonitorLayout.ts) stores layout
under `osfs.engineMonitor.v2`, separately from settings and history. Each scope
contains the aircraft ID, running engine model and semantic capability. It saves
top-level collapse; independent `plots:<family>` and `values:<family>` collapse;
supplementary-item collapse; and canonical-variable presentation, unit, grouping
and explicit display range. A saved group value of `null` means deliberate
separation; no group value means the reviewed default. Temporarily unavailable
IDs keep their choices for when they return. An unknown or removed ID creates no
UI item. Validation discards malformed modes, units and ranges and survives
corrupt storage.

Migration from `osfs.engineMonitor.v1` maps the old spools, temperatures, fuel,
controls, plant, air and heat-balance section choices onto their compact family
bands, maps the old history collapse choice onto the independent plot bands, and
keeps useful supplementary collapse choices. The new top-level
defaults remain Settings closed and Live data open. The legacy key remains
available for rollback; the existing settings migration preserves its fuel-flow
unit independently. Neither layout key persists a time series.

DOM order follows visual order and controls retain focus when presentation moves
them. Real buttons and details summaries use accessible names and
`aria-expanded`. Under the shared `controlTakesKey` contract, buttons/summaries
consume Space and Enter, sliders consume their navigation keys, and text/search
fields and dropdowns consume their own keyboard input. Unrelated flight keys and
unused swipes/pinches continue to the world behind the panel.

The shared `createHelpTooltip` primitive comes from `foss-earth/shell`. Its **?**
button works by click and by the button's ordinary Space/Enter activation; help
is never available only by hovering. The explanation uses the browser's top
layer where available or a viewport-positioned fallback outside panel clipping.
The button identifies its content with `aria-controls`, `aria-describedby` while
open, and `aria-expanded`. A second help button, a click outside or Escape closes
the current explanation. Collapsing Engine sections or detaching their host
closes help too. Tooltips contain explanations; controls retain their existing
Settings or Plot options home.

## Qualification

Behavior is checked with focused model and DOM tests and the repository's normal
typecheck, related tests, lint and final CI. No server, visible browser, GPU run,
phone-layout check or benchmark is implied by this UI redesign. Wrapping,
appearance and gesture behavior require a separately authorized viewing run;
DOM tests establish contracts but do not qualify their appearance.

Checked on 2026-10-08 ([retained check record](../validation/evidence/engine-monitor/2026-10-08/checks.json)):
incremental typecheck and lint passed; all Engine model and DOM tests passed. The
related run passed 844 tests and failed four concurrently added powered-lift
physics tests. Final `npm run ci`, run once, passed lint and 2,099 tests with one
expected failure, and failed those same four tests in
`src/flight/jsbsim/f35b.powered-lift.integration.test.ts`. Each sees zero native
`fuel-flow-rate-pps` where line 75 expects a positive value while fuel bookkeeping
is frozen; the file fails the same way in isolation. No physics or SDK workaround
was added in this UI task. CI skipped its build after the test failure; the
production build then passed separately, including typecheck and installed/emitted
artifact verification. Appearance and browser input remain unqualified.

The later click-help follow-up passed incremental typecheck and lint, all 43
focused Engine DOM tests, and final CI: 195 test files, 2,111 passing tests and
one expected failure, followed by a successful production build and artifact
verification. FOSS Earth's shared help and parameter-control checks passed,
including its final CI with 160 files, 1,446 tests and a successful build. The
UMN globe consumer's incremental typecheck and build also passed. Initial
related-test failures were old tooltip/disposal expectations and passed after
those assertions were updated. The 0sfs final test run used 50% workers; FOSS
Earth's requested worker suffix reached the build command instead of Vitest,
so its test run was uncapped. These runs make no timing qualification claim.
This follow-up is retained separately in the same check record, preserving the
earlier failed baseline; visual appearance and browser gestures remain
unqualified.
