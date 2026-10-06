#!/usr/bin/env python3
"""Generate CoACD comparison candidates from aircraftGeometry.mjs JSON.

0sfs owns this aircraft collision experiment. Dependencies stay under build/.
The macOS wrapper builds and verifies the native worker budget before generation:
  node scripts/validation/collision/run-coacd.mjs \
    --input=build/.../mesh.json --output=build/.../coacd.json --budgets=4,8,16,32

The native library's worker cap must be established before a generation run.
OMP_NUM_THREADS does not limit CoACD's std::thread fallback. --thread-policy
records the verified policy; it does not configure the native implementation.
The source mesh can be open: auto preprocessing remeshes it, so coverage must
be measured against the original triangles rather than assumed from threshold.
"""

import argparse
import ctypes
import hashlib
import importlib.metadata
import inspect
import json
import math
import os
from pathlib import Path
import platform
import subprocess
import sys
import time


def parse_budgets(value):
    try:
        budgets = [int(part) for part in value.split(",")]
    except ValueError as error:
        raise argparse.ArgumentTypeError("budgets must be comma-separated integer hull counts") from error
    if not budgets or any(budget < 1 for budget in budgets) or len(set(budgets)) != len(budgets):
        raise argparse.ArgumentTypeError("budgets must be distinct positive hull counts")
    return budgets


def positive_integer(value):
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("value must be a positive integer")
    return parsed


def default_output():
    """Use the repository's shared dated-output helper instead of system temp."""
    repo = Path(__file__).resolve().parents[3]
    result = subprocess.run(
        ["node", "--input-type=module", "-e",
         'import {newOutputDirectory} from "./scripts/outputDirectory.mjs"; '
         'console.log(newOutputDirectory("validation","collision","coacd"));'],
        cwd=repo, check=True, text=True, capture_output=True,
    )
    return Path(result.stdout.strip()) / "coacd.json"


def replace_native_library(coacd, library_path):
    """Use a separately built library with the same public CoACD C interface."""
    original = coacd._lib
    replacement = ctypes.CDLL(str(library_path.resolve()))
    for name in ("CoACD_run", "CoACD_freeMeshArray", "CoACD_setLogLevel"):
        source = getattr(original, name)
        target = getattr(replacement, name)
        target.argtypes = source.argtypes
        target.restype = source.restype
    coacd._lib = replacement


class TbbWorkerLimit:
    """Hold oneTBB's native global_control alive during all generation calls.

    The published oneTBB global_control layout is size_t value, intptr reserved,
    enum parameter. Tested against the embedded oneTBB in CoACD 1.0.14. Using
    the already loaded CoACD handle controls its embedded runtime rather than
    accidentally loading a separate TBB library with an unrelated worker pool.
    https://github.com/uxlfoundation/oneTBB/blob/master/include/oneapi/tbb/global_control.h
    """
    class Control(ctypes.Structure):
        _fields_ = [("value", ctypes.c_size_t), ("reserved", ctypes.c_ssize_t), ("parameter", ctypes.c_int)]

    def __init__(self, library, workers):
        self.control = self.Control(workers, 0, 0)
        self.create = getattr(library, "_ZN3tbb6detail2r16createERNS0_2d114global_controlE")
        self.destroy = getattr(library, "_ZN3tbb6detail2r17destroyERNS0_2d114global_controlE")
        self.active_value = getattr(library, "_ZN3tbb6detail2r127global_control_active_valueEi")
        for function in (self.create, self.destroy):
            function.argtypes = [ctypes.POINTER(self.Control)]
            function.restype = None
        self.active_value.argtypes = [ctypes.c_int]
        self.active_value.restype = ctypes.c_size_t
        self.before = self.active_value(0)
        self.enabled = False

    def __enter__(self):
        self.create(ctypes.byref(self.control))
        self.enabled = True
        self.active = self.active_value(0)
        if self.active > self.control.value:
            self.__exit__(None, None, None)
            raise RuntimeError("embedded TBB worker limit did not take effect")
        return self

    def __exit__(self, _error_type, _error, _traceback):
        if self.enabled:
            self.destroy(ctypes.byref(self.control))
            self.enabled = False


