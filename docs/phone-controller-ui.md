# Phone controller UI

How the `/rc/` page is built, why it is built that way, and the traps that have
already been paid for. [Phone controller](phone-controller.md) covers pairing,
the protocol and the connection diagnostics; this is the screen itself.

## The one rule

**The phone controller is the desktop HUD, rearranged.** It shows the same
controls, so it uses the same class names and the same CSS rules. When something
about a control looks wrong on the phone, the fix almost always belongs in the
shared stylesheet, where it lands on both screens at once — not in a phone-only
rule that re-solves a solved problem.

## Where things live

| File | Holds |
| --- | --- |
| [`src/styles/flightControls.css`](../src/styles/flightControls.css) | **Appearance** of every flight control, shared by both screens |
| [`src/styles/flight.css`](../src/styles/flight.css) | Desktop HUD: placement, plus everything that is not a control |
| [`src/remote/phone.css`](../src/remote/phone.css) | Phone: placement and theme only |
| [`src/remote/PhoneController.tsx`](../src/remote/PhoneController.tsx) | Phone markup, using the HUD's class names |
| [`src/remote/PhoneStick.tsx`](../src/remote/PhoneStick.tsx) | The pitch/roll pad, the camera pad and the brake |
| [`src/remote/PhoneYaw.tsx`](../src/remote/PhoneYaw.tsx) | The yaw slider and its return to centre |
| [`src/remote/PhoneViewSwitch.tsx`](../src/remote/PhoneViewSwitch.tsx), [`PhoneIcons.tsx`](../src/remote/PhoneIcons.tsx) | The cockpit/chase switch, and its icons, drawn for this page |
| [`src/remote/PhoneEngine.tsx`](../src/remote/PhoneEngine.tsx) | The desktop's engine widget, fed from the status frame |
| [`src/flight/hud/engineSummary.ts`](../src/flight/hud/engineSummary.ts) | That widget's DOM and drawing, shared with the desktop engine monitor |
| [`src/remote/useFullscreenOffer.ts`](../src/remote/useFullscreenOffer.ts), [`PhoneFullscreenPrompt.tsx`](../src/remote/PhoneFullscreenPrompt.tsx) | The fullscreen popup and the ⛶ button |
| [`src/remote/fullscreenMessage.tsx`](../src/remote/fullscreenMessage.tsx) | The iPhone notice's words, and nothing else |
| [`src/remote/phonePopup.css`](../src/remote/phonePopup.css) | The popup card, shared with the flight page's iPhone notice |
| [`src/remote/PhoneUnpaired.tsx`](../src/remote/PhoneUnpaired.tsx) | The page with no invitation — every Home Screen launch — and its **Scan QR code** |
| [`src/remote/PhoneQrScanner.tsx`](../src/remote/PhoneQrScanner.tsx), [`qrScanner.ts`](../src/remote/qrScanner.ts) | The in-page QR scanner, and the camera and decoder behind it |
| [`src/remote/PhoneSettings.tsx`](../src/remote/PhoneSettings.tsx), [`phoneSettingsStore.ts`](../src/remote/phoneSettingsStore.ts) | The ⚙ settings sheet and what it remembers |
| [`src/remote/ConnectionDiagnosticsPanel.tsx`](../src/remote/ConnectionDiagnosticsPanel.tsx) | The 🌐 chip and its sheet |
| [`src/flight/hud/flightHud.ts`](../src/flight/hud/flightHud.ts) | Desktop HUD markup, for reference when copying |
| [`src/flight/hud/RemoteControlTab.tsx`](../src/flight/hud/RemoteControlTab.tsx), [`createPhonePairingPanel.ts`](../src/flight/hud/createPhonePairingPanel.ts) | The flight panel's Remote Control tab: the computer's QR, and **Switch to RC mode** |

### Appearance versus placement

`flightControls.css` owns how a control *looks*: borders, fills, type, the
diagonal split in the trim square, slider thickness and accent. It contains no
`grid-column`, no `position`, no host-specific sizing.

Each host owns *where* its controls sit. The HUD anchors a cluster to the bottom
corners of the canvas; the phone lays the same pieces into a grid that fills a
handset. Both place the same class names.

