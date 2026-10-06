import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Traces each aircraft family's top-view silhouette from its exterior glTF
 * model into JSBSim's structural frame, so the Fuel tab can draw the tanks
 * where the flight model puts them. Run it again after a model or its
 * alignment changes: `node scripts/build-aircraft-top-views.mjs`.
 *
 * Every exterior model's origin sits on the ground beneath its flight model's
 * CG, nose toward glTF -Z and right wing toward +X (see aircraftCatalog.ts).
 * Structural x runs aft and y to the right, in inches, so
 *   x = cg.x + z / 0.0254,  y = cg.y + x / 0.0254.
 */

const root = fileURLToPath(new URL("../", import.meta.url));
const OUTPUT = "src/flight/aircraft/generated/aircraftTopViews.ts";
const METERS_PER_INCH = 0.0254;
/** Raster cell, in inches: fine enough for a panel a few hundred pixels across. */
const CELL_IN = 1;
/** Largest distance a simplified edge may stray from the traced one, in inches. */
const SIMPLIFY_IN = 1.25;
/** Gaps between control surfaces and their wing up to twice this, in cells, close up. */
const CLOSE_CELLS = 4;

export const TOP_VIEW_SOURCES = [
  {
    familyId: "cessna-172",
    model: "public/aircraft/cessna-172/Cessna_172_LOD3.glb",
    fdm: "public/jsbsim-data/aircraft/c172p/c172p.xml",
    // Seen from above, the disc is the propeller's blur, not the aeroplane.
    skip: ["Propeller_Disc"],
  },
  {
    familyId: "cirrus-vision-jet",
    model: "public/aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_LOD3.glb",
    fdm: "public/jsbsim-data/aircraft/sf50/sf50.xml",
    skip: [],
  },
  {
    familyId: "f-35b",
    model: "public/aircraft/f-35b/F-35B_AF267.glb",
    fdm: "public/jsbsim-data/aircraft/F-35B-jsbsim/F-35B-jsbsim.xml",
    // The boarding ladder stands beside the parked aircraft.
    skip: ["ladder"],
    // Shown with the outline; public/aircraft/f-35b/NOTICE.md has the full credit.
    credit: "Outline traced from AF267's F-35B model, CC BY 4.0.",
  },
];

