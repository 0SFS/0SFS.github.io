# Engine-to-deck receiver evidence

The current calculation is the [full-domain receiver](full-domain/README.md),
including existing internal and external gas emission, complete foreground
attenuation and actual visible core/liner surfaces. Its
[fixed EV +8/+10 comparison](full-domain/receiver-comparison.svg),
[report](full-domain/report.json) and [acceptance receipt](full-domain/acceptance.json)
retain separate gas components, raw units and numerical limitations.
The later [pressure-input spelling correction](pressure-key-correction/README.md)
proves unchanged physical outputs for these four zero-burned-AB cases while
preserving the original frozen run.

Selected downward probes pass their refinement criteria. At the actual
powered-lift center, internal gas contributes 0.00691604 lux, external gas
0.03038971 lux and hardware 0.00000639 lux. A 20% ideal diffuse receiver then
has luminance 0.00237536 cd/m². The full images remain unqualified, and the
aggregate diagnostic still fails because three tiny horizontal-shutdown
metal contributions do not converge to the declared relative criterion.

The preceding [exterior-only calculation](exterior-only/README.md) remains
unchanged in its own directory, including its original source snapshots,
figures and failed aggregate receipt. The original files at this directory's
root are also retained for existing links; they describe **exterior-only**
transport and must not be mistaken for the newer full-domain run.

Neither calculation changes native temperatures or emitted power. These are
offline CPU optical diagnostics, not a runtime receiving deck, GPU result,
impinging-flow simulation, deck-heating model or F135 appearance calibration.
