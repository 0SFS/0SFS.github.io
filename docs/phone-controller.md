# Phone controller

Use your phone as a physical-feeling control yoke while the simulator runs on your computer. No app
to install and nothing to configure — both ends are just web pages.

## Pairing

1. On the computer, open [flight mode](https://0sfs.github.io/fly/), then ⚙ → **Remote Control**.
2. Scan the QR code with your phone camera.
3. On the phone, tap **Take control** in the chip grid to take control.

A controller added to the Home Screen opens without an invitation, because the Camera app sends a
scanned link to the browser rather than to the installed app. It pairs by reading the QR itself:
tap **Scan QR code** and point the phone at the computer. A session that has ended offers the same
button in the chip grid and under its cause in **Connection details**. The browser opens the camera only on a secure page, so this works on the
deployed site and under `npm run dev:lan`, not over plain HTTP. A QR for this same page pairs in
place, without the invitation ever reaching the address bar; a QR for another copy of the site
loads that copy, as the Camera app would, so the phone runs the code the computer runs.

A phone that is on the simulator instead — opened at `/fly/`, or from a Home Screen icon made there —
becomes the controller from the same tab: **Switch to RC mode** opens `/rc/` in its place. On a phone
the tab leads with that button and makes no QR until asked. The icon still opens the simulator next
time; an icon made from `/rc/` is named *0SFS RC* and always opens the controller.

**Take control** preserves the simulator's current pause state; if the flight is paused, tap **▶** (Resume)
in the grid separately. The one exception is the pause that hiding the desktop tab caused, which lifts
when control comes back (see [Who flies](#who-flies)). The touch controller provides pitch/roll, rudder, throttle, trim, flaps, brake, pause,
camera view, and release.

The controls sit where the desktop flight HUD puts them, so muscle memory carries between
the two screens: the pitch/roll stick with roll trim above it, pitch trim on its left, the flaps lever
on its right, and the trim-centring buttons in the corner above pitch trim; then yaw, brake and the
throttle lever as the second group.

The controller page never scrolls. It is sized to the viewport so a control cannot move out from
under a thumb mid-flight, and everything secondary collapses to make room: the instruments, the link
state and every button share one compact chip grid below the controls (or above them, from ⚙
Settings), and **Connection details** and **Settings** open as full-screen sheets instead of growing
the page. A phone in portrait is too narrow to hold both of the desktop HUD's bottom corners
side by side, so the two groups stack there, each keeping its own internal geometry; in landscape and
on wider screens they sit side by side exactly as the desktop does.

The QR expires after two minutes and admits one phone. Leaving the tab hides it; **Disconnect**
invalidates the invitation or ends the session.

### Who flies

Once the phone has taken control, it keeps its claim to the controls until its pilot taps **Release**.
Control can still be taken from it for a while: by flight input on the computer, by the desktop tab
being hidden (which pauses the flight), or by phone input that stops arriving for longer than
**Hold the phone's last command** (see [When the link drops](#when-the-link-drops)). What happens next
is Remote Control → **Who flies** → **Control changes hands**:

| Choice | Flight input on the computer | Control goes back to the phone |
| --- | --- | --- |
| **Automatically** (default) | Takes control | By itself, once the computer's controls have rested for **Rest before returning** (1 s), the desktop tab is showing and the phone is heard from |
| **Only when taken** | Takes control | When the phone's pilot taps **Take control**; a pause stays until someone resumes |
| **Latched to the phone** | Does nothing while the phone flies | By itself, without waiting for the computer's controls to rest |
| **Latched to this computer** | — | Never: the phone cannot take control |

In every mode **Take control** in the Remote Control tab takes control here on purpose — while control
is waiting to go back, the button reads **Keep control here** — and the phone then waits for its pilot
to tap **Take control**. A phone disconnection pauses the flight and ends the session.

The computer never resumes the flight by itself. When control goes back after the pause that hiding
the desktop tab caused, the computer tells the phone that the pause is the phone's to lift, and the
phone lifts it once it has heard that it is flying, so nothing flies under a phone that does not know
it has the controls. A pause anyone chose in the meantime stays. A phone page loaded before this
behaviour existed asks for nothing and keeps the pause; reload it.

### When the link drops

Wi-Fi, a busy phone or a busy computer can hold up the link for a moment. Nothing pops up and nothing
pauses:

- The computer keeps flying the phone's last command — stick, rudder, brake, throttle, and a starter
  held to start the engine — for **Hold the phone's last command** (2 s by default, up to 10 s), in
  Remote Control → **Who flies**. Heard again within that, the phone flies on as if nothing happened.
- The phone's controls stay live, and its **🌐** chip lights up and counts how long the computer has
  gone unheard, in place of the round trip.
- Past the hold, the stick, rudder, brake and starter let go, the levers stay where they are, and the
  computer takes control without pausing. It goes back to the phone by itself once the phone is heard
  again, as **Control changes hands** says.
- The computer stalling — compiling shaders as an engine lights, say — does not count as the phone's
  silence, and the phone stalling does not count on its 🌐 chip.

Both ends keep each loss and how long it lasted in their **Connection details** timeline. Hiding the
controller — locking the phone, switching apps — sends a centred frame first, so the computer holds
nothing deflected, and a page back within the hold flies on.

**Sharing the controls**, in the same section, decides whether one device flies at a time, as above,
or both. With **Blend both**, a phone that has taken control flies together with the computer, whose
keys, gamepad and HUD stay live:

- Pitch, roll, rudder and brake mix. The device chosen by **Blend priority** gets its input, and the
  other gets whatever authority that leaves free, so a full deflection on the priority device is all of
  the control and a centred one hands the whole control to the other.
- Throttle, trim and flaps go where they were last moved, by either pilot, and the priority device's
  move wins if both move one at once. The levers on both screens follow; a hardware lever resting
  somewhere else waits until it is moved again.
- Flight input on the computer never takes control from a blending phone. **Control changes hands**
  then only decides whether the phone joins again by itself after a loss; **Latched to this computer**
  keeps it out. The phone's link chip reads **BLEND**.

## When pairing fails: read the connection details

Both ends keep a timeline of the whole attempt, and both show it. On the phone it is the
**🌐** chip in the controller's grid, which shows the round trip — or, lit, how long the computer has
gone unheard — and opens **Connection details**; on the computer it is **Connection
details** inside the Remote Control tab. Either one opens itself when something fails, shows the
cause at the top, and has a **Copy diagnostics** button that produces a plain-text report suitable for
a bug report.

The report answers the questions that actually decide a pairing failure:

| Line | What it tells you |
| --- | --- |
| `signaling` | Whether this device registered with the pairing service, how long it took, and the PeerJS error type if it did not |
| `local candidates` / `remote candidates` | How many addresses each side offered, by type (`host`, `srflx`, `relay`), and how many were mDNS `.local` names |
| `ice server error` | A STUN or TURN server that answered with an error while gathering |
| `selected pair` | The path that was actually chosen, or `none` |
| `channels` | When the session channel and the low-latency control channel opened |
| `failure` | The first recorded cause, which is the one worth reading |

Common shapes:

- **`peer-unavailable`** — the QR expired, or the computer's tab was closed or reloaded after the QR
  was shown. Create a new QR. This is reported immediately rather than after a timeout.
- **remote candidates `none`** — nothing ever arrived from the other device. It is still gathering, was
  closed, or its signaling dropped before it answered.
- **both sides only `mdns`** — the two browsers could not resolve each other's `.local` names. On
  macOS and iOS this is the **Local Network** permission; allow it for the browser and pair again.
- **candidates on both sides, no `relay`, no selected pair** — there is no direct path between the two
  devices. Access points with client isolation ("AP isolation", most guest networks) and routers that
  will not loop a connection back to themselves both land here. Only a TURN relay gets through it; see
  below.

Addresses in the report are masked to their subnet (`192.168.1.x`), and mDNS candidates are labelled
rather than printed, so a report can be shared without publishing a device's full address.

## Requirements and limits

Pairing uses PeerJS Cloud for signaling. Flight inputs then travel over a direct WebRTC data channel
configured with `ordered: false` and `maxRetransmits: 0`, so a late packet is dropped rather than
delaying the ones behind it.

Both pages are static GitHub Pages assets; there is no application server, local helper, or tunnel.
Internet access is needed for page loading and initial signaling.

By default the connection uses STUN only — several independent STUN hosts, so one blocked or
rate-limited server costs gathering time rather than the connection. STUN discovers addresses; it
cannot carry traffic. Where no direct path exists between the two devices, a TURN relay is the only
option.

The phone and desktop must run the same protocol version — reload both after an update.

## Adding a TURN relay

A TURN server relays the flight-control traffic when the two devices cannot reach each other
directly. Both ends need the same configuration.

At build time — one setting reaches both devices, because they load the same bundle:

```sh
VITE_ICE_SERVERS='[{"urls":"turn:turn.example.org:3478","username":"user","credential":"pass"}]' npm run build
```

Per device, without rebuilding, in the browser console on each of the two devices:

```js
localStorage.setItem('osfs.ice-servers', '[{"urls":"turn:turn.example.org:3478","username":"user","credential":"pass"},{"urls":"stun:stun.l.google.com:19302"}]')
```

The device setting overrides the build setting. Include a STUN entry alongside TURN so a direct path
is still preferred when one exists — the **Connection** line in the diagnostics panel reports whether
the session ended up direct or relayed. An invalid or partly invalid list is ignored in full rather
than half-applied, and the diagnostics report names which servers were used with credentials stripped.

Running your own TURN server (`coturn` is the usual choice) keeps the flight data on infrastructure
you control; a third-party TURN provider will see the relayed traffic.

## Where the QR points

The QR points at **the site the desktop is already on** — same origin, same base path, plus `/rc/`.
A fork served from anywhere needs no configuration for this, and a locally served copy pairs with a
phone without being deployed first.

Two exceptions:

- **Loopback.** A phone cannot reach `localhost`, so a QR must never offer it. The dev server reports
  the address other devices can use, and the QR is built from that instead. A browser cannot discover
  its own LAN address — WebRTC stopped exposing it — so this only works when a dev server has supplied
  one; see [Development](development.md#testing-on-a-real-phone). Without one, creating a QR fails and
  names the command to run rather than producing an unreachable link.
- **`VITE_PHONE_CONTROLLER_URL`.** Set at build time, it overrides the origin entirely, for a
  deployment whose QR has to point somewhere else. See [Deploying to GitHub Pages](deploying.md).

Invitations require HTTPS, with one carve-out: plain HTTP is accepted when the host is a private
address (loopback, `10.x`, `192.168.x`, `172.16–31.x`, IPv6 unique- and link-local). That is what a
laptop serving its own LAN looks like, and requiring a certificate there would mean no testing on a
real phone without one. A deployed site is never on such a host, so a published QR is always HTTPS.

The phone route loads independently of the globe renderer and JSBSim, so it stays lightweight on
mobile data.

## The screen itself

The phone flies the aircraft, moves the chase camera from a trackpad — swipe to look, pinch to zoom —
and shows the desktop HUD's own engine widget, drawn by the same code from the same reading, just
above the throttle. Where the browser can hide its own bars it asks once, in a popup, and keeps a ⛶
button in its grid after that. On an iPhone, where Safari has no page fullscreen at all, that popup
explains why rather than only saying "add it to your Home Screen": what the bars cost, that nothing
is missing or for sale, the three options that exist, and — folded away for whoever wants it — the
whole technical case, including why another browser on the same phone changes nothing. ⚙ Settings moves the chip grid above or below the controls, and decides whether the
yaw slider returns to centre when you let go — and how long that return takes — or keeps the
deflection until you move it again.

[Phone controller UI](phone-controller-ui.md) covers how the page is built: the stylesheet it shares
with the desktop HUD, the OLED theme, the control arrangement in each orientation, and the layout
rules `npm run check:phone-layout` enforces.

**Defects found on a real iPhone** — see [the session record](ux/2026-09-17-iphone-session.md):

- **A vertical drag on a slider scrolled the page instead of moving the control**, which made the
  throttle unusable. Every flight slider now carries `touch-action: none` in the shared
  `flightControls.css`, and the phone page no longer rubber-bands. **Not yet confirmed on a
  device** — the layout check passed before the fix too, because a geometric check cannot see a
  stolen gesture.
- **Add to Home Screen from `/rc/` installed the flight simulator.** `/rc/` now links its own
  manifest, `public/rc.webmanifest` — *0SFS RC*, opening `/rc/` — chosen by the boot script in
  `index.html`, so the controller and the simulator install as two icons.
- **`/fly/` said almost nothing about fullscreen on a phone.** It now shows the controller's own
  notice on an iPhone: the same component, words and card.
- **An installed controller could not pair.** The invitation arrives in the QR link's hash and is
  cleared as soon as the page reads it, and iOS opens a link from the Camera app in Safari, never
  in a Home Screen app — so the installed controller opened at *Scan a new QR to connect* with no
  way to take one. The controller now reads the QR itself: **Scan QR code** on that page, and in
  the chip grid of a session that has ended, opens the camera in the page. **Not yet confirmed on a
  device.**

Each page tints the browser bars its own background (`theme-color`, set per route by the same boot
script): true black on `/rc/`, the flight page's `#04060a` on `/fly/`.

There is no way to hide the iOS URL bar other than a Home Screen launch; the alternatives and why
each fails are tabulated in [the brainstorm](brainstorm/ios-url-bar-and-scrolling.md).

## Specification

[docs/proposals/phone-controller.md](proposals/phone-controller.md) has the control protocol, failure
behavior, and the device acceptance checklist. Real iPhone and Android testing on the deployed site is
still required before treating the feature as verified on those devices.
