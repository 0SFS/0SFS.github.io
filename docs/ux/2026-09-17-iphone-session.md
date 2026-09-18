# Session record: first real iPhone run, 2026-09-17

Device: iPhone XS Max, Safari, local dev server. Pages: `/fly/` on the Mac,
`/rc/` on the phone.

This is a **UX record**: what a person actually did, in the order they did it,
and what the software did back. It is not a bug list — the bugs are the residue.
Write these down whenever a real device is in a real hand, because this one
session found four defects that no amount of reading the code would have found,
and one of them had already been shipped past a layout check that exists
specifically to prevent it.

## What happened

1. Opened `http://localhost:5173/fly/` on the Mac and scanned the QR with the
   iPhone. Pairing worked.
2. **Tried to move the throttle. The page scrolled instead.** Repeatedly. The
   throttle was effectively unusable.
3. Gave up on the browser and used **Add to Home Screen** — from `/rc/`, the
   controller.
4. **Opened the new icon and got the flight simulator**, not the controller.
5. Flew in the installed app. **The page still scrolled by accident**, so the
   install had not fixed the thing that caused it.

Every step after 2 was caused by step 2. The install was not a preference, it
was an escape attempt — and it did not work, because the bars were never the
problem.

## What this found

### 1. The throttle loses its drag to the page scroller — the one that mattered

A vertical `<input type="range">` on iOS hands a vertical drag to the scroller
before the input sees it. The throttle is vertical
(`writing-mode: vertical-lr`), so the gesture it needs is the gesture Safari
reads as a scroll. `.phone-app` being `100dvh; overflow: hidden` does not help:
that stops the page having anywhere to go, not the gesture being stolen.

The pads never had this problem, which is why it went unnoticed: `PhoneStick`,
`PhoneCameraPad` and `PhoneBrake` all `preventDefault()` every pointer event and
carry `touch-action: none`. The sliders carry neither.

Fix: `touch-action: none` on the range inputs in `flightControls.css`, beside
the rule that already gives it to `.flight-hud__attitude` — the desktop HUD has
the same defect on any touchscreen, and the phone inherits the fix through the
shared stylesheet. **Not** on `.phone-app`: the Connection details sheet has to
keep scrolling under a finger, and a layout-check rule enforces that.
`overscroll-behavior: none` on `html, body` kills the document rubber-band too.

**This is worth dwelling on.** `npm run check:phone-layout` has a rule that the
page must never scroll, and it passes. It measures `scrollHeight` against the
viewport — the page indeed has nowhere to scroll to. What it cannot see is a
touch being routed away from a control. A geometric check cannot catch a gesture
bug, so a device session is not optional.

### 2. Add to Home Screen from `/rc/` installs the flight simulator

`public/manifest.webmanifest` declares `"start_url": "./fly/"`, and Safari
honoured it over the current URL. So the pilot did exactly what the controller's
own popup recommended, and got a different program.

Fix: a manifest per route, selected by the boot script in `index.html`, which
already knows the route. `/rc/` gets `"start_url": "./rc/"` and its own
`short_name`, so both icons can live on one Home Screen. See
[the brainstorm](../brainstorm/ios-url-bar-and-scrolling.md) for the options
considered.

### 3. The flight page barely mentions fullscreen on a phone

`/fly/` calls `offerFullscreen()`, which prints into `GameLog`; with no
fullscreen API and a coarse pointer it prints one sentence about the Home Screen
and stops. The flight page is where the screen matters most and it says the
least. The controller's popup — whose words are now a standalone file,
[`src/remote/fullscreenMessage.tsx`](../../src/remote/fullscreenMessage.tsx) —
should be shown there too, from that one source of words.

### 4. No, there is no other way to hide the URL bar

Asked and answered: `minimal-ui` was removed in iOS 8, the `scrollTo(0, 1)`
trick died with iOS 7, the manifest's `display` is ignored on iOS, orientation
cannot be locked from a page, and the `<video>` + `captureStream` route enters
real fullscreen but hands the surface to the native player, so no touch reaches
the page. Home Screen, or bars. The full table is in the brainstorm.

Worth doing anyway: set `theme-color` **per route** so the bars match the page
they frame — `#000` for the controller's true black, `#04060a` for the flight
page — instead of one `#080e14` that matches neither. The bars stay; they stop
looking like stolen screen.

## The rule this session earned

**Ship nothing touch-related without a device.** Two of these four defects are
invisible to headless Chrome, and one of them sailed past a check written to
catch exactly that class of problem. Emulated touch is not touch.

## Context worth keeping

The person doing this was, by their own account, furious — at a browser that
would not give a web page the screen, and at having to install something to get
around it. Then they noted the irony: the complaint is about not being able to
install what you want, and the workaround was an install.

It is not really an irony. The Home Screen is the one install route on iOS that
Apple does not gate, it is the only one this project can recommend, and it is
the one Apple announced it would break in the EU in 2024 and restored only under
regulatory scrutiny. An escape hatch working is not evidence the door is open.

And the fact that frames all of it: **the same code, on Android, just works.**
