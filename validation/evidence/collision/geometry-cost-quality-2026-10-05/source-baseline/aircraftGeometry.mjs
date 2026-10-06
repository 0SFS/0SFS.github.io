/**
 * 0sfs aircraft collision validation input: bake the GLB's default pose into
 * glTF world coordinates (+X right, +Y up, +Z aft for our aircraft), in metres.
 * No renderer, textures, network request, or display LOD selection is involved.
 *
 * node scripts/validation/collision/aircraftGeometry.mjs --inspect model.glb
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newOutputDirectory } from "../../outputDirectory.mjs";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const COMPONENTS = {
  5121: { bytes: 1, read: (view, offset) => view.getUint8(offset) },
  5123: { bytes: 2, read: (view, offset) => view.getUint16(offset, true) },
  5125: { bytes: 4, read: (view, offset) => view.getUint32(offset, true) },
  5126: { bytes: 4, read: (view, offset) => view.getFloat32(offset, true) },
};

function fail(message) {
  throw new Error(`Aircraft GLB: ${message}`);
}

function indexOf(value, entries, label) {
  if (!Number.isInteger(value) || value < 0 || value >= entries.length) {
    fail(`${label} index is invalid`);
  }
  return entries[value];
}

function finiteArray(value, count, label) {
  if (!Array.isArray(value) || value.length !== count || !value.every(Number.isFinite)) {
    fail(`${label} must contain ${count} finite numbers`);
  }
  return value;
}

/** Column-major matrices, as stored by glTF. */
function multiply(a, b) {
  const result = Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) result[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
    }
  }
  return result;
}

function nodeMatrix(node, label) {
  if (node.matrix !== undefined) {
    if (node.translation || node.rotation || node.scale) fail(`${label} mixes matrix and TRS transforms`);
    const matrix = finiteArray(node.matrix, 16, `${label} matrix`);
    if (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) {
      fail(`${label} has a non-affine matrix`);
    }
    return matrix;
  }
  const [tx, ty, tz] = finiteArray(node.translation ?? [0, 0, 0], 3, `${label} translation`);
  const [sx, sy, sz] = finiteArray(node.scale ?? [1, 1, 1], 3, `${label} scale`);
  const [x, y, z, w] = finiteArray(node.rotation ?? [0, 0, 0, 1], 4, `${label} rotation`);
  if (Math.abs(x * x + y * y + z * z + w * w - 1) > 1e-5) {
    fail(`${label} rotation quaternion is not unit length`);
  }
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function determinant3(m) {
  return m[0] * (m[5] * m[10] - m[9] * m[6])
    - m[4] * (m[1] * m[10] - m[9] * m[2])
    + m[8] * (m[1] * m[6] - m[5] * m[2]);
}

function boundsOf(vertices) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], vertices[i + axis]);
      max[axis] = Math.max(max[axis], vertices[i + axis]);
    }
  }
  return { min, max, size: max.map((value, axis) => value - min[axis]) };
}

function parseGlb(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67) fail("input is not a GLB file");
  if (bytes.readUInt32LE(4) !== 2) fail("only GLB version 2 is supported");
  if (bytes.readUInt32LE(8) !== bytes.length) fail("declared GLB length differs from the file length");
  let json;
  let binary;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) fail("truncated GLB chunk header");
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (length % 4 !== 0 || start + length > bytes.length) fail("invalid GLB chunk length");
    if (type === 0x4e4f534a) {
      if (json !== undefined || offset !== 12) fail("JSON must be the first and only JSON chunk");
      try { json = JSON.parse(bytes.subarray(start, start + length).toString("utf8")); }
      catch { fail("invalid GLB JSON"); }
    } else if (type === 0x004e4942) {
      if (binary !== undefined) fail("multiple GLB BIN chunks are unsupported");
      binary = bytes.subarray(start, start + length);
    }
    offset = start + length;
  }
  if (!json || !binary) fail("both JSON and BIN chunks are required");
  if (json.asset?.version !== "2.0") fail("only glTF 2.0 is supported");
  if (json.buffers?.length !== 1 || json.buffers[0].uri) fail("only one embedded GLB buffer is supported");
  if (!Number.isInteger(json.buffers[0].byteLength) || json.buffers[0].byteLength < 0 || json.buffers[0].byteLength > binary.length) {
    fail("embedded buffer length is invalid");
  }
  const compression = (json.extensionsUsed ?? []).filter(name => [
    "KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_mesh_quantization",
  ].includes(name));
  if (compression.length) fail(`unsupported geometry encoding: ${compression.join(", ")}`);
  return { json, binary };
}

