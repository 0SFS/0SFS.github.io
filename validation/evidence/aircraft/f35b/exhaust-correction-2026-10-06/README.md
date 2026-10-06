# F135 exhaust source correction evidence

The implementation removes the unsupported mode-selected temperature conversion
and exterior chemical-light allocation, and joins the provisional thermal source
through the rigid duct and nozzle. **Physical and visual acceptance remains open.**
The dry nighttime luminous region and deck patch are not explained by this model.

The [combined receipt](acceptance.json) distinguishes software and numerical checks
from unqualified source assumptions and GPU appearance. The
[correction report](../../../../../docs/validation/f135-exhaust-source-correction.md)
explains the physical contract, implementation and remaining discrepancies.

| Record | Scope |
| --- | --- |
| [Native contract](native/README.md) | Equations and 4,171 retained observations; no new engine run or SDK build |
| [Primary sources](source-research/README.md) | Excited-state production/loss, spectrum and missing F135 inputs |
| [Optical model](optics-model/README.md) | Version-2 source, deterministic bake and bounded geometry-weight cache |
| [Independent numerics](numerical/README.md) | Eight native milestones, spectra, full-domain power, mode invariance and receiver bounds |
| [Geometry baseline](geometry-baseline/README.md) | Task-entry identities, posed stations and former point-light location |
| [Geometry](geometry/README.md) | 36 actual-export poses, interfaces, centrebody exclusion and pose-invariant physical domain |
| [Posed CPU images](posed-optics/README.md) | 64 gas-only CPU images and finite-ray convergence; no GPU qualification |
| [Application checks](application/README.md) | Final sources, software checks, lifecycle regressions and preservation audit |

Earlier failed checks and superseded hypotheses remain retained with their
limits. Source snapshots end in `.txt` so they cannot enter test discovery.
No browser, GPU run, dev/preview server, WASM build or benchmark was started.