Shared class names in use on both screens: `flight-hud__tape`,
`__tape-header`, `__label`, `__value`, `__unit`, `__gear`, `__auto-trims`,
`__auto-trim--roll`, `__auto-trim--pitch`, `__slider-control`,
`__slider-control--roll-trim`, `__lever--pitch`, `__lever--flaps`,
`__lever-meta`, `__lever-track`, `__yaw-control`, `__yaw-heading`. The engine widget
brings the desktop monitor's `flight-engine__*` classes and `engineMonitor.css` with it.

### Theme tokens

Everything colour-like in the shared file is a `--ctl-*` custom property, with
defaults on `:root` equal to the desktop HUD's values. A host re-points them:

| Token | HUD default | Phone |
| --- | --- | --- |
| `--ctl-surface` | `rgba(0, 0, 0, 0.45)` | `transparent` |
| `--ctl-line` | `rgba(255, 255, 255, 0.12)` | `rgba(196, 208, 220, 0.24)` |
| `--ctl-accent` | `#e8b647` | `#e8b647` |
| `--ctl-chip-size` | `28px` | `34px` |
| `--ctl-lever-thickness` | `16px` | `30px` |

The phone theme is tuned for an OLED handset: the page is `#000` so those pixels
are off, panels are outlines rather than filled shapes, the knob is a ring rather
than a puck, and text is `#c9d2da` rather than white. There is no light theme
yet; see [the theme prompt](theme-support-prompt.md).

## Layout

The desktop HUD puts the pitch/roll surface bottom-left inside a cluster — roll
trim above it, pitch trim left, flaps right, the trim square in the corner — and
yaw, the engine monitor and the throttle lever bottom-right with the throttle
outermost. The phone keeps those relationships in both orientations, with one
swap: the camera pad takes the engine monitor's slot, and the engine widget sits
just above the throttle instead.

**Nothing sits above or below the controls.** Everything that is not a flight
surface — IAS, ALT and HDG, the gear, the link chip, pause and release (only
while flying), haptics, 🌐 connection details, ⛶ fullscreen, ⚙ settings and the
brake, in that order — is one chip grid at the density FOSS Earth's
`.hud-bar` uses, because they are menu items and readouts and the screen is
worth more to the controls. It sits under the controls by default; **⚙ Settings
→ Button grid → Top** moves it above them, remembered under
`osfs.phone-grid-position`. The brake is a `B` chip held under a thumb, a little
wider than the glyph chips; a full-width bar was more brake than anyone needs.

There used to be an instrument row at the top, a status banner, a fullscreen
banner and a footer. Each cost a row of screen to say something a chip can say.
In particular there is no banner for a connection that has gone quiet: the link
chip reads `DELAYED` with its light out, at the same width as every other label
it shows so the grid never reflows under a thumb, and the client's full sentence
goes to a live region for assistive tech. A session that has ended opens
Connection details itself, with the cause and what to do about it.

Yaw is one row — `YAW`, the track, the value — rather than the HUD's heading
row over the track, which made the box nearly twice the height the track needs.
The value has a fixed width so the track does not resize while it is being
dragged. The class names are still the HUD's; only `phone.css` places them.

**Yaw and roll trim are one lever thickness**, border included, so the two
horizontal strips read as the same control as the pitch and flaps levers rather
than as bars twice their weight. Yaw sets its track to
`calc(var(--ctl-lever-thickness) - 2px)` and lets the border make up the rest;
roll trim takes the thickness as its own height and stretches its track to fill
it, which also ends the 12px hit area the desktop's mouse-sized bar left on a
phone. Roll trim keeps sitting on the bottom edge of the trim square's row, so
what it lost is empty space above it, and yaw's row gives its height to the
camera pad below.

The track is drawn from the client's own control state rather than from the
DOM's, so the thumb is wherever the rudder actually is. That is a requirement,
not a preference: every slider here is React-controlled, so a control the client
moves in its mailbox without putting it in the snapshot is painted back to the
snapshot's value on the next render — which is what the yaw slider did for a
while, sitting still at 0% while the aircraft answered the finger perfectly.
`RENDERED_CONTROLS` in [`phoneControllerClient.ts`](../src/remote/phoneControllerClient.ts)
is the list that has to reach the snapshot; the pitch/roll pad and the brake
draw themselves from the pointer and are deliberately not on it.

