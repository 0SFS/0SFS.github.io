# F-35B hung-store meshes

These meshes are built in `@0sfs/stores` when a store is hung. There is no glTF file and no borrowed model.

Published dimensions used as geometry:

- AIM-120: 12 ft long, 7 in diameter, 19 in fin span
- AIM-9X: 9.9 ft long, 5 in diameter, 17.6 in fin span
- ASRAAM: 2.9 m long, 166 mm diameter. Fin span is unpublished, so the mesh is the body only
- GAU-22/A pod: 146 in long, 27 in wide, 32 in high
- GBU-32: 119.5 in long, 19.6 in fin span. Body diameter is unpublished. The body is a 14 in cylinder
- GBU-12: 10 ft 9 in long. The published caption says "11 to 18 in" and does not split body from fin. The body is a 14 in cylinder
- Paveway IV: length and diameter are unpublished. The mesh is a 10 ft by 14 in cylinder so the station is visible. It is not a measured weapon

Where a diameter is published, drag area is the frontal disk at Cd = 1: AIM-120 0.267 ft², AIM-9X 0.136 ft², ASRAAM 0.233 ft². The pod uses its 27 by 32 in face, 6 ft². GBU-32, GBU-12, and Paveway IV use a 1 ft² placeholder, the same placeholder the external tanks document.

Bay doors are new panels. They are not the AF267 gear doors named `leftDoor` and `rightDoor`. Each panel is 2.2 m long, 0.9 m wide, and 0.04 m thick. Hinges are a mesh fit, outboard of the light bay station. The open angle is 97 degrees, from the Code One description of the inboard doors at launch. The 1.5 s slew is a development stand-in, not a measured door time.

Station coordinates are a mesh fit to AF267, not a station drawing. Stations 1 through 5 are drawn on the pilot's right, positive structural Y. The briefs do not say which number is port.

Original geometry, AGPL-3.0-only, the same license as the rest of 0SFS. No manufacturer render and no game asset is used.
