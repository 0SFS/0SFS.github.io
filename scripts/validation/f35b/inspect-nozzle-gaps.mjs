#!/usr/bin/env node
// 0sfs owns this aircraft-specific engine-visual geometry diagnostic.
// Actual GLB triangles + production rig, without a browser, GPU or physics run.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rolldown } from "rolldown";
import { Mesh, NullEngine, Quaternion, Scene, TransformNode, Vector3, VertexBuffer } from "@babylonjs/core";
import { newOutputDirectory } from "../../outputDirectory.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: node scripts/validation/f35b/inspect-nozzle-gaps.mjs [--out=NEW_DIRECTORY] [--asset=GLB] [--poses=0,0.5,1] [--station-local=0.1,0.4,0.7,0.85]\nStations are +Z offsets aft of the hinge-ring plane in nozzle-local asset units, before the exported conversion scale. This reports angular triangle coverage, not a calibrated seal or F135 acceptance test.");
  process.exit(0);
}
const option = key => args.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
for (const arg of args) if (!/^--(out|asset|poses|station-local)=/.test(arg)) throw new Error(`Unknown argument: ${arg}`);
function numberList(text, defaults, valid) {
  const values = text === undefined ? defaults : text.split(",").map(Number);
  if (!values.length || values.some(value => !Number.isFinite(value) || !valid(value))) throw new Error(`Invalid numeric list: ${text}`);
  return values;
}
const poses = numberList(option("poses"), [0, 0.5, 1], value => value >= 0 && value <= 1);
const stations = numberList(option("station-local"), [0.1, 0.4, 0.7, 0.85], value => value > 0);
const explicit = option("out");
const out = explicit ? path.resolve(explicit) : newOutputDirectory("validation", "f35b-nozzle-gaps");
if (explicit) await mkdir(out); // Refuse to overwrite an earlier run.
const assetPath = path.resolve(root, option("asset") ?? "public/aircraft/f-35b/F-35B_AF267.glb");
const animationPath = path.join(root, "src/flight/aircraft/aircraftAnimation.ts");
const fixturePath = path.join(out, "rig-source.ts");
await writeFile(fixturePath, `export { applyAircraftRig, bindAircraftRig, NEUTRAL_CONTROL_SURFACES } from ${JSON.stringify(animationPath)};\n`);
const bundle = await rolldown({ input: fixturePath, external: id => !id.startsWith(".") && !path.isAbsolute(id) });
const bundlePath = path.join(out, "rig.mjs");
try { await bundle.write({ file: bundlePath, format: "esm" }); } finally { await bundle.close(); }
const { applyAircraftRig, bindAircraftRig, NEUTRAL_CONTROL_SURFACES } = await import(pathToFileURL(bundlePath).href);

const bytes = await readFile(assetPath);
if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error("Expected a complete glTF 2 GLB");
let gltf, binary;
for (let offset = 12; offset < bytes.length;) {
  const size = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
  const chunk = bytes.subarray(offset + 8, offset + 8 + size);
  if (chunk.length !== size) throw new Error("Truncated GLB chunk");
  if (type === 0x4e4f534a) gltf = JSON.parse(chunk.toString());
  if (type === 0x004e4942) binary = chunk;
  offset += size + 8;
}
if (!gltf || !binary) throw new Error("Expected JSON and embedded BIN chunks");
function accessorValues(index) {
  const accessor = gltf.accessors[index], view = gltf.bufferViews[accessor.bufferView];
  if (accessor.sparse || accessor.normalized || !view || (view.buffer ?? 0) !== 0) throw new Error("Unsupported sparse, normalized or external accessor");
  const components = { VEC3: 3, SCALAR: 1 }[accessor.type];
  const width = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
  const read = { 5121: "readUInt8", 5123: "readUInt16LE", 5125: "readUInt32LE", 5126: "readFloatLE" }[accessor.componentType];
  if (!components || !width) throw new Error("Unsupported accessor layout");
  const values = [], start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  for (let row = 0; row < accessor.count; row++) for (let component = 0; component < components; component++) {
    values.push(binary[read](start + row * (view.byteStride ?? width * components) + component * width));
  }
  return values;
}

