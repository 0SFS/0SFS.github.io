# Final actual-engine plume support and depth diagnostic

The [report](report.json) loads the unchanged full F135 GLB and production rigid
nozzle rig in Babylon NullEngine, then creates the actual production plume mesh
through an explicit CPU readiness seam. It uses actual native dry powered-lift
state from [the retained trace](../native/trace.csv). No shader executes and no
radiance or display appearance is inferred from this geometric test.

Reproduce with `node scripts/validation/f35b/check-plume-geometry.mjs`. The command
creates a dated `build/validation/plume-geometry` directory and exits nonzero if
the dry mesh is disabled, misdirected, detached or entirely hidden in a tested
view. Exact source snapshots and the bundled production entry are retained as
`.txt`, with [file hashes](files.json). No test files are executable snapshots.

Twelve poses cover pitch 0, 45, 90 and 95 degrees and yaw −10, 0 and 10 degrees.
Each has rear, oblique and world-side cameras: **36 views total**. All have
unobstructed positive tracer support. The maximum exit-origin error is
2.67 × 10⁻⁷ m and the maximum native direction-vector error is 7.27 × 10⁻⁸.
At 90 degrees, zero yaw, the enabled plume begins near [0, 1.0063, 3.4833] m,
ends near [0, −4.9937, 3.4833] m, and follows the downward rigid exit. It has a
0.4016 m exit radius, a 0.8216 m enclosing-box half-width and six metres of axial
support. The source model's spreading radius is checked independently of light.

The depth probe traces engine triangles and a positive tracer strictly inside
the declared conical support. It tests the final exit-clustered segment spacing
at 4, 8, 16 and 32 samples. Across all views, 108, 18, 5 and 2 rays respectively
miss very thin tracer support; none of those budgets causes an entire view to
lose support. No first-interaction false hides or behind-hardware contributions
were encountered at these particular camera positions. This is not a proof that
the first-interaction depth approximation is correct for every camera or for
the actual nonuniform optical source.

The [previous uniform-ray attempt](previous-new-field-uniform-rays.json) is
preserved, and the separate [original baseline](../geometry-baseline/README.md)
retains the former 1.2 m dry support. Longer support is not proof of brighter
light: the final radiometric evidence remains extremely dim in powered lift.

The world-side camera is named for its world location, not for an airframe test.
Only full-engine hardware is included. Ground, airframe, atmosphere, reflection
and source radiance are excluded, including cameras that would lie below a
stand's ground plane. These results establish attachment and available geometric
paths; they do not reproduce or qualify the user's rendered VTOL image.
