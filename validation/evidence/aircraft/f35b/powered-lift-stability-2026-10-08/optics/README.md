# Powered-lift optical replay receipts — 2026-10-08

These records preserve CPU evaluations of the production optical source function,
using captured native state and the authored rigid nozzle/gas-support geometry.
The optical evaluator, profile, adapter and geometry identities are identical
across these replays. No brightness, exposure, temperature, persistence or display
gain was changed. NullEngine draws nothing: these records qualify neither device
appearance nor escaped rays, deck illumination, pixels or audible synchronization.
The existing subjective user acceptance of AB visual/sound behavior remains a
separate observation.

## Retained records and identities

- [Before](before/report.json): fork.20 native captures, replayed at 0.125 s
  cadence plus native extrema and event rows; 648 idle-entry and 646 free-full
  samples. All 9,601 native rows of each input remain identified by their hashes.
- [After](after/report.json): fork.21 held idle-entry and steady-hot captures,
  replayed at the same cadence, with 648 and 652 samples. Its third case is a
  replay of the **original fork.20 free-full trace**, byte-identical to the
  before free-full replay; it is not a new fork.21 free-flight measurement.
- [Per-step](per-step/report.json): every one of the 9,601 fork.21 idle-entry
  native rows, at 120 Hz over 80 s; no cadence subsampling.
- [Summary](summary.json): derived peak/minimum states, tail channel ranges and
  drift, dry flags and clamp counts from the retained compressed replay records.
- [Retention manifest](retention.json): source/destination SHA-256 receipts,
  compressed source snapshots and their uncompressed identities. Copies were
  verified byte-for-byte; the original report bytes and historical paths were
  preserved. Frozen snapshots under `sources/` are evidence, not active tools.

Fork.20 identifies native revision `ea6956b4e9f9bddc04ef22863190ab1a8101e0f8`;
fork.21 identifies `34eeae66e5c886eec59eaefb516c0848cb504756`. The optical
bundle SHA-256 is
`6d410b79abaa6baee80b0137b4e59369b16de976e431fa593efb625fd033e40c`
in all three runs. The replay script SHA-256 is
`7e65f6efdc0f28c0aa7a02b26f1a4460c6217d34dbf7104b5e9a3693142a5298`.
No duplicated generated bundle is needed: the retained evaluator/profile/adapter
receipts match all three manifests, and the existing repository GLB is identified
and verified in the retention manifest. SDK archives, native traces and native
profile hashes are identified in each original report.

## Exact adapter boundary and limits

The helper mirrors `createAircraftEngineVisuals` conversions and availability
checks, then directly invokes `evaluateEngineGasOptics` using the current
`f135-visible-approximation-v1` profile. It does **not** invoke the production
visual adapter or establish a native-to-adapter integration test. Trace catalog
columns use `propulsion/engine/`; engine-index-0 catalog descriptors resolve to
those columns. Missing or invalid temperatures remain unavailable.

| Input | Conversion and physical meaning |
| --- | --- |
| Gas temperature | `thermal/nozzle-gas-temperature-k`, gated by `thermal/valid`; on the plant this is **station 7 total temperature**, used as the imposed bath proxy |
| Upstream temperature | `egt-degc + 273.15`, gated by `thermal/valid`; a **lagged station 5 gauge**, not station 6 reactant temperature |
| Ambient | `T-R × 5/9` K and `P-psf × 47.88025898033584` Pa |
| Fuel | `fuel-flow-rate-pps × 0.45359237` kg/s; burned reheat uses its separate native kg/s observation |
| Resource eligibility | Positive finite N2 and legacy fuel flow, with finite simulation time, followed by optical validity |
| Geometry | Attained pitch/yaw/nozzle pose drives the actual rigid GLB rig; its exit radius and connected interior/exterior flow domain enter the 64 × 32 source field, with 6 m exterior support |
| Metals | Separate native core and liner Kelvin histories, with initialization/validity checks; retained independently of the gas source |

