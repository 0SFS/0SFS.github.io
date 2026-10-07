# Rejected fixed-budget interval quadrature

**NOT implemented.** This scratch-only candidate retained exactly 32 source
evaluations per active ray and the existing 1% criterion. It made selected
ray accuracy worse; the runtime and its default were left unchanged.

The candidate sorts the conservative section-box intersections already
available to the gas shader, clips them to opaque hardware depth, and splits
their occupied union at section-box endpoints. It gives each interval at least
one midpoint and allocates the remaining budget by the largest deficit from
length-proportional allocation. Every segment keeps its physical length. The
source field, temperature, fuel, exact circular/annular/seal membership and
homogeneous-segment transfer equations are unchanged. No artificial source
weighting or brightness adjustment is used.

The run uses the [complete current inputs](../posed-rays-complete-inputs/README.md),
including upstream gas temperature and ambient pressure, and verifies positive
burned-AB parcel activation. Actual hardware contains 24,024 triangles per pose.
There are 96 selected CPU rays; 60 exceed the unchanged peak-reference cutoff
of 10⁻⁸ cd/m². The same run retains ordinary global midpoint results at 32
evaluations and a 4096-step reference with a 2048-step refinement check.

| Metric | Current global midpoint | Candidate interval alignment |
| --- | ---: | ---: |
| Rays exceeding 1% | 12 | 16 |
| Maximum relative peak error | 4.5344% | 24.1671% |
| Dry 99% maximum | 2.1629% | 4.6092% |
| Powered-lift maximum | 2.2031% | 24.1671% |
| AB onset maximum | 3.6414% | 7.0719% |
| Sustained AB maximum | 2.7096% | 3.4193% |

All active candidate rays use exactly 32 evaluations. Of the 60 non-negligible
rays, 46 skip no guaranteed vacuum: the conservative boxes overlap. The
interval boundaries therefore redistribute samples without reliably resolving
the actual curved support or the strongest source variation. The candidate
improves 23 rays and worsens 28; nine are unchanged. Maximum reference
2048-to-4096 change is 0.1024%. This is a negative result, not a qualification
of the current 32-step default or a proof against other integration methods.
No further candidate was tried.

[summary.json](summary.json) records the per-state results; [report.json](report.json)
retains every ray and [diagnostic.log](diagnostic.log) the failed exit.
[source-0-prototype.mjs.txt](source-0-prototype.mjs.txt) is the exact executed
prototype. Its runnable working copy remains in the recorded scratch folder.
[acceptance.json](acceptance.json) records command and hashes. Identical source
snapshots already retained with the complete-input run are linked by relative
path in the report; no numerical row was altered. The exact executed helper
bundle is retained here separately.

No production source, runtime default, threshold, shader, engine state or
optical profile changed. No test suite, GPU, browser, server, benchmark or native
engine run was performed.
