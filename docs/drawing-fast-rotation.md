# Drawing things that spin faster than the display can show

A propeller and a wheel have the same problem. Both are periodic images turning
at a rate that eventually exceeds what the frame rate can represent, and past
that point drawing the truth is worse than drawing a lie — the image stops
looking fast and starts looking wrong, usually slow and backwards.

This is the one technique behind the propeller disc and the tyres, and it
generalises. Apply it wherever something spins.

## The rule

**Below the sampling limit, draw the object. Above it, draw its time-average
over one rotation.**

That is the whole thing. The rest is working out where the limit is, what the
average looks like, and how to put it on screen.

## Where the limit is

It is not a fixed RPM. It is a property of the image and of the display the
frame is actually being drawn on.

An image that repeats `n` times in one turn repeats every `2π / n`. Reading a
repeating signal needs two samples per repeat — the Nyquist limit — so the
object may advance at most half a repeat per frame:

```text
maxReadableRadPerSec = π / n / frameSeconds
```

`n` is how many times the **image** repeats, not how many parts there are: a
two-blade propeller repeats twice per turn, and so does a tyre with a band
straight through its hub, because the band looks the same after half a turn.

- A two-blade propeller at 60 fps aliases at about **900 rpm**, below a
  Cessna's idle. In practice the disc is shown whenever the engine runs.
- A banded tyre at 60 fps aliases at 15 rev/s — about **35 kt** on a 0.19 m
  tyre, so the band reads through a normal taxi and smears early in the
  take-off roll. On a 144 Hz display the same tyre holds to about 84 kt.
- A four-blade propeller aliases at half a two-blade one's speed.

Three details that are not optional:

- **Measure the frame interval, and smooth it.** Do not assume 60. A single long
  frame must not flip the whole aircraft into blur.
- **Measure it for everything that spins, not inside one of them.** It used to
  be updated only in the propeller's branch, so a jet — which has no propeller —
  judged its tyres against a hard-coded 60 fps on any display.
- **Carry hysteresis on the threshold.** Something sitting on the boundary
  otherwise flickers between its two representations, which is more
  distracting than either. 20% works.

`n` is a count of repeats, so `n = 1` is legitimate — a single radial mark
aliases at half a two-blade propeller's rate — and `n = 0` means there is no
repeating image at all, which is a jet's propeller: nothing to alias. The
function once guarded `n < 2`, which quietly returned "never" for a
one-mark wheel.

## What the average looks like

Average the object over one rotation, weighted by how long each part of the
image occupies each point. Do it in **linear light** — the average is what a
camera integrates over a turn, not the average of the numbers in a file — and
only encode to sRGB afterwards.

- **A propeller** averages to a **solid of revolution**, not a flat disc. At
  each radius the half-extent along the thrust axis is how far the rotated
  section reaches, `max(chord·sin(angle), thickness·cos(angle))`, so the result
  is a lens — thick at the hub, thin at the tip — and it stays correct seen
  edge-on, which is the case a flat disc gets wrong.
- **A tyre** is already a solid of revolution, so its shape averages to itself
  and nothing needs sweeping. What averages is the band — and it does **not**
  average to one colour. A point at radius `ρ` spends this fraction of a turn
  under a band of half-width `h`:

  ```text
  coverage(ρ) = 1                          ρ ≤ h
              = (2 / π) · asin(h / ρ)       ρ > h
  ```

  So the blurred sidewall is a **bright disc at the hub**, `h` in radius,
  falling away to `(2/π)·asin(h/r)` at the rim — 11.6% of the band colour for
  the tyres here — and the tread averages to exactly that rim value, because
  the rim is where the tread meets the sidewall. That is a picture, not a
  colour: a gradient in radius, which is a texture.

  It is still a tyre-shaped picture, though, so the tyre's own mesh can show it.

An earlier version of this document said a wheel's average was "a material
change, not a mesh change … costs nothing". Half of that holds. It is a
material change and it costs no geometry, as the next section shows. But it is
not one colour: that was only true of the mark it was written for, one tread
block, whose average around the tread *is* uniform. It stopped being true the
moment the mark crossed the sidewall. Then the twin detour below got the other
half wrong too.

