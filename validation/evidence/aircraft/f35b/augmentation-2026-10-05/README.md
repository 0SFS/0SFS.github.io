# F-35B conversion / augmentation boundary regression, 2026-10-05

This evidence qualifies the experimental aircraft FCS interlock, not F-35B
flight performance. The sustained fully converted full-throttle fixture already
reported native augmentation inactive; the pilot withdrew that suspected issue.
The corrected defects are small positive conversion values and closing/recovery
boundaries. The original condition inhibited only physical position >0.001.
Native automatic augmentation engages above 0.99 throttle after N2 > 97%, so a
request/position 0.0001 or 0.001 could enter afterburner. Closing also crossed that
deadband before reaching zero.

The FCS now samples positive requested or pre-step physical conversion before
the kinematic node, caps main throttle at 0.99, and retains inhibition during
zero-time evaluations. RunIC reaches the requested kinematic endpoint while
snapshot/relocation subsequently restore the saved physical actuator. Without
the zero-time hold, a naturally reached closing snapshot at position 0.0005
returns positive conversion with native augmentation active. The retained
[causal log](closing-before-zero-time-hold.log) reaches 0.0005 through accepted
native steps, not an arbitrary property overwrite. The hold releases on an
ordinary positive-time evaluation once request and pre-step position are zero;
new-flight profile defaults explicitly clear it.

[Installed-SDK regression log](installed-sdk-regressions.log): 19/19 cases pass
against the adopted fork.8 SDK and updated XML. Seven new cases cover tiny
positive conversion, every full-throttle entry/exit/reentry step, raw RunIC,
snapshot restoration, relocation, full-throttle reload and fully converted
initialization; the twelve existing conventional/converted flight and control
contracts also pass. Engine state is read from the actual read-only
`propulsion/engine[0]/augmentation` observer. No throttle-based display inference
or native thrust/fuel schedule changes implement this correction. The native
nozzle observer is packaged separately in fork.9. After installation,
[97 installed-SDK cases across five files](../../../jsbsim/adoption/fork9/installed-regressions.log)
pass, including all 20 current F35 native integration cases (the prior 19 plus
one read-only nozzle schedule/reset/reload contract).

The runnable regression is `src/flight/jsbsim/f35b.integration.test.ts`.
Current aircraft XML bytes/hashes and modification notices are in
`public/jsbsim-data/aircraft/F-35B-jsbsim/source-manifest.json` and `NOTICE.md`.
Unmodified FlightGear source remains unchanged. Ground collisions and physical
plume/area calibration are outside this result.
