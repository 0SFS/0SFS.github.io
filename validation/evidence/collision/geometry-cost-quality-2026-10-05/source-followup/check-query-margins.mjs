/**
 * Reproduce the aircraft benchmark's two observed conservative-gate misses.
 * This is a numerical query diagnostic, not a performance run or certified fix.
 * node scripts/validation/collision/check-query-margins.mjs --input=fixtures.json
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import RAPIER from "../../../build/tools/collision/node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs";
import { newOutputDirectory } from "../../outputDirectory.mjs";
import { quaternion, rotate, vector } from "./queries.mjs";

const ZERO = { x: 0, y: 0, z: 0 };
const MARGINS = [0, 0.0001, 0.0005, 0.001, 0.002, 0.003, 0.005];
const REPRODUCTIONS = [{ caseIndex: 27, candidateId: "hulls-64" }, { caseIndex: 108, candidateId: "hulls-16" }];

function nativeShape(shape) {
  if (shape.type === "hull") return new RAPIER.ConvexPolyhedron(new Float32Array(shape.vertices.flat()),
    shape.indices ? new Uint32Array(shape.indices) : undefined);
  if (shape.type === "box") return new RAPIER.Cuboid(...shape.halfExtents);
  if (shape.type === "sphere") return new RAPIER.Ball(shape.radius);
  if (shape.type === "capsule") return new RAPIER.Capsule(shape.halfHeight, shape.radius);
  throw new Error(`Unsupported shape ${shape.type}`);
}

function hitRecord(hit) {
  if (!hit) return null;
  return { fraction: hit.time_of_impact, witness1: hit.witness1, witness2: hit.witness2,
    normal1: hit.normal1, normal2: hit.normal2 };
}

function sourcePoints(mesh) {
  const indices = [...new Set(mesh.indices)];
  return indices.map(index => mesh.vertices.slice(index * 3, index * 3 + 3));
}

function proxyPoints(shapes) {
  return shapes.flatMap(shape => {
    let local;
    if (shape.type === "hull") {
      const flat = shape.vertices.flat();
      local = Array.from({ length: flat.length / 3 }, (_, i) => flat.slice(i * 3, i * 3 + 3));
    } else if (shape.type === "box") {
      local = Array.from({ length: 8 }, (_, i) => shape.halfExtents.map((value, axis) => value * (i & 1 << axis ? 1 : -1)));
    } else throw new Error("Analytic support diagnostic requires generated hulls/boxes");
    return local.map(point => rotate(quaternion(shape.rotation), point).map((value, axis) => value + shape.center[axis]));
  });
}

function wallSupport(points, state) {
  let maximum = -Infinity, witness;
  for (const point of points) {
    const rotated = rotate(state.rotation, point);
    if (rotated[0] > maximum) { maximum = rotated[0]; witness = rotated; }
  }
  const gap = -0.05 - state.position[0] - maximum;
  const fraction = gap / state.velocity[0];
  return { maximumRotatedX: maximum, startGapMeters: gap, fraction,
    witnessInsideFiniteWall: Math.abs(state.position[1] + witness[1]) <= 12
      && Math.abs(state.position[2] + witness[2]) <= 12 };
}

export async function checkQueryMargins(fixtures) {
  await RAPIER.init();
  const fixture = fixtures.find(item => item.mesh.id === "sf50-hilosrun");
  if (!fixture) throw new Error("Input must include the sf50-hilosrun followup fixture");
  const scenario = fixture.scenarios.find(item => item.id === "wall");
  if (!scenario) throw new Error("Input is missing the short wall workload");
  const world = new RAPIER.World(ZERO);
  const results = [];
  try {
    const wall = world.createCollider(RAPIER.ColliderDesc.cuboid(0.05, 12, 12));
    const exact = world.createCollider(RAPIER.ColliderDesc.trimesh(
      new Float32Array(fixture.mesh.vertices), new Uint32Array(fixture.mesh.indices)));
    const source = sourcePoints(fixture.mesh);
    for (const reproduction of REPRODUCTIONS) {
      const candidate = fixture.candidates.find(item => item.id === reproduction.candidateId);
      const state = scenario.cases.find(item => item.index === reproduction.caseIndex);
      if (!candidate || !state) throw new Error(`Missing retained case/candidate: ${JSON.stringify(reproduction)}`);
      const compound = world.createCollider(new RAPIER.ColliderDesc(new RAPIER.Compound(
        candidate.shapes.map(nativeShape), candidate.shapes.map(shape => vector(shape.center)),
        candidate.shapes.map(shape => quaternion(shape.rotation)))));
      exact.setTranslation(vector(state.position)); exact.setRotation(state.rotation);
      compound.setTranslation(vector(state.position)); compound.setRotation(state.rotation);
      const exactHit = hitRecord(exact.castCollider(vector(state.velocity), wall, ZERO, 0, 1, true));
      const margins = MARGINS.map(targetDistanceMeters => {
        const coarseHit = hitRecord(compound.castCollider(vector(state.velocity), wall, ZERO, targetDistanceMeters, 1, true));
        const reverseHit = hitRecord(wall.castCollider(ZERO, compound, vector(state.velocity), targetDistanceMeters, 1, true));
        const confirmedHit = coarseHit ? hitRecord(exact.castCollider(vector(state.velocity), wall, ZERO, 0, 1, true)) : null;
        return { targetDistanceMeters, coarseHit, reverseHit, confirmedHit };
      });
      // Place each resident child with the same composed transform to see
      // whether the zero-margin miss is unique to Compound traversal.
      const children = candidate.shapes.map(shape => {
        const local = quaternion(shape.rotation), q = state.rotation;
        const rotation = {
          x: q.w * local.x + q.x * local.w + q.y * local.z - q.z * local.y,
          y: q.w * local.y - q.x * local.z + q.y * local.w + q.z * local.x,
          z: q.w * local.z + q.x * local.y - q.y * local.x + q.z * local.w,
          w: q.w * local.w - q.x * local.x - q.y * local.y - q.z * local.z,
        };
        const position = rotate(state.rotation, shape.center).map((value, axis) => value + state.position[axis]);
        return world.createCollider(new RAPIER.ColliderDesc(nativeShape(shape))
          .setTranslation(...position).setRotation(rotation));
      });
      const childHits = children.map((child, index) => ({ index,
        hit: hitRecord(child.castCollider(vector(state.velocity), wall, ZERO, 0, 1, true)) })).filter(item => item.hit);
      const analyticSource = wallSupport(source, state), analyticProxy = wallSupport(proxyPoints(candidate.shapes), state);
      results.push({ ...reproduction, state, sourceTriangleCount: fixture.mesh.indices.length / 3,
        nativeShapeCount: candidate.shapes.length, exactHit, analyticSource, analyticProxy,
        proxyInwardSupportErrorMeters: analyticSource.maximumRotatedX - analyticProxy.maximumRotatedX,
        childZeroMarginHitCount: childHits.length, childZeroMarginHits: childHits, margins });
      for (const child of children) world.removeCollider(child, false);
      world.removeCollider(compound, false);
    }
  } finally { world.free(); }
  return { rapierVersion: RAPIER.version(), nodeVersion: process.version, marginsMeters: MARGINS,
    execution: "Node CPU/WASM; direct resident collider pairs; no timing or rigid-body stepping",
    limits: ["Two previously observed misses only; no exhaustive margin guarantee", "First source-triangle contact; source solid containment is not assumed",
      "Standalone children compose transforms in JavaScript before Float32 conversion; Compound queries may use different native rounding/frame conditioning",
      "A positive target distance only opens the exact confirmation gate; final source query keeps zero margin"], results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const at = arg.indexOf("=");
    if (at < 0) throw new Error("Use --input=fixtures.json [--output=directory]");
    return [arg.slice(0, at).replace(/^--/, ""), arg.slice(at + 1)];
  }));
  if (!args.input) throw new Error("Use --input=fixtures.json [--output=directory]");
  const bytes = readFileSync(args.input);
  const output = args.output ? path.resolve(args.output) : newOutputDirectory("validation", "collision", "query-margins");
  mkdirSync(output, { recursive: true });
  const report = await checkQueryMargins(JSON.parse(bytes));
  report.fixtureSha256 = createHash("sha256").update(bytes).digest("hex");
  report.scriptSha256 = createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex");
  writeFileSync(path.join(output, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ output, results: report.results.map(result => ({ caseIndex: result.caseIndex,
    candidateId: result.candidateId, exactFraction: result.exactHit?.fraction, supportErrorMeters: result.proxyInwardSupportErrorMeters,
    childZeroMarginHits: result.childZeroMarginHitCount,
    margins: result.margins.map(item => ({ marginMeters: item.targetDistanceMeters,
      fraction: item.coarseHit?.fraction ?? null, confirmedFraction: item.confirmedHit?.fraction ?? null })) })) }, null, 2));
}
