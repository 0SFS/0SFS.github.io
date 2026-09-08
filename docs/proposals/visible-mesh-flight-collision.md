# Visible mesh flight collision

Status: Stage 1 complete; Stage 2 enabled for gameplay evaluation
Date: 2026-09-08
Scope: Flight Sim collision, recovery, and FOSS Earth `SurfaceQuery` integration

## Problem

Flight Sim has two incompatible contact paths. Raster basemaps provide
`SurfaceQuery.sample()` from the adopted terrain triangles, and JSBSim consumes
that height as its gear-contact floor. Google 3D Tiles are rendered visually,
but Flight Sim does not sample them, so JSBSim retains a previous raster floor.
This creates an invisible collision surface. Neither path currently tests the
aircraft against trees or buildings; `tiles.checkCollisions` is not aircraft
physics.

An unstable JSBSim contact latches a fixed-step fault and the application turns
that fault into a pause. Resume clears only the pause, so it cannot restart the
latched loop. Teleport resets the loop, which is why it recovers the aircraft.

## Goals

- The visible selected map mesh is the source of ground-contact height.
- A road or a visible building roof supports the aircraft at its rendered height.
- Missing or replacement coverage never reuses a stale map provider's height.
- Collision work remains bounded by nearby visible geometry; it must not scan
  every loaded tile each physics step.
- A recoverable impact does not permanently disable the Resume control.
- Later body hits against trees and buildings produce a controlled bounce.

## Non-goals for the first implementation

- Full rigid-body aircraft simulation or damage modelling.
- Treating all photogrammetry detail as physically trustworthy at all distances.
- Scene-wide Babylon collision checks, per-frame allocation, or unbounded mesh
  traversal.

## Collision contract

`runtime.surface.sample(lat, lon)` is the authoritative vertical contact query.
For raster it uses the adopted rendered terrain triangles directly. For Google
it raycasts only currently visible Google tile meshes. The query returns null
when no visible geometry owns the coordinate; physics does not advance rather
than retaining a floor from the previous provider.

The map handoff retains old geometry until replacement coverage is renderable.
During that period the old surface remains authoritative. When the old runtime
is disposed, its query must no longer contribute.

## Staged implementation

### Stage 1: unified vertical support

Run terrain contact for every runtime mode, not only raster. This immediately
removes the stale Google floor and makes landings use the rendered vertical
surface. Preserve the raster direct sampler; use the existing bounded visible
mesh `SurfaceQuery` path for Google.

Acceptance:

- Switching raster to Google cannot retain the old raster elevation once Google
  coverage is active.
- A Google surface miss blocks a physics step and cannot create an invisible
  support plane.
- Raster sampling retains its current direct-index performance.

### Stage 2: swept body contacts

Before each JSBSim step, construct five short swept probes from the previous
to predicted aircraft-local positions: nose, main gear/CG, both wing tips, and
tail. Query only the active map meshes through `SurfaceQuery.raycast`; cap the
probe length and candidate work. A hit supplies position and normal.

On a body hit, restore the last valid JSBSim snapshot, move it to the contact
point plus a clearance epsilon, and reflect only the normal velocity with a
small restitution coefficient. Preserve tangential velocity subject to a
friction cap. Record the event for diagnostics. This is sufficient for a
controlled bounce without pretending to be a full rigid-body solver.

### Stage 3: recovery UX and calibration

Track a last-safe simulation snapshot after every valid step. A physics fault
is distinct from user pause. Resume from a fault restores that snapshot, resets
the fixed-step loop and terrain contact, and consumes the accumulated frame
delta. Add an explicit status/action label for recovery.

Calibrate probe dimensions, clearance, restitution and friction against roads,
trees, building walls, shallow landings and intentional high-speed crashes.

## Performance budget

- Stage 1: raster retains its measured direct tile lookup; Google uses one
  vertical ray query only while visible geometry exists.
- Stage 2: maximum five probes per 120 Hz substep, with no whole-scene scan and
  no allocations in the steady path.
- Capture query count, probe hits, candidate triangles, fallback scans and
  contact CPU time through opt-in bounded diagnostics. Establish browser P95
  before enabling Stage 2 by default.
- If Google mesh queries exceed the budget, reduce probe rate based on speed and
  retain a short contact cache. Do not lower JSBSim's fixed step globally.

## Failure behavior

- Provider/network failure: retain currently usable handoff coverage; otherwise
  hold integration until visible coverage arrives.
- Surface miss: do not reuse stale elevation or invent a floor.
- Invalid JSBSim output: restore the last safe snapshot and enter recoverable
  fault state. The app must keep rendering and allow recovery without teleport.
- Rapid map switches: generation/selected-runtime checks ignore stale callbacks
  and obsolete collision results.

## Tests

- Raster and Google mode both invoke the same contact query.
- Mode switches cannot use a stale raster height after Google becomes active.
- Surface misses do not call JSBSim `run`.
- Fault recovery clears the latch and resumes from a valid state.
- Stage 2 tests cover a road, roof, wall/tree proxy, grazing hit and no-hit.
- Benchmark direct raster sampling and bounded Google probes independently.

## Rollout

Stage 1 and fault recovery are complete. Stage 2 is enabled as a bounded
gameplay experiment: it uses at most five short probes and only within 150 m of
the sampled visible surface. Retain it only after browser testing demonstrates
acceptable frame pacing and more reliable obstacle contacts than vertical
support alone.