Actual station 4/5/6/7 totals and native nozzle exit-static conditions, flow and
area are retained for comparison but do not replace any optical input. Pressure,
composition, enthalpy, particle thermal lag and the T7-total-to-local-particle
boundary remain the incomplete optical-migration workstream. No nozzle expansion
is added here. Photopic Y uses `[0.2126, 0.7152, 0.0722]`; integrated exterior Y
is **intensity in cd before opaque visibility**, not luminance in cd/m².

## Source observations

The tail is elapsed time ≥20 s, an analysis window rather than automatic steady
qualification. Source means in the cadence reports use cadence rows only; their
peak/minimum records can additionally include explicitly selected native extrema
or event rows. Only per-step idle-entry covers every optical source state.

| Case and identity | Valid minimum Y (cd) | Peak Y (cd), time | Tail mean Y (cd) | Peak / tail mean | Invalid / samples |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before idle-entry, fork.20 | unavailable | unavailable | unavailable | unavailable | 648 / 648 |
| Original free-full, fork.20 | 0.005784786 at 0.00833 s | 0.015013798 at 0.625 s | 0.010443844 | 1.437574 | 1 / 646 |
| After idle-entry, fork.21, cadence | 2.21661e-16 at 0 s | 0.009498876 at 80 s | 0.009452904 | 1.004863 | 0 / 648 |
| After steady-hot, fork.21, cadence | 0.011214985 at 0.00833 s | 0.034833726 at 27.325 s | 0.034833577 | 1.000004 | 0 / 652 |
| After idle-entry, fork.21, per-step | 2.21661e-16 at 0 s | 0.009498876 at 80 s | 0.009452723 | 1.004883 | 0 / 9,601 |

Before idle-entry has positive native burned core fuel (about 2.599 kg/s in the
tail) and attained power, but frozen-fuel legacy `fuel-flow-rate-pps` is exactly
zero. Its mirrored production resource gate is false, so its invalid optical
result is **not a physical dry-radiance baseline**. After the native observation
repair, the same held trajectory publishes about 5.760 pps, without replacing it
with an independently fabricated optical fuel input. The single invalid original
free-full sample is its zero-time initialization row.

Every retained sample verifies zero reheat burn. CH and C2 source powers are zero
throughout, and no particle power cap activates. Reaction-table input clamps are
reported rather than hidden: 20 cadence samples and 268 per-step samples in
corrected idle-entry, occurring during the initial cold/low-temperature history.
They do not create dry chemical light. Steady-hot and original free-full have no
reaction input clamps.

| Tail channel, K | Corrected idle-entry per-step range; end−start | Steady-hot sampled range; end−start | Original free-full sampled range; end−start |
| --- | --- | --- | --- |
| T7 bath | 975.547–976.335; +0.788 | 1040.262284–1040.263012; +0.000599 | 976.848–984.119; −6.684 |
| Lagged T5 gauge | 1039.350–1039.531; −0.180 | 1105.624510–1105.625041; +0.000505 | 1040.610–1048.451; −7.576 |
| Core metal | 1010.144–1012.158; +1.939 | 1071.137517–1071.139310; +0.001791 | 1014.387–1022.881; −8.494 |
| Liner metal | 601.990–772.474; +170.484 | 822.766724–822.802945; +0.036221 | 779.778–789.291; −9.513 |

At corrected idle-entry's final/peak state, T7 is 976.335 K, the upstream gauge
1039.350 K, the core 1012.083 K and liner 772.474 K. Its modeled particle field
spans ambient about 278.246 K to T7. The original free-full source peak has T7
994.949 K, gauge 1059.398 K, core 1032.376 K and liner 793.232 K. Free flight
changes ambient conditions and demand during the interval, so its declining
source is not a fixed-input steady comparison.

Corrected per-step idle-entry's tail Y spans 0.009311860–0.009498876 cd, with
RMS ripple 0.000048940 cd and a +0.000187016 cd end−start drift. The liner is
still warming substantially: near-stationary gas/source does not establish
thermal equilibrium of the installation. These limited scenarios neither decide
true F135 dry radiance nor complete the paired empirical/plant dry matrix.