def read_mesh(file_path, np):
    source = json.loads(file_path.read_text())
    vertices = np.asarray(source.get("vertices"), dtype=np.float64)
    indices = np.asarray(source.get("indices"), dtype=np.float64)
    for label, array in (("vertices", vertices), ("indices", indices)):
        if array.ndim != 1 or len(array) == 0 or len(array) % 3 != 0 or not np.isfinite(array).all():
            raise ValueError(f"{label} must be a nonempty flat finite array whose length is a multiple of 3")
    if np.any(indices != np.floor(indices)) or np.any(indices < 0) or np.any(indices >= len(vertices) // 3):
        raise ValueError("triangle indices must be integers within the vertex array")
    if np.any(indices > np.iinfo(np.int32).max):
        raise ValueError("triangle indices exceed CoACD's int32 interface")
    vertices = np.ascontiguousarray(vertices.reshape((-1, 3)), dtype=np.float64)
    indices = np.ascontiguousarray(indices.reshape((-1, 3)), dtype=np.int32)
    geometry_hash = hashlib.sha256(vertices.astype("<f8").tobytes() + indices.astype("<i4").tobytes()).hexdigest()
    metadata = {"geometrySha256": geometry_hash, "vertexCount": len(vertices), "triangleCount": len(indices)}
    # Copy only the geometry hash from input metadata. Paths, names, machine
    # information, and arbitrary metadata are never copied into this artifact.
    source_hash = source.get("metadata", {}).get("sha256")
    if isinstance(source_hash, str) and len(source_hash) == 64 and all(char in "0123456789abcdef" for char in source_hash):
        metadata["sourceAssetSha256"] = source_hash
    return vertices, indices, metadata


def save(output, report):
    output.parent.mkdir(parents=True, exist_ok=True)
    partial = output.with_name(f"{output.name}.partial-{os.getpid()}")
    partial.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    partial.replace(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", type=Path, required=True, help="Flat metre-coordinate vertices and triangle indices JSON")
    parser.add_argument("--output", type=Path, help="Defaults to a new dated build/validation/collision/coacd folder")
    parser.add_argument("--budgets", type=parse_budgets, default=parse_budgets("4,8,16,32"), help="Maximum hull counts, default 4,8,16,32")
    parser.add_argument("--threshold-metres", type=float, default=0.05, help="CoACD concavity threshold in metres, default 0.05")
    parser.add_argument("--preprocess-resolution", type=positive_integer, default=50, help="Manifold preprocessing resolution, default 50")
    parser.add_argument("--sampling-resolution", type=positive_integer, default=2000, help="Distance sample count, default 2000")
    parser.add_argument("--mcts-nodes", type=positive_integer, default=20, help="MCTS child node count, default 20")
    parser.add_argument("--mcts-iterations", type=positive_integer, default=150, help="MCTS iterations, default 150")
    parser.add_argument("--mcts-depth", type=positive_integer, default=3, help="MCTS search depth, default 3")
    parser.add_argument("--max-hull-vertices", type=int, default=0, help="Enable hull decimation to this vertex cap; 0 disables decimation")
    parser.add_argument("--seed", type=int, default=0, help="Fixed sampling seed, default 0")
    parser.add_argument("--native-library", type=Path, help="Optional separately built compatible CoACD shared library")
    parser.add_argument("--native-concurrency-probe", type=Path, help="Native probe dylib exporting collision_native_concurrency_probe; validates libc++ std::thread cap")
    parser.add_argument("--tbb-max-workers", type=positive_integer, default=max(1, (os.cpu_count() or 2) // 2), help="Embedded OpenVDB TBB max parallelism, defaults to half the logical cores")
    parser.add_argument("--thread-policy", help="Verified native worker policy, recorded verbatim; does not enforce a cap")
    parser.add_argument("--log-level", choices=["off", "error", "warn", "info", "debug"], default="info")
    args = parser.parse_args()
    if not math.isfinite(args.threshold_metres) or args.threshold_metres <= 0:
        parser.error("threshold-metres must be finite and positive")
    if args.max_hull_vertices != 0 and args.max_hull_vertices < 4:
        parser.error("max-hull-vertices must be 0 or at least 4")
    if not 5 <= args.preprocess_resolution <= 1000:
        parser.error("preprocess-resolution must lie between 5 and 1000 (upstream limits)")
    if not 0 <= args.seed <= 2**32 - 1:
        parser.error("seed must fit an unsigned 32-bit integer")
    if not args.thread_policy:
        parser.error("supply --thread-policy after verifying the native worker cap; OMP_NUM_THREADS cannot cap std::thread")
    if args.tbb_max_workers > max(1, (os.cpu_count() or 2) // 2):
        parser.error("tbb-max-workers must not exceed half this machine's logical cores")

    import coacd
    import numpy as np

    if "real_metric" not in inspect.signature(coacd.run_coacd).parameters:
        raise RuntimeError("installed CoACD lacks real_metric; this experiment requires metre thresholds")
    if args.native_library:
        replace_native_library(coacd, args.native_library)
    native_concurrency = None
    probe_sha256 = None
    if args.native_concurrency_probe:
        probe = ctypes.CDLL(str(args.native_concurrency_probe.resolve()))
        probe.collision_native_concurrency_probe.restype = ctypes.c_uint
        native_concurrency = probe.collision_native_concurrency_probe()
        probe_sha256 = hashlib.sha256(args.native_concurrency_probe.read_bytes()).hexdigest()
        if native_concurrency < 1 or native_concurrency > args.tbb_max_workers:
            raise RuntimeError(f"native std::thread worker count {native_concurrency} exceeds configured cap {args.tbb_max_workers}; launch with the thread-budget interposer")
    coacd.set_log_level(args.log_level)
    vertices, indices, mesh_metadata = read_mesh(args.input, np)
    output = args.output or default_output()
    parameters = {
        "threshold": args.threshold_metres,
        "real_metric": True,
        "preprocess_mode": "auto",
        "preprocess_resolution": args.preprocess_resolution,
        "resolution": args.sampling_resolution,
        "mcts_nodes": args.mcts_nodes,
        "mcts_iterations": args.mcts_iterations,
        "mcts_max_depth": args.mcts_depth,
        "pca": False,
        "merge": True,
        "decimate": args.max_hull_vertices > 0,
        "max_ch_vertex": args.max_hull_vertices or 256,
        "extrude": False,
        "extrude_margin": 0.01,
        "apx_mode": "ch",
        "seed": args.seed,
    }
    native_file = Path(coacd._lib._name)
    report = {
        "metadata": {
            "generator": "0sfs-coacd-proxies/1.0",
            "versions": {"coacd": importlib.metadata.version("coacd"), "numpy": np.__version__, "python": platform.python_version()},
            "nativeLibrarySha256": hashlib.sha256(native_file.read_bytes()).hexdigest(),
            "input": mesh_metadata,
            "threadPolicy": args.thread_policy,
            "nativeStdThreadConcurrency": native_concurrency,
            "nativeConcurrencyProbeSha256": probe_sha256,
            "tbbMaxWorkersRequested": args.tbb_max_workers,
            "geometryBytesMeaning": "Packed float32 xyz positions; excludes backend hull topology and acceleration storage.",
            "preprocessing": "auto: CoACD checks manifoldness and remeshes non-manifold input with OpenVDB. Original-surface coverage is measured separately.",
            "budgetMeaning": "Maximum hull count requested from merge; returned count and measured error are authoritative.",
            "accuracy": "The hull cap can exceed the concavity threshold. Preprocessing can alter or omit thin source features. No enclosure guarantee is assumed.",
        },
        "candidates": [],
    }
    with TbbWorkerLimit(coacd._lib, args.tbb_max_workers) as worker_limit:
        report["metadata"]["tbbMaxWorkersActive"] = worker_limit.active
        save(output, report)
        for budget in args.budgets:
            kwargs = {**parameters, "max_convex_hull": budget}
            print(f"CoACD generation starts: budget={budget}", flush=True)
            start = time.perf_counter()
            parts = coacd.run_coacd(coacd.Mesh(vertices, indices), **kwargs)
            generation_ms = (time.perf_counter() - start) * 1000
            shapes = []
            total_vertices = 0
            for part_vertices, _part_indices in parts:
                if len(part_vertices) < 4 or not np.isfinite(part_vertices).all():
                    raise RuntimeError("CoACD returned an invalid convex-hull vertex array")
                total_vertices += len(part_vertices)
                shapes.append({"type": "hull", "vertices": part_vertices.reshape(-1).tolist(), "center": [0, 0, 0], "rotation": [0, 0, 0, 1]})
            if not shapes:
                raise RuntimeError("CoACD returned no hulls")
            candidate = {
                "id": f"coacd-{budget}" + (f"-v{args.max_hull_vertices}" if args.max_hull_vertices else ""),
                "kind": "shapes", "budget": budget, "shapes": shapes,
                "metadata": {
                    "generationMs": generation_ms, "shapeCount": len(shapes), "totalVertices": total_vertices,
                    "geometryBytes": total_vertices * 3 * 4, "parameters": kwargs,
                    "budgetSatisfied": len(shapes) <= budget,
                },
            }
            report["candidates"].append(candidate)
            save(output, report)
            print(json.dumps({"id": candidate["id"], **candidate["metadata"]}), flush=True)
    print(json.dumps({"output": str(output), "candidateCount": len(report["candidates"])}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, ImportError, AttributeError) as error:
        print(f"CoACD proxy generation: {error}", file=sys.stderr)
        sys.exit(1)