**Releasing yaw is a setting**, in [`PhoneYaw.tsx`](../src/remote/PhoneYaw.tsx).
A real rudder springs back, and that is still the default, but a phone has no
way to hold a deflection except a finger parked on the track — so Settings →
Yaw offers *Keep value* as well, and gives the return a time: 0 is the instant
release the controller always did, up to 1.5s of sweep, each frame of it sent as
an ordinary rudder update so the aircraft yaws back the way the thumb does. The
animation lives on this screen, not in the client or the protocol: the host
knows only that the rudder moved. Whatever centres the transient controls — a
stale link, a blur, handing the aircraft back — still overrides both choices.

**Taking control is a popup, not a chip.** Whenever the phone is not flying —
still connecting, the computer flying, or the session over — every flight control
is disabled, so the only useful thing on that screen is taking control, and
[`PhoneControlPrompt`](../src/remote/PhoneControlPrompt.tsx) puts it in front:
**Take control**, greyed out with the client's reason under it when it cannot be
taken ("Center controls to take over."), or the way back when the session has
ended. It dims the flight controls and **not the chip grid**, which is raised
above the dimming: Connection details, Settings, fullscreen and haptics need no
control, and a popup that covered 🌐 would leave no way to find out why Take
control is unavailable. The fullscreen question, asked once, sits above both.

**Landscape** is how a controller is actually held and the one orientation where
the HUD's arrangement fits as-is: cluster left, yaw over the camera pad with the
engine widget top right and the throttle outermost under it, chip grid across the
bottom. Full bleed — a centred column wastes both margins on a handset.

**Portrait** is too narrow to hold both of the HUD's bottom corners side by side,
so the two groups stack, each keeping its own internal geometry; the engine
widget lands centre right.

Neither orientation leaves space unused. The stack used to hug the bottom of a
portrait screen and left the top third dark; the controls now stretch into the
whole page, and the check enforces it.

### The camera trackpad

The pad in the HUD's engine-monitor slot is a **trackpad, not a stick**: one
finger swipes the chase view, two pinch it closer or further. Nothing about it
is a position, so it draws no knob and there is nothing to centre — let go and
the view stays where you put it, the way dragging the desktop canvas does. The
dot grid is what says "drag here" in the absence of a knob.

It reports what the fingers just did: movement in **CSS pixels** scaled to the
wire's -1..1, and a pinch as the ratio the finger spread changed by. CSS pixels
rather than a fraction of the pad, deliberately — they are already
density-independent, so a swipe of a given length turns the view by the same
amount on any phone and in either orientation, where a fraction of the pad would
make the same finger movement mean different things in portrait and landscape.
The desktop multiplies by 0.005 rad per pixel, which is exactly the rate its own
mouse drag uses, and feeds it through the same `applyOrbitDelta` and
`zoomChaseCamera` the mouse and the gamepad use. Drag signs are the desktop's:
right orbits right, down lifts the camera, pinch apart brings the aircraft
closer.

Deltas rather than a held rate is what makes it feel like a trackpad, and it
changes the failure mode for the better: a dropped frame costs that frame's
movement and nothing else. Frames can land faster than the desktop renders, so
the session **sums** them and the renderer **drains** the total once — throwing
away a swipe because two frames shared a video frame is how a trackpad comes out
feeling slow. Movement older than the 250 ms input window is discarded rather
than drawn late.

A paused desktop renders only on request, so an arriving gesture asks for a
frame — otherwise the pad would be dead exactly when someone wants to look at
their aircraft. The desktop's own mouse drag schedules its frame from the
pointer event; this is the phone's equivalent.

**Cockpit or chase is a switch in the pad's top-left corner**, with the pad's
`CAMERA` label moved under it. There are exactly two views and one is always on,
which a switch says and two buttons did not; both icons stay visible and the
thumb sits under the one in use. It is a camera control, so it lives on the
camera. It sits *over* the pad in a shared slot rather than inside it, because
the pad is a `<button>` and a switch inside it would be a button in a button;
being on top, it takes its own taps, so touching it never starts a swipe.

