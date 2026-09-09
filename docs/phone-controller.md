# Phone controller

Use your phone as a physical-feeling control yoke while the simulator runs on your computer. No app
to install and nothing to configure — both ends are just web pages.

## Pairing

1. On the computer, open flight mode and click **Phone controller**.
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

## Notes for self-hosting

The QR normally opens `https://0sfs.github.io/?mode=remote`. To point it at a different static HTTPS
deployment, set `VITE_PHONE_CONTROLLER_URL` to that base URL at build time. See
[Deploying to GitHub Pages](deploying.md).

The phone route loads independently of the globe renderer and JSBSim, so it stays lightweight on
mobile data.

## Specification

[docs/proposals/phone-controller.md](proposals/phone-controller.md) has the control protocol, failure
behavior, and the device acceptance checklist. Real iPhone and Android testing on the deployed site is
still required before treating the feature as verified on those devices.
