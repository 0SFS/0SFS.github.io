# Previous uniform-source plume geometry audit

This preserves the CPU/NullEngine audit before the new spatial renderer. The
[report](report.json) uses the actual full engine GLB and production rigid rig at
12 poses (pitch 0, 45, 90 and 95 degrees, yaw −10, 0 and 10 degrees), each from
rear, oblique and world-side cameras. A positive tracer distinguishes geometric
support from the extremely dim native dry radiance.

All 36 views have unobstructed support. At 90 degrees and zero yaw, the old dry
volume is enabled, 1.2 m long and attached within 2.6 × 10⁻⁹ m of the rigid exit;
its axis differs from the native direction by 7.2 × 10⁻⁹. This does not reproduce
an entire downward plume being disabled. No first-depth false hides or integrated
samples behind engine hardware were encountered in these particular views.
Thin support was missed on 44, 9, 6 and 2 rays at 4, 8, 16 and 32 midpoint samples.
The positive cylinder is a support probe, not the old density or optical field.

Ground, airframe, scattering, reflections and scene exposure are excluded.
NullEngine does not execute either fragment shader. These results cannot exclude
hardware depth errors at other viewpoints or qualify the user's rendered image.
The old first-interaction depth approximation can generally hide a thin near
contribution or integrate light beyond intervening opaque hardware.

The exact compiled module used is retained as
[compiled-audit-entry.mjs.txt](compiled-audit-entry.mjs.txt). The raw renderer file
changed concurrently before archiving; [snapshots.json](snapshots.json) explicitly
marks that mismatch instead of misrepresenting a later source as the baseline.
All archived code has a `.txt` suffix and is not discovered as a runnable test.
See the sibling final geometry and spatial-optics records for the new field.