function readAccessor(gltf, binary, accessorIndex, kind) {
  const label = `${kind} accessor ${accessorIndex}`;
  const accessor = indexOf(accessorIndex, gltf.accessors ?? [], label);
  if (accessor.sparse) fail(`${label}: sparse accessors are unsupported`);
  if (accessor.normalized) fail(`${label}: normalized values are unsupported`);
  const channels = kind === "POSITION" ? 3 : 1;
  if (accessor.type !== (channels === 3 ? "VEC3" : "SCALAR")) fail(`${label}: unexpected accessor type`);
  if (kind === "POSITION" ? accessor.componentType !== 5126 : ![5121, 5123, 5125].includes(accessor.componentType)) {
    fail(`${label}: unsupported component type`);
  }
  if (!Number.isInteger(accessor.count) || accessor.count < 1) fail(`${label}: invalid count`);
  const bufferView = indexOf(accessor.bufferView, gltf.bufferViews ?? [], `${label} bufferView`);
  if (bufferView.buffer !== 0) fail(`${label}: external buffers are unsupported`);
  if (bufferView.extensions?.EXT_meshopt_compression) fail(`${label}: meshopt compression is unsupported`);
  const component = COMPONENTS[accessor.componentType];
  const itemBytes = channels * component.bytes;
  const stride = bufferView.byteStride ?? itemBytes;
  const relativeOffset = accessor.byteOffset ?? 0;
  const viewOffset = bufferView.byteOffset ?? 0;
  if (![relativeOffset, viewOffset, bufferView.byteLength, stride].every(Number.isInteger)
    || relativeOffset < 0 || viewOffset < 0 || bufferView.byteLength < 0
    || stride < itemBytes || stride % component.bytes !== 0) fail(`${label}: invalid buffer layout`);
  if (relativeOffset + (accessor.count - 1) * stride + itemBytes > bufferView.byteLength
    || viewOffset + bufferView.byteLength > binary.length) fail(`${label}: accessor exceeds its bufferView`);
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const values = [];
  for (let i = 0; i < accessor.count; i++) {
    for (let channel = 0; channel < channels; channel++) {
      const value = component.read(view, viewOffset + relativeOffset + i * stride + channel * component.bytes);
      if (!Number.isFinite(value)) fail(`${label}: non-finite vertex coordinate`);
      values.push(value);
    }
  }
  return values;
}

/**
 * Read rigid triangle geometry in the selected scene and the file's default
 * node pose. parts indices address each part's own vertices; top-level indices
 * address the merged vertices. Vertex duplication at material seams is retained.
 *
 * excludeNodeNames replaces the default exclusion list (Propeller_Disc). An
 * excluded node excludes its children too. Skins and morph targets require a
 * pose evaluator and are rejected rather than silently extracted incorrectly.
 */
