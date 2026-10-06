# Aircraft forces

Debug → Forces draws native JSBSim observations at the current aircraft transform.
The overlay works independently of sound and follows the aircraft's floating origin.
It starts disabled; enabling it creates one noncreating native property batch and
the drawing resources. Disabling it frees both.

| Setting | Default | Bounds |
| --- | --- | --- |
| Show aircraft forces | off | off/on |
| Arrow force scale | 20,000 N/m | 100–200,000 N/m |
| Maximum arrow length | 20 m | 1–100 m |
| Force labels | on | off/on |
| Force label refresh | 5 Hz | 1–20 Hz |

An arrow's length is force magnitude divided by the scale, capped at the selected
maximum. Its label always shows the actual magnitude in kN and marks a capped
arrow. Native simulation time controls label refresh; pausing holds the labels.
Arrow geometry follows the current native snapshot. App ticks suppress redundant
frame requests, while asynchronous drawing readiness and setting changes request
their own frames. No separate animation loop runs.

## What is observed

The [aircraft reader](../src/flight/diagnostics/aircraftForces.ts) obtains all values
in one batch read, copies them into its snapshot, and never commands the model.
Pound-force is converted to newtons with 1 lbf = 4.4482216152605 N.

| Arrow | Native source | Anchor |
| --- | --- | --- |
| Lift, drag, side force | `forces/fb{x,y,z}-aero-rp-lbs`, decomposed by the native wind/body basis | `aero/rp-body-{x,y,z}-ft`, the resolved body-frame aerodynamic moment arm |
| Aero applied at CG | `forces/fb{x,y,z}-aero-cg-lbs` | CG |
| Each engine or force carrier | `propulsion/engine[N]/body-force-{x,y,z}-lbs` | Its actual `x/y/z-position` relative to the current native CG |
| Weight | `forces/fb{x,y,z}-weight-lbs` | CG |
| Applied total (excludes gravity) | `forces/fb{x,y,z}-total-lbs` | CG display anchor |
| Net force (with gravity) | Exact vector addition of the same-read native applied total and weight | CG display anchor |

JSBSim's applied total includes native contact/friction forces but excludes gravity.
The net arrow adds the observed weight vector; its two raw source vectors are kept
in the snapshot. This is the resultant external force, not a reconstruction of
JSBSim's rotating-frame acceleration terms.

The RP and CG aero contributions are separate because models can apply aerodynamic
terms at both locations and move the reference point. The reader projects the
native RP body vector into wind axes, isolates its three components, and rotates
them back with JSBSim's `Tw2b` basis. The arrows sum to that native RP force, including
signed or reversed forces; they do not estimate coefficients. Native body X/Y/Z is
forward/starboard/down. Drawing coordinates are left/up/forward, so a thrust arrow
points in the force direction, opposite the exhaust. Native structural points are
X aft, Y starboard, Z up in inches and are translated by the current CG.

The F35 profile names its four native force carriers Main engine, Lift fan, Right
roll post and Left roll post. Names do not change their vectors or positions. This
shows the experimental model's actual forces; it does not validate its provisional
CG, mass, force allocation or aerodynamic calibration.

## Missing observations and remaining work

Unsupported or nonfinite component observations are skipped and reported once in
the flight log. Where resolved aerodynamic components are unavailable, the native
aggregate aerodynamic vector is shown with an explicit **CG display anchor** label.
The same fallback is available for aggregate propulsion. Such an aggregate's display
anchor does not claim that the physical resultant acts at the CG. Other observed
components remain visible.

There are no invented per-wing or per-part arrows. Moment arcs, a coefficient-term
table, and per-surface attribution remain future work in [TODO](../TODO.md#debug-views).
The drawing currently appears through aircraft/terrain geometry for diagnostic
visibility. Generic vector glyphs and labels are owned and publicly exported by
[FOSS Earth](../../foss-earth/docs/diagnostics.md#world-vector-drawing); 0sfs owns
native aircraft observations and their coordinate adaptation.

The native cached observers were introduced in fork.10 and remain in the locally
adopted fork.11 SDK. Reader
tests exercise actual installed WASM on both a piston aircraft and F35; glyph and
adapter tests cover transforms, readiness, disabled cleanup, missing values and
paused rendering. These checks do not qualify the F35's flight dynamics or a device's
graphics performance.

The retained [focused acceptance record](../validation/evidence/aircraft/f35b/forces-overlay-2026-10-05/acceptance.json)
identifies the exact installed fork.10 bytes and source hashes: 12/12 consumer
tests and 7/7 shared drawing tests passed, with the shared owner's incremental
typecheck and lint passing. Final coordinated CI is recorded separately by the
parent task; this receipt does not claim it ran CI or a browser.

The [combined acceptance record](../validation/evidence/aircraft/f35b/final-acceptance-2026-10-05/acceptance.json)
adds full application/shared-owner runs and the final hardware rendering checks.
Labels upload while hidden before material readiness, then appear atomically
with their arrows. A separate tip transform keeps camera-facing labels at their
actual force-vector tips under parent rotation, scale and origin changes.
