# Phone controller specification

Status: **Implemented; device and network acceptance testing pending**  
Date: 2026-09-08  
Reviewed checkout: 0SFS `4d54d204e584`

## Intended result

A user opens **https://0sfs.github.io/** on their computer, clicks **Phone controller**, scans a QR, and flies the simulated aircraft from a touch controller in their phone's browser.

Both interfaces remain static files deployed to GitHub Pages. Use **free PeerJS Cloud for connection setup** and direct WebRTC for controls. Production requires no Vite process, local helper, Cloudflare Tunnel, or backend that we operate.

[PeerJS documents free cloud signaling](https://peerjs.com/client/faq). It is a shared external dependency; its maintainers recommend separate hosting for high-traffic applications. This spec does not assume an availability guarantee or unlimited capacity. [PeerServer Cloud](https://peerjs.com/server/cloud).

### First-release decisions

| Area | Decision |
| --- | --- |
| Devices | One desktop simulation tab and one paired phone. |
| Pairing | One QR scan opens the controller and connects automatically; phone-side **Fly** explicitly takes control. |
| Primary network | Phone and computer on a reachable home LAN, with Internet access for page loading and signaling. |
| Transport | Direct WebRTC, 60 Hz full control snapshots, no retransmission of controls. |
| Controller | Touch pitch/roll, rudder, throttle, trim, flaps, brake, pause, and camera view. |
| Lost input | Hold the phone's last command for `osfs.remote.holdLast` (2 s); then let go of the transient controls and return control to the desktop, without a pause. Control goes back to the phone as [Sharing the controls](#sharing-the-controls) sets. See [Losing the phone](#losing-the-phone). |
| Infrastructure | Existing GitHub Pages + PeerJS Cloud + public STUN. No application backend or paid service. |
| Relay policy | Explicit STUN-only configuration in v1; no TURN relay or HTTP/WebSocket control fallback. Failed direct connections receive a clear error. |
| Later work | Tilt steering, relay connectivity, automatic transport reconnection, multiple phones, video streaming, and autopilot integration. |

The relay policy and touch layout are v1 scope choices. Same Wi-Fi is a useful test target, not a connectivity guarantee: guest isolation, firewalls, and browser policy can prevent a direct connection. Separate networks may work through direct ICE connectivity, but are not a release guarantee.

## User experience

### Desktop

1. Add **Phone controller** to the existing flight HUD bar. Networking initializes on demand when this button is clicked.
2. Open a dialog showing **Preparing connection…**, then a locally generated QR, **Copy link**, **New QR**, **Cancel pairing**, and an expiry countdown. An unused QR expires after **2 minutes**.
3. Once authenticated, dismiss the QR and show **Phone paired · Desktop controls**. The phone is not yet allowed to affect the aircraft.
4. After the phone requests and receives ownership, show **Phone controls**, with **Take control** and **Disconnect phone** available.
5. Opening/closing the dialog and scanning the QR do not pause, resume, or change aircraft controls. Closing the dialog merely hides it; Cancel pairing explicitly invalidates an unused invitation.

The desktop remains authoritative. Take control works immediately without waiting for a phone acknowledgement. Meaningful local flight input also takes over. Camera gestures do not.

### Phone

Scanning opens this route in the normal browser:

```text
https://0sfs.github.io/rc/#v=1&peer=<desktop-id>&join=<secret>
```

The controller displays connection progress, then the aircraft's current settings and **Fly**. It must not offer Fly until authentication and both channels are ready.

Fly requests ownership. If the aircraft is already paused, ownership can transfer while it stays paused; the phone then offers **Resume**. There is no second desktop approval dialog.

The phone shows airspeed in knots, altitude in feet, heading, throttle percentage, simulation pause state, and current control owner. Connection details and measured RTT are available in a small expandable diagnostics area. The default UI uses plain statuses such as **Connected**, **Connecting…**, and **Connection lost · Waiting for the computer**.

| Phone input | Behavior |
| --- | --- |
| Right stick | Left/right rolls left/right. Push up pitches the nose down; pull down pitches up. Springs to neutral on release. |
| Left rudder pad | Horizontal movement commands yaw left/right. Springs to neutral on release. |
| Throttle slider | Absolute 0–100%; holds its value when released. |
| Trim control | Absolute pitch trim, with a center/reset control. |
| Flap presets | Absolute settings derived from the bundled aircraft's allowed detents, rather than repeated increment messages. |
| Brake | Held while pressed; releases on pointer up/cancel. |
| Pause / Resume | Explicit desired state, acknowledged by the desktop. |
| Camera view | Explicit cockpit/chase selection. |
| Release control | Pause and return ownership to desktop. |

Support simultaneous pointers, safe-area insets, and portrait and landscape layouts. Landscape is preferred without making orientation lock/fullscreen mandatory. Minimum button target: 44 CSS pixels. Suppress browser drag/zoom gestures within control surfaces, preserve ordinary accessibility behavior elsewhere, and provide labels and keyboard-operable buttons/sliders.

Port gdog's small joystick interaction into isolated TypeScript components: [pointer capture and clamping](../../../gdog-remote/src/App.jsx#L259). Add lost-capture, visibility, and orientation handling. No robot tuning or voice UI belongs in the controller. No microphone, camera capture, or motion-sensor permission is required; optional screen wake lock must degrade gracefully.

## Production architecture

```mermaid
flowchart LR
    G[GitHub Pages] -->|Static simulator files| D[Desktop browser]
    G -->|Static controller files| P[Phone browser]
    D <-->|Connection setup over WSS| S[PeerJS Cloud]
    P <-->|Connection setup over WSS| S
    P -->|Direct WebRTC controls| A[Desktop control selector]
    D <-->|Direct WebRTC actions and status| P
    A --> J[JSBSim WASM]
    J --> R[Desktop rendering]
```

PeerJS Cloud forwards the setup information that lets the browsers establish their connection. It does not own application sessions, authenticate the phone for 0SFS, or receive our control snapshots. The desktop implements pairing and ownership locally. Public STUN assists ICE address discovery; it does not relay aircraft controls.

The application remains usable with local controls if PeerJS Cloud is unavailable. An already established healthy peer connection can continue through a signaling-only outage. New pairing requires signaling availability.

### Static routing and dependencies

- Add a lazy `mode=remote` branch before flight/globe imports in [main.tsx](../../src/main.tsx). The phone route must not initialize or fetch Babylon, JSBSim, globe assets, terrain, or map services.
- Build a clean URL from the configured public app base. Production default: `https://0sfs.github.io/`. Keep the root path and trailing slash. Include only the controller mode and invitation fields, never desktop map keys or other query parameters.
- Read and validate the fragment, retain its data in memory, then remove it with `history.replaceState`. Refreshing the phone page requires a new invitation in v1.
- Bundle and lock the PeerJS client and QR encoder with the application. Generate QR locally; do not send its secret to a QR image service.
- Start with **PeerJS 1.5.5 pinned exactly**, the release whose source was inspected for this design. Changes of version require repeating the transport compatibility gate below.
- Use secure PeerServer Cloud connections on port 443 and no custom server host. Both clients must explicitly supply the same STUN-only ICE configuration. Public service addresses are configuration; no private API key is required.

The installed PeerJS release includes TURN endpoints in its defaults, so leaving `config` unspecified would violate the proposed direct-only scope. Explicitly configure `iceServers: [{ urls: "stun:stun.l.google.com:19302" }]`. Do not ship the library's default relay list unintentionally. [Pinned default configuration](https://github.com/peers/peerjs/blob/v1.5.5/lib/util.ts#L35).

## Pairing and authentication

The desktop owns this state machine:

```text
off → preparing → invitation → authenticating → paired → phone controls
                       ↘ expired/error         ↑            │
                                                └─ takeover ─┘
paired / phone controls → disconnected → new invitation
```

Keep connection state, control ownership, and simulation paused/fault state separate in code. A connected socket never implies permission to fly.

1. The desktop creates a PeerJS peer and waits for its assigned ID. Generate a 256-bit random join secret with `crypto.getRandomValues`, a random invitation ID internally, and a 2-minute deadline measured on the desktop.
2. The QR contains the peer ID and secret. The peer ID alone grants no authority.
3. The phone creates its PeerJS peer and opens one reliable DataConnection to the advertised desktop. Only public protocol/version information may enter PeerJS connection metadata.
4. Over the opened, encrypted data channel, the phone sends `hello` with protocol version and the join secret. Do not put the secret in signaling metadata, logs, analytics, or persistent browser storage.
5. The desktop validates version, deadline, and secret, and consumes the invitation when claiming the first valid connection. Claim synchronously before asynchronous setup work so two phones cannot both win. A second phone or reused/expired link is rejected without affecting the active controller.
6. The desktop responds with a random session ID and current status, then completes native control-channel setup. The phone discards the join secret after success. The invitation remains consumed if later setup fails; New QR starts over.
7. Disconnect, page refresh, or destruction invalidates the session. V1 requires a new QR after transport closure; it does not persist credentials for automatic reconnection.

Limit pending unauthenticated connections to four, with a 5-second hello deadline, and close invalid or oversized messages. These are desktop resource bounds, not a claim of service-wide abuse protection. The hosted signaling service remains trusted for brokering connections; no application identity guarantee is inferred from a PeerJS ID.

Starting another flight tab creates an independent invitation. No stored “last phone” is automatically trusted.

## WebRTC channels

Use **one PeerJS peer connection with two data channels**:

| Channel | Delivery | Content |
| --- | --- | --- |
| PeerJS `flight-session-v1` | Reliable, ordered | Hello, authentication, channel setup, ownership, pause/view actions, acknowledgements, the phone controller's settings. |
| Native `flight-controls-v1` | Unordered, zero retransmissions | Full control snapshots, host freshness heartbeat, telemetry, latency probes. |

Open the PeerJS channel with `reliable: true` and `serialization: "json"`. PeerJS handles offer/answer and candidate exchange through its cloud service.

**Do not use `reliable: false` as a substitute for zero retransmissions.** In the inspected release it changes ordering only. Its incoming-channel handler also assumes the channel belongs to the existing DataConnection. [Pinned negotiator implementation](https://github.com/peers/peerjs/blob/v1.5.5/lib/negotiator.ts#L34).

After authentication, the desktop selects an unused SCTP stream ID and announces it over the reliable channel. With only the initial channel present, choose 1 if its ID is 0, otherwise 0; validate the available stream range. Both endpoints create:

```ts
const controls = connection.peerConnection.createDataChannel(
  "flight-controls-v1",
  {
    negotiated: true,
    id: agreedStreamId,
    ordered: false,
    maxRetransmits: 0,
  },
);
```

Use the public [DataConnection peerConnection reference](https://peerjs.com/client/api/data-connection#peerconnection-object). Explicit matching IDs avoid PeerJS's incoming-channel handler; neither endpoint creates an additional in-band channel. Both confirm local channel-open state over the reliable channel before declaring transport ready. An existing SCTP association permits this without another ICE connection. This follows the [WebRTC negotiated-channel contract](https://www.w3.org/TR/webrtc/#dom-rtcdatachannelinit-negotiated).

This adapter is **source/spec checked, not yet browser tested**. Before feature implementation proceeds, verify on actual iPhone Safari and Android Chrome against desktop Chromium: identical IDs, `ordered === false`, `maxRetransmits === 0`, intact PeerJS handlers, simultaneous reliable actions and native input, and shared teardown. Failure blocks this transport design; do not silently switch to a retransmitting control stream.

## Application protocol and scheduling

All post-authentication messages include `v: 1`, session ID, message type, and a desktop-issued control epoch where relevant. Reject unsupported versions with a readable “Reload both devices” error.

A control frame has this shape:

```ts
interface ControlFrameV1 {
  v: 1;
  type: "controls";
  session: string;
  epoch: number;
  seq: number;
  lease: number; // Echoes a recent host heartbeat ID.
  controls: {
    elevator: number;
    aileron: number;
    rudder: number;
    throttle: number;
    pitchTrim: number;
    flaps: number;
    brake: number;
  };
  // What the camera trackpad did since the last frame; absent when it did nothing.
  camera?: { yaw: number; pitch: number; zoom?: number };
}
```

Use finite values in `[-1, 1]` for surfaces/trim and `[0, 1]` for throttle/flaps/brake.

`camera` is additive on v1 and a view rather than a control surface: it cannot refresh a lease or take
authority, and malformed aim is dropped on its own rather than costing the frame its control surfaces.
A peer that never sends it behaves exactly as before. It carries gesture *deltas*, not a position or a
rate — `yaw`/`pitch` are the swipe in CSS pixels scaled by 1/1000 and bounded to `[-1, 1]`, and `zoom`
is a pinch ratio bounded to `[0.5, 2]` per frame. The desktop sums the frames it receives and draws
the total once per rendered frame, so a dropped frame costs that frame's movement and nothing more. The status frame carries the desktop's engine reading the same way, in an
optional `engine` field — a `phase` label plus `n1`, `n2`, `rpm`, `thrustLbf`, `fuelFlowPph` and
`fuelFlowGph`, everything the HUD's engine widget draws, each absent rather than zero when the flight
model does not publish it. Three more fields carry engine start and shutdown, all additive on v1. The
status's `engine.state` (`running`, `starting` or `stopped`), with `start` (the start's progress, 0 to 1)
and an optional short `blocked` reason, is what the phone's throttle lever draws and offers; a host that
sends no `state` gets a plain throttle. A control frame carries `starter: 1` while the phone holds that
lever to start the engine — a held control like the brake, so the starter lets go with the frames — and
the `shutdownEngine` action, with no value, asks the desktop to shut it down once the ring at idle
closes. Local pointer processing clamps to these ranges; network validation rejects invalid values rather than repairing malformed input. Frame size is at most **2 KiB UTF-8 JSON**. Unknown message types, invalid sessions, and unsafe/noninteger/negative counters are rejected.

Sequence starts at zero for each new epoch and increases for every transmitted snapshot. Keep only frames newer than the last accepted sequence; reset the counter with a new epoch before exhausting safe integer range. Old epochs, duplicates, and reordered frames cannot alter controls or refresh freshness.

| Parameter | Initial setting |
| --- | --- |
| Phone snapshots | 60 Hz, including unchanged input while phone-owned and during handoff |
| Contact/release | Send promptly, with an overall 120 messages/second sender cap |
| Host heartbeat | Every 50 ms, also while paired/paused; includes current session and epoch |
| Telemetry | At most 10 Hz, coalesced on the native channel |
| Input stale limit | 250 ms |
| Host heartbeat validity | 250 ms from its desktop issue time |
| Native send backlog | At most 2 KiB already buffered before coalescing |
| Reliable action backlog | At most 8 pending actions, at most 2 KiB each |
| Setup timeouts | 10 s peer registration; 15 s connection/setup after registration |
| Action acknowledgement / handoff | 2 s; cancel an incomplete handoff and show failure rather than queueing more requests |

These timing values are proposed tuning defaults, not measured guarantees.

Pointer handlers update mutable current state independently of React rendering. Send the latest complete snapshot on the scheduler; do not integrate throttle from packet rate. Native send requires an open channel. If `bufferedAmount + frameBytes` would exceed 2 KiB, retain only the newest unsent state and send it when the buffer drains. Never replay a history of stick motion or use PeerJS's send queue for the high-rate stream.

Periodic complete frames repair a lost release packet. Prioritize host heartbeats over optional telemetry when coalescing outbound traffic. Throttle, flaps, trim, and brake each have a single canonical representation in the snapshot; actions must not concurrently write them.

The phone controller's own settings — where its chip grid sits, what its yaw slider does on release, how long the return takes, and haptics — are kept on the desktop with its other settings, so one export holds the whole setup. They travel as `settings` on the reliable channel, both ways, additive on v1: an older peer ignores the message and each end keeps its own. Once paired, the phone sends its own with `initial: true`, and the desktop takes them only where it still has its defaults, so an imported setup reaches the phone and a phone's earlier choices are not lost. The phone sends them again after each change its pilot makes, and the desktop answers each with what it then holds, and sends them again whenever they change there; it never sends them to a phone that has not sent its own. `rev` counts the phone's sends; the answer carries the newest the desktop has taken, and the phone ignores an answer older than its own latest change, so a slider being dragged is not pulled back by an answer in flight. Settings are not authority: they need no lease and are not bound to an epoch.

Reliable actions use unique IDs, explicit states such as `setPaused(true)` and `setViewMode("third")`, and desktop acknowledgements. Deduplicate within an epoch and bound the cache. Duplicate requests return the existing result. Do not automatically replay actions after epoch/session change. Cross-channel ordering is unspecified, so authority changes require the acknowledged handoff below. A delayed Resume must fail its session/epoch/freshness checks.

### Freshness independent of device clocks

The host heartbeat carries a monotonically increasing lease ID. The desktop records each ID's issue time; the phone echoes the newest received ID in controls and authority-sensitive actions.

For an arriving control frame, validate its lease and record the local receive time only after all validation passes. A frame is accepted only if its echoed host heartbeat was issued within 250 ms and belongs to this session/epoch. The newest accepted frame is the phone's command: fresh while it arrived within 250 ms, then held for the silence [Losing the phone](#losing-the-phone) allows.

A receive-time watchdog alone cannot detect a continuously delayed stream. Echoed heartbeats reject such traffic using only the desktop's clock. Do not subtract phone and desktop timestamps to decide freshness. Keep only the small live heartbeat window. A paired phone may request control using a current lease before it has sent any control frames; Resume while phone-owned additionally requires fresh accepted controls.

Freshness is measured on the desktop's **listening clock**: its monotonic clock less the time its main thread was too busy to listen. The session wakes every 50 ms heartbeat; a longer gap than two heartbeats between its own wake-ups is a stall, and all of it but one heartbeat is taken off. While the desktop is stalled nothing from the phone can reach it and no newer lease can reach the phone, so a stall of any length is neither silence from the phone nor ages its leases, and frames queued behind it are as fresh as the leases they carry. Deadlines — the handoff, the invitation — stay on the monotonic clock.

## Authority, handoff, and simulation integration

Use `local | phone` ownership and extract a single normalized `applyFlightControls()` writer from [flightInputManager.apply](../../src/flight/input/flightInputManager.ts#L170). Preserve the rudder conversion exactly once. This is the same control boundary anticipated by the separate [ArduPilot proposal](ardupilot-sitl.md); this feature does not implement autopilot or change who advances physics.

Network handlers validate and replace a latest-state mailbox. They do not call JSBSim. The application selects controls immediately before [the existing physics input callback](../../src/flight/createFlightSimApp.ts#L321).

### Granting phone control

1. Fly sends `requestControl` while paired. Require local flight keys released, local transient commands near neutral, and phone sticks/brake released. Explain **Center controls to take over** if necessary.
2. Desktop creates a pending epoch and sends current **applied** throttle/trim/flaps plus neutral transient controls and a fresh lease for that pending epoch. Continue issuing leases during handoff. This baseline is not interpolated HUD state.
3. Phone adopts the baseline, acknowledges it, and sends a fresh centered snapshot for that epoch. Desktop remains owner until both arrive. Local control changes, pause changes, reset, or expiry during the handoff cancel it.
4. Desktop activates the epoch and acknowledges the grant. Phone then enables live controls. Existing pause is preserved; Resume is a separate explicit action.

Persistent settings transfer unchanged; transient controls begin neutral. This does not promise continuous nonzero surface deflection across handoff.

### Returning to desktop

Take control or a deliberate local flight input immediately revokes phone authority and changes epoch, unless control is latched to the phone ([Sharing the controls](#sharing-the-controls)). Centring a control is letting go of it, not input: only a deflection takes over. Seed local persistent controls from the last applied state, clear old held keys/transient state, then apply the new intentional input. Existing `resetControls()` clears trim/flaps, so add a dedicated state-adoption method.

An attached idle gamepad must not overwrite phone input or a transferred throttle. Detect deliberate axis movement relative to its takeover baseline outside a tested deadband; treat new button presses as activity. Camera gestures and small resting noise do not take over. Local throttle/trim slider interaction does.

Desktop Take control preserves the existing pause state. Phone Release control and desktop Disconnect while phone-owned pause first. Disconnect while desktop-owned does not disturb local flight.

### Loss and lifecycle

A watchdog runs separately from render callbacks, with the same check immediately before every physics step.

- **Stale input or an expired lease** while phone-owned: hold the phone's last command, as [Losing the phone](#losing-the-phone) says. Past the hold, revoke phone authority and invalidate the epoch; clear transient surfaces, brake and starter, retain persistent settings, and synchronize local state; do not pause. Show the reason on both devices where communication remains available.
- **A lost control or reliable channel**: revoke the same way, pause through [the existing pause path](../../src/flight/createFlightSimApp.ts#L203), and end the session.

Inside the physics callback, past the hold, the step takes the last command with its transient controls let go, and the watchdog revokes within a heartbeat. A hidden desktop tab returns `false` as well as setting pause; otherwise [the current loop](../../src/flight/physics/fixedStepLoop.ts#L35) could still execute one step. A main-thread stall is not phone silence (the listening clock, above), so the first step after one applies what the phone last sent, and the frames queued behind the stall follow.

Within the hold, packets that return continue the same epoch. Past it, if channels remain healthy, remain paired and permit a fresh Fly handoff after recovery; never reactivate an old epoch because packets return. Authority comes back only through a new handoff ([Sharing the controls](#sharing-the-controls)). If either channel closes, require re-pairing. Signaling-only disconnection does not revoke a healthy direct session; attempt bounded signaling reconnection without recreating/destroying the healthy peer connection.

Phone hide/page exit sends a centred frame, then twice more as the frame timer and rate cap allow, then nothing. The desktop holds whatever it heard last, so one frame lost to the cap or the link must not leave a deflected stick, brake or starter held. Hiding is not Release and gives up no authority. A page back within the hold flies on in the same epoch. After the hold, the desktop has taken control back without a pause, and hands it back as after any loss. A handoff in progress when the page hides is abandoned for good. Pointer up/cancel/lost capture releases affected controls. Rotation cancels gestures before resizing. Desktop hiding while phone-owned explicitly pauses and revokes ownership. Returning the desktop tab to the foreground resumes flight only through the hand-back, which the phone completes.

Reset/reposition invalidates input and returns ownership to desktop before using the existing reset flow. Resynchronize the paired phone; departure presets retain their existing paused behavior. Teardown closes both channels and PeerJS, cancels timers/listeners/wake locks, and invalidates async callbacks.

### Avoiding application-side latency

Phone analog controls bypass [keyboard smoothing](../../src/flight/input/flightInputManager.ts#L112). Its current rate of 8 takes about 268 ms to reach 90% of a step at 60 FPS, calculated from the recurrence. Preserve local keyboard behavior; start phone controls with a deadzone/response curve but no time filter.

[120 Hz physics](../../src/flight/physics/fixedStepLoop.ts#L6) is driven by render callbacks. Incoming network handlers cannot interleave with synchronous substeps on the same thread, so it does not guarantee an 8.3 ms input response. Preserve the physics driver for v1 and measure rendering contention. A Worker is outside this feature.

## Sharing the controls

Added 2026-10-06. The first release handed control back to the phone only when its pilot tapped Take
control, after every loss. On a real desk that made the remote unusable: each stray key, hidden tab or
dropped frame needed a tap on the phone. Worse, one of those losses was not real — the HUD's stick pad
released its stick on every window blur and resize, whether or not anyone held it, and the release
reached the controls as local flight input. Clicking another application took control from a flying
phone. A release of a control nobody holds now moves nothing, and centring a control is never takeover
input.

**The claim.** A phone that is granted control holds a claim to it until its pilot taps Release, Take
control is pressed in the Remote Control tab, or the session ends. Losing control otherwise — a hidden
desktop tab, phone input stale past the hold, local flight input, a reset — leaves the claim standing.

**Control changes hands** (`osfs.remote.handover`) decides what a standing claim does:

| Value | Local flight input | Hand-back |
| --- | --- | --- |
| `auto` (default) | Revokes | Once local input has rested for `osfs.remote.returnIdle` (1 s), local controls are centred, and the tab is visible |
| `stay` | Revokes, and ends the claim | None: the phone's pilot taps Take control. The first release's behaviour |
| `phone` | Ignored while the phone flies | As soon as the tab is visible |
| `computer` | — | None; a flying phone is revoked and `requestControl` is refused |

**The offer.** While a hand-back is due, every status the desktop sends carries `handBack`: `now` when it
would grant a request at once, `idle` while it waits for local controls to rest. A phone that sees `now`
while it could tap Take control sends the ordinary `requestControl`, at most every 500 ms, and the
ordinary centred handoff follows. The offer is advice, never authority: a malformed value is dropped
on its own, and the request is checked exactly as a tap's is.

**Resuming.** If losing control paused a running flight, the `granted` message carries `resume: true`.
Only a hidden desktop tab pauses now; a phone that goes quiet does not ([Losing the phone](#losing-the-phone)). The
desktop never resumes by itself; the phone sends `setPaused(false)` once the grant reaches it, so a
flight cannot run under a phone that has not heard it is flying. A pause anyone chose in between clears
the mark. A grant that never reaches the phone leaves the flight paused, and the handoff's own timeout
returns control to the desktop.

**Blending.** With `osfs.remote.sharing` set to `blend`, a phone granted control flies together with the
desktop, whose input manager stays live (`setRemoteOwned(false)`). `src/flight/remote/controlBlend.ts`
mixes each physics step. Elevator, aileron, rudder and brake are `p + (1 − |p|) · s`, where `p` is the
input of the device that `osfs.remote.blendPriority` names and `s` the other's: continuous, never past
full travel, and a full deflection on the priority device is all of the control. Throttle, trims and
flaps take the value of whichever side moved last, the priority's on a simultaneous move. The desktop's
levers are set to the result with `adoptLevers`, which makes an absolute hardware lever resting elsewhere
wait for movement past the takeover deadband, as automatic flaps already did. Statuses then carry
`blend`, the priority, with the levers where the pilots put them, before automation, and the phone moves
its levers to them once the heartbeat's `appliedSeq` has reached the first frame of its own latest lever
move, so a status from before the move never drags a lever back under the finger. Automation that writes
a desktop lever — trim assist, an engine holding idle — reaches the result as a desktop move; flaps count
only the pilot's own flap input, by revision, because automatic flaps write the actual travel back every
frame. Local flight input never revokes a blending phone, so `handover` only decides rejoining: `auto` and
`phone` rejoin as soon as the tab is visible. Changing the sharing under a flying phone revokes it without
a pause, and the hand-back grants it again under the new sharing.

**Compatibility.** `handBack`, `resume` and `blend` are additive on v1. An older phone ignores all three:
it shows Take control, keeps the pause, and keeps its levers where it put them, so while blending its
next touch can jump a lever the computer moved. An older desktop never offers; a newer phone then asks
only when its pilot taps. Because a newer phone no longer sends Release when hidden, an older desktop
pauses on the silence instead, within the stale limit.

## Losing the phone

Added 2026-10-06. Until then, 250 ms without phone input revoked control and paused the flight. The phone
locked its controls and let go of everything, starter included, as soon as it had not heard the desktop
for as long. Control came back only through a fresh handoff, while a popup covered the phone's controls.
On a real desk the link drops for a moment often: Wi-Fi power saving, a busy phone, the desktop's own
main thread compiling shaders as an engine lights. An engine start, which needs the starter held for many
seconds, could not survive one, and the user reported that they could not start the engine at all.

**Holding.** The desktop applies the newest accepted frame — stick, rudder, brake, levers and `starter` —
through a silence of up to `osfs.remote.holdLast` (default 2 s, 0 to 10 s) past the 250 ms stale limit.
Owner and epoch stay as they are, and the Remote Control tab says the command is held. Frames that arrive
on a stale lease are still rejected; one heard within the hold continues the same epoch at once. Past the
hold the watchdog revokes without a pause: stick, rudder, brake and starter let go, the levers stay, and
the claim stands, so control goes back to the phone once it is heard, as `handover` says. The hold is read
at every step, so shortening it under a silence lets go at once. Both ends record each silence and its
length in their connection timeline.

**This computer's stalls** are not silence. Silence and lease age are measured on the listening clock
(see [Freshness](#freshness-independent-of-device-clocks)), so a stall of the desktop's main thread, of any
length, neither starts the hold nor ages a lease.

**The phone.** Its controls stay live while the desktop is unheard, and what the pilot does is sent for when
the link is back. The 🌐 chip shows how long the desktop has gone unheard in place of the round trip,
counting up in tenths of a second and lit. The phone's own stalls are taken off that count: a gap of more
than six control intervals between its control timer's ticks, less one interval. There is no popup. Take control is a chip where Pause and Release go
while flying, and a session that has ended offers Scan QR code there and under its cause in Connection
details.

**Compatibility.** Nothing on the wire changed. An older phone still locks its controls and lets go of
everything 250 ms after it last heard the desktop, and gives up its authority on hiding: hidden within the
hold, it cannot fly again until the desktop takes control back past the hold and hands it back. An older
desktop still pauses on 250 ms of silence.

## Errors and operating limits

| Condition | Required behavior |
| --- | --- |
| PeerJS Cloud cannot be reached | Stop after the registration timeout; show **Pairing service unavailable. Retry.** Local flight continues. |
| Direct connection fails | Show **Could not connect directly. Try the same non-guest Wi-Fi network.** Offer Retry/new QR. No tunnel/server setup instructions. |
| Invitation expired/consumed | Require a new desktop QR. If the peer itself is unreachable, show a combined expired/unavailable message rather than claiming a precise cause. |
| Unsupported protocol | Tell the user to reload both devices; do not accept controls. |
| Phone already paired | Reject the new connection without interrupting the current phone. |
| Poor connection | The phone's 🌐 chip counts how long the desktop has gone unheard. The desktop holds the last command through a short loss, and takes control back without a pause after a long one. |
| Stale controls | Held for `osfs.remote.holdLast` if phone-owned; then let go, and control is the desktop's until the hand-back. |
| Unavailable browser API | Explain that phone control is unsupported; preserve local flight. |

V1 introduces no paid infrastructure. Free services can change or become unavailable. A TURN solution can be specified later if connection success requires it; do not embed paid relay credentials in public static assets or claim all networks are supported.

## File-level implementation plan

| File or area | Responsibility |
| --- | --- |
| `src/main.tsx` | Lazy controller route before globe/flight initialization. |
| `src/remote/createPhoneControllerApp.tsx`, touch components/CSS | Lightweight mobile controller and progress/error states. |
| `src/remote/protocol.ts` | Types, bounded parsing, validation, counters, action acknowledgements. |
| `src/remote/peerTransport.ts` | Pinned PeerJS adapter, native negotiated channel, backpressure, status, teardown. |
| `src/remote/pairing.ts` | Public URL construction, invitation parsing, local secret/deadline handling. |
| `src/flight/remote/createPhoneControlSession.ts` | Host authentication, one-phone claim, mailbox, leases, watchdog. |
| Host session and `src/flight/input/applyFlightControls.ts` | Exclusive owner, applied-state baseline, handoff, one JSBSim writer. |
| `src/flight/input/flightInputManager.ts` | Local state adoption and intentional takeover detection. |
| `src/flight/hud/RemoteControlTab.tsx`, `createPhonePairingPanel.ts` | Remote Control tab: QR, status, takeover and disconnect. |
| `src/flight/createFlightSimApp.ts`, HUD updates | Composition, pause/reset/destroy wiring, applied-control diagnostics. |
| `package.json`, lockfile, README | Client dependencies, production configuration, usage and limitations. |

Keep feature code in 0SFS. No FOSS Earth modification or `services/signaling/` deployment is planned.

## Acceptance criteria

Implementation is complete only after these checks pass:

1. **Production-only flow:** Open the deployed app and scan its QR with no local process running. The phone reloads the `/rc/` route successfully; its network requests contain no simulator/globe payloads or map keys.
2. **Real devices:** Current iPhone Safari and Android Chrome pair with desktop Chromium on a home LAN; also verify desktop Safari. Record OS/browser versions, selected non-relay candidate pair, and actual channel delivery settings. Confirm PeerJS's wrapped channel remains intact.
3. **Pairing:** Expired/reused/wrong invitations, second phone, malformed links, and version mismatch cannot control the aircraft. The secret stays out of signaling metadata, requests to static hosting, logs, and persistent storage.
4. **Authority:** Pairing does not alter flight. Both handoffs preserve non-default throttle/trim/flaps. Idle gamepad cannot overwrite phone controls. Deliberate desktop takeover works without network acknowledgements. Old epochs cannot regain control.
5. **Protocol and queues:** Reject malformed/oversized/nonfinite/out-of-range input; discard duplicate/reordered frames and expired leases. Saturated output coalesces rather than replaying old motion. Lost releases recover through snapshots; duplicate actions apply once.
6. **Lifecycle:** Screen lock, backgrounding, tab exit, channel loss, desktop hide and reset cannot advance physics with phone input held past the hold, and an injected main-thread stall is not phone silence. Test watchdog behavior while rendering is idle and that the pre-step check lets go past the hold.
7. **Controls:** Simultaneous touch works; pitch/roll/yaw directions match the actual C172 response. Pointer cancellation, lost capture, rotation, and leaving the page release controls. Pause and resume preserve authority/freshness rules.
8. **Failure isolation:** Block signaling and direct connectivity separately. Errors are actionable, attempts are bounded, and local simulation remains usable. A healthy peer session survives signaling-only loss.
9. **Cleanup and regression:** Repeated pair/disconnect/destroy cycles leave no live connections/timers/listeners or late SDK writes. Existing keyboard/gamepad, pause, reset, collision, and JSBSim tests pass with lint and production build.
10. **Latency evidence:** Run at least a five-minute session on each primary phone platform at stable desktop 60 FPS, then repeat under terrain/tile-streaming load. Record actual send rate, sequence gaps, backlog, ping/pong RTT, receive-to-applied-physics delay, and p50/p95/p99.

Target **p95 touch-to-visible-applied-input below 50 ms** on the reference home-LAN setup at stable desktop 60 FPS. Measure this with a high-frame-rate recording of touch plus an applied-input indicator, separately from aircraft inertia. The target is not yet demonstrated. Report event sample counts and the loaded-scene results; do not treat half-RTT or subtraction of unsynchronized clocks as measured one-way latency. If the target fails, investigate the measured source before increasing complexity.

First implementation milestone is the bounded PeerJS/native-channel compatibility check. Then implement the input seam and full QR/controller flow, followed by lifecycle and deployed-device acceptance. Review of this document does not imply those checks have run.

## Review focus

The main product choices to review are: **touch controls before tilt; explicit Fly/Resume; a held last command, then a hand-back without a pause, on lost phone input; direct-only networking initially; and a new QR after transport closure.** Architecture and acceptance criteria above use those defaults consistently.

## Implementation notes

The implementation uses `src/remote/` for the browser-only controller, protocol, QR invitation helpers, and pinned PeerJS transport. `src/flight/remote/createPhoneControlSession.ts` owns desktop authentication, readiness, input leases, action deduplication, and authority. `applyFlightControls.ts` is the common normalized input-to-JSBSim boundary. The desktop labels the invitation cancellation action **Disconnect**; leaving the tab preserves the invitation.

The HUD-bar button and its dialog described under [Desktop](#desktop) were later replaced by a **Remote Control** tab in the flight panel (⚙ → Remote Control), with the same pairing controls and a **Switch to RC mode** button that turns the device showing it into the controller. Networking still initializes only when the tab first opens.

The desktop and phone entry points are dynamically imported by `mode=flight` and `mode=remote`. Dependencies are pinned to PeerJS 1.5.5 and qrcode 1.5.4. Automated protocol, transport, input, lifecycle, and application integration checks accompany the implementation. The device/network acceptance checklist above remains a manual release check; automated tests do not establish latency or compatibility on physical phones.

The headless Brave verification environment reached PeerJS Cloud and exchanged ICE candidates, but the data channel stayed in ICE checking. A separate minimal native WebRTC pair in the same page, without PeerJS or application code, failed in the same way; a repeat in Chrome 153 on September 9, 2026 also stayed in ICE checking. That environment therefore could not verify an established direct connection. Production pairing, desktop Safari, physical iPhone/Android compatibility, and measured touch-to-aircraft latency remain unverified. No development server or deployment was started.

The production build was checked in isolated Chrome 153 at the former `/flight-sim/` base path using intercepted static assets, without starting a server. Re-run this check at the organization-site root before release. The phone route downloaded no globe, flight-simulation, or JSBSim chunks. Invalid invitations initialized no networking, valid invitation credentials were cleared before networking and absent from observed requests, and refreshing required a new QR. Opening another invitation in the same tab now consumes the new fragment and replaces the previous client.

Additional regression coverage checks that desktop camera changes preserve a pending Fly handoff, delayed status messages cannot restore a hidden or timed-out phone's authority, and protocol-version mismatches request a reload of both devices. Desktop ownership status uses a bounded, coalesced retry when the reliable channel is busy; persistent failure closes the session instead of leaving the phone indefinitely disabled.
