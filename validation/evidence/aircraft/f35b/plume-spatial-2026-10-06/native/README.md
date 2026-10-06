# Installed native state and frozen plume baseline

The [acceptance record](acceptance.json) covers 82,925 accepted fixed steps and
4,171 retained samples from the installed fork.16 SDK. No native source, package
or F135 XML was changed. The [report](report.json) compares cold/idle/dry/AB/
cutoff/shutdown and powered-lift milestones with the preceding physical-correction
run: all recorded differences are exactly zero. The [CSV](trace.csv) has native
state, fuel staging, nozzle pose, solid temperatures and baseline optical values.

The complete source inputs were stable during execution. The
[helper bundle](qualification-helpers.mjs.txt), [entry](qualification-helpers.ts.txt),
[optical manifest](baseline-optical-manifest.json), [shader](baseline-shader.ts.txt)
and [spatial PNG](baseline-spatial.png) freeze the preceding uniform-source
implementation. These baseline values must not be presented as final spatial-field
results. Later field diagnostics can reuse the native CSV without running JSBSim
again.

## Causes established by this experiment

| State | Native gas proxy | Burned AB fuel | Baseline photopic source |
| --- | ---: | ---: | ---: |
| Idle | 649.60 K | 0 kg/s | 2.86e-7 cd/m³ |
| 99% dry | 1003.13 K | 0 kg/s | 0.07225 cd/m³ |
| Full-command dry VTOL | 1003.13 K | 0 kg/s | 0.07225 cd/m³ |
| AB +0.233 s | 1034.45 K | 0.092478 kg/s | 274.97 cd/m³ |
| Sustained AB | 2363.10 K | 4.78072 kg/s | 259,870.55 cd/m³ |

Dry VTOL has conversion 1, nozzle pitch π/2, valid optics and 4.42005 kg/s total
fuel. It is not disabled by a VTOL optical branch. Its baseline support is only
1.2 m. Integrating the actual density PNG along three unoccluded CPU rays gives
0.0112–0.0197 cd/m², or 1.12e-5–1.97e-5 linear scene Y at the default
1000 cd/m² white reference and unit display gain, before scene exposure.
That supports a dim, short-source explanation under the old assumptions. It
does not reproduce the user's camera, hardware occlusion or GPU pixels.

At AB +0.233 s, excited bands contribute 274.50 cd/m³ while the continuum gives
only 0.470 cd/m³. Their blue-weighted mixture is applied everywhere in the
baseline. Sustained AB instead has continuum 251,605.51 cd/m³ and excited bands
8,265.05 cd/m³. A permanently blue physical source is therefore not established
by this model, although uniform spatial chromaticity at any given time is a
confirmed structural limitation. Display clipping and the actual appearance
need separate inspection.

At the first accepted AB cutoff step, burned AB fuel is zero and the gas proxy
returns to the dry value, while solids retain heat and total fuel decreases
over subsequent steps. There is no native downstream gas inventory or travel
time. An instantaneous replacement field is a quasi-steady approximation; an
arbitrary renderer fade would not supply missing transport physics.

The trace distinguishes `nativeRunning` from `visualRunning`: the latter
reproduces the old app's positive-fuel/positive-N2 activity test. During shutdown,
native Running becomes false immediately while modeled fuel and spool wind down,
so the old visual source can remain active briefly. This distinction must not
be mistaken for continued AB or residual solid incandescence.

## Available flow state and limits

The [station audit](native-station-audit.json) records the native implementation,
property inventory and physical interpretation. The gas observation is an
imposed constant-cp mixture enthalpy proxy based on legacy EGT plus AB heat;
the code does not establish a calibrated exit static/total station, kinetic
energy conversion or particle temperature. The XML's flow schedule is about
115.83 kg/s in these dry cases, but supplies no independently solved exit Mach,
pressure, velocity, species or downstream transport. Aircraft flight Mach and
incoming total-air pressure are not exhaust Mach and nozzle-exit pressure.

An explicit station-to-exit mapping may be a provisional optical hypothesis.
[NASA's isentropic relations](https://www.grc.nasa.gov/www/k-12/airplane/isentrop.html)
distinguish static and total temperature;
[normal-shock relations](https://www.grc.nasa.gov/www/k-12/airplane/normal.html)
allow a local static-temperature rise without new heat or an increased total
temperature. Neither supplies F135 station values or shock locations. The
[afterburner arrangement](https://www.grc.nasa.gov/www/k-12/airplane/turbab.html)
also does not prove exterior combustion. The native algebraic difference between
supplied and oxygen-limited burned fuel must not be repurposed as an observed
external reaction. No hotter dry particles, extra reaction or AB bypass was
invented to force the referenced glow.

## Plots and reproduction

- [Native cycle and component sources](baseline-native-cycle.svg)
- [AB onset and cutoff](baseline-ab-transitions.svg)
- [Physical ray radiance and support length](baseline-rays-and-support.svg)
- [Plot provenance](plot-provenance.json)

PNG counterparts are retained. These are Matplotlib data figures, not rendered
appearance comparisons. Dense samples resolve every 120 Hz step in the first
three seconds of AB onset/cutoff, one second of shutdown and five seconds of
powered-lift transition; other samples are nominally 0.25 s apart. Every native
step checks validity, fuel staging and powered-lift AB inhibition. Fifty held
executive calls preserve the complete recorded native state exactly.

After the spatial upgrade, reproduce the old optical baseline on newly captured
installed native state with:

```sh
node scripts/validation/f35b/trace-f135-plume-state.mjs --baseline=validation/evidence/aircraft/f35b/plume-spatial-2026-10-06/native
```

The optional baseline directory selects the retained uniform profile, density PNG
and shader record; native helpers/data still come from the current installation.
The legacy pure optical evaluator remains supported. Omitting this option captures
live uniform-schema inputs and deliberately rejects a spatial profile rather than
mislabeling it as the old baseline. The [exact executed producer](qualification-trace-script.mjs.txt)
predates this input-path convenience; its hash is retained in the report. No native
state was rerun just to add that input option.

Use `node scripts/validation/f35b/plot-f135-plume-state.mjs --report=<report.json> --python=<Matplotlib-enabled Python>`
to plot an existing trace. Outputs default to new dated directories in `build/`.
No browser, GPU, image appearance or performance qualification is claimed here.
