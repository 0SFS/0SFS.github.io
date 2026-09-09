# Asset licensing policy

Software, documentation, and creative assets are separate works. A future OSFS core-code license must not be presented as a license for every model, texture, sound, photograph, PDF, map tile, or aircraft definition in this repository.

## Intended policy

| Material | Intended license approach |
| --- | --- |
| Original OSFS source code | AGPLv3 after copyright holders and third-party boundaries are confirmed. |
| Documentation written for OSFS | CC BY-SA 4.0, except embedded third-party quotations, trademarks, or material with another stated license. |
| Aircraft models, textures, sounds, and reference packs | Individual license and provenance record per asset. Do not assume the code license applies. |
| External maps, terrain, airport search, and 3D tiles | Provider terms, required attribution, API policies, and access keys. They are not redistributed as OSFS assets. |
| JSBSim aircraft/engine/propeller data | Record upstream file path, authorship, version, license/permission, and any redistribution restriction separately. |

## Minimum record for every distributable asset

Each shipped asset needs a nearby `LICENSE`/`NOTICE` or an inventory entry with:

1. Repository path and a content hash or release version.
2. Creator/copyright holder and source URL.
3. Exact license or written permission, including commercial/derivative terms.
4. Whether OSFS modified it and where editable source is kept.
5. Required attribution and the UI/docs location where it appears.

## Current release status

The project author represents the Cessna 172 and Cirrus Vision Jet runtime GLB models as original work created for this project from publicly available reference material. That authorship statement supports treating the authored model geometry as project material; it does not license third-party reference files or manufacturer marks.

The current C172 JSBSim definition, Cessna mesh reference material, and some Cirrus reference material do not yet meet the minimum record. In particular, a “not to be sold” statement in the C172 data and sources without a verifiable license prevent a blanket open-source release. Keep those references and definitions out of a release until they are cleared, replaced, or expressly licensed.

Aircraft names, logos, and manufacturer marks can also create trademark issues even when a mesh is original. Do not imply endorsement by Cessna, Cirrus, NASA, Google, Caltech/JPL, or any data provider.
