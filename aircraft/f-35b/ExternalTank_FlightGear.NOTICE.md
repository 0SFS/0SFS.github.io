# External tank and pylon model

`ExternalTank_FlightGear.glb` derives from the FlightGear F-35B package,
FGAddon revision 15340, whose contributors are Petar Jedvaj, Detlef Faber,
F-GTUX, Stuart Cassie and Gary Brown. The source archive is
<https://fgaddon.b-cdn.net/Aircraft-trunk/F-35B.zip>, SHA-256
`caf3c591c838148ccdeec8fc61a23fd09f17574aeb36e0071e84a132dd25ebd6`.

The GPL version 3 package license accompanies this file in
`ExternalTank_LICENSE-GPL-3.0.txt`. Editable, unchanged AC3D sources and the
tank texture are retained in
`planes/Lockheed_Martin_F-35B/tests/flightgear-external-tanks/`.
No individual asset author or later-license permission is inferred.

0sfs converted the tank and inner pylon `Station3` with
`scripts/build-external-tank-model.mjs --install`. Changes: triangulated
source polygons, generated normals, converted axes and texture coordinates,
and placed the pylon relative to the tank using the source payload offsets.
The source geometry and tank texture are preserved; the pylon uses its source
gray material. The adjacent provenance file records source and export hashes.

The aircraft mounts mirrored-side copies using its declared development
store positions. Their fit, mass, drag and release motion are approximations,
not a certified F-35B external-tank loadout. Both tank and pylon leave together.
Released stores follow visual-only ballistic motion without collisions,
terrain impact, wind or aerodynamics and expire within the user's debris
budget. AF267's airframe is separately licensed under CC BY 4.0; this asset
does not change that attribution or imply endorsement by either contributor.
