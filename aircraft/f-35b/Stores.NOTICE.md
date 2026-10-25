# F-35B hung-store meshes and weapon-bay doors

The store meshes are built in `@0sfs/stores` when a store is hung. There is no glTF file and no borrowed model. The weapon-bay doors are cut from the AF267 model, described below.

Published dimensions used as geometry:

- AIM-120: 12 ft long, 7 in diameter, 19 in fin span
- AIM-9X: 9.9 ft long, 5 in diameter, 17.6 in fin span
- ASRAAM: 2.9 m long, 166 mm diameter. Fin span is unpublished, so the mesh is the body only
- GAU-22/A pod: 146 in long, 27 in wide, 32 in high
- GBU-32: 119.5 in long, 19.6 in fin span. Body diameter is unpublished. The body is a 14 in cylinder
- GBU-12: 10 ft 9 in long. The published caption says "11 to 18 in" and does not split body from fin. The body is a 14 in cylinder
- Paveway IV: length and diameter are unpublished. The mesh is a 10 ft by 14 in cylinder so the station is visible. It is not a measured weapon

Where a diameter is published, drag area is the frontal disk at Cd = 1: AIM-120 0.267 ft², AIM-9X 0.136 ft², ASRAAM 0.233 ft². The pod uses its 27 by 32 in face, 6 ft². GBU-32, GBU-12, and Paveway IV use a 1 ft² placeholder, the same placeholder the external tanks document.

Station coordinates are a mesh fit to AF267, not a station drawing. Stations 1 through 5 are drawn on the pilot's right, positive structural Y. The briefs do not say which number is port.

## Store mesh fit, 2026-10-24

The meshes were moved onto AF267. Every number in this section is a mesh fit to AF267, measured against the model, the bay-door fit and the animated flaperons. None of it is a station drawing. Store dimensions, masses and drag areas are unchanged.

A station's structural point is still the JSBSim pointmass and drag point. Where that point is a plausible mass arm, only the mesh moves. A fit is the same on the left and right station of each pair. The table is `STORE_MESH_FITS` in `stores/src/stationTable.ts`.

Wing stores hang level. Each store's top is 20 mm under the lowest wing or flaperon surface above it, at any point of the flaperon's animated travel, -0.435 to +0.749 rad. The meshes have no pylon. The station points stay on the external tanks' waterline, about where a pylon would carry the store.

| Stations | Store | Mesh raised | Mesh moved inboard |
| --- | --- | --- | --- |
| 1, 11 wingtip | AIM-9X | 0.721 m | 0.244 m |
| 1, 11 wingtip | ASRAAM | 0.704 m | 0.244 m |
| 2, 10 outboard | AIM-9X | 0.692 m | none |
| 2, 10 outboard | ASRAAM | 0.674 m | none |
| 2, 10 outboard | Paveway IV | 0.575 m | none |
| 3, 9 inboard | Paveway IV | 0.533 m | none |

- The wingtip stations are on the wingtip edge, so half of each store hung past the tip. Their meshes move 0.244 m inboard, which puts the AIM-9X fin tips 20 mm inside the tip. ASRAAM uses the same line.
- Stations 3 and 9 keep the external-tank inches. Only the Paveway IV mesh moves, up from the tank hardpoint.
- No wing store moves fore or aft. The closest approach is 12 mm, between the station 2 and 10 tails and the flaperon at full down travel.

Bay stores, stations 4, 5, 7 and 8:

- The earlier bay points were 0.40 m below the CG, under the closed belly. That is outside the airframe, so it is not a plausible mass arm for an internal store. These structural points move instead of the meshes. Stations 4 and 8 go from z -31.11 in to -11.03 in, and stations 5 and 7 to -11.82 in. x and y are unchanged. The JSBSim pointmasses and drag forces moved with them.
- Every store a station carries is centred on the station point: the heavy line is 0.11 m above the CG and the light line 0.09 m above it. The meshes have no offset.
- The stores pitch nose-down to follow the closed leaves, which rise aft: 3.25° on the heavy stations and 5° on the light ones.
- With the doors closed, every store is at least 28 mm from the leaves' inner faces and at least 26 mm from the lining. The tightest point is the GBU-32 fin tip at the inboard jamb. The forward ends stay under the inlet duct, where the lining drops to about 0.26 m above the CG.
- No store meets a leaf anywhere in the 0° to 97° sweep, in 1° sampled checks. The stores still appear only once their bay is more than 20 % open.
- The lining is a stand-in, so this places each store inside the fit's volume. It is not a rack position.

