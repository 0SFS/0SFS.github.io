# SF50 evaluation — pilot test card

For a pilot with SF50 time who has agreed to fly this simulation and say what is
wrong with it. Allow about 90 minutes. Nothing here asks for a document, a
number from a manual, or anything covered by an obligation to a former employer:
**we are asking what the airplane does and what this does instead.**

## What this is

A development flight model of the SF50 G1, flown in a browser on JSBSim. The
aerodynamics are engineering estimates; the engine schedule and the parasite
drag were fitted to the published AFM's cruise and climb tables last week. It
has never been flown by anyone with SF50 experience. It is not a training
device, and no claim of fidelity is made.

## Before you start

1. Open the simulation and select **Cirrus Vision Jet (G1)**.
2. Note the **build version** shown in the app; every recording carries it.
3. Controls. A joystick is far better than a keyboard; if you are on a keyboard:
   W/S pitch, A/D roll, Q/E rudder, Shift/Ctrl throttle, F and R flaps down and
   up, G gear, B brakes, P pause.
4. Turn **auto-trim off** if it is on. It is a casual-flying aid and it will
   hide exactly what we want you to judge.
5. Recording is off until you start it. Open the **Logging** tab, press
   **Record**, and leave that tab in the strip. **Press M — or Mark — the
   moment anything feels wrong**, then say what it was. Closing Logging ends
   the recording. A mark with a sentence is worth more to us than a perfect
   description afterwards. At the end, **Save CSV**.
6. Sound is off until you ask for it, and it is Vision Jet only. Open the
   **Sound** tab, press **Enable sound**, set **Sound quality** to **Med**, then
   press **Run Med anyway (testing)**. Med has no device evidence behind it and
   runs as Low until you press that; the switch lasts this session only. Leave it
   on for the whole flight and judge the sound as you go — Card 8 is only the
   handful of checks that need you to do something specific.

## Known — please do not spend time on these

- No aural warnings, no CAS beyond a red STALL WARNING / STICK PUSHER box, no
  avionics, no autopilot modes to speak of, no ESP, no yaw damper.
- Mid-altitude climb runs about 15 % high at MCT.
- The landing flare distance is short of the book.
- Ground handling, brakes and tires are unvalidated assumptions, and so is the
  tire sound.
- **Sound quality High** says "Audio pack unavailable". There is no licensed
  engine recording, and there may never be. Med is the top of the ladder today.
- An engine you have shut down still makes noise, and it rises and falls with
  airspeed. JSBSim windmills N1 and N2 with dynamic pressure and the sound
  follows. We know.
- Weight and CG are synthetic; there is no loading page.
- The G2 and G3 entries are the same model under a different name.

## Ratings

For each item: a **handling rating 1–10** (1 = as the airplane does it, 10 =
nothing like it), and whichever of these applies — *too strong / too weak / too
fast / too slow / wrong direction / right*. Say what the real airplane does when
it differs. If an item is impossible to judge because of something missing, say
that instead of guessing.

---

## Card 1 — Trim and pitch response (cruise, 10,000 ft)

1. Level at about 200 KIAS. Trim it.
2. Pitch doublet: smooth stick aft and forward, release.
3. Pull to 1.3 g, release, hands off.

- Stick force per g — too heavy, too light?
- The short-period: how fast does it settle, does it settle?
- The phugoid: is there one, what period, does it damp?
- Does it stay trimmed, or does it wander?

## Card 2 — Roll and yaw

1. Full stick roll left, then right, wings level to wings level.
2. Rudder doublet at 180 KIAS.
3. Steep turn, 45° bank, hold altitude. Then 60°.

- Roll rate and roll onset — too quick, too slow?
- Adverse yaw: how much, right amount?
- Dutch roll: is it there, how many cycles?
- Does the 60° turn take the pull it should?

## Card 3 — Configuration changes

1. Gear down at 180 KIAS. Then up.
2. Flaps 50 %, then 100 %, then back up, at appropriate speeds.
3. Idle to full thrust and back, level flight.

