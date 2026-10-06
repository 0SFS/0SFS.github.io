// Convert retained FlightGear AC3D geometry without Blender or a server.
// Defaults to dated build/ output; --install also updates the public artifact.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newOutputDirectory } from "./outputDirectory.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, "planes/Lockheed_Martin_F-35B/tests/flightgear-external-tanks");
const output = newOutputDirectory("validation", "external-tank-model");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const files = Object.fromEntries(["Tank.ac", "Tank.png", "pylons.ac"].map(name => [name, readFileSync(path.join(source, name))]));

function acObject(bytes, name) {
  const parts = bytes.toString("utf8").replaceAll("\r", "").split("OBJECT poly\n");
  const text = parts.find(part => part.startsWith(`name "${name}"\n`));
  if (!text) throw new Error(`Missing AC3D object ${name}`);
  const lines = text.split("\n");
  const location = (lines.find(line => line.startsWith("loc ")) ?? "loc 0 0 0").split(/\s+/).slice(1).map(Number);
  const first = lines.findIndex(line => line.startsWith("numvert "));
  const count = Number(lines[first].split(" ")[1]);
  const vertices = lines.slice(first + 1, first + 1 + count).map(line => line.trim().split(/\s+/).map(Number));
  const surfaces = [];
  for (let i = first + count + 1; i < lines.length; i++) {
    if (!lines[i].startsWith("refs ")) continue;
    const n = Number(lines[i].split(" ")[1]);
    surfaces.push(lines.slice(i + 1, i + 1 + n).map(line => line.trim().split(/\s+/).map(Number)));
    i += n;
  }
  return { vertices, surfaces, location };
}

