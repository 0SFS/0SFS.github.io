# Dry powered-lift mechanism evidence

Recorded 2026-10-06. **Physical recreation and visual acceptance remain open.**
The [investigation report](../../../../../docs/validation/f135-dry-vtol-mechanism.md)
separates observations, conditional source calculations and unknown real-engine
and camera inputs. No browser, GPU run, server, benchmark or WASM build was used.
The [acceptance summary](acceptance.json) keeps software, numerical, physical
and visual status separate; it does not turn partial checks into acceptance.

| Record | Result and limit |
| --- | --- |
| [Footage](footage/README.md) | Persistent structured red jet, changing strobe and a distinct near-deck maximum. Compressed video is not radiometry; post-landing deck persistence is unavailable. |
| [Thermal observer](thermal-camera/README.md) | Visible/NIR, photon-collection and exposure bounds. These are conditional calculations, not the reference camera's response. |
| [Particle spectrum](particle-spectrum/README.md) | Independently checked non-gray emission and matching integrated power. Other-flame measurements support the spectral exponent; F135 loading and full-spectrum extrapolation remain hypotheses. |
| [Current source](runtime-source/README.md) | Physical inputs held fixed. The source correction does not resolve oversized AB or the near-deck morphology. Corrected hardware-clipped rays fail the 1% criterion at the current 32-step default. |
| [Sampling prototype](runtime-source/interval-prototype/README.md) | A fixed-budget interval candidate worsens selected error and is rejected. Exact source and failed results are retained; runtime is unchanged. |
| [Receiver](receiver/README.md) | Full-domain gas and hardware transport predicts a dim reflected patch. Selected downward probes pass; three tiny horizontal grazing values fail refinement. Whole images remain unqualified. |
| [Occlusion erratum](occlusion-erratum/README.md) | Earlier non-indexed hardware was omitted. Affected visibility claims are withdrawn; original runs are preserved. |
| [Application](application/README.md) | Final CI passes 175 files and 1893 tests, with one existing expected failure, plus lint, incremental typecheck, build and artifact verification. This does not qualify appearance. |

Each record retains commands, numerical outputs, input identities and source
snapshots. Failed and superseded runs remain available with their limits stated.
The engine's temperature-station meaning, rear-flow boundary, particle loading,
scattering and reference-camera calibration are still unresolved; no hotter dry
source or hover afterburner was introduced to force agreement.

## Attribution

The official color-matching observations used in the spectral calculations are
CIE 2019, *Colour-matching functions of CIE 1931 standard colorimetric observer*,
International Commission on Illumination (CIE), Vienna, AT,
DOI [10.25039/CIE.DS.xvudnb9b](https://doi.org/10.25039/CIE.DS.xvudnb9b).
CIE-derived spectra, photometric tables and diagnostic images are licensed
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Changes include the declared Planck/particle integration, transport,
photometric conversion and fixed display mapping documented in each record.
Code follows the repository's code license.

This attribution does not cover third-party reference footage. Its PNG extracts
remain ignored local references because redistribution rights are unestablished;
[footage provenance](footage/README.md) records the public source, credited author,
hashes and extraction method.


## Publication copies and original identities

Before publication, machine-specific absolute checkout paths in 18 logs and
archived source files were replaced with `[checkout]`. These are explicitly
redacted publication copies. The [redaction manifest](publication-redactions.json)
records each original and published SHA-256, byte count and replacement count,
plus the associated provenance-file changes. The original bytes are preserved
in the local, ignored build archive and are not distributed.

Original executed-input and executed-bundle hashes remain unchanged. Where a
snapshot was redacted, `publishedSnapshotSha256` identifies its published bytes;
it does not replace the actual execution identity. Inventories of retained
files describe their published byte count and SHA-256 and also keep
`originalSha256`/`originalBytes` with a link to the redaction manifest. Numerical
results, commands apart from checkout-prefix substitution, source formulas,
criteria and reported failures were not changed. An archived source containing
`[checkout]` must have that placeholder replaced with the local repository path
before execution. Claims of exact retained source elsewhere in this historical
record are subject to this declared publication substitution.