const engine = new NullEngine(), scene = new Scene(engine);
scene.useRightHandedSystem = true;
const tau = 2 * Math.PI, coordinateTolerance = 1e-9, angularTolerance = 1e-7;
// A segment intersecting the axis has no well-defined minor angular interval.
function crossesAxis(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / length2));
  return Math.hypot(a[0] + t * dx, a[1] + t * dy) <= coordinateTolerance;
}
function crossSection(triangles, center, planeZ) {
  const intervals = [];
  let intersectingTriangles = 0, coplanarTriangles = 0, axisCrossingSegments = 0;
  for (const triangle of triangles) {
    const cuts = [], distances = triangle.map(point => point[2] - planeZ);
    if (distances.every(distance => Math.abs(distance) <= coordinateTolerance)) { coplanarTriangles++; continue; }
    const add = point => {
      if (!cuts.some(other => Math.hypot(point[0] - other[0], point[1] - other[1]) <= coordinateTolerance)) cuts.push(point);
    };
    for (let index = 0; index < 3; index++) {
      const a = triangle[index], b = triangle[(index + 1) % 3];
      const da = distances[index], db = distances[(index + 1) % 3];
      if (Math.abs(da) <= coordinateTolerance) add([a[0] - center[0], a[1] - center[1]]);
      if (da * db < 0) {
        const t = da / (da - db);
        add([a[0] + t * (b[0] - a[0]) - center[0], a[1] + t * (b[1] - a[1]) - center[1]]);
      }
    }
    if (cuts.length !== 2) continue;
    intersectingTriangles++;
    if (crossesAxis(cuts[0], cuts[1])) { axisCrossingSegments++; continue; }
    const angles = cuts.map(point => (Math.atan2(point[0], point[1]) + tau) % tau).sort((a, b) => a - b);
    const [low, high] = angles;
    if (high - low > Math.PI) intervals.push([0, low], [high, tau]);
    else intervals.push([low, high]);
  }
  const merged = [];
  for (const interval of intervals.sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1] + angularTolerance) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  const uncovered = [];
  let end = 0;
  for (const [low, high] of merged) { if (low > end + angularTolerance) uncovered.push([end, low]); end = high; }
  if (end < tau - angularTolerance) uncovered.push([end, tau]);
  const coveredRadians = merged.reduce((sum, [low, high]) => sum + high - low, 0);
  const degrees = value => value * 180 / Math.PI;
  return {
    status: coplanarTriangles || axisCrossingSegments || !intersectingTriangles ? "inconclusive" : "measured",
    intersectingTriangles, coplanarTriangles, axisCrossingSegments,
    coveredDegrees: degrees(coveredRadians), uncoveredDegrees: degrees(tau - coveredRadians),
    coveredFraction: coveredRadians / tau,
    uncoveredIntervalsDegrees: uncovered.map(interval => interval.map(degrees)),
  };
}

