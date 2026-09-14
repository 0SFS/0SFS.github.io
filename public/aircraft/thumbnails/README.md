# Aircraft gallery thumbnails

These 640 × 400 transparent PNGs are static renders of the procedural LOD3
meshes already shipped by OSFS. The mesh artist is **felipegalin0**, as recorded
in `src/flight/aircraft/aircraftCatalog.ts`. The meshes are measured
reconstructions made by the repository's aircraft generators; the thumbnails
retain their existing geometry and body/window base colors. Tiny tyre treads
are represented with a neutral rubber color.

| Thumbnail | Source mesh | Source generator |
| --- | --- | --- |
| `cessna-172.png` | `public/aircraft/cessna-172/Cessna_172_LOD3.glb` | `planes/Cessna_172/agent_workspace/scripts/generate_c172.py` |
| `cirrus-vision-jet.png` | `public/aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_LOD3.glb` | `planes/Cirrus_Vision_Jet/agent_workspace/scripts/generate_sf50.py` |

The thumbnails use repository-owned procedural assets under the project's
AGPL-3.0-only license (`LICENSE`). They contain no reference photographs,
downloaded aircraft images or third-party HD model. The separately credited
Hilos Run model is not a source for either image.

Regenerate both assets from the repository root with Python 3 (standard library
only):

```sh
python3 scripts/render-aircraft-thumbnails.py
```

The script reads the shipped GLBs, hides the stopped C172 propeller's blur
disc, and rasterizes a common front-left orthographic view with diffuse
lighting and a small highlight on the CPU. It preserves geometry and
interpolates the mesh normals. This lightweight preview does not reproduce
the application's full PBR renderer. It writes only the two thumbnails. Each
PNG uses 2× supersampling, 8-bit RGBA, Sub filtering and maximum PNG compression;
no live 3D viewer is needed in the gallery. The renderer supports the
translation-only node transforms used by these procedural GLBs and rejects
future exports with other transforms instead of silently drawing them wrong.

The Vision Jet thumbnail represents the shared development exterior used by
G1, G2 and G3. It does not illustrate generation-specific cabins, avionics or
calibrated performance. Keep the aircraft's development disclosure and model
credits visible in the selection controls.
