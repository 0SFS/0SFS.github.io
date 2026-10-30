# F-35B with the empirical F135 (before the coupled engine plant)

The F-35B as it flew before its F135 became JSBSim's coupled engine plant, kept
so the two engine models can be flown one after the other. Choose it in
**Engine → Simulation → Engine model**.

The three engine files are byte-identical to the F-35B package at 0sfs commit
`d92a928a`, the last before the plant. The aircraft XML matches that snapshot
except for the 2026-10-12 primary-surface actuators, 2026-10-22 differential
ground braking and 2026-10-29 hull contacts, shared with the current model. The actuators use the same radian
rate limit (`fcs/primary-surface-rate-limit-rad_sec`, 60 deg/s, an explicit
assumption). Ground yaw applies the inside main brake and releases the outside
brake, gated by native main-wheel weight on wheels, as described in the current
model's `NOTICE.md`. The aircraft hash below is the original snapshot:

| File here | Was | SHA-256 |
| --- | --- | --- |
| `F-35B-jsbsim-empirical.xml` | `F-35B-jsbsim/F-35B-jsbsim.xml` | `7d81cf7930ac9ecb008fa5c8a72259aa198824cc31acb26a4537e140d055be17` |
| `Engines/F135-PW-600.xml` | `F-35B-jsbsim/Engines/F135-PW-600.xml` | `04cea10d3c135cb79247bbf7794a81359070e2bdc9afc9782502b538444eac16` |
| `Engines/liftfan.xml` | `F-35B-jsbsim/Engines/liftfan.xml` | `9ded9a6a93eeab2dac35c779b51945b9e5cf0807591737b67262b27c5ab67287` |
| `Engines/sidefan.xml` | `F-35B-jsbsim/Engines/sidefan.xml` | `90e1017803f4d9f46285ee09b2aed37d01cee82053e612ffabcf7a19816571ae` |

The thruster (`direct.xml`) and pushback system are shared with
`../F-35B-jsbsim/`, through JSBSim's engine and systems paths. The source,
authors and every modification are recorded in that commit's
`F-35B-jsbsim/NOTICE.md` and `F-35B-jsbsim/source-manifest.json`. The aircraft
XML's hash above is the one that manifest records.

This model has the known defect the plant removed: after a cold start it
publishes full reheat thrust for 4.1333 s with no reheat fuel burned (0sfs
`docs/validation/f135-ab-onset.md`). Its lift fan and roll
posts are force carriers (engines 1–3) that share out the main engine's upward
force, not a shaft-driven fan.

Licence: GPL version 3, the text in `../F-35B-jsbsim/License.txt`. Original
notices remain in the files.