GAU-22/A pod, station 6:

- The mesh moves 0.21 m up and pitches 4° nose-down. Its top then follows the belly, at least 20 mm under it.
- Station 6 keeps its inches, 0.75 m below the CG. That point is still inside the box, 0.21 m under its centre.

## Weapon-bay doors

Each bay has an inboard and an outboard leaf. Both leaves follow their bay's `stores/bay[n]/door-pos-norm`. The geometry is the [AF267 weapon-bay door fit](../../../docs/proposals/f35b-weapon-bay-door-geometry.md). Its hinge lines, outlines, shell thickness, seams, skin blend and lining are visual fits to AF267. They are not hinge, station or bay drawings.

The leaves' forward and aft ends are serrated. The teeth were traced by eye from photographs of JASDF F-35B 69-8205 with its bays open, as the [serration method record](../../../docs/proposals/f35b-weapon-bay-door-serrations.md) describes. They are a visual fit, not a manufacturer dimension. No photograph shows the outboard aft end, so it repeats the inboard aft pattern.

When the airframe loads, `@0sfs/stores` does the following:

- Cuts the four door footprints out of AF267's lower `fuselage` skin.
- Blends the surrounding skin onto the hinge rails.
- Hangs the clipped skin on the hinges as the leaves' exteriors, with an inner face 18 mm above.
- Bevels each leaf at 45° along its serrated ends, so the teeth clear the fixed skin between them as the leaf opens.
- Adds a recessed lining behind the openings. Its jambs rise from the cut skin's edge, and its roof stays 30 mm under the next surface of the model. It is a stand-in. It is not a measured bay depth or rack.

The AF267 gear doors `leftDoor` and `rightDoor` are unchanged. The leaves, the cut skin and the lining are adaptations of the CC BY 4.0 AF267 model. [NOTICE.md](NOTICE.md) gives that model's attribution.

Travel and time:

- 97° on the inboard leaves is from the Code One description of the inboard doors at launch (Eric Hehs, 15 May 2008).
- 97° on the outboard leaves is a simulation convention. No outboard travel was found.
- Door travel takes 1.5 s in the JSBSim kinematic. This is a development stand-in, not a measured door time.
- The powered-lift fountain-fence position, about 45°, is not modelled. It is deferred.

Gear and bays:

- The landing gear and a bay door never move together.
- A gear request first shuts both bays. The gear then waits until both bay positions and commands are at or below 0.001.
- A bay opened while the gear waits or moves opens once the gear rests at its endpoint.
- This is a simulation rule, not a published F-35B operating rule. The 0.001 tolerance is a development choice.
- It does not clear the closed belly during gear transit. The gear rig already intersects the original AF267 belly partway through its travel, and it also meets the closed outboard leaves.

Known conflicts:

- The rectangular GAU-22/A pod intersects the inboard leaves from about 47° to 97°. Seating the pod under the belly made the contact start earlier. With the earlier, lower pod fit it began at about 61°. No pod clearance is claimed, and the travel was not shortened to hide it.
- From about 82° to 97°, each inboard leaf passes through the fixed skin strip inboard of its hinge and the lining's inner jamb. The overlap grows to about 40 mm at 97°.
- At 97°, each outboard leaf touches the fixed skin and jamb foot outboard of its hinge, near |X| 1.445 m, Z 1.10 to 1.13 m.

None of these conflicts was hidden by changing the fit's geometry or travel.

The store meshes are original geometry, AGPL-3.0-only, the same license as the rest of 0SFS. No manufacturer render and no game asset is used.
