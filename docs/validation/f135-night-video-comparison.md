# F135: a dark climbing exhaust and a luminous VTOL landing

Recorded 2026-10-06 after the user's latest visual test. **Neither reference
establishes a universal dry-exhaust brightness.** The climbing clip adds a
necessary nondetection case; it does not cancel the carrier footage's positive
observation. Appearance acceptance remains open. Further visual tuning is held
while these constraints are reconciled.

## What was actually inspected

The new reference is [*F-35B AFTERBURNER AT NIGHT !!!*](https://www.youtube.com/watch?v=JX-loX8NGm0),
published by spencerhughes2255 on 2017-03-19. Its description identifies the 2017
MCAS Yuma Air Show, March 17 at 7:40 pm. These are publisher metadata, not engine
telemetry. The downloaded 1080p video was sampled directly. Selected decoded
frames and input hashes are retained in
[the comparison evidence](../../validation/evidence/aircraft/f35b/night-climb-comparison-2026-10-06/provenance.json).

| Time | Direct observation | Allowed inference |
| --- | --- | --- |
| [1:05.5](https://www.youtube.com/watch?v=JX-loX8NGm0&t=65s), [frame](../../validation/evidence/aircraft/f35b/night-climb-comparison-2026-10-06/climb-65p5.png) | Bright, tapered white/pink plume; navigation lights remain visible. The airframe and nozzle hardware are poorly resolved. | Strong external light, consistent with the video's afterburner description. RGB is not a measured spectrum. |
| [1:06](https://www.youtube.com/watch?v=JX-loX8NGm0&t=66s), [frame](../../validation/evidence/aircraft/f35b/night-climb-comparison-2026-10-06/climb-66.png) | A much fainter yellow/orange tail remains. | A rapid source change is plausible. It has not become mathematically zero at this frame. |
| [1:07](https://www.youtube.com/watch?v=JX-loX8NGm0&t=67s), [frame](../../validation/evidence/aircraft/f35b/night-climb-comparison-2026-10-06/climb-67.png) | No readily discernible plume in the unmodified frame; navigation lights remain visible. | Exhaust-region light has fallen below useful visibility in this capture. Nozzle temperature, throttle and absolute radiance are unknown. |
| Carrier reference, [about 2:42.8](https://www.youtube.com/watch?v=rIroDPghWF4&t=162s), [frame](../../validation/evidence/aircraft/f35b/engine-review-2026-10-06/frames/vtol-162p8.png) | Downward nozzle, external red/orange luminous region, bright deck patch, and large aircraft detail in frame. | This is a positive observation requiring a source and surface/camera explanation. It cannot be replaced by an internal glowing disk alone. |

The camera tracks the aircraft, so screen motion alone is not a measurement of
climb rate or acceleration. The user describes continued climb. Both captures
are at night: a day/night distinction alone cannot explain them. There is no
measured common exposure or spectral response between the cameras.

## Most plausible explanation of the new transition

The rapid loss of the bright plume while navigation lights remain is consistent
with augmentation cutoff. This is an inference, not a confirmed control event.
View angle changes and unrecorded camera processing remain possible contributors;
we have neither stable calibrated reference lights nor engine telemetry.

Continued climb does not require afterburner. With thrust along the flight path,
the steady along-path balance is `T − D = W sin(γ)`; in a transient,
`m dV/dt = T − D − W sin(γ)`. An aircraft can retain an upward velocity while
reducing thrust or trading speed for height. Its direction of motion therefore
does not reveal its throttle setting. These are consequences of the
[NASA climb-force equations](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/forces-in-a-climb/).

Main combustion occurs upstream of the turbine, which extracts work. Afterburning
adds fuel and heat downstream of that turbine. Turning off this second combustion
zone can therefore remove a very bright source quickly while the main engine
continues producing thrust. Hot metal has its own thermal history; a camera's
failure to resolve it after cutoff is not evidence that all metal cooled instantly.
[NASA's afterburner description](https://www.grc.nasa.gov/www/k-12/airplane/turbab.html)
supports the mechanism, not this video's exact operating state.

## Why the carrier glow can coexist with that dark frame

An exhaust image is a measurement of light reaching a camera, not a temperature
map. A useful conceptual separation is:

`pixel = camera response(background transmission + visible hardware + gas/particle emission + scattered light)`

Surface reflection and surface incandescence add separate terms where a deck is
visible. Each has different inputs. The camera response includes lens throughput,
exposure, spectral sensitivity, pixel coverage, clipping and image processing.

1. **Dry exhaust can be very hot and weak in visible light.** Combustion gases
   have selective spectra; temperature does not make a transparent gas radiate
   like an opaque blackbody. Water/CO₂ thermal bands are principally infrared,
   while hot soot can contribute a visible continuum. Hot hardware and chemical
   emission have different spectra and dynamics. [NIST's imaging study, §2](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=925024)
   establishes these distinctions for combustion imaging; it does not identify
   the emitting species in either F135 video.
2. **A weak source can disappear in one recording and register in another.**
   The climbing aircraft occupies little of its frame; the carrier view resolves
   the nozzle, wheel and nearby plume. Once a source is under-resolved, pixel
   coverage and blur can suppress it. Distance alone does not impose inverse-square
   fading on the radiance of a resolved surface. Exposure differences are also
   possible: a black sky does not reveal shutter/aperture/gain, and settings that
   capture bright AB may leave much weaker dry light below the recorded black
   level. [Nikon's exposure documentation](https://www.nikonusa.com/learn-and-explore/c/tips-and-techniques/a-basic-look-at-the-basics-of-exposure)
   supports the camera dependency, not an inferred setting for these clips.
3. **Powered lift and climbing need not have the same exhaust state.** Thrust
   is shared between the rear nozzle, LiftFan and roll posts. The LiftFan draws
   substantial shaft power and produces cold thrust; extracting turbine work
   changes downstream enthalpy, while engine controls change fuel and flow.
   We cannot order rear-nozzle temperature from total thrust alone. See
   [Rolls-Royce's LiftSystem description](https://www.rolls-royce.com/products-and-services/defence/aerospace/combat-jets/rolls-royce-liftsystem)
   and [NASA's turbine work balance](https://www.grc.nasa.gov/WWW/K-12/airplane/powtrbth.html).
   The user's 90–95% landing throttle remains a guess, not a calibration point.
4. **The deck changes the problem.** It intercepts radiation and hot flow.
   Reflected light, jet impingement, heating, and possible particle scattering
   must be distinguished. A bright patch does not alone prove incandescent deck
   material. Conversely, real thermal loading is documented by
   [NAVSEA's F-35B sea-trial work](https://www.navsea.navy.mil/Media/News/Article/4053212/carderock-team-provides-critical-technical-support-for-f-35b-sea-trials-on-js-k/).
   That article supplies no optical attribution or temperature that calibrates
   the supplied footage. The luminous region above the deck remains an additional
   observation even if much of the patch is reflection.

Near-infrared leakage is a possible camera sensitivity question, but no source
identifies the spectral response of these cameras. It must not be asserted as
the answer. Neither should scattering, glowing soot, external chemical reaction,
or deck incandescence be individually promoted to an established explanation.

The independent operational constraint remains: F-35B hover does not use AB,
according to [Lockheed engineer Kevin Renshaw](https://www.codeonemagazine.com/f35_article.html?item_id=137).
Thus the carrier light needs a non-AB explanation consistent with the full image.
The new dark clip does not weaken that constraint.

## Implications for this simulator

The target is **one physical source model capable of both observations under
their respective operating and viewing conditions**, not permanent darkness
whenever AB is off, or a permanently bright dry plume. A valid comparison needs
the source and camera assumptions recorded together. Video alone does not yield
a unique solution for temperature, soot loading, exposure and emissivity.

Current implementation still has unresolved inputs: a generic native dry gas-bath
proxy rather than a qualified nozzle station, imposed particle loading, an
uncalibrated AB reacting-parcel closure, and incomplete scene light transport.
The unlit raster material cannot receive the exhaust point light. A finite thermal
core is supported by heated-jet measurements, but that structural correction
does not calibrate brightness.

In fact, the latest core change also increased the retained sustained-AB exterior
source integral from **2009.78 to 37408.67 cd**, about **18.61×**, alongside the
**43.56×** dry increase. These are model source integrals, not directly measured
pixels or total escaped flux. The user's report of a huge AB plume may be a
regression from that change. Software checks passing and a physically motivated
mixing structure do not establish accepted appearance. See the
[dry follow-up record](f135-dry-vtol-observation.md) for inputs and evidence.

The next discriminating work should preserve both cases: a conventional AB
cutoff where the bright plume falls below a recorded viewing threshold, and a
dry powered-lift landing with external light and a separately modeled receiver.
Check the internal hot hardware independently. Record an exposure sweep rather
than changing temperatures to hit one image. Compare nozzle-scale dimensions
and clipping before tuning apparent flame length. If a deck patch persists after
the source leaves, that supports stored surface heat; if it follows the source
immediately, reflection/scattering becomes more plausible, although temporal
resolution and camera persistence must also be checked.

This comparison added documentation and retained reference frames. No runtime
or profile values were changed in response to the new clip, and no GPU test was
run. It does not close either dry-glow or oversized-AB acceptance.
