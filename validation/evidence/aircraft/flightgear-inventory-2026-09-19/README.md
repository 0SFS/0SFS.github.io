# FlightGear aircraft inventory, 2026-09-19

Records behind [docs/flightgear-aircraft.md](../../../../docs/flightgear-aircraft.md).
They are frozen: they record what the FGAddon trunk catalogue held, and how the
installed JSBSim WASM package ran it, on 2026-09-19. The tools that produced
them are in [`scripts/validation/aircraft/`](../../../../scripts/validation/aircraft/).

## Inputs

- **Catalogue:** `https://mirrors.ibiblio.org/flightgear/ftp/Aircraft-trunk/catalog.xml`,
  fetched 2026-09-19: 673 packages, 971 variants. Package zips were read from
  its base URL, `https://fgaddon.b-cdn.net/Aircraft-trunk/`. Each record keeps
  the package's FGAddon `revision`.
- **JSBSim engine:** the installed `@felipegalind0/jsbsim` `1.2.4-fork.7` WASM
  package (`deps/`), the build 0sfs ships.
- **JSBSim repository aircraft:** `aircraft/`, `engine/` and `systems/` from
  `Felipegalind0/jsbsim` commit `499c3832`, taken with `git archive`.

## Files

| File | What it is | Produced by |
| --- | --- | --- |
| `inventory.json` | One record per catalogue variant: flight model, aero file, model path, ratings, author, licence findings, package and model sizes, Nasal count; for JSBSim variants, engines, gear, systems and how many FlightGear-tree properties the model reads. The per-model property lists are dropped to keep this small; `controls-properties.json` keeps the part the document cites | `scan-flightgear-aircraft.py --extract-fdm` |
| `controls-properties.json` | How many JSBSim packages mention each `/controls/flight/*` and `/controls/engines/*` property | Derived from the scan's property lists |
| `smoke-flightgear.json` | Load, stand, thrust, trim and level-flight results for the 289 extracted FlightGear JSBSim variants | `smoke-test-flightgear-fdm.mjs --fdm` |
| `smoke-jsbsim-499c3832.json` | The same checks over the JSBSim repository's aircraft | `smoke-test-flightgear-fdm.mjs --jsbsim-root` |
| `model-surveys.json` | Exterior triangle counts, and AC3D bytes by category, for every package with a variant that flew | `survey-flightgear-model.py --exterior-only` |
| `dhc6jsb-model.json` | Full survey of the DHC-6 model: triangles by category and file, and what its animations drive | `survey-flightgear-model.py dhc6 --variant dhc6jsb --glb` |
| `dhc6jsb-front-left.png` | That GLB rendered headless in Blender 5.2 (Workbench, textured); the GLB itself is not kept | `render-aircraft-glb.py` |

The extracted flight models, the GLB and the catalogue XML are not kept. They
are third-party files, reproducible from the catalogue revision, and 60 MB.

Two more tools sit beside those and produced no file here, only the
explanations in the document: `diagnose-fdm-native.py`, which says in words why
a model that the WASM build could only report as "native exception" failed, and
`trace-flightgear-fdm.mjs`, which flies one model and prints what it is doing
each second.

## Credit for the render

`dhc6jsb-front-left.png` is rendered from FlightGear's `dhc6` package (FGAddon
revision 18298): de Havilland Canada DHC-6-300 Twin Otter by Syd Adams (initial
model), Christian Thiriot (3D, textures), Bo Lan, Jonathan Schellhase,
Simworld2020 and Sascha Reißner. The package carries the GPL v2 text in
`docs/COPYING`, and FlightGear's policy for FGAddon is GPLv2+. Source:
<https://sourceforge.net/p/flightgear/fgaddon/HEAD/tree/trunk/Aircraft/dhc6/>.

## Licence findings

`licence_files` in each record lists what the scan read and where: a file at the
package root, a file deeper in the package, or (marked `header: true`) a licence
statement found in the header of a model or Nasal file when no licence file
existed. An empty list means the scan found no statement anywhere, which is not
the same as the aircraft being unlicensed — FGAddon's own policy has been GPLv2+
since August 2015. The document's [Licences](../../../../docs/flightgear-aircraft.md#licences)
section works through what that does and does not settle.

## Limits

These are triage results, not qualification. The smoke test stands in for
FlightGear's Nasal with generic defaults, keeps every tank full, and flies
with a fixed-gain stand-in pilot; see the document's
[How it was measured](../../../../docs/flightgear-aircraft.md#how-it-was-measured).
A failure can be one missing line in an aircraft's mapping, and a pass says
nothing about fidelity.