Unlike the pitch/roll pad it is **not held to a square**: a gesture is measured
in pixels moved, so the pad's shape never changes what it means.

### The engine

The phone shows **the desktop HUD's own engine widget** — fuel flow, the N1 ring
around the N2 core with thrust, and the phase — not a phone rendition of it.
[`engineSummary.ts`](../src/flight/hud/engineSummary.ts) is that widget as DOM
with no model behind it: the desktop monitor feeds it from JSBSim, and
[`PhoneEngine`](../src/remote/PhoneEngine.tsx) feeds it from the `engine` field of
the status frame, which carries everything it draws. One piece of drawing code
and one stylesheet means the two screens cannot drift, and a test puts a reading
through the monitor, the wire and the phone and requires identical output. Only
the widget crosses over: the monitor's details panel, transition log and JSBSim
property discovery stay out of the `/rc/` bundle.

The phase travels as its label, and the phone looks the colour up from it; a
label the phone does not know still prints, uncoloured. Tapping the fuel flow
switches pounds and gallons per hour, as clicking it does on the desktop. There
is no Engine tab on the phone, so the rest of the widget is a readout.

It sits just above the throttle it answers to, and it is both wider than the
throttle and taller than yaw. Given a grid cell of its own it made both sliders
that thick, so it sits over the group's top-right corner instead and **notches
into the camera pad**: the pad runs underneath it, masked by a gap-wide black
shadow, yaw stops short of it and the throttle starts below it. The pad can take
that shape because a swipe is measured in pixels moved, not as a position within
a rectangle. The widget's box is fixed (`--phone-engine-width`,
`--phone-engine-height`) because the pieces around it are laid out against it.
A host that sends no engine leaves the throttle its whole column.

### Fullscreen

[`useFullscreenOffer`](../src/remote/useFullscreenOffer.ts) asks once, in a popup
with **Fullscreen** and **Dismiss**, and leaves a **⛶** button in the chip grid —
the flight page's toolbar glyph — for every time after that. Three constraints
come from [`src/fullscreen/fullscreen.ts`](../src/fullscreen/fullscreen.ts):
browsers grant fullscreen only inside a tap, so both are buttons and never an
effect; iPhone Safari has no page fullscreen at all, so there the popup makes a
case instead of offering a button; and a dismissal is remembered under
`osfs.fullscreen-prompt-dismissed`, because a controller that asks again every
time you pick the phone up is worse than the bars it wants to hide. A popup
answered this visit does not come back when fullscreen ends. Someone who already
chose *Every visit* on the flight page has answered the question, so their first
tap anywhere is taken as the gesture and nothing is asked.

**The iPhone popup makes its case.** "For a full-screen controller, add it to
your Home Screen" is, on its own, an app-install interstitial: it interrupts a
controller that works to recommend installing something, offers no button that
does the thing, and gives no reason — which reads as a vendor herding a user,
because that is what the pattern usually is. The objection is not that it is
said. It is being told to install something with no reason given and no way to
check the claim.

So the popup names the actor in its title, states the cost (about an eighth of
the screen, and the bottom bar sits under the brake thumb), says outright that
nothing is missing, locked or for sale, and gives the three options that
actually exist: Add to Home Screen, fly with the bars, or use a device whose
browser allows it. Underneath, folded away in a `<details>`, is the case:
**Why this is a policy, not a limitation.**

That section is an argument, and it names a motive, which is the part a reader
is entitled to be sceptical of. So it is built only out of things they can
check — Apple's own commission, its own courtroom defence, its own revenue
figures, and the record of which restrictions it has dropped and under what
compulsion. The five steps:

1. **The capability is withheld, not missing.** WebKit implements fullscreen —
   it is how video goes full-bleed on the same phone — and Safari grants it to
   whole pages on macOS and iPadOS. Same standard, same engine, one device
   singled out. The controller does not sniff for an iPhone, it asks, which is
   why iPad, Android and desktop never see the popup at all.
2. **The safety story does not survive its own platform.** The cited worry is a
   page imitating the system and trapping the person. Other browsers settled
   that years ago with a prompt, an unmissable notice and an escape gesture —
   and iOS ships that gesture already, because it is how you leave any
   full-screen App Store app. If the danger were the reason, it would be a
   danger on the iPad too.
