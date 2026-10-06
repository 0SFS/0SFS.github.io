# FlightGear external tank and pylon source

These unchanged files come from the F-35B FGAddon archive, revision 15340,
already retained for the aircraft's flight model. Its archive SHA-256 is
`caf3c591c838148ccdeec8fc61a23fd09f17574aeb36e0071e84a132dd25ebd6`.
Source: <https://fgaddon.b-cdn.net/Aircraft-trunk/F-35B.zip>.

`Tank.ac` and `Tank.png` come from `F-35B/Models/Payload/Tank/`;
`pylons.ac` comes from `F-35B/Models/Payload/`. The package credits Petar Jedvaj,
Detlef Faber, F-GTUX, Stuart Cassie and Gary Brown. The package's unchanged
GPL version 3 text accompanies these sources in `License.txt`; no individual
asset author or “or later” permission is inferred.

`scripts/build-external-tank-model.mjs` converts the tank and inner pylon
`Station3` into the separately licensed runtime GLB. This is a development
store adapted from FlightGear, not evidence of an operationally certified
F-35B tank installation. It is independent of AF267's CC BY 4.0 airframe.