The general form: **average the geometry only when the geometry is not
rotationally symmetric, and average the appearance only as far as the
appearance actually is.** A mark that varies with radius gives an average that
varies with radius.

## How it is put on screen

The propeller and the tyre do it differently, and the reason is the rule above:
**change the geometry only if the average is a different shape.**

| | propeller | tyre |
|---|---|---|
| repeats per turn | `propellerBlades` from the catalog | 2, the band |
| is the average a different shape? | yes, a lens instead of blades | no, a tyre |
| below the limit | blades drawn, `Propeller` turned | `Wheel_*` turned, atlas at its sharp half |
| above the limit | `Propeller_Disc` shown, blades hidden | same mesh, atlas moved to its blurred half |
| extra geometry | the disc, a second mesh | none |
| fallback | a flat disc built at runtime | none needed; a plain rubber tyre has nothing to blur |

The tyre's texture is an atlas of two squares side by side: the band as painted,
and `coverage(ρ)` as a 2-D disc. The tyre's UVs are a planar projection onto its
sidewall plane, so they address the sharp square. Blurring is setting the
texture's `uOffset` to put the other square under the same UVs. That's one
number per frame, on a material all the tyres share.

Planar UVs are what make a plain cylinder enough. A linear function of position
interpolates exactly across any triangle, however the polygon is split up, so
the band is a straight, constant-width stripe on an 8-sided tyre as much as on
a 32-sided one. The tread's vertices are the rim's vertices, so each tread quad
reads the texture along a chord of the rim, and the band crosses the tread
top and bottom where it should. Cutting the band into the mesh instead cost 16
triangles a tyre. Done with a fan from the hub, it came out a wedge, because
every fan triangle widens toward the rim.

Two details:

- **Hold the sharp tyre at `uOffset` 1, not 0.** The sampler repeats, so it is
  the same picture. At 0 the texture has no transform, Babylon compiles the
  material without one, and the first blur changes that and recompiles the
  shader in the middle of the take-off roll. Off zero, both states are one
  shader, and switching costs a uniform.
- **One decision for every tyre.** They share one material, and a nose tyre
  blurring a frame before the mains would be an unexplained flicker anyway.

The first version gave every tyre a baked blurred twin, `WheelBlur_*`, hidden
until needed, copying the propeller. That duplicated the tyre's vertex and index
buffers, nodes and file size to show a different picture on the same shape. It
was removed. Its triangles were never drawn together with the tyre's, but they
were still loaded, stored and counted.

Both live in `src/flight/aircraft/aircraftAnimation.ts`, with
`maxReadableRadPerSec` shared between them. The tyres and their atlas come from
`planes/shared/tyres.py`, which both airframes build from.

## Checking it

A render will not tell you the texture is right. Blender reads an image through
its own colour space and view transform, so a correctly encoded texture and a
double-encoded one can look equally plausible there. Read the bytes the viewer
will read instead:

```bash
python3 planes/Cirrus_Vision_Jet/agent_workspace/scripts/glb_texture_probe.py \
    public/aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_LOD3.glb 52 64 76 192 212 232 253
```

That prints one row through the middle of the atlas. Pass x positions to read
particular texels. For the tyres here, the blurred square reads 241, 157, 118
and 100 at x = 192, 212, 232 and 253: the hub, a third and two thirds of the way
out, and the rim. Those match `coverage(ρ)` blended in linear light and encoded
once; encoded twice, the rim would read 168. The sharp square reads 241 across
the band, x = 53–75, and 48 either side.

## Why a band at all

Without a mark a tyre is rotationally symmetric and its rotation is invisible —
spinning at any rate or not at all, it looks identical. A band is the cheapest
thing that makes the rate readable, and it is what a test department paints on
a tyre for exactly that reason. It is also what makes the alias limit mean
anything: there is no point computing a sampling limit for an image that
carries no information.

## What this does not fix

The average is only correct if the thing really is turning steadily about a
fixed axis for the whole frame. A locked, skidding tyre is not spinning at all,
and no blur will say so. The tyres roll at ground speed over radius whenever a
gear unit carries weight — they do not model slip; `docs/wheel-spin-experiment.md`
covers what the simulation knows about that.