3. **What fullscreen actually decides.** Whether a web page can feel like an
   app. The category that hangs on it is games, about 70% of App Store revenue
   by the figures disclosed in *Epic v. Apple*. Outside the EU the App Store is
   the only way to install an app on an iPhone, and Apple takes 15–30% of what
   sells there; a web game or a free controller pays nothing and asks no
   permission. Keeping the web unable to fill the screen keeps the untaxed
   channel from competing with the taxed one — the pressure that turns free web
   software into a paid app, because the store is the only place the screen is
   yours.
4. **Apple has argued away its own excuse.** Its standing antitrust answer is
   that developers are not captive to the App Store because they can reach users
   through the web. That defence needs the web to be a genuine alternative, and
   Apple is the party deciding whether it is. Holding the web up as proof the
   store is optional, while ensuring the web cannot do what an app does, is not
   a position that can be held in good faith. This is the load-bearing step: it
   turns "maybe it is an oversight" into a claim its own lawyers have retired.
5. **Judge the intent by what gets defended.** Rival engines on iOS came only
   when the DMA compelled them, only in the EU; other app stores reached iPad
   only when the law reached iPadOS; the iOS 17.4 release carrying that
   compliance also announced Home Screen web apps would stop working in the EU,
   reversed only after the Commission asked why; and in 2025 a US federal judge
   found Apple had wilfully violated her own App Store injunction and referred
   the company for criminal contempt.

Steps 3 and 4 are the argument. Steps 1, 2 and 5 exist to close the exits —
technical limitation, safety, and forgetfulness — one at a time, so that by the
time the motive is named it is the only explanation still standing.

Option 3 names the honest limit rather than a slogan: another *device* fixes
this, another *browser on the same iPhone* cannot, because every iOS browser is
required to be Safari underneath. That is a harder hit than "use a real browser"
and it is also the true one, which is the point — a reader who catches us
overstating anything here gets to dismiss the whole card, so nothing in it is
overstated. The claims to re-check if this text is ever revised are the dated
ones: the 17.4 EU opening and the Home Screen web app reversal, the iPadOS
designation, the 2025 contempt referral, the 70% games share and the 15–30%
commission band. Every one is public record, and none is an inference about
anyone's state of mind — which is exactly why the section can say what it says.

The card is the one popup that can outgrow a handset, so it scrolls inside
itself and pins its buttons to its own bottom edge. An explanation you have to
scroll past before you are allowed to dismiss it would be the same trap in a
different costume.

The flight page's own `offerFullscreen` is not reusable here: it renders into
`GameLog`, which is flight-only and does not exist on `/rc/`.

The other direction works. On an iPhone `/fly/` shows this same notice, through
[`createFullscreenNotice.tsx`](../src/fullscreen/createFullscreenNotice.tsx): a
small React root around `useFullscreenOffer` and `PhoneFullscreenPrompt`, with
the card's rules in `phonePopup.css` so the flight page never loads `phone.css`.
One component, one hook and one file of words, so the two pages cannot say
different things. The dismissal key is shared too, so a phone that has read the
notice on one page is not asked on the other; the log line's **Why?** brings it
back. It loads only on that branch, so no other browser downloads React for it.

### Pairing from the page

A controller launched from its Home Screen icon has no invitation — the QR
link's hash is cleared as soon as the page reads it, and iOS sends a link from
the Camera app to Safari, never to an installed app. So the page reads the QR
itself. [`PhoneUnpaired`](../src/remote/PhoneUnpaired.tsx) offers **Scan QR
code**, and so does the take-control popup of a session that has ended.

The way onto this page from the simulator is the flight panel's **Remote
Control** tab, which pairs a phone from a computer and has **Switch to RC
mode** for the other direction. A coarse pointer puts that button first and
holds the QR back until asked, because a phone opens the tab to become the
remote far more often than to pair another one.