export function readAircraftGlb(filePath, options = {}) {
  const bytes = readFileSync(filePath);
  const { json: gltf, binary } = parseGlb(bytes);
  const sceneIndex = options.sceneIndex ?? gltf.scene ?? 0;
  const scene = indexOf(sceneIndex, gltf.scenes ?? [], "scene");
  const excludedNames = options.excludeNodeNames ?? ["Propeller_Disc"];
  if (!Array.isArray(excludedNames) || !excludedNames.every(name => typeof name === "string")) {
    fail("excludeNodeNames must be an array of node names");
  }
  const exclude = new Set(excludedNames);
  const vertices = [];
  const indices = [];
  const parts = [];
  const visited = new Set();
  const excludedNodes = [];
  const includedNodes = [];

  function visit(nodeIndex, parentMatrix, parentExcluded) {
    if (visited.has(nodeIndex)) fail("scene contains a cycle or a node with multiple parents");
    visited.add(nodeIndex);
    const node = indexOf(nodeIndex, gltf.nodes ?? [], "node");
    const name = node.name ?? `node-${nodeIndex}`;
    if (node.skin !== undefined) fail(`node ${nodeIndex} (${name}): skinning is unsupported`);
    if (node.extensions?.EXT_mesh_gpu_instancing) fail(`node ${nodeIndex} (${name}): GPU instancing is unsupported`);
    const world = multiply(parentMatrix, nodeMatrix(node, `node ${nodeIndex} (${name})`));
    if (!world.every(Number.isFinite)) fail(`node ${nodeIndex} (${name}): non-finite world transform`);
    const excluded = parentExcluded || exclude.has(name);
    if (excluded) excludedNodes.push(name);
    if (node.mesh !== undefined) {
      const mesh = indexOf(node.mesh, gltf.meshes ?? [], `node ${nodeIndex} mesh`);
      const part = { name, vertices: [], indices: [] };
      const determinant = determinant3(world);
      if (Math.abs(determinant) < 1e-15) fail(`node ${nodeIndex} (${name}): singular transform`);
      for (const primitive of mesh.primitives ?? []) {
        if (primitive.targets?.length || mesh.weights?.length || node.weights?.length) fail(`${name}: morph targets are unsupported`);
        if (primitive.extensions?.KHR_draco_mesh_compression) fail(`${name}: Draco compression is unsupported`);
        if (primitive.mode !== undefined && primitive.mode !== 4) fail(`${name}: only triangle primitives are supported`);
        const sourceVertices = readAccessor(gltf, binary, primitive.attributes?.POSITION, "POSITION");
        const vertexCount = sourceVertices.length / 3;
        const sourceIndices = primitive.indices === undefined
          ? Array.from({ length: vertexCount }, (_, index) => index)
          : readAccessor(gltf, binary, primitive.indices, "indices");
        if (sourceIndices.length % 3 !== 0 || sourceIndices.some(index => index >= vertexCount)) {
          fail(`${name}: invalid triangle indices`);
        }
        if (excluded) continue;
        const baseVertex = part.vertices.length / 3;
        for (let i = 0; i < sourceVertices.length; i += 3) {
          const [x, y, z] = sourceVertices.slice(i, i + 3);
          part.vertices.push(
            world[0] * x + world[4] * y + world[8] * z + world[12],
            world[1] * x + world[5] * y + world[9] * z + world[13],
            world[2] * x + world[6] * y + world[10] * z + world[14],
          );
        }
        for (let i = 0; i < sourceIndices.length; i += 3) {
          const [a, b, c] = sourceIndices.slice(i, i + 3);
          part.indices.push(baseVertex + a, baseVertex + (determinant < 0 ? c : b), baseVertex + (determinant < 0 ? b : c));
        }
      }
      if (part.vertices.length) {
        const baseVertex = vertices.length / 3;
        for (const value of part.vertices) vertices.push(value);
        for (const index of part.indices) indices.push(baseVertex + index);
        parts.push(part);
        includedNodes.push(name);
      }
    }
    for (const child of node.children ?? []) visit(child, world, excluded);
  }

  for (const nodeIndex of scene.nodes ?? []) visit(nodeIndex, IDENTITY, false);
  if (!vertices.length) fail("selected scene has no included triangle geometry");
  return {
    vertices,
    indices,
    parts,
    metadata: {
      source: path.basename(filePath),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.length,
      sceneIndex,
      frame: "glTF world; metres; file-default node pose",
      sourceNodeCount: gltf.nodes?.length ?? 0,
      visitedNodeCount: visited.size,
      includedMeshNodeCount: parts.length,
      vertexCount: vertices.length / 3,
      triangleCount: indices.length / 3,
      includedNodes,
      excludedNodes,
      excludedNodeNames: excludedNames,
      bounds: boundsOf(vertices),
      parts: parts.map(part => ({ name: part.name, vertexCount: part.vertices.length / 3, triangleCount: part.indices.length / 3, bounds: boundsOf(part.vertices) })),
      extensionsUsed: gltf.extensionsUsed ?? [],
      pose: "Static asset pose; no control deflection or gear movement applied.",
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] !== "--inspect" || !args[1] || (args.length > 2 && (args[2] !== "--output" || !args[3] || args.length > 4))) {
    console.error("Usage: node aircraftGeometry.mjs --inspect model.glb [--output report.json]");
    process.exitCode = 1;
  } else {
    try {
      const result = readAircraftGlb(args[1]);
      const output = args[3] ?? path.join(newOutputDirectory("validation", "collision", "geometry"), "geometry.json");
      writeFileSync(output, `${JSON.stringify(result.metadata, null, 2)}\n`);
      console.log(JSON.stringify({ output, ...result.metadata }, null, 2));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
