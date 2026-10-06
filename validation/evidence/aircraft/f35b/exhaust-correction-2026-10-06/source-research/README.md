# Chemical and particle source audit

Recorded 2026-10-06 after the user rejected the spatial pass. This is a research
and proposal checkpoint, not an implemented chemistry model or visual acceptance.
The [open follow-up](../../../../../../docs/f135-plume-physical-followup-prompt.md)
records the failed appearance. Previous optical evidence is preserved.

`sources.json` identifies primary studies, their domains and what they do not
establish. `survival-bound.json` contains a reproducible radiative-loss bound,
with no assumed excited-species concentration. No browser, GPU, server, build or
test suite was run for this source audit.

The current source incorrectly turns all internally burned AB fuel into a
prescribed exterior CH*/C2* photon allocation. Concentrating that fixed allocation
in a small exterior region increases local radiance without evidence for local
reaction. Moving a chosen fraction inside would preserve the same unsupported
assumption. A meaningful correction needs three separate domains: internally
reacting augmentor gas, exiting particles/products, and any independently
supported exterior reactions. Internal photons can travel out through the exit;
that is distinct from excited molecules surviving downstream.

For species `s`, a reduced local balance is
`dn_s*/dt = P_s − (A_s + Q_s) n_s*`, where `P_s` is production in molecules/m³/s,
`A_s` is radiative decay in s⁻¹ and `Q_s = Σ k_sq n_q` is collisional loss.
Its quasi-steady solution is `n_s* = P_s/(A_s+Q_s)`. Emitted spectral power is
`n_s* Σ A_su hν_su`, distributed by measured transition strengths. Neither the
fuel power nor the bulk temperature supplies `P_s`, the quencher composition or
the initial population. A fuel-energy check remains a ceiling, not a source.
The [DLR mechanism and experiment](https://elib.dlr.de/75430/1/Kathrotia2012apb571_manuscript.pdf)
supports this production/loss formulation; its validation domain is not the F135.

The proposed application contract should distinguish **unavailable** chemistry
from a supplied, physically zero production rate. Unknown input must not silently
be treated as a measurement of zero exterior reactions. It also must not produce
an invented source. The active fallback can retain explicitly provisional
particle radiation without the unsupported chemical allocation. It should use
the native gas proxy without a second unqualified expansion and avoid changing
particle loading or its energy cap solely because an AB flag toggles.

A future supported input may provide local production and collisional loss, or
an excited-state population, for a named physical domain and electronic state.
An offline table can supply transition spectra, rate coefficients and errors;
runtime only interpolates and applies supplied source amplitudes. Ground-state
chemistry, advection, residence time and particle thermal state belong in JSBSim
if they become simulated state. A methane flamelet selected from bulk fuel and
temperature alone would leave the missing mixture and precursor assumptions
unresolved. No such surrogate is proposed as an F135 calibration.

Soot radiation likewise requires loading and particle temperature independently.
Published engine measurements establish that particles can survive combustion
and that oxidation strongly changes loading; they do not supply this F135's
opacity. Laser-heated nanosoot cools rapidly in laboratory measurements, so a
long-lived hotter particle reservoir cannot be introduced without particle size,
heat transfer and energy inputs. Larger particles or other light mechanisms
are not excluded by that observation.
See the [NASA combustor measurements](https://ntrs.nasa.gov/citations/19860006746)
and [time-resolved incandescence experiment/model](https://pmc.ncbi.nlm.nih.gov/articles/PMC7347618/).

The useful near-term change is removal of unsupported source assertions and
mode discontinuities, with an explicit missing-chemistry diagnostic and correct
internal/exit geometry. That is **not completion of the user's appearance
objective**. The dry night glow, deck illumination and rendered source boundary
still require qualified comparisons and a supported physical explanation.