[`PhoneQrScanner`](../src/remote/PhoneQrScanner.tsx) is the camera, full screen,
with a frame to aim at and the status and **Cancel** along the bottom under the
thumbs. It accepts only a link `parsePairingUrl` accepts; anything else says
so and keeps looking. The camera is off the moment a link is read or the
scanner closes, including when permission arrives after it has closed. The
decoder is jsQR, loaded on the first tap, because iPhone Safari has no
`BarcodeDetector`; a test draws the pairing QR with the desktop's own `qrcode`
settings and reads it back through it. Browsers open the camera only on a
secure page, which is said in the scanner rather than failing silently.

### Sheets: Connection details and Settings

**🌐** shows the round trip and opens Connection details; **⚙** opens Settings.
Both are `<details>` elements that are a chip while closed and a full-screen page
with its own scroll while open (`.phone-sheet`), so neither ever takes room from
the controls. Their headers say what they are in words and close them. Settings
holds two things: where the chip grid sits, and what yaw does on release.

## What the check cannot see

`npm run check:phone-layout` measures geometry in headless Chrome. It proved
that the page has nowhere to scroll to — and a real iPhone still scrolled under
a thumb, because a vertical drag on a range input is handed to the scroller
before the input sees it. A geometric check cannot catch a routed gesture.

So: **nothing touch-related ships without a device.** The record of the session
that found this is in [ux/2026-09-17-iphone-session.md](ux/2026-09-17-iphone-session.md),
and the cause and fix are in
[brainstorm/ios-url-bar-and-scrolling.md](brainstorm/ios-url-bar-and-scrolling.md).

## Rules the check enforces

`npm run check:phone-layout` fails the build on each of these. Three are
behavioural:

- **The page never scrolls.** A control that can move out from under a thumb
  mid-flight is a bug, not a layout preference. `.phone-app` is `100dvh` with
  `overflow: hidden`, and secondary content collapses instead — the diagnostics
  panel opens as a full-screen sheet rather than growing the page.
- **The pitch/roll pad is square.** `PhoneStick` derives its deflection radius
  from `min(width, height)`, so every pixel past square is dead area the user can
  touch and nothing happens.
- **An open sheet scrolls under a finger.** With the page locked, the Connection
  details sheet is the only way to reach the bottom of a long timeline. The check
  fills the timeline past the screen and swipes on it with emulated touch.

Two bound how the page is spent: **nothing in the page's flow may sit outside
`.phone-controls`** — the instrument row, banners and footer that used to are
gone, and popups and sheets are fixed-position — and the controls take at least
90% of the page, which is what is left after safe-area padding.

The rest pin the arrangement: roll trim above the stick **and exactly as wide as
it**, pitch trim left of the stick, flaps right, the trim square left of the roll
trim, the chip grid wholly below the controls (wholly above on the `grid-top`
page), camera pad below yaw, throttle right of both, yaw never taller than the
stick, the cockpit/chase switch in the camera pad's top-left corner with the
`CAMERA` label under it, **YAW and its value either side of the yaw track** with the box no taller
than the track, and a camera pad big enough to aim with. The engine widget must sit above
the throttle with their right edges aligned, right of yaw, and notched into the
camera pad — with the throttle narrower than the widget and yaw shorter than it,
so the widget can never again thicken the sliders.

The take-control popup must be up on the `control` page, where the computer is
flying, and on no other; where it is up, a finger on the stick must land on the
popup and a finger on a grid chip must land on the chip.

The run renders `flying`, `control`, `grid-top` and `failed` and holds each to the rules;
`offer` (the fullscreen popup), `home-screen` (its iPhone notice), `settings`
(the settings sheet), `fly-home-screen` (the same notice over the flight HUD),
`unpaired` (the page a Home Screen launch opens on) and `scanner` (the QR
scanner, caught while its camera starts) are rendered to be looked at, since
none of them has flight controls to measure.

Three of these selectors had gone stale — the yaw slider stopped being a pad and
the trim square was never `.phone-cluster__centers` — so the rules reading them
were quietly measuring nothing. A rule that cannot find its element now fails
where it can, and the run prints both pad sizes so a shrinking control is
visible before it breaks a rule.

## Traps already paid for

Do not re-discover these.

- **A range input under a thumb on iOS.** iOS hands a drag that starts on
  `<input type="range">` to the nearest scroller before the input sees it, and
  for a vertical slider that is exactly the gesture it needs: the throttle was
  unusable on an iPhone. Every flight slider carries `touch-action: none` in
  `flightControls.css`, as the attitude surface always has. **Not on
  `.phone-app`**: the open sheets must still scroll under a finger. The layout
  check cannot see this; only a device can.
