# Phone controller

Use your phone as a physical-feeling control yoke while the simulator runs on your computer. No app
to install and nothing to configure — both ends are just web pages.

## Pairing

1. On the computer, open [flight mode](https://0sfs.github.io/fly/) and click **Phone controller**.
2. Scan the QR code with your phone camera.
3. On the phone, tap **Fly** to take control.

**Fly** preserves the simulator's current pause state; if the flight is paused, use **Resume**
separately. The touch controller provides pitch/roll, rudder, throttle, trim, flaps, brake, pause,
camera view, and release.

The QR expires after two minutes and admits one phone. Closing the dialog hides it; **Disconnect**
invalidates the invitation or ends the session. Desktop flight inputs or **Take control** immediately
reclaim control from the phone.

Lost or delayed phone inputs, a hidden desktop tab, or a phone disconnection all pause the simulation
and return control to the desktop. Resuming or handing control back to the phone always requires an
explicit action — the simulator never silently resumes under a control source it cannot hear from.

## Requirements and limits

Pairing uses PeerJS Cloud for signaling. Flight inputs then travel over a direct WebRTC data channel
configured with `ordered: false` and `maxRetransmits: 0`, so a late packet is dropped rather than
delaying the ones behind it.

Both pages are static GitHub Pages assets; there is no application server, local helper, or tunnel.
Internet access is needed for page loading and initial signaling.

Version 1 uses STUN only. Guest Wi-Fi isolation, restrictive firewalls, and some network combinations
can prevent a direct connection. If pairing fails, try putting both devices on the same non-guest
Wi-Fi network.

The phone and desktop must run the same protocol version — reload both after an update.

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

## Specification

[docs/proposals/phone-controller.md](proposals/phone-controller.md) has the control protocol, failure
behavior, and the device acceptance checklist. Real iPhone and Android testing on the deployed site is
still required before treating the feature as verified on those devices.
