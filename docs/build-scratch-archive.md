# Gitignored `build/` offload

Waiting on an external SSD. Do not move these until the drive is mounted and
this list is followed. Recycle-now junk already went to Trash on 2026-09-20.

0sfs `build/` is gitignored scratch. JSBSim scratch lives in
`/Users/felg/gh/Felipegalind0/jsbsim/build` (also gitignored). Committed
evidence stays in `validation/evidence/`. See [validation layout](validation/layout.md).

Sizes below are `du -sh` after the 2026-09-20 recycle, when JSBSim `build/`
was 19 GB and 0sfs `build/` was 516 MB.

## Already in Trash

Folder: `~/.Trash/build-recycle-2026-09-20` (24 GB). Finder Put Back may not
restore original paths; `MANIFEST.txt` in that folder names the destinations.

Moved: five superseded 18 Sep wheel-spin CSV runs; #1502 mutant/source copies
and leftover task dirs; `idle-ff`, `trim-ff`, `trim-ff-rename`; fork.4 /
in-tree isolation trees; `turbine-init-01-20260919/src`; 0sfs
`validation/jsbsim-centralization-20260913/dependency-recovery`;
`build/scratch`; `phone-layout/chrome-PCRLYc`; `commit-stash`; live-root probe
files.

Empty Trash only when sure none of that is needed. The published #1502
summaries are already in `validation/evidence/jsbsim/wheel-spin-review/`.

## Move to the external drive

Preserve each path under a dated root on the SSD, for example
`$SSD/build-archive-2026-09-20/jsbsim/...` and `.../0sfs/...`. `mv` on the
same machine is enough; do not copy then delete unless the drive is a
different volume and you have verified the copy.

### JSBSim (`/Users/felg/gh/Felipegalind0/jsbsim/build`)

| Path | Size | Why |
| --- | --- | --- |
| `wheel-spin-review/2026-09-19_131146` | 13 GB | Accepted #1502 61-input traces at `499c3832`. Hashes and `analysis.json` are in git. Regenerates in ~3.5 min if the hashed binaries below stay. |
| `pr1502-preserved-wasm/build/attempts` | 1.1 GB | Intermediate WASM compiles. **Do not move** sibling `artifacts/`, `packages/`, `demo/`, `node_modules/`, or `last-*.json`. |
| `pr1502-preserved-wasm/build/sources` | 640 MB | Archived WASM source snapshots. Same stay rule as `attempts`. |
| `upstream-submission-native` | 1.2 GB | Sep 13 #1506 submission ASAN/python/tars. Local `reload-asan` stays. |
| `upstream-submission-wasm` | 358 MB | Sep 13 #1507 tree, including `contribution-branches.bundle`. |

After this, JSBSim `build/` should be about 3 GB of stay-put trees plus the
last WASM artifacts (~170 MB).

### 0sfs (`/Users/felg/gh/0sfs/build`)

| Path | Size | Why |
| --- | --- | --- |
| `fg-aircraft-inventory` | 155 MB | 19 Sep FlightGear catalog, models, smoke results. |
| `fg-aircraft-inventory-2026-09-19` | 1.5 MB | Earlier inventory slice. |
| `marimo-research-2026-09-19` | 91 MB | Cloned FlightDynamicsCalcs plus notes. |
| `research` | 17 MB | Partial SimGear/FlightGear snapshots. |
| `phone-layout` | 21 MB | Dated screenshot history. Leave `latest` if it is a symlink into a dated folder you are moving; recreate it after restore. |
| `validation` | 177 MB | Dated SF50 / in-tree / landing outputs. Not the committed `validation/evidence/` tree. |

Do not move `tools/`, `benchmarks/`, or `dev-certs/`.

## Stay put

Leave these on the boot disk until the matching PR is merged or the tool no
longer points here.

**JSBSim**

- `pr1508-off-engine-20260919` — current checkout, #1508 local fix
- `pr1505-off-engine-20260919` — #1505 local fix, not pushed
- `turbine-init-01-20260919` — cmake/probes only (`src/` already trashed)
- `tank-temp` — #1511
- `pr1502`, `pr1502-cxx`, `pr1502-probe`, `pr1502-base`, `pr1502-final-original` — hashed #1502 binaries
- `pr1502-handoff`, `pr1502-final-validation`
- `reload-asan` — #1506 reproduce
- `native` — `scripts/validation/aircraft/diagnose-fdm-native.py`
- `pr1502-preserved-wasm/build/artifacts`, `packages`, `demo`, `node_modules`, `last-*.json` — `wasm/` is currently missing from the JSBSim working tree; WASM is not a reproducible rebuild

**0sfs**

- `tools/jsbsim-py`
- `benchmarks/audio`
- `dev-certs`

## Commands when the SSD is mounted

Set `SSD` to the mounted volume. Dry-run by echoing first. Same-volume `mv`
is a rename; a USB SSD is a copy.

```sh
SSD=/Volumes/YOUR_DRIVE
ROOT="$SSD/build-archive-2026-09-20"
JS=/Users/felg/gh/Felipegalind0/jsbsim/build
OS=/Users/felg/gh/0sfs/build

mkdir -p "$ROOT/jsbsim/wheel-spin-review" \
  "$ROOT/jsbsim/pr1502-preserved-wasm/build" \
  "$ROOT/0sfs"

test -d "$JS/pr1502-preserved-wasm/build/artifacts"
test -d "$JS/pr1502"
test -d "$JS/pr1508-off-engine-20260919"

mv "$JS/wheel-spin-review/2026-09-19_131146" "$ROOT/jsbsim/wheel-spin-review/"
mv "$JS/pr1502-preserved-wasm/build/attempts" "$ROOT/jsbsim/pr1502-preserved-wasm/build/"
mv "$JS/pr1502-preserved-wasm/build/sources" "$ROOT/jsbsim/pr1502-preserved-wasm/build/"
mv "$JS/upstream-submission-native" "$ROOT/jsbsim/"
mv "$JS/upstream-submission-wasm" "$ROOT/jsbsim/"

mv "$OS/fg-aircraft-inventory" "$ROOT/0sfs/"
mv "$OS/fg-aircraft-inventory-2026-09-19" "$ROOT/0sfs/"
mv "$OS/marimo-research-2026-09-19" "$ROOT/0sfs/"
mv "$OS/research" "$ROOT/0sfs/"
mv "$OS/phone-layout" "$ROOT/0sfs/"
mv "$OS/validation" "$ROOT/0sfs/"
```

After the moves, confirm `pr1502-preserved-wasm/build/artifacts` and the
stay-put cmake trees still exist under JSBSim `build/`, then `du -sh` both
`build/` directories.

Optional after #1502 merges: the 13 GB traces on the SSD can go. They
regenerate from the hashed binaries with
`scripts/validation/jsbsim/wheel-spin-review/compare_scripts.py --trace`.
After #1505/#1508 replies land, those off-engine cmake trees become archive
candidates too.
