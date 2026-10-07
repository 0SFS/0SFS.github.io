# Aircraft forces

Debug → Forces draws native JSBSim observations at the current aircraft transform:
forces as arrows, and moments as arcs that turn about their axis by the right-hand
rule.
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
| Control surfaces | on | off/on |
| Arc moment scale | 2,000 N·m/° | 10–100,000 N·m/° |
| Moment arc radius | 3 m | 0.5–20 m |
| Maximum arc sweep | 300° | 30–330° |

An arrow's length is force magnitude divided by the scale, capped at the selected
maximum. An arc's sweep is moment magnitude divided by its scale, capped likewise.
Labels always show the actual magnitude, in kN or kN·m, and mark a capped glyph. Native simulation time controls label refresh; pausing holds the labels.
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
| Aero moment about CG (arc) | `moments/{l,m,n}-aero-lbsft` | CG |
| Each control surface's force | Its declared `aero/coefficient/*` drag, side and lift terms, wind frame rotated by `Tw2b` | `aero/rp-body-{x,y,z}-ft` |
| Each control surface's moment (arc) | Its declared roll, pitch and yaw terms, body axes | `aero/rp-body-{x,y,z}-ft` |

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

## Control surfaces

KSP draws lift on each control surface because its aerodynamics are per part:
every surface is a wing with a position. JSBSim has no surfaces. A control
surface exists only as coefficient terms, each an `<function>` in one of six
axes of the model's `<aerodynamics>`, such as the F-35B's `CLde`, `CDde` and
`Cmde` for its elevator. JSBSim sums the drag, side and lift terms into one force
at the aerodynamic reference point and adds the roll, pitch and yaw terms as pure
moments ([FGAerodynamics.cpp](../../Felipegalind0/jsbsim/src/models/FGAerodynamics.cpp)).
So before this, a surface's force was an unnamed part of the Lift and Drag arrows,
and its moment, most of what a control surface does, was drawn nowhere. The
F-35B model gives its ailerons and rudders no force term at all, only moments.

The overlay now draws each surface's own terms where JSBSim applies them: its
force as one arrow at the reference point and its moment as one arc there, both
in the surface's color and under its name. Nothing is drawn at the surfaces
themselves, since the model has no surface positions. Reading a force and a
moment at one point as a single force somewhere else would be exact only for
the surfaces that have both, and would place the F-35B elevator's force 41 ft
aft of its reference point at 300 knots, past the end of the 51 ft aircraft.

Each [FDM profile](../src/flight/jsbsim/fdmProfiles.ts) declares its surfaces'
terms by axis. [fdmProfiles.test.ts](../src/flight/jsbsim/fdmProfiles.test.ts)
reads every model file and holds each declaration to it: the term is in that
axis, applied at the reference point, in JSBSim's default frames, and an
increment that vanishes with the surface centred (a product with the surface's
position, its magnitude, or a one-input table of it reading zero at zero). Every
other term that reads a surface position must be listed there with the reason it
is not one surface's: the C172's whole-wing drag table and the stability
derivatives its flaps schedule, and the F-35B's fan-trap drag. One aileron
position drives both ailerons' terms in the C172 and F-35B models, so those
draw as one "Ailerons"; the SF50 models keep each aileron and ruddervator apart.

The [installed-SDK test](../src/flight/diagnostics/aircraftForces.integration.test.ts)
checks the frames on the C172, F-35B and SF50: all of a model's terms, converted
as the surfaces' are, sum to JSBSim's own `forces/fb*-aero-rp-lbs`, and with the
reference-point lever arm to `moments/*-aero-lbsft`. Each drawn surface equals
its terms read separately. At 300 knots, with 0.3 of the elevator and rudder
commands and 0.4 of the aileron's, the F-35B drew an elevator of 16 kN and
208 kN·m, ailerons of 348 kN·m and rudders of 8.6 kN·m.

## Missing observations and remaining work

Unsupported or nonfinite component observations are skipped and reported once in
the flight log. Where resolved aerodynamic components are unavailable, the native
aggregate aerodynamic vector is shown with an explicit **CG display anchor** label.
The same fallback is available for aggregate propulsion. Such an aggregate's display
anchor does not claim that the physical resultant acts at the CG. Other observed
components remain visible.

There are no invented per-wing or per-part arrows. Arcs for propulsion, ground
contact and net moments, and a table of every coefficient term, remain future
work in [TODO](../TODO.md#debug-views).
The drawing currently appears through aircraft/terrain geometry for diagnostic
visibility. Generic vector and arc glyphs and labels are owned and publicly exported by
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
