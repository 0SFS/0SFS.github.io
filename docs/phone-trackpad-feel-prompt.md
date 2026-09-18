# Work prompt: why the phone's camera trackpad feels jumpy

Execute this task when the user starts a fresh conversation with this file.
Work in `/Users/felg/gh/0sfs`. Read the current `AGENTS.md` before making changes.

## What the user reports

On the phone controller (`/rc/`), the camera trackpad works as it should, with very
low latency, which the user loves and will not trade away. But it feels **jumpy**.
When the user works the trackpad **and the joystick at the same time**, it sometimes
**jumps a lot** and just feels off.

The user's guess is that packets are being dropped, and that there is no smoothing.
Any smoothing must not add latency.

## What this session is for

Start by understanding the code and measuring. Trace exactly how a finger moving on the
phone becomes the camera moving on the desktop. Find where the jumps come from and
show evidence for it. Then say how it *should* work to feel responsive, smooth and
not jumpy, with low latency.

Do **not** change how the camera feels until the user has seen your diagnosis and
chosen a direction. You may add measurement code, tests and scratch harnesses.

## Read first

- [Phone controller](phone-controller.md), especially *Requirements and limits*.
  The control channel is unordered with no retransmits, on purpose.
- [The spec](proposals/phone-controller.md): the protocol, failure behaviour and
  the authority model.
- [Phone controller UI](phone-controller-ui.md): how the `/rc/` page is built.

## The path a swipe takes

Line numbers are as of 2026-09-17. Search by name if they have drifted.

1. **The finger.** `PhoneCameraPad` in
   [`src/remote/PhoneStick.tsx`](../src/remote/PhoneStick.tsx) (`move`, about line 188)
   tracks each pointer separately.
   - One finger reports a delta in CSS pixels ÷ 1000.
   - Two fingers are a pinch only, reported as a spread ratio.
2. **Buffering on the phone.** `nudgeCamera` in
   [`src/remote/phoneControllerClient.ts`](../src/remote/phoneControllerClient.ts)
   (about line 530) adds the delta to a pending `camera` total and calls `sendControls`.
3. **Sending.** `sendControls` (about line 208) sends at most one frame every
   1000/120 ms (line 213).
   - A delta that arrives inside that window waits for the next event, or for the
     60 Hz `frameTimer` (about line 453; `CONTROL_INTERVAL_MS` is in `protocol.ts`).
   - The pending total is cleared once `sendNative` returns true. That only means the
     channel accepted it, not that it arrived.
4. **The stick uses the same frames.** Moving the stick calls `updateControls` →
   `sendControls` too. It competes for the same 120/s allowance and decides when a
   camera delta leaves.
