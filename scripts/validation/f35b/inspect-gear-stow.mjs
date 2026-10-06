#!/usr/bin/env node
// 0sfs owns this aircraft-specific actual-asset geometry inspection.
// No browser, renderer, physics, source-asset edits or visibility changes.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rolldown } from "rolldown";
import { newOutputDirectory } from "../../outputDirectory.mjs";
import { buildSkinTriangles, classifySkinEnvelope, F35B_SKIN_NAMES, hasEnvelopeViolation, worldVertices } from "./gearGeometry.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const explicit = process.argv.slice(2).find(arg => arg.startsWith("--out="))?.slice(6);
const authorPose = process.argv.includes("--author-pose");
const checkStowed = process.argv.includes("--check-stowed");
const out = explicit ? path.resolve(explicit) : newOutputDirectory("validation", "f35b-gear-stow");
if (explicit) await mkdir(out); // Keep each earlier run intact.
const animation = path.join(root, "src/flight/aircraft/aircraftAnimation.ts");
const fixturePath = path.join(out, "inspect.ts");
await writeFile(fixturePath, `export {applyAircraftRig,bindAircraftRig,NEUTRAL_CONTROL_SURFACES} from ${JSON.stringify(animation)};\n`);
const bundle = await rolldown({ input: fixturePath, external: id => !id.startsWith(".") && !path.isAbsolute(id) });
const bundlePath = path.join(out, "rig.mjs");
try { await bundle.write({ file: bundlePath, format: "esm" }); } finally { await bundle.close(); }
const { applyAircraftRig, bindAircraftRig, NEUTRAL_CONTROL_SURFACES } = await import(pathToFileURL(bundlePath).href);
const { Mesh, NullEngine, Quaternion, Scene, TransformNode, Vector3, VertexBuffer } = await import("@babylonjs/core");
const assetPath = path.join(root, "public/aircraft/f-35b/F-35B_AF267.glb");
const bytes = await readFile(assetPath);
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
const binary = bytes.subarray(28 + jsonLength);
function accessorValues(index) {
  const accessor = gltf.accessors[index], view = gltf.bufferViews[accessor.bufferView];
  const components = accessor.type === "VEC3" ? 3 : 1;
  const width = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
  if (!width) throw new Error("Unsupported GLB component type");
  const read = { 5121: "readUInt8", 5123: "readUInt16LE", 5125: "readUInt32LE", 5126: "readFloatLE" }[accessor.componentType];
  const values = [], start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  for (let row = 0; row < accessor.count; row += 1) for (let component = 0; component < components; component += 1) {
    values.push(binary[read](start + row * (view.byteStride ?? width * components) + component * width));
  }
  return values;
}
const engine = new NullEngine(), scene = new Scene(engine);
scene.useRightHandedSystem = true;
const nodes = gltf.nodes.map(definition => {
  const node = definition.mesh === undefined ? new TransformNode(definition.name, scene) : new Mesh(definition.name, scene);
  if (definition.mesh !== undefined) {
    const positions = [], indices = [];
    for (const primitive of gltf.meshes[definition.mesh].primitives) {
      const offset = positions.length / 3, points = accessorValues(primitive.attributes.POSITION);
      positions.push(...points);
      indices.push(...(primitive.indices === undefined ? Array.from({ length: points.length / 3 }, (_, index) => index) : accessorValues(primitive.indices)).map(index => index + offset));
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
const byName = new Map(nodes.map(node => [node.name, node]));
const rig = bindAircraftRig(nodes, { scene, aircraftId: "f-35b", propellerBlades: 0 });
const authoredRest = new Map(nodes.map(node => [node.name, node.rotationQuaternion.clone()]));
const point = (node, local = Vector3.Zero()) => Vector3.TransformCoordinates(local, node.computeWorldMatrix(true));
const vertices = worldVertices;
const bounds = points => ({ min: [0, 1, 2].map(axis => Math.min(...points.map(p => p.asArray()[axis]))), max: [0, 1, 2].map(axis => Math.max(...points.map(p => p.asArray()[axis]))) });
// Independently measured numerical facts from the author's public setup. Never
// copy/distribute its copyright-reserved JSON or conceal meshes for this trial.
// GeoFS's column-major rotation helpers reverse its degree signs; root.model
// has no forceZup. Order is intrinsic X, then Y, then Z, after the asset rest.
function applyAuthorPose(physical) {
  const travel = 1 - physical, main = Math.min(1, travel / 0.8);
  const rotations = [
    ["leftGear", 120 * main, -50 * main, 35 * main],
    ["rightGear", 120 * main, 50 * main, -35 * main],
    ["noseGear", 110 * travel, 0, 0],
    ["leftPiston", -100 * main, 0, 0], ["rightPiston", -100 * main, 0, 0],
    ["nosePiston", -90 * travel, 0, 0],
  ];
  for (const [name, x, y, z] of rotations) {
    let q = authoredRest.get(name).clone();
    for (const [axis, degrees] of [[Vector3.Right(), x], [Vector3.Up(), y], [new Vector3(0, 0, 1), z]]) {
      q = q.multiply(Quaternion.RotationAxis(axis, degrees * Math.PI / 180));
    }
    byName.get(name).rotationQuaternion = q;
  }
}
const gearMeshNames = nodes.filter(node => /^(left|right|nose)(Gear|Suspension|Wheel|Piston|Strut[TB])$/.test(node.name)).map(node => node.name);
const result = {
  schemaVersion: 1, asset: path.relative(root, assetPath), assetSha256: createHash("sha256").update(bytes).digest("hex"),
  animationSha256: createHash("sha256").update(await readFile(animation)).digest("hex"),
  frame: "Standard exported glTF metres: +Y up, -Z nose. No loader yaw or stance offset.",
  scope: "Actual distributed vertex/index data and production bind/apply rig, all geometry visible. Vertical exterior skin-envelope classification is not a watertight containment guarantee and does not identify the internal bay cavity.",
  skinMeshNames: F35B_SKIN_NAMES,
  poseKind: authorPose ? "Exploratory original-author leg/piston angles; production door poses retained. No hide, contact compression or wheel roll." : "Current production rig",
  authorPoseSource: authorPose ? "https://www.geo-fs.com/models/aircraft/load.php?id=5229" : null,
  hierarchy: gearMeshNames.map(name => { const node = byName.get(name); return { name, parent: node.parent?.name, localPosition: node.position.asArray(), authoredRotation: node.rotationQuaternion.asArray(), localBounds: bounds(node.getVerticesData(VertexBuffer.PositionKind).reduce((points, value, index, all) => { if (index % 3 === 0) points.push(new Vector3(value, all[index + 1], all[index + 2])); return points; }, [])) }; }),
  poses: [],
};
try {
  for (const gearDownNorm of [1, 0.75, 0.5, 0.25, 0]) {
    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, gearDownNorm }, 0);
    if (authorPose) applyAuthorPose(gearDownNorm);
    const skin = buildSkinTriangles(byName);
    result.poses.push({ gearDownNorm, meshes: gearMeshNames.map(name => {
      const node = byName.get(name), points = vertices(node);
      const classification = classifySkinEnvelope(points, skin);
      return { name, center: point(node).asArray(), bounds: bounds(points), vertices: points.length, verticalEnvelope: classification };
    }) });
  }
  await writeFile(path.join(out, "geometry.json"), `${JSON.stringify(result, null, 2)}\n`);
  const summary = JSON.stringify({ output: out, fullyRetracted: result.poses.at(-1).meshes.filter(mesh => /Wheel$/.test(mesh.name)).map(mesh => ({ name: mesh.name, center: mesh.center, bounds: mesh.bounds, ...mesh.verticalEnvelope })) }, null, 2);
  await writeFile(path.join(out, "inspection.log"), `${summary}\n`);
  console.log(summary);
  if (checkStowed && result.poses.at(-1).meshes.some(mesh => hasEnvelopeViolation(mesh.verticalEnvelope))) {
    console.error("Selected-skin stow check FAILED: protrusion or inconclusive intersections remain. See geometry.json; invisibility does not affect this check.");
    process.exitCode = 1;
  }
} finally { scene.dispose(); engine.dispose(); }
