/**
 * 0sfs owns this aircraft collision experiment. Reuse prepared aircraft meshes,
 * encounters, and proxy geometry for a reduced follow-up timing comparison.
 * This module performs no timing or browser launch. The baseline reuses proxies;
 * an optional independent GLB prepares the same reduced proxy budgets anew.
 *
 * node scripts/validation/collision/prepare-followup.mjs --input=fixtures.json
 *   [--output=fixtures.json] [--support-tolerance-metres=0.0000001]
 *   [--extra-model=aircraft.glb --extra-id=aircraft-name]
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newOutputDirectory } from "../../outputDirectory.mjs";

const DEFAULT_HYBRIDS = ["aabb-1", "hulls-16", "hulls-64"];
const DEFAULT_COMPARISONS = ["aabb-1", "hulls-16", "hulls-64", "points-24"];
const DEFAULT_PLANE_WORKLOADS = ["ground-dense", "far-miss"];
const sha256 = value => createHash("sha256").update(value).digest("hex");
const hashObject = value => sha256(JSON.stringify(value));

function requireCandidate(fixture, id) {
  const matches = fixture.candidates.filter(candidate => candidate.id === id);
  if (matches.length !== 1) throw new Error(`${fixture.mesh.id}: requires exactly one ${id} candidate`);
  return matches[0];
}

function transformHullVertices(shape) {
  if (shape.type !== "hull") throw new Error("Plane support requires a full convex hull; an enclosing box fallback is insufficient");
  const vertices = shape.vertices.flat();
  const center = shape.center ?? [0, 0, 0];
  const rotation = shape.rotation ?? [0, 0, 0, 1];
  if (vertices.length < 12 || vertices.length % 3 || !vertices.every(Number.isFinite)
    || center.length !== 3 || !center.every(Number.isFinite)
    || rotation.length !== 4 || !rotation.every(Number.isFinite)
    || Math.abs(Math.hypot(...rotation) - 1) > 1e-8) throw new Error("Invalid global-hull transform or vertices");
  const [qx, qy, qz, qw] = rotation;
  const points = [];
  for (let i = 0; i < vertices.length; i += 3) {
    const [x, y, z] = vertices.slice(i, i + 3);
    const ux = qy * z - qz * y, uy = qz * x - qx * z, uz = qx * y - qy * x;
    const vx = qy * uz - qz * uy, vy = qz * ux - qx * uz, vz = qx * uy - qy * ux;
    points.push([
      x + 2 * (qw * ux + vx) + center[0],
      y + 2 * (qw * uy + vy) + center[1],
      z + 2 * (qw * uz + vz) + center[2],
    ]);
  }
  return points;
}

function checkAxialSupport(mesh, points, tolerance) {
  const sourceMin = [Infinity, Infinity, Infinity], sourceMax = [-Infinity, -Infinity, -Infinity];
  const hullMin = [...sourceMin], hullMax = [...sourceMax];
  // Only vertices referenced by source triangles are collision surfaces.
  for (const index of new Set(mesh.indices)) {
    for (let axis = 0; axis < 3; axis++) {
      const value = mesh.vertices[index * 3 + axis];
      sourceMin[axis] = Math.min(sourceMin[axis], value);
      sourceMax[axis] = Math.max(sourceMax[axis], value);
    }
  }
  for (const point of points) for (let axis = 0; axis < 3; axis++) {
    hullMin[axis] = Math.min(hullMin[axis], point[axis]);
    hullMax[axis] = Math.max(hullMax[axis], point[axis]);
  }
  const difference = Math.max(...sourceMin.map((value, axis) => Math.abs(value - hullMin[axis])),
    ...sourceMax.map((value, axis) => Math.abs(value - hullMax[axis])));
  if (!Number.isFinite(difference) || difference > tolerance) {
    throw new Error(`${mesh.id}: global hull axial support differs from source by ${difference} m`);
  }
  return { directions: 6, maximumExtentDifferenceMeters: difference, toleranceMeters: tolerance,
    meaning: "Six axial support checks; completeness comes from the stored full global hull, not directional sampling." };
}

/** Reuse complete fixture objects; change only candidate selection and provenance. */
export function prepareFollowup(fixtures, options = {}) {
  const hybridIds = options.hybridCandidateIds ?? DEFAULT_HYBRIDS;
  const comparisonIds = options.comparisonCandidateIds ?? DEFAULT_COMPARISONS;
  const planeWorkloads = options.planeWorkloads ?? DEFAULT_PLANE_WORKLOADS;
  const hullId = options.globalHullCandidateId ?? "hulls-1";
  const tolerance = options.supportToleranceMeters ?? 1e-7;
  if (!Array.isArray(fixtures) || !fixtures.length || !Number.isFinite(tolerance) || tolerance <= 0) {
    throw new Error("Prepared fixtures and a positive support tolerance in metres are required");
  }
  for (const [label, values] of [["hybrid ids", hybridIds], ["comparison ids", comparisonIds], ["plane workloads", planeWorkloads]]) {
    if (!Array.isArray(values) || !values.length || !values.every(value => typeof value === "string" && value.length)
      || new Set(values).size !== values.length) throw new Error(`${label} must be distinct nonempty names`);
  }
  return fixtures.map(original => {
    const fixture = structuredClone(original);
    const mesh = fixture.mesh;
    if (!mesh?.id || !Array.isArray(mesh.vertices) || !Array.isArray(mesh.indices)
      || !Array.isArray(fixture.candidates) || !Array.isArray(fixture.scenarios)) throw new Error("Invalid prepared aircraft fixture");
    const sourceHash = mesh.metadata?.sha256;
    if (typeof sourceHash !== "string" || !/^[0-9a-f]{64}$/.test(sourceHash)) throw new Error(`${mesh.id}: source asset hash is required`);
    if (planeWorkloads.some(id => !fixture.scenarios.some(scenario => scenario.id === id))) {
      throw new Error(`${mesh.id}: requested plane-support workload is absent`);
    }
    const comparisons = comparisonIds.map(id => requireCandidate(fixture, id));
    const hybrids = hybridIds.map(id => {
      const source = requireCandidate(fixture, id);
      if (source.kind !== "shapes" || !source.shapes?.length || !source.metadata?.sourceSurfaceCovered) {
        throw new Error(`${mesh.id}: ${id} must enclose its complete assigned source triangles`);
      }
      return { ...structuredClone(source), id: `hybrid-${id}`, kind: "hybrid", metadata: {
        ...source.metadata,
        sourceCandidateId: id,
        sourceCandidateSha256: hashObject(source),
        sourceAssetSha256: sourceHash,
        confirmation: "exact-source",
        confirmationCandidateId: "exact-triangles",
        confirmationGeometrySha256: hashObject({ vertices: mesh.vertices, indices: mesh.indices }),
        queryPolicy: "Enclosing proxy sweep rejects misses; possible hits are confirmed against the unchanged exact source triangle surface.",
      } };
    });
    const fullHull = requireCandidate(fixture, hullId);
    if (fullHull.kind !== "shapes" || fullHull.shapes?.length !== 1
      || !fullHull.metadata?.sourceSurfaceCovered || fullHull.metadata.degenerateHullFallbacks) {
      throw new Error(`${mesh.id}: ${hullId} must contain one complete global convex hull`);
    }
    const points = transformHullVertices(fullHull.shapes[0]);
    const supportCheck = checkAxialSupport(mesh, points, tolerance);
    const planeSupport = {
      id: "plane-support", kind: "plane-support", budget: points.length, points,
      applicableWorkloads: [...planeWorkloads],
      metadata: {
        generationMs: fullHull.metadata.generationMs,
        requestedBudget: points.length, actualBudget: points.length, pointCount: points.length,
        shapeCount: 0, totalVertices: points.length, geometryBytes: points.length * 12,
        sourceCandidateId: hullId,
        sourceCandidateSha256: hashObject(fullHull),
        sourceHullGeometrySha256: hashObject(fullHull.shapes),
        sourceAssetSha256: sourceHash,
        sourceMeshGeometrySha256: hashObject({ vertices: mesh.vertices, indices: mesh.indices }),
        fullGlobalHullVertices: true,
        supportCheck,
        algorithm: "All stored global-hull vertices transformed into the unchanged mesh frame; analytic plane support.",
        coverageGuarantee: "Full convex-hull plane support within source hull numerical error. Restricted to plane workloads; obstacle-volume coverage is not claimed.",
      },
    };
    fixture.candidates = [...comparisons, ...hybrids, planeSupport];
    fixture.followupPreparation = {
      generator: "0sfs-collision-followup/1.0",
      baselineFixtureSha256: options.baselineFixtureSha256 ?? null,
      inheritedMeshGeometrySha256: hashObject({ vertices: mesh.vertices, indices: mesh.indices }),
      inheritedScenariosSha256: hashObject(fixture.scenarios),
      sourceAssetSha256: sourceHash,
      sourceMode: fixture.extraModelPreparation ? "additional-glb" : "inherited-baseline",
      comparisonCandidateIds: [...comparisonIds], hybridCandidateIds: [...hybridIds],
      globalHullCandidateId: hullId, planeWorkloads: [...planeWorkloads], supportToleranceMeters: tolerance,
      exactTriangles: "Added by the timing runner from the inherited source mesh.",
      note: fixture.extraModelPreparation
        ? "Independent added GLB mesh and scenarios prepared once; reduced candidates reuse its generated geometry; no timing."
        : "Meshes, encounters, source generation metadata and comparison geometry inherited verbatim; no proxy regeneration or timing.",
    };
    return fixture;
  });
}