function readGlb(file) {
  const bytes = readFileSync(path.join(root, file));
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} is not a GLB file.`);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  const binStart = 20 + jsonLength + 8;
  const bin = bytes.subarray(binStart, binStart + bytes.readUInt32LE(20 + jsonLength));
  return { json, bin };
}

const COMPONENTS = { SCALAR: 1, VEC3: 3 };
const ARRAYS = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

function readAccessor({ json, bin }, index) {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  const Type = ARRAYS[accessor.componentType];
  const width = COMPONENTS[accessor.type];
  if (!Type || !width || accessor.sparse) throw new Error(`Unsupported accessor ${index}.`);
  const stride = (view.byteStride ?? 0) / Type.BYTES_PER_ELEMENT || width;
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const source = new Type(bin.buffer, bin.byteOffset + offset, (accessor.count - 1) * stride + width);
  const values = new Float64Array(accessor.count * width);
  for (let item = 0; item < accessor.count; item++) {
    for (let component = 0; component < width; component++) values[item * width + component] = source[item * stride + component];
  }
  return values;
}

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    }
  }
  return out;
}

function localMatrix(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

/** Every triangle of the scene, as [x, z] pairs in metres, skipping named subtrees. */
function projectedTriangles(glb, skip) {
  const triangles = [];
  const visit = (index, parent, skipped) => {
    const node = glb.json.nodes[index];
    const hidden = skipped || skip.some(prefix => (node.name ?? "").startsWith(prefix));
    const world = multiply(parent, localMatrix(node));
    if (node.mesh !== undefined && !hidden) {
      for (const primitive of glb.json.meshes[node.mesh].primitives) {
        if ((primitive.mode ?? 4) !== 4) continue;
        const positions = readAccessor(glb, primitive.attributes.POSITION);
        const count = positions.length / 3;
        const indices = primitive.indices === undefined
          ? Float64Array.from({ length: count }, (_, i) => i)
          : readAccessor(glb, primitive.indices);
        const point = i => {
          const [x, y, z] = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
          return [
            world[0] * x + world[4] * y + world[8] * z + world[12],
            world[2] * x + world[6] * y + world[10] * z + world[14],
          ];
        };
        for (let i = 0; i + 2 < indices.length; i += 3) {
          triangles.push([point(indices[i]), point(indices[i + 1]), point(indices[i + 2])]);
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world, hidden);
  };
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const index of glb.json.scenes[glb.json.scene ?? 0].nodes) visit(index, identity, false);
  return triangles;
}

function readCg(file) {
  const xml = readFileSync(path.join(root, file), "utf8");
  const match = /<location\s+name="CG"\s+unit="(\w+)"\s*>([\s\S]*?)<\/location>/.exec(xml);
  if (!match) throw new Error(`${file} has no CG location.`);
  const scale = { IN: 1, FT: 12, M: 1 / METERS_PER_INCH }[match[1]];
  if (!scale) throw new Error(`${file} gives its CG in ${match[1]}.`);
  const axis = name => Number(new RegExp(`<${name}>\\s*([-\\d.eE+]+)\\s*</${name}>`).exec(match[2])?.[1]) * scale;
  return { x: axis("x"), y: axis("y") };
}

/** Cells whose centres lie in any triangle, with every hole filled. */
function rasterize(triangles, bounds) {
  const width = Math.ceil((bounds.maxY - bounds.minY) / CELL_IN) + 2 * (CLOSE_CELLS + 1);
  const height = Math.ceil((bounds.maxX - bounds.minX) / CELL_IN) + 2 * (CLOSE_CELLS + 1);
  const originY = bounds.minY - (CLOSE_CELLS + 1) * CELL_IN;
  const originX = bounds.minX - (CLOSE_CELLS + 1) * CELL_IN;
  let mask = new Uint8Array(width * height);
  for (const triangle of triangles) {
    // Columns follow structural y and rows structural x.
    const points = triangle.map(([y, x]) => [(y - originY) / CELL_IN, (x - originX) / CELL_IN]);
    const area = (points[1][0] - points[0][0]) * (points[2][1] - points[0][1])
      - (points[2][0] - points[0][0]) * (points[1][1] - points[0][1]);
    if (Math.abs(area) < 1e-9) continue;
    const sign = Math.sign(area);
    const left = Math.max(0, Math.floor(Math.min(...points.map(p => p[0]))));
    const right = Math.min(width - 1, Math.ceil(Math.max(...points.map(p => p[0]))));
    const top = Math.max(0, Math.floor(Math.min(...points.map(p => p[1]))));
    const bottom = Math.min(height - 1, Math.ceil(Math.max(...points.map(p => p[1]))));
    for (let row = top; row <= bottom; row++) {
      for (let column = left; column <= right; column++) {
        const cx = column + 0.5;
        const cy = row + 0.5;
        let inside = true;
        for (let edge = 0; edge < 3 && inside; edge++) {
          const [ax, ay] = points[edge];
          const [bx, by] = points[(edge + 1) % 3];
          inside = sign * ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) >= 0;
        }
        if (inside) mask[row * width + column] = 1;
      }
    }
  }
  // Dilate then erode: a cell is set when any (dilate) or every (erode) cell around it is.
  const morph = (source, dilate) => {
    const out = new Uint8Array(source.length);
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        let any = false;
        let every = true;
        for (let dy = -CLOSE_CELLS; dy <= CLOSE_CELLS; dy++) {
          for (let dx = -CLOSE_CELLS; dx <= CLOSE_CELLS; dx++) {
            const r = row + dy;
            const c = column + dx;
            const set = r >= 0 && r < height && c >= 0 && c < width && source[r * width + c] === 1;
            any ||= set;
            every &&= set;
          }
        }
        out[row * width + column] = (dilate ? any : every) ? 1 : 0;
      }
    }
    return out;
  };
  mask = morph(morph(mask, true), false);
  // Flood the outside from the border; whatever it cannot reach is aircraft.
  const outside = new Uint8Array(mask.length);
  const queue = [0];
  outside[0] = 1;
  while (queue.length) {
    const cell = queue.pop();
    const row = Math.floor(cell / width);
    const column = cell % width;
    for (const [r, c] of [[row - 1, column], [row + 1, column], [row, column - 1], [row, column + 1]]) {
      if (r < 0 || r >= height || c < 0 || c >= width) continue;
      const next = r * width + c;
      if (outside[next] || mask[next]) continue;
      outside[next] = 1;
      queue.push(next);
    }
  }
  for (let cell = 0; cell < mask.length; cell++) mask[cell] = outside[cell] ? 0 : 1;
  return { mask, width, height, originX, originY };
}

/** Closed loops along the cell edges between aircraft and outside, aircraft on the left. */
function traceLoops({ mask, width, height }) {
  const filled = (row, column) => row >= 0 && row < height && column >= 0 && column < width && mask[row * width + column] === 1;
  const edges = new Map();
  const add = (from, to) => {
    const key = from.join(",");
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push(to);
  };
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      if (!filled(row, column)) continue;
      // Vertices are [column, row] corners; each edge keeps the cell on its left.
      if (!filled(row - 1, column)) add([column + 1, row], [column, row]);
      if (!filled(row + 1, column)) add([column, row + 1], [column + 1, row + 1]);
      if (!filled(row, column - 1)) add([column, row], [column, row + 1]);
      if (!filled(row, column + 1)) add([column + 1, row + 1], [column + 1, row]);
    }
  }
  const loops = [];
  for (const [startKey, targets] of edges) {
    while (targets.length) {
      const loop = [startKey.split(",").map(Number)];
      let previous = loop[0];
      let current = targets.pop();
      while (current.join(",") !== startKey) {
        loop.push(current);
        const options = edges.get(current.join(","));
        // At a corner two cells share, keep to the sharpest left turn so loops stay simple.
        const heading = [current[0] - previous[0], current[1] - previous[1]];
        options.sort((a, b) => turn(heading, current, b) - turn(heading, current, a));
        previous = current;
        current = options.pop();
      }
      loops.push(loop);
    }
  }
  return loops;
}

function turn([hx, hy], from, to) {
  return hx * (to[1] - from[1]) - hy * (to[0] - from[0]);
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const length = Math.hypot(bx - ax, by - ay);
  let farthest = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const distance = length === 0
      ? Math.hypot(px - ax, py - ay)
      : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length;
    if (distance > farthest) { farthest = distance; index = i; }
  }
  if (farthest <= tolerance) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    area += ax * by - bx * ay;
  }
  return area / 2;
}

export function traceTopView(source) {
  const cg = readCg(source.fdm);
  const triangles = projectedTriangles(readGlb(source.model), source.skip)
    .map(triangle => triangle.map(([x, z]) => [cg.y + x / METERS_PER_INCH, cg.x + z / METERS_PER_INCH]));
  const all = triangles.flat();
  const bounds = {
    minX: Math.min(...all.map(p => p[1])), maxX: Math.max(...all.map(p => p[1])),
    minY: Math.min(...all.map(p => p[0])), maxY: Math.max(...all.map(p => p[0])),
  };
  const raster = rasterize(triangles, bounds);
  const toStructure = ([column, row]) => [raster.originX + row * CELL_IN, raster.originY + column * CELL_IN];
  const outlines = traceLoops(raster)
    .map(loop => {
      // Split the closed loop at its farthest point so the simplifier keeps both ends.
      const start = loop.map(toStructure);
      const far = start.reduce((best, p, i) => Math.hypot(p[0] - start[0][0], p[1] - start[0][1])
        > Math.hypot(start[best][0] - start[0][0], start[best][1] - start[0][1]) ? i : best, 0);
      const first = simplify(start.slice(0, far + 1), SIMPLIFY_IN);
      const second = simplify([...start.slice(far), start[0]], SIMPLIFY_IN);
      return [...first.slice(0, -1), ...second.slice(0, -1)];
    })
    .filter(points => Math.abs(polygonArea(points)) > 4 * CELL_IN * CELL_IN);
  const round = value => Math.round(value * 10) / 10;
  const xs = outlines.flat().map(p => p[0]);
  const ys = outlines.flat().map(p => p[1]);
  return {
    // Path coordinates are [x aft, y right] in inches; the panel turns the nose up.
    outlines: outlines.map(points => points.map(([x, y]) => [round(x), round(y)])),
    bounds: { minX: round(Math.min(...xs)), maxX: round(Math.max(...xs)), minY: round(Math.min(...ys)), maxY: round(Math.max(...ys)) },
  };
}

/** The generated module's text, traced afresh from the models. */
export function renderTopViews(log = () => {}) {
  const entries = TOP_VIEW_SOURCES.map(source => {
    const view = traceTopView(source);
    const points = view.outlines.reduce((sum, outline) => sum + outline.length, 0);
    log(`${source.familyId}: ${view.outlines.length} outline(s), ${points} points, x ${view.bounds.minX}..${view.bounds.maxX} in, y ${view.bounds.minY}..${view.bounds.maxY} in`);
    const credit = source.credit ? `    credit: ${JSON.stringify(source.credit)},\n` : "";
    return `  ${JSON.stringify(source.familyId)}: {\n    model: ${JSON.stringify(source.model)},\n${credit}`
      + `    bounds: ${JSON.stringify(view.bounds)},\n`
      + `    outlines: [\n${view.outlines.map(outline => `      ${JSON.stringify(outline)},`).join("\n")}\n    ],\n  },`;
  });
  return "// Generated by scripts/build-aircraft-top-views.mjs; do not edit.\n"
    + "// Each family's exterior model seen from above, in JSBSim structural inches: [x aft, y right].\n"
    + "export const AIRCRAFT_TOP_VIEWS = {\n" + entries.join("\n") + "\n} as const;\n";
}

export const TOP_VIEWS_OUTPUT = path.join(root, OUTPUT);

function main() {
  writeFileSync(TOP_VIEWS_OUTPUT, renderTopViews(console.log));
  console.log(`Wrote ${OUTPUT}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
