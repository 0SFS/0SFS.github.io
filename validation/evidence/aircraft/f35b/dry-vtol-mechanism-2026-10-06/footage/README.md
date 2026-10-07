# Dry powered-lift footage discrimination

Read [the analysis](../../../../../../docs/validation/f135-dry-vtol-mechanism.md) for measured clues, ranked hypotheses and the conditional model. The images are unretouched decoded reference frames; RGB analysis is in encoded video units, never radiance or temperature. `report.json` contains five axial profiles and separate illustrative Planck/shock calculations. `provenance.json` records the public source, extraction, unchanged input hashes and the additional 161–169 s download. The larger videos remain in scratch. Media redistribution rights are not established: the PNGs are ignored local reference files; their hashes, numerical results and the exact script are retained in Git.

`landing-010.png` is about 162.16 s, with several free-jet brightness bands and the broader near-deck maximum. `landing-015/020/025/028` follow the same shot toward touchdown. `landing-030` and the extended frames show the editorial cuts that prevent a deck-persistence test. Exposure/filter/temperature/engine telemetry were not supplied. The strobe and jet have different temporal/color behavior, but this does not identify the source spectrum.

Reproduce with the decoded originals, using the tool's dated output default:

```sh
node scripts/validation/f35b/analyze-dry-vtol-footage.mjs --frames=<directory containing landing-010.png etc>
```

`analysis.log` records the diagnostic run; `lint.log` is focused ESLint. No runtime physics, shaders, assets, engine XML, browser or GPU were changed or executed by this investigation. No device performance or appearance qualification is implied.