5. **The wire.** `CameraAim` in [`src/remote/protocol.ts`](../src/remote/protocol.ts)
   (about line 58). Its comment explains why deltas were chosen over positions: "a
   dropped frame costs that frame's movement". The channel is `ordered: false,
   maxRetransmits: 0` in [`src/remote/peerTransport.ts`](../src/remote/peerTransport.ts)
   (line 276).
6. **Receiving on the computer.** `onNative` in
   [`src/flight/remote/createPhoneControlSession.ts`](../src/flight/remote/createPhoneControlSession.ts):
   - It drops any frame with `seq <= lastSeq` (line 268). On an unordered channel, a
     late frame's camera delta goes with it.
   - It drops frames beyond 120 in a sliding second (line 275).
   - `addCameraAim` (line 136) adds up the surviving deltas, and throws away any older
     than `STALE_MS` = 250 ms (line 141).
7. **Drawing.** `applyPhoneCameraAim` in
   [`src/flight/createFlightSimApp.ts`](../src/flight/createFlightSimApp.ts) (line 879)
   runs once per rendered frame (line 1616).
   - It takes everything owed (`takeCameraAim`, session line 461) and applies it in that
     one frame through `applyOrbitDelta` (line 860), scaled by `PHONE_SWIPE_RADIANS`
     (line 201).
   - `recenterOrbit` (line 894) pulls the view back to centre whenever `isCameraActive`
     goes false, i.e. no gesture in the last 250 ms (session line 468). This only
     applies when the recenter setting is `recenter`; the default is `hold`.

## Leads, all unverified

These come from reading the code. None is a conclusion. Each needs evidence, and the
user's guess is one of them.

1. **Uneven arrival shows up as uneven movement.** Nothing lines deltas up with time:
   whatever arrived since the last computer frame is drawn in that frame. So a steady
   finger with irregular arrivals turns into per-frame movement like 0, 2×, 1×. The
   arrivals can be irregular because of Wi-Fi, or because the phone sends both on
   events and on a timer under an 8.3 ms cap. This happens even with zero loss.
2. **Movement lost for good.** A delta is lost whenever its frame is:
   - lost in transit (no retransmits),
   - rejected for arriving out of order (the `seq` check), or
   - rejected by the computer's 120/s window.

   With both fingers moving, the phone sends at its 120/s cap the whole time. A burst
   of delivery after a Wi-Fi stall could then push the computer's window over 120 and
   drop frames. That fits "when I use both".
3. **Stalls.** A stall longer than 250 ms throws away movement still owed (line 141).
   With recenter on, it also lets the view start returning to centre mid-gesture, so
   the camera has moved when frames resume. That is a candidate for "jumps a lot".
   Find out which recenter setting the user has.
4. **Maybe not the network at all.** Flying with the stick moves the aircraft, and the
   chase camera follows it. Check whether the same "off" feel happens with a mouse
   orbit on the computer while flying with the keyboard. Render interpolation is in
   [`src/flight/physics/fixedStepLoop.ts`](../src/flight/physics/fixedStepLoop.ts)
   (around line 128).
5. **The phone's own input.** Check the iOS `pointermove` rate when two fingers are
   down on different elements. Compare the event `timeStamp` with the time each frame
   is sent.

## How to find out

- **Measure before reasoning further.** Record timestamps at every hop:
  - on the phone: the pointer event's `timeStamp`, the send time, `seq` and the delta;
  - on the computer: the receive time, `seq` gaps (lost frames), frames dropped as out
    of order, frames dropped by the 120/s window, and how much movement each rendered
    frame drew, with that frame's time.

  Put this behind an opt-in flag, the way the stutter trace works:
  [`flightPerformanceCapture.ts`](../src/flight/diagnostics/flightPerformanceCapture.ts),
  `?flightPerf=1` and `window.osfsFlightPerformance`. It should export as JSON. The
  connection diagnostics already report round-trip time and receive-to-apply time: 🌐
  on the phone, and **Connection details** in the computer's Remote Control tab.
- **Use a deterministic harness; it needs no phone.**
  - Feed `createPhoneControlSession` a scripted stream at constant finger speed, with
    realistic jitter, loss, reordering and bursts.
  - Drain it at 60 Hz, as the render loop does.
  - Compare the movement drawn each frame against the ideal.

  That turns "feels jumpy" into numbers: how much per-frame movement varies, and how
  much is lost in total. Use `build/scratch/` for a throwaway harness, or a vitest file
  if it should stay.
- **Test on the real device.**
  - Ask the user to run `npm run dev:lan`; do not start it yourself.
  - On the Mac, open `https://localhost:5173/fly/` → ⚙ → **Remote Control**.
  - The phone scans that QR, which points at the LAN address the script prints.
  - Tell the user exactly what to do: a steady swipe on its own; a swipe while holding
    the stick still; a swipe while moving the stick. Also tell them how to get the
    trace out.

## How it should work

The user wants the camera responsive, smooth and not jumpy, with low latency and no
latency added. Answer with numbers. Evening out uneven arrival always costs some delay;
the questions are how much, and whether it is below what anyone can notice. Show that
trade-off; don't hide it.

Directions worth weighing, not prescriptions:

- **Make loss and reordering cost nothing, with no added delay.** Send a running total
  for each gesture, with a gesture id, instead of a per-frame delta. The computer
  applies the new total minus what it has already applied, so every frame is safe to
  receive twice or out of order, and any later frame carries what a lost one carried.
  - Check how this fits the protocol staying compatible within v1; see how `gearDown`
    and `feedback` were added.
  - Pinch zoom is a product of ratios, not a sum.
- **Draw movement on the phone's timeline, not on arrival.** Stamp it with the phone's
  event time and replay it on that timeline. This removes the jitter but needs a small
  replay delay; measure how much.
- **Pace the phone's sends** at a steady rate instead of in event-driven bursts. Check
  both ends' 120/s caps against the stick-plus-camera case.
- Anything else the measurements point to.

Rule out plain low-pass filtering or easing of the camera, because it adds lag. Also
rule out moving the camera to a reliable or ordered channel: a lost packet would hold
up every packet behind it until it was resent. The channel is unordered on purpose.

## Constraints

- Scratch goes in `build/` (for example `build/scratch/`). Never write to `/tmp` or
  anywhere outside the repository.
- Never start a dev, preview or watch server. Give the user the command.
- Do not open a visible browser. If you need one, use headless Chrome through
  `scripts/headless-chrome.mjs`.
- The working tree holds a lot of uncommitted work from other sessions. Don't revert
  it, and don't commit unless asked.
- **Protocol changes.** The phone and computer load the same bundle, but a stale tab on
  one side is common. Keep changes compatible, or version them on purpose.
- **Authority.** The computer is in charge, and the camera is only a view. It must
  never refresh a lease or affect who has control (see the comment above `aim` in
  `createPhoneControlSession.ts`).
- **Keep these green:** `npm run test`, `npx tsc -b` and `npm run lint`. Lint already
  has 5 errors, in `LoggingPanel.tsx` and `evaluationInstruments.test.ts`; they are not
  yours.

## Report back

Plain language first.

- Where the jumps come from, with the measurements that show it.
- Which leads turned out wrong.
- The options, each with the delay it costs in milliseconds.
- What you would change, and where.

Then wait for the user to choose before changing how the camera feels.