/** Optional independent model/triangle-count comparison, prepared without timing. */
export async function prepareExtraModel(file, id, options = {}) {
  if (typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)) throw new Error("extra-id must use lowercase letters, digits and hyphens");
  const directionCount = options.directionCount ?? 2048;
  const cases = options.cases ?? 128;
  const seed = options.seed ?? 20261005;
  if (!Number.isInteger(directionCount) || directionCount < 6 || !Number.isInteger(cases) || cases < 1
    || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Extra-model directions/cases/seed must be valid integer parameters");
  const [{ readAircraftGlb }, { generateProxies }, { initialize, makeScenarios, prepareContactWindows }] = await Promise.all([
    import("./aircraftGeometry.mjs"), import("./proxies.mjs"), import("./queries.mjs"),
  ]);
  const original = readAircraftGlb(file);
  const center = original.metadata.bounds.min.map((value, axis) => (value + original.metadata.bounds.max[axis]) / 2);
  const mesh = {
    id,
    vertices: original.vertices.map((value, index) => value - center[index % 3]),
    indices: original.indices,
    metadata: {
      ...original.metadata,
      source: path.basename(file),
      recenteredByMeters: center,
      bounds: {
        min: original.metadata.bounds.min.map((value, axis) => value - center[axis]),
        max: original.metadata.bounds.max.map((value, axis) => value - center[axis]),
        size: original.metadata.bounds.size,
      },
      pose: "Independent source GLB default rigid pose; gear/control configuration inherited from that file; Propeller_Disc excluded.",
      comparisonLimitation: "An independent model can differ in geometry and gear pose as well as triangle count; this is a source-model scaling comparison.",
    },
  };
  const generated = generateProxies(mesh, { budgets: [1, 16, 64], pointBudgets: [24, 96], directionCount });
  await initialize();
  const scenarios = makeScenarios(mesh, { count: cases, seed });
  prepareContactWindows(mesh, scenarios);
  return { mesh, candidates: generated.candidates, generation: generated.metadata, scenarios,
    scenarioGeneration: { casesPerWorkload: cases, seed, surfaceSampling: "area weighted", fixedPose: true },
    extraModelPreparation: { directionCount, casesPerWorkload: cases, seed, shapeBudgets: [1, 16, 64], pointBudgets: [24, 96] },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = new Map();
    const allowed = new Set(["input", "output", "hybrid-candidates", "comparison-candidates", "global-hull-candidate", "plane-workloads", "support-tolerance-metres",
      "extra-model", "extra-id", "extra-directions", "extra-cases", "extra-seed"]);
    for (const arg of process.argv.slice(2)) {
      if (arg === "--help") {
        console.log("Usage: node prepare-followup.mjs --input=fixtures.json [--output=fixtures.json] [--hybrid-candidates=aabb-1,hulls-16,hulls-64] [--comparison-candidates=aabb-1,hulls-16,hulls-64,points-24] [--global-hull-candidate=hulls-1] [--plane-workloads=ground-dense,far-miss] [--support-tolerance-metres=0.0000001] [--extra-model=aircraft.glb --extra-id=aircraft-name] [--extra-directions=2048] [--extra-cases=128] [--extra-seed=20261005]");
        process.exit(0);
      }
      const match = /^--([a-z-]+)=(.+)$/.exec(arg);
      if (!match || !allowed.has(match[1]) || options.has(match[1])) throw new Error(`Invalid or repeated option: ${arg}`);
      options.set(match[1], match[2]);
    }
    if (!options.has("input")) throw new Error("--input=<prepared fixtures.json> is required");
    const input = readFileSync(path.resolve(options.get("input")));
    const baseline = JSON.parse(input.toString("utf8"));
    if (options.has("extra-model") !== options.has("extra-id")) throw new Error("extra-model and extra-id must be supplied together");
    if (options.has("extra-model")) {
      const id = options.get("extra-id");
      if (baseline.some(fixture => fixture.mesh?.id === id)) throw new Error("extra-id must differ from baseline aircraft ids");
      baseline.push(await prepareExtraModel(path.resolve(options.get("extra-model")), id, {
        directionCount: options.has("extra-directions") ? Number(options.get("extra-directions")) : undefined,
        cases: options.has("extra-cases") ? Number(options.get("extra-cases")) : undefined,
        seed: options.has("extra-seed") ? Number(options.get("extra-seed")) : undefined,
      }));
    }
    const list = name => options.has(name) ? options.get(name).split(",") : undefined;
    const fixtures = prepareFollowup(baseline, {
      baselineFixtureSha256: sha256(input),
      hybridCandidateIds: list("hybrid-candidates"), comparisonCandidateIds: list("comparison-candidates"),
      planeWorkloads: list("plane-workloads"), globalHullCandidateId: options.get("global-hull-candidate"),
      supportToleranceMeters: options.has("support-tolerance-metres") ? Number(options.get("support-tolerance-metres")) : undefined,
    });
    const output = options.has("output") ? path.resolve(options.get("output"))
      : path.join(newOutputDirectory("validation", "collision", "followup-fixtures"), "fixtures.json");
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(fixtures, null, 2)}\n`);
    console.log(JSON.stringify({ output, aircraft: fixtures.map(fixture => ({ id: fixture.mesh.id,
      candidates: fixture.candidates.map(candidate => candidate.id),
      planeSupportPoints: fixture.candidates.find(candidate => candidate.kind === "plane-support").points.length,
    })) }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
