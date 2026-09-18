# Brainstorm: hiding the iOS URL bar, and the scrolling that caused all this

Working notes. The shippable conclusions are in
[`docs/ux/2026-09-17-iphone-session.md`](../ux/2026-09-17-iphone-session.md);
this file is the search and the dead ends.

## Question: is there any way to hide the URL bar on iOS other than fullscreen?

**No.** Not for a normal web page. Everything that used to work is gone, and
everything that sounds like it should work does not:

| Approach | Verdict |
| --- | --- |
| Fullscreen API (`requestFullscreen`) | Not implemented for pages in iPhone Safari. This is the whole problem. |
| `<meta name="viewport" content="minimal-ui">` | iOS 7.1 only. Removed in iOS 8, 2014. |
| `window.scrollTo(0, 1)` on load | The iOS 6-era trick. Dead since iOS 7. |
| Making the page scrollable so Safari collapses its bars | Works, sort of — and it is *exactly* what we must not do, because a scrolling page is what made the throttle unusable. Trading a broken control for 40px of screen is a bad trade. |
| `display: fullscreen` in the web manifest | Honoured on Android. On iOS the manifest's `display` is ignored; Home Screen apps get standalone behaviour from the `apple-mobile-web-app-capable` meta tag instead. |
| `<video>` fullscreen via `webkitEnterFullscreen` + `canvas.captureStream()` | Technically enters real fullscreen, and is a dead end: the native video player owns the surface, so touches go to its controls, not to the page. Useless for a controller — it is a player, not a canvas. |
| Locking orientation to landscape | Cannot be done from a web page on iOS; `screen.orientation.lock()` is unsupported there. |
| Add to Home Screen (standalone) | **The only thing that actually works.** No bars at all. |

So the honest answer stays: Home Screen, or bars. Two things are still worth
doing, because they reduce the damage:

1. **`theme-color`, per route.** Safari 15+ tints its bars with `theme-color`.
   The page already sets `#080e14`, which is close to the flight page's
   `#04060a` but nowhere near the phone controller's true black `#000`. Matching
   it per route makes the bars stop reading as stolen screen even though they
   are still there. Cheap, no behaviour change, helps every iPhone visitor.
2. **`apple-mobile-web-app-status-bar-style: black-translucent`** is already
   set, which is right: in a Home Screen launch the page draws under the status
   bar and `env(safe-area-inset-top)` keeps the controls clear of it.

## Why the page scrolls under a thumb — the actual cause

The pads are safe and the sliders are not.

`PhoneStick`, `PhoneCameraPad` and `PhoneBrake` are `<button>`s that call
`event.preventDefault()` on every pointer event *and* carry
`touch-action: none` in CSS. Nothing they do can pan the page.

The sliders are native `<input type="range">` and have neither. `.phone-app` is
`height: 100dvh; overflow: hidden`, which stops the *page* from scrolling — but
on iOS a vertical drag that starts on a range input is handed to the scroller
before the input sees it, and the nearest scrollable thing takes it. The
throttle is the worst case because it is a *vertical* slider
(`writing-mode: vertical-lr`), so the gesture it wants is precisely the gesture
Safari reads as a scroll. That is why the throttle, of all controls, was the one
that would not work.

The fix is `touch-action: none` on the range inputs. It belongs in
`flightControls.css`, next to the rule that already gives it to
`.flight-hud__attitude`, because the desktop HUD's sliders have the same problem
on any touchscreen — and the phone gets it for free through the shared
stylesheet, which is this project's one rule.

**Do not put `touch-action: none` on `.phone-app`.** The Connection details
sheet must still scroll under a finger; there is a layout-check rule that fills
its timeline and swipes on it. Target the inputs.

`overscroll-behavior: none` on `html, body` is worth adding as well: it kills
the rubber-band bounce of the whole document, which is the other thing that
feels like the page moving when it should not.

## Then why does the installed "app" scroll too?

Same cause. Standalone mode removes the browser bars; it does not change how
touch is routed to a range input. The bug was never about the bars.

## The Home Screen icon opens the wrong page

`public/manifest.webmanifest` declares `"start_url": "./fly/"`. On iOS, Add to
Home Screen usually keeps the URL you were on — but the manifest's `start_url`
is what wins when the browser honours the manifest, and Safari has honoured it
here: an icon created from `/rc/` opened the flight simulator.

That is a real bug with a real cost: the pilot performed the install we
recommended, and got a different program. The controller is the *more* likely
thing to install, too — it is the one you keep on a phone.

Options:

- `start_url: "./"` — the route chooser, which is honest but adds a tap.
- Drop `start_url` and let iOS keep the current page. Loses Android's install
  behaviour, which is worse.
- **Two manifests**, one per route: `/fly/` links a flight manifest, `/rc/`
  links a controller manifest with `"start_url": "./rc/"`, `"short_name": "OSFS
  RC"` and its own icon. The route is already known at boot by the inline script
  in `index.html`, so the right `<link rel="manifest">` can be chosen there.
  This is the one that gives the pilot what they asked for, on both platforms,
  and lets the two icons live side by side on a Home Screen.

## The fullscreen offer should be on the flight page too

`/fly/` has `offerFullscreen()` in `src/fullscreen/fullscreen.ts`, which prints
a line into `GameLog` — and on a coarse pointer with no fullscreen API it prints
one sentence about the Home Screen and nothing else. On an iPhone the flight
page is where the screen matters most, and it says the least.

The controller's popup is the better pattern and its words are now a standalone
file (`src/remote/fullscreenMessage.tsx`), so the flight page can render the
same notice. What has to be worked out: the flight page is not React, so it
needs either a small React root for the popup or the same copy expressed as DOM.
The copy must not be duplicated — one source of words, two hosts, which is the
same rule the stylesheet follows.

## On the irony

Worth recording honestly: the complaint is about not being able to install what
you want, and the resolution was installing something. That does not weaken the
point, it sharpens it — the Home Screen is the one install route Apple does not
control, it is the one this project has to recommend, and it is the one Apple
announced it would remove in the EU in 2024 and only reinstated under scrutiny.
The escape hatch working is not evidence the door is open.

And the plain fact underneath all of it: **this just works on Android.** Same
code, same standard, one tap.