const document = {
  asset: { version: "2.0", generator: "0sfs build-external-tank-model.mjs", copyright: "FlightGear F-35B package contributors; GPL-3.0" },
  scene: 0, scenes: [{ nodes: [0, 1] }], nodes: [], meshes: [],
  materials: [
    { name: "FlightGear tank", pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.7 } },
    { name: "FlightGear pylon", pbrMetallicRoughness: { baseColorFactor: [0.533333, 0.533333, 0.533333, 1], metallicFactor: 0, roughnessFactor: 0.7 } },
  ],
  textures: [{ source: 0 }], images: [], accessors: [], bufferViews: [], buffers: [],
};
const chunks = [];
let byteLength = 0;
function bufferView(bytes, target) {
  const padding = (4 - byteLength % 4) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding; }
  const index = document.bufferViews.length;
  document.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, ...(target ? { target } : {}) });
  chunks.push(bytes); byteLength += bytes.length;
  return index;
}
function accessor(values, components, type, bounds = false) {
  const data = Buffer.alloc(values.length * 4);
  values.forEach((value, i) => data.writeFloatLE(value, i * 4));
  const index = document.accessors.length;
  const entry = { bufferView: bufferView(data, 34962), componentType: 5126, count: values.length / components, type };
  if (bounds) {
    entry.min = Array.from({ length: components }, (_, axis) => Math.min(...values.filter((_, i) => i % components === axis)));
    entry.max = Array.from({ length: components }, (_, axis) => Math.max(...values.filter((_, i) => i % components === axis)));
  }
  document.accessors.push(entry);
  return index;
}
const reports = [];
for (const [name, bytes, sourceName, offset, material] of [
  ["Tank", files["Tank.ac"], "Tank", [0, 0, 0], 0],
  // FlightGear's tank offset is (aft 1.25, right 3.25, up -0.3) m;
  // AC3D axes are aft,up,left. Station3 is its matching inner pylon.
  ["Pylon", files["pylons.ac"], "Station3", [-1.25, 0.3, -3.25], 1],
]) {
  const object = acObject(bytes, sourceName);
  const vertices = object.vertices.map(vertex => {
    const p = vertex.map((value, axis) => value + object.location[axis] + offset[axis]);
    return [p[2], p[1], -p[0]]; // Aircraft local frame: left,up,forward.
  });
  const triangles = object.surfaces.flatMap(surface => Array.from({ length: Math.max(0, surface.length - 2) }, (_, i) => [surface[0], surface[i + 1], surface[i + 2]]));
  const smooth = vertices.map(() => [0, 0, 0]);
  for (const triangle of triangles) {
    const [a, b, c] = triangle.map(([i]) => vertices[i]);
    const u = b.map((v, i) => v - a[i]), v = c.map((v, i) => v - a[i]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const [index] of triangle) normal.forEach((value, axis) => { smooth[index][axis] += value; });
  }
  const positions = [], normals = [], uvs = [];
  for (const triangle of triangles) for (const [index, u, v] of triangle) {
    positions.push(...vertices[index]);
    const length = Math.hypot(...smooth[index]) || 1;
    normals.push(...smooth[index].map(value => value / length));
    uvs.push(u, 1 - v);
  }
  const position = accessor(positions, 3, "VEC3", true);
  document.meshes.push({ name, primitives: [{ attributes: { POSITION: position, NORMAL: accessor(normals, 3, "VEC3"), TEXCOORD_0: accessor(uvs, 2, "VEC2") }, material }] });
  document.nodes.push({ name, mesh: document.meshes.length - 1 });
  reports.push({ name, sourceObject: sourceName, sourceVertices: vertices.length, triangles: triangles.length, bounds: { min: document.accessors[position].min, max: document.accessors[position].max } });
}
document.images.push({ name: "Tank.png", bufferView: bufferView(files["Tank.png"]), mimeType: "image/png" });
document.buffers.push({ byteLength });
const json = Buffer.from(JSON.stringify(document));
const jsonPadded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
const binary = Buffer.concat([...chunks, Buffer.alloc((4 - byteLength % 4) % 4)]);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonPadded.length + binary.length, 8);
const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(jsonPadded.length); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binaryHeader = Buffer.alloc(8); binaryHeader.writeUInt32LE(binary.length); binaryHeader.writeUInt32LE(0x004e4942, 4);
const glb = Buffer.concat([header, jsonHeader, jsonPadded, binaryHeader, binary]);
const provenance = {
  schema: 1, sourceArchiveSha256: "caf3c591c838148ccdeec8fc61a23fd09f17574aeb36e0071e84a132dd25ebd6",
  sourceUrl: "https://fgaddon.b-cdn.net/Aircraft-trunk/F-35B.zip", sourceRevision: 15340,
  license: "GPL-3.0", generator: "scripts/build-external-tank-model.mjs",
  sourceFiles: Object.entries(files).map(([name, bytes]) => ({ path: path.relative(root, path.join(source, name)), bytes: bytes.length, sha256: hash(bytes) })),
  export: { path: "public/aircraft/f-35b/ExternalTank_FlightGear.glb", bytes: glb.length, sha256: hash(glb) },
  frame: "metres, +X left, +Y up, +Z forward; tank source origin approximately at its geometric centre",
  modifications: ["Triangulated source polygons, generated area-weighted vertex normals and converted axes and texture V convention.", "Retained source tank geometry and texture; extracted inner pylon Station3 and moved it relative to the tank using source payload offsets.", "Runtime mounts copies at the declared development store locations; no certification or measured aerodynamic properties are asserted."],
  meshes: reports,
};
writeFileSync(path.join(output, "ExternalTank_FlightGear.glb"), glb);
writeFileSync(path.join(output, "ExternalTank_FlightGear.provenance.json"), JSON.stringify(provenance, null, 2) + "\n");
if (process.argv.includes("--install")) {
  const destination = path.join(root, "public/aircraft/f-35b"); mkdirSync(destination, { recursive: true });
  for (const file of ["ExternalTank_FlightGear.glb", "ExternalTank_FlightGear.provenance.json"]) copyFileSync(path.join(output, file), path.join(destination, file));
}
console.log(JSON.stringify({ output, ...provenance.export, meshes: reports }, null, 2));