try {
  const nodes = gltf.nodes.map(definition => {
    if (definition.matrix) throw new Error("Matrix-authored nodes require explicit inspection support");
    const node = definition.mesh === undefined ? new TransformNode(definition.name, scene) : new Mesh(definition.name, scene);
    if (definition.mesh !== undefined) {
      const positions = [], indices = [];
      for (const primitive of gltf.meshes[definition.mesh].primitives) {
        if ((primitive.mode ?? 4) !== 4) throw new Error("Expected triangle primitives");
        const offset = positions.length / 3, points = accessorValues(primitive.attributes.POSITION);
        positions.push(...points);
        const sourceIndices = primitive.indices === undefined ? Array.from({ length: points.length / 3 }, (_, index) => index) : accessorValues(primitive.indices);
        indices.push(...sourceIndices.map(index => index + offset));
      }
      node.setVerticesData(VertexBuffer.PositionKind, positions);
      node.setIndices(indices);
    }
    if (definition.translation) node.position.set(...definition.translation);
    if (definition.scale) node.scaling.set(...definition.scale);
    node.rotationQuaternion = definition.rotation ? new Quaternion(...definition.rotation) : Quaternion.Identity();
    return node;
  });
  gltf.nodes.forEach((definition, index) => { for (const child of definition.children ?? []) nodes[child].parent = nodes[index]; });
  const nozzle = nodes.find(node => node.name === "vtol");
  if (!nozzle) throw new Error("Missing vtol nozzle attachment");
  const rig = bindAircraftRig(nodes, { scene, aircraftId: "f-35b", propellerBlades: 0 });
  if (rig.nozzleArea.length !== 16 || rig.nozzleArea.some(petal => petal.node.parent !== nozzle)) throw new Error("Expected current 16 direct-child petal rig");
  const nozzleWorld = nozzle.computeWorldMatrix(true).clone(), inverse = nozzleWorld.clone().invert();
  const scale = [Vector3.Right(), Vector3.Up(), new Vector3(0, 0, 1)].map(axis => Vector3.TransformNormal(axis, nozzleWorld).length());
  if (Math.max(...scale) - Math.min(...scale) > 1e-6) throw new Error("Nozzle parent conversion is not uniformly scaled");
  const center = Vector3.Zero();
  for (const petal of rig.nozzleArea) center.addInPlace(Vector3.TransformCoordinates(petal.node.getAbsolutePosition(), inverse));
  center.scaleInPlace(1 / rig.nozzleArea.length);
  const centerArray = center.asArray();
  const hash = value => createHash("sha256").update(value).digest("hex");
  const files = [assetPath, animationPath, fileURLToPath(import.meta.url), fileURLToPath(new URL("../../outputDirectory.mjs", import.meta.url))];
  const report = {
    schema: "0sfs-f35b-nozzle-angular-coverage/1", owner: "0sfs engine visual validation",
    createdAt: new Date().toISOString(), command: ["node", path.relative(root, fileURLToPath(import.meta.url)), ...args],
    inputs: await Promise.all(files.map(async file => ({ path: path.relative(root, file), sha256: hash(await readFile(file)) }))),
    algorithm: {
      id: "triangle-plane-intersection-angular-union-v1",
      description: "Intersect each posed petal triangle with a nozzle-local constant-Z plane. Project each non-axis-crossing segment into its minor polar-angle interval about the hinge-ring axis, split wraparound, and merge interval coverage. This measures radial triangle presence, not connected watertightness or gas sealing.",
      coordinateToleranceNozzleLocal: coordinateTolerance, intervalMergeToleranceRadians: angularTolerance,
      angleConvention: "0 degrees is nozzle-local +Y; increases toward +X about local +Z.",
      coordinateConvention: "Authored vtol-local frame, +Z toward exhaust; hinge-ring mean from the 16 direct-child origins. Actual production bind/apply rig poses, no source edits, loader yaw, stance offset, hiding, material, lighting or emission changes. Uniform parent conversion converts local station offsets to metres.",
    },
    scope: {
      assembly: "vtol", selectedMeshes: rig.nozzleArea.map(petal => petal.node.name),
      hingeRingCenterNozzleLocal: centerArray, uniformConversionScale: scale[2],
      stationOffsetsNozzleLocal: stations, aperturePositionsNorm: poses,
      poses: "Native display positions listed in aperturePositionsNorm are supplied directly; actual nozzle pitch/yaw remain neutral. This is not an F135 A8/A9 schedule.",
      limits: [
        "Positive uncovered angle establishes absent selected-petal triangles at that section; it does not alone identify real-engine leakage or prove every visible slot erroneous.",
        "Zero uncovered angle does not prove overlapping seals, a continuous connected wall, correct hardware, or calibrated internal flow geometry.",
        "Real serrated trailing edges have intentional notches. Future rebuild acceptance must distinguish upstream sealing sections from intended exit serrations.",
        "No exact F135B nozzle length, A8/A9 range, seal linkage or numeric hardware schedule is established by this diagnostic.",
        "All geometry is included regardless of authored visibility or material. Coplanar triangles and axis-crossing segments make the selected section inconclusive.",
      ],
    },
    sourceContext: [
      { url: "https://onlinelibrary.wiley.com/doi/full/10.1002/9780470686652.eae490", supports: "Lockheed authors describe overlapping CD flow-path/fairing flaps, A8 throat/A9 exit, and shorter STOVL nozzle versus common A/C. No numeric F135 schedule." },
      { url: "https://www.codeonemagazine.com/article.html?item_id=137", supports: "Lockheed ASTOVL engineer distinguishes compact B nozzle from longer A/C flaps and separate three-bearing swivel duct." },
    ],
    geometry: {
      petalPrimitiveCount: rig.nozzleArea.reduce((sum, petal) => sum + gltf.meshes[gltf.nodes[nodes.indexOf(petal.node)].mesh].primitives.length, 0),
      housingAxialBoundsNozzleLocal: [Math.min(...nozzle.getVerticesData(VertexBuffer.PositionKind).filter((_, index) => index % 3 === 2)), Math.max(...nozzle.getVerticesData(VertexBuffer.PositionKind).filter((_, index) => index % 3 === 2))],
      petalBindings: rig.nozzleArea.map(petal => ({ name: petal.node.name, axis: petal.axis.asArray(), closedAngleRad: petal.closedAngleRad, openAngleRad: petal.openAngleRad })),
    },
    sections: [],
  };
  for (const aperture of poses) {
    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, nozzlePositionNorm: aperture }, 0);
    const localInverse = nozzle.computeWorldMatrix(true).clone().invert(), triangles = [];
    for (const petal of rig.nozzleArea) {
      const matrix = petal.node.computeWorldMatrix(true).multiply(localInverse);
      const raw = petal.node.getVerticesData(VertexBuffer.PositionKind), points = [];
      for (let index = 0; index < raw.length; index += 3) points.push(Vector3.TransformCoordinates(Vector3.FromArray(raw, index), matrix).asArray());
      const indices = petal.node.getIndices();
      for (let index = 0; index < indices.length; index += 3) triangles.push([points[indices[index]], points[indices[index + 1]], points[indices[index + 2]]]);
    }
    for (const offset of stations) report.sections.push({
      apertureNorm: aperture, stationOffsetNozzleLocal: offset, stationOffsetMeters: offset * scale[2],
      planeZNozzleLocal: center.z + offset, selectedTriangleCount: triangles.length,
      housingPresentAtPlane: center.z + offset >= report.geometry.housingAxialBoundsNozzleLocal[0] && center.z + offset <= report.geometry.housingAxialBoundsNozzleLocal[1],
      ...crossSection(triangles, centerArray, center.z + offset),
    });
  }
  await writeFile(path.join(out, "geometry-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const summary = { output: path.relative(root, out), report: "geometry-report.json", sourceGlbSha256: report.inputs[0].sha256,
    sections: report.sections.map(({ apertureNorm, stationOffsetMeters, coveredDegrees, uncoveredDegrees, status }) => ({ apertureNorm, stationOffsetMeters, coveredDegrees, uncoveredDegrees, status })),
    qualification: "Measured angular diagnostic only; not real F135 or watertight-seal acceptance. No geometry was modified." };
  const log = `${JSON.stringify(summary, null, 2)}\n`;
  await writeFile(path.join(out, "geometry.log"), log);
  console.log(log);
} finally { scene.dispose(); engine.dispose(); }
