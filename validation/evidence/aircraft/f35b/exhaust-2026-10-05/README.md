# F-35B exhaust GPU acceptance, 2026-10-05

[Acceptance record](acceptance.json) captures the installed fork.9 SDK, actual
12,259-triangle GLB, native nozzle/augmentation observations, shared shaders and
baked optical data on Apple M5 Metal hardware. Both WebGL2 and WebGPU pass.
The runnable tool is `scripts/validation/f35b/check-exhaust-headless.mjs`.
No server or visible browser was used; Chrome exits normally with code 0 and
no signal. The aircraft reference stays fixed for framing while native physics
and engine state step; this does not qualify full globe flight behavior.

The enabled afterburner changes 5,220 rear-view pixels versus the same native
state with exhaust rendering disabled. Its aligned front view changes zero
pixels because the airframe occludes the volume. The muted dry table contributes
only a very small pixel difference (at most 2 channel levels); it is deliberately
faint. Side, rear, front, disabled and fully converted screenshots are retained.

For both backends, enabled/disabled per-frame draws are 149/148: exactly one added
volume draw, 12 triangles, 8 default texture lookups per covered fragment with a
32-sample maximum. The LUT is 2,856 compressed bytes / 8,192 decoded RGBA bytes.
These are structural budgets, not timing or interference-qualified benchmarks.
Native afterburner stays active when only rendering is disabled, remains inactive
through every full-throttle conversion step, and is inactive at full conversion.
Native clock and render requests hold on pause. Optical color, temporal variation
and plume shape remain declared approximations, not calibrated F135 spectra,
radiance, pressure-derived shock geometry or device performance.

The initial WebGPU diagnostic failed because the fixture called `scene.render()`
without submitting `engine.endFrame()`. The retained acceptance uses proper
begin/end frame submission; it is not evidence of a production shader defect.
The final run includes the renderer's direct bound camera-uniform correction.
Earlier failed diagnostics remain local in `build/`; they are not this acceptance.
[Retained file manifest](retained-files.json) records source inputs and hashes.