- **`height: 100%` on a vertical range input.** It resolves against an
  indefinite ancestor and Chrome falls back to the *viewport* height, which
  dragged the page to 1437px on an 844px screen. Stretch as a flex child
  (`height: auto; align-self: stretch; min-height: 0`) instead.
- **`@supports (-webkit-appearance: slider-vertical)`.** Chrome answers `true`
  long after dropping the behaviour, so the guard fires on Chrome too and applies
  a legacy appearance to every range it matches — including horizontal ones,
  which then lose their fill. `writing-mode: vertical-lr` is the standard and is
  what both screens rely on. There is no fallback, on purpose.
- **A square that fits a box.** CSS cannot express "largest square that fits" in
  one rule. Portrait is width-constrained so width drives the aspect ratio;
  landscape is height-constrained and flips it in a media query.
- **An aspect-ratio box cannot size its own column.** Putting the roll trim and
  the pad in one grid or flex column does not make the slider the width of the
  square: the container measures its intrinsic width before any row height
  exists, so the aspect-ratio box contributes nothing and the column collapses to
  the slider's own minimum — in landscape that produced a 192px slider over a
  141px pad. The pad *is* the square, and the roll trim is positioned against its
  top edge, where `left: 0; right: 0` cannot be anything but the same width.
- **A percentage `translate` on the knob.** `translate(70%, 0)` resolves
  against the *knob's* own 52px, not the pad, so the ring crept about 36px while
  the aircraft went to full deflection — the values were right and the control
  looked broken. The knob is offset in pixels, by the same `min(width, height) *
  0.36` radius the pad reads deflection from, so it sits under the finger.
- **`align-self` on a shared slider.** The vertical slider stretches to fill
  whatever height its host gives the box, which is what lets the phone's throttle
  use the screen. That `align-self: stretch` beats the `align-items: center` the
  horizontal roll-trim variant relies on, so the variant restates `align-self`
  for itself. Forgetting that pins the trim slider to the top of its box on both
  screens.
- **A scroll container inside the sheet.** The connection timeline was
  `overflow: auto; overscroll-behavior: contain` with no height cap: a scroll
  container that never had anything to scroll, and that refused to pass a swipe
  on to the sheet. Every swipe that started on the timeline — most of the sheet —
  went nowhere. A sheet has exactly one scroller, itself; `contain` belongs on
  that and nowhere inside it.
- **Giving a wide widget its own grid cell.** The engine widget in a cell above
  the throttle made the throttle's column as wide as the widget and yaw's row as
  tall as it. It spans the group's flexible row and column instead, so it sizes
  neither, and the camera pad is notched under it. An item that spans a flexible
  track is left out of intrinsic track sizing; one spanning only intrinsic tracks
  spreads its size across all of them.
- **`localStorage` in the layout harness.** Node's own experimental
  `localStorage` global shadows jsdom's and is undefined without a backing file,
  so the harness stubs one to give each page its starting preferences.
- **The trim square's labels.** The HUD fits `TRIM`/`AUTO` in 35px because each
  line is four characters. Longer words overlap; the phone uses one word per
  half in a larger square, because two tap targets share it.

## Changing it safely

1. Run `npm run check:phone-layout`. It renders the real `PhoneController` *and*
   the real flight HUD through the same pipeline and screenshots both into a
   dated folder under `build/phone-layout/`. See
   [Development](development.md#phone-controller-layout).
2. Look at `flight-hud-*.png` beside `flying-*.png`. They are rendered from the
   same stylesheet; if the phone looks like a different product, that is the bug.
3. If you touch `flightControls.css`, confirm the HUD did not move. The
   screenshots are deterministic, so comparing `flight-hud-*.png` from the run
   before and after should give identical bytes. That comparison is what caught
   the `@supports` trap above.
4. `npm run dev:lan` puts it on a real phone without deploying — see
   [Testing on a real phone](development.md#testing-on-a-real-phone). A headless
   screenshot cannot tell you whether a target is comfortable under a thumb.
