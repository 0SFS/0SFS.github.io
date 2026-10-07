# Receiver pressure-input spelling correction

The runnable producer now uses `ambientPressurePascal`, matching the optical
evaluator API. Its frozen preceding run used `ambientPressurePa`, which was
ignored. The frozen script/report are preserved unchanged.

[Receipt](receipt.json) · [Executed comparison source](executed-check.mjs.txt) ·
[Log](check.log) · [Corrected producer snapshot](corrected-check-engine-deck-receiver.mjs.txt)

The focused comparison verifies that the property spelling is the producer's
only change and that current evaluator/profile hashes match the frozen run.
For all four retained dry/zero-burned-AB cases, every physical output scalar,
nested field and array value is exactly equal. All 38,912 typed-array elements
in the powered case also match byte for byte. The three cold/shutdown cases
retain the same inactive gas result. Metal temperatures and geometry are not
changed, so unchanged inputs enter the existing receiver integration.

One metadata difference is retained explicitly: the powered case now reports
`reactionInputWasClamped: false`, where the ignored pressure input previously
left that flag absent. With zero burned AB fuel, the looked-up parcel contributes
no light or temperature redistribution. No physical numeric output changes.

This establishes continued applicability of the preceding receiver values and
PNGs without rerunning the rays. It does **not** establish equivalence for
positive burned-AB cases, where pressure affects the parcel. No native run,
test suite, WASM build, browser, server, GPU or full receiver rerun was performed.
The preceding aggregate convergence failures remain failures.