- Pitch change with each — direction and size.
- How much retrimming, and does the airplane wander while you do it?
- Thrust change pitch coupling: right direction, right magnitude?

## Card 4 — Slow flight and stall protection, clean

At 8,000 ft or above, idle, wings level, hold altitude, about 1 kt/s.

1. Note where the **STALL WARNING** box appears.
2. Keep decelerating and let the **pusher** fire. Recover.
3. Repeat, and this time hold aft stick against the pusher for a few seconds.

- Is the warning early, late, or about right for the speeds you know?
- Does the airplane's low-speed behaviour before the warning feel right — the
  buffet you would expect, the control feel, the sink?
- Is the push firm enough? Too firm? Does it release when it should?
- What does the real pusher do that this does not?

There is no aural warning and no shaker here; judge the timing, not the cue.

## Card 5 — Slow flight and stall protection, landing configuration

Gear down, flaps 100 %, same technique.

- Same questions.
- Does the flap setting change the margin the way it should?

## Card 6 — Approach and landing

1. Set up a normal approach, gear down, flaps 100 %, at a speed you would use.
2. Fly it to touchdown. Do two or three.

- Speed stability on the approach: is the airplane on the front or back side
  where it should be?
- Flare: does it float, does it drop, how much is left in the elevator?
- Touchdown and rollout: gear, brakes, directional control.
- What would you correct first?

## Card 7 — Takeoff and climb

1. Line up, full thrust, rotate at a speed you would use.
2. Clean up, climb at a normal schedule to 15,000 ft.

- Acceleration and rotation feel.
- Pitch attitude and trim in the climb.
- Does the rate of climb feel like the airplane?
- Engine: spool time from idle, response in the climb, anything odd in N1 or
  fuel flow.

## Card 8 — Sound

Do this with the engine running and settled. It takes a few minutes; the rest
you will have formed an opinion about while flying the other cards.

1. Cockpit view. Idle, then smoothly to full thrust, then back to idle.
2. Switch to the outside (chase) view. Same thing.
3. Outside view, engine at a steady cruise power: **scroll the view in and out**
   — mouse wheel, or a two-finger pinch on a trackpad; there is no zoom on the
   joystick or keyboard. Slowly first, then as fast as you can, then reverse
   direction mid-scroll.
4. Zoom all the way out to the stop, and all the way back in.
5. Sometime at 250 KIAS or faster, listen to the airframe, not the engine.

- Does it sound like an FJ33 sitting behind you, or like something else? What?
- Does the sound follow the thrust lever the way the engine does — the spool
  lag, the whine coming up, the way it decays?
- **While you were scrolling in step 3, did the pitch stay put?** Any slide,
  wobble, warble or lurch is what we are asking about. This was broken until
  2026-09-16 — scrolling out bent the whole engine down by about two octaves —
  and you are the first pilot to hear it since.
- Anything that is not the airplane: clicks, gaps, dropouts, a level that jumps.
- Cockpit against outside: is the cockpit muffled about the right amount?
- Zoomed right out, is the engine still there and about the right level?
- The airframe wind: an earlier session reported it as loud static in a 300 kt
  dive, and it was retuned about 18 dB quieter at 250 kt. Where is it now — still
  too loud, now too quiet, or about right?
- Balance between the three: fan whine, low rumble, wind noise.

The 1–10 handling rating does not fit here. Describe it instead, and if you can
name what it should sound like, that is worth more than a number.

Fair warning so you do not waste effort: **every frequency and gain in this is a
synthetic placeholder**, not a measurement of an FJ33. The fan tone is literally
"2500 × N1 hertz" and is not a blade-pass frequency — nobody has the blade counts
or shaft speeds. So "the pitch is wrong" is expected. What we cannot get anywhere
else is *which way* it is wrong and what the real one does instead.

## Card 9 — Anything you noticed

The most valuable thing you can tell us is the thing that made you say "no, it
doesn't do that". Mark it if you can, and describe it however you like.

## At the end

1. Open **Logging** and **Save CSV**.
2. Three questions:
   - What is the single worst thing about how this flies?
   - What would you fix first?
   - Is there anything here that would teach a pilot the wrong habit?
