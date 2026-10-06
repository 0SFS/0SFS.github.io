/**
 * Aircraft-only benchmark proxies. Each partition owns whole source triangles;
 * every shape encloses all corners assigned to it. This certifies surface
 * coverage, not filled-solid containment or rotational continuous collision.
 * Hull vertices are flat local xyz coordinates; transforms use xyzw quaternions.
 */
import { performance } from "node:perf_hooks";
import quickHull from "../../../build/tools/collision/node_modules/quickhull3d/dist/quickhull3d.js";

const IDENTITY = [0, 0, 0, 1];
const PAD = 0.00001;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => a.map((value, axis) => value - b[axis]);
const add = (a, b) => a.map((value, axis) => value + b[axis]);
const scale = (a, factor) => a.map(value => value * factor);
const norm = a => Math.hypot(...a);
const unit = a => scale(a, 1 / norm(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const maximum = (values, floor = -Infinity) => values.reduce((best, value) => Math.max(best, value), floor);
const minimum = values => values.reduce((best, value) => Math.min(best, value), Infinity);

function bounds(points) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], point[axis]);
    max[axis] = Math.max(max[axis], point[axis]);
  }
  return { min, max, center: scale(add(min, max), 0.5), size: sub(max, min) };
}

function centroid(points) {
  const sum = [0, 0, 0];
  for (const point of points) for (let axis = 0; axis < 3; axis++) sum[axis] += point[axis];
  return scale(sum, 1 / points.length);
}

function quaternion(axes) {
  const m = Array.from({ length: 3 }, (_, row) => axes.map(axis => axis[row]));
  const trace = m[0][0] + m[1][1] + m[2][2];
  let q;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4];
  } else {
    const i = [0, 1, 2].reduce((best, axis) => m[axis][axis] > m[best][best] ? axis : best, 0);
    const j = (i + 1) % 3, k = (i + 2) % 3;
    const s = Math.sqrt(1 + m[i][i] - m[j][j] - m[k][k]) * 2;
    q = [0, 0, 0, (m[k][j] - m[j][k]) / s];
    q[i] = s / 4;
    q[j] = (m[j][i] + m[i][j]) / s;
    q[k] = (m[k][i] + m[i][k]) / s;
  }
  return scale(q, 1 / Math.hypot(...q));
}

/** Jacobi eigensolver for a symmetric 3x3 covariance; no model semantics. */
function principalAxes(points) {
  const mean = centroid(points);
  const a = Array.from({ length: 3 }, () => [0, 0, 0]);
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (const point of points) {
    const d = sub(point, mean);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) a[row][col] += d[row] * d[col];
  }
  for (let iteration = 0; iteration < 32; iteration++) {
    let p = 0, q = 1;
    for (const [row, col] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[row][col]) > Math.abs(a[p][q])) { p = row; q = col; }
    }
    if (Math.abs(a[p][q]) <= 1e-14 * Math.max(1, Math.abs(a[0][0]) + Math.abs(a[1][1]) + Math.abs(a[2][2]))) break;
    const angle = Math.atan2(2 * a[p][q], a[q][q] - a[p][p]) / 2;
    const c = Math.cos(angle), s = Math.sin(angle), pp = a[p][p], qq = a[q][q], pq = a[p][q];
    a[p][p] = c * c * pp - 2 * s * c * pq + s * s * qq;
    a[q][q] = s * s * pp + 2 * s * c * pq + c * c * qq;
    a[p][q] = a[q][p] = 0;
    for (let k = 0; k < 3; k++) {
      if (k !== p && k !== q) {
        const kp = a[k][p], kq = a[k][q];
        a[k][p] = a[p][k] = c * kp - s * kq;
        a[k][q] = a[q][k] = s * kp + c * kq;
      }
      const vp = v[k][p], vq = v[k][q];
      v[k][p] = c * vp - s * vq;
      v[k][q] = s * vp + c * vq;
    }
  }
  const axes = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]).map(i => unit(v.map(row => row[i])));
  for (let i = 0; i < 2; i++) {
    const major = [0, 1, 2].reduce((best, axis) => Math.abs(axes[i][axis]) > Math.abs(axes[i][best]) ? axis : best, 0);
    if (axes[i][major] < 0) axes[i] = scale(axes[i], -1);
  }
  axes[2] = unit(cross(axes[0], axes[1]));
  return axes;
}

function fitBox(points, axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
  const local = points.map(point => axes.map(axis => dot(point, axis)));
  const box = bounds(local);
  const center = axes.reduce((sum, axis, i) => add(sum, scale(axis, box.center[i])), [0, 0, 0]);
  const halfExtents = box.size.map(size => Math.max(size / 2, PAD));
  const violation = maximum(local.flatMap(point => point.map((value, axis) => Math.abs(value - box.center[axis]) - halfExtents[axis])), 0);
  return { shape: { type: "box", center, halfExtents, rotation: quaternion(axes) }, violation };
}

function fitHull(points) {
  if (points.length < 4) return { ...fitBox(points), fallback: true };
  let faces;
  try { faces = quickHull(points); }
  catch { return { ...fitBox(points), fallback: true }; }
  const selected = [...new Set(faces.flat())].sort((a, b) => a - b);
  const center = centroid(selected.map(index => points[index]));
  const vertexIndices = new Map(selected.map((sourceIndex, localIndex) => [sourceIndex, localIndex]));
  const indices = [];
  let volume = 0, violation = 0;
  for (const face of faces) {
    const a = sub(points[face[0]], center), b = sub(points[face[1]], center), c = sub(points[face[2]], center);
    volume += dot(a, cross(b, c)) / 6;
    let normal = cross(sub(b, a), sub(c, a));
    const size = norm(normal);
    if (size === 0) continue;
    const outward = dot(normal, a) >= 0;
    indices.push(vertexIndices.get(face[0]), vertexIndices.get(face[outward ? 1 : 2]), vertexIndices.get(face[outward ? 2 : 1]));
    normal = scale(normal, (dot(normal, a) < 0 ? -1 : 1) / size);
    for (const point of points) violation = Math.max(violation, dot(normal, sub(sub(point, center), a)));
  }
  // Rapier convex hulls need volume. Degenerate leaves keep enclosing boxes.
  if (Math.abs(volume) < PAD ** 3) return { ...fitBox(points), fallback: true };
  if (violation > PAD) throw new Error(`QuickHull failed source enclosure by ${violation} m`);
  return { shape: { type: "hull", center, vertices: selected.flatMap(index => sub(points[index], center)), indices, rotation: [...IDENTITY] }, violation, fallback: false };
}

function fitSphere(points) {
  const farthest = from => points.reduce((best, point) => norm(sub(point, from)) > norm(sub(best, from)) ? point : best, points[0]);
  const a = farthest(points[0]), b = farthest(a);
  let center = scale(add(a, b), 0.5), radius = norm(sub(a, b)) / 2;
  for (const point of points) {
    const delta = sub(point, center), distance = norm(delta);
    if (distance > radius) {
      const nextRadius = (distance + radius) / 2;
      center = add(center, scale(delta, (nextRadius - radius) / distance));
      radius = nextRadius;
    }
  }
  radius = Math.max(radius, PAD);
  const violation = maximum(points.map(point => norm(sub(point, center)) - radius), 0);
  radius += violation; // Roundoff-sized correction retains strict containment.
  return { shape: { type: "sphere", center, radius, rotation: [...IDENTITY] }, violation: 0 };
}

function fitCapsule(points, axes) {
  const direction = axes[0], mean = centroid(points);
  const projected = points.map(point => dot(sub(point, mean), direction));
  const middle = (minimum(projected) + maximum(projected)) / 2;
  const center = add(mean, scale(direction, middle));
  const local = points.map(point => {
    const delta = sub(point, center), along = dot(delta, direction);
    return { along, radial: norm(sub(delta, scale(direction, along))) };
  });
  const radius = maximum(local.map(point => point.radial), PAD);
  const halfHeight = maximum(local.map(point => Math.abs(point.along) - Math.sqrt(Math.max(0, radius * radius - point.radial * point.radial))), 0);
  const rotation = direction[1] < -0.999999999 ? [1, 0, 0, 0] : unit([direction[2], 0, -direction[0], 1 + direction[1]]);
  const violation = maximum(local.map(point => Math.hypot(point.radial, Math.max(0, Math.abs(point.along) - halfHeight)) - radius), 0);
  return { shape: { type: "capsule", center, radius: radius + violation, halfHeight, rotation }, violation: 0 };
}

function buildPartitions(points, triangles, budgets) {
  const started = performance.now();
  const triangleCenters = triangles.map(triangle => scale(triangle.reduce((sum, index) => add(sum, points[index]), [0, 0, 0]), 1 / 3));
  let nextId = 1;
  const clusters = [{ id: 0, triangles: triangles.map((_, index) => index) }];
  const snapshots = new Map();
  for (const budget of budgets) {
    while (clusters.length < budget) {
      const splittable = clusters.filter(cluster => cluster.triangles.length > 1).sort((a, b) => b.triangles.length - a.triangles.length || a.id - b.id);
      if (!splittable.length) break;
      const cluster = splittable[0];
      const span = bounds(cluster.triangles.map(index => triangleCenters[index])).size;
      const axis = [0, 1, 2].reduce((best, i) => span[i] > span[best] ? i : best, 0);
      const ranked = cluster.triangles.slice().sort((a, b) => triangleCenters[a][axis] - triangleCenters[b][axis] || a - b);
      const middle = Math.floor(ranked.length / 2);
      clusters.splice(clusters.indexOf(cluster), 1,
        { id: nextId++, triangles: ranked.slice(0, middle) },
        { id: nextId++, triangles: ranked.slice(middle) });
    }
    for (const cluster of clusters) {
      if (!cluster.points) cluster.points = [...new Set(cluster.triangles.flatMap(index => triangles[index]))].sort((a, b) => a - b).map(index => points[index]);
    }
    snapshots.set(budget, { clusters: clusters.slice().sort((a, b) => a.id - b.id), generationMs: performance.now() - started });
  }
  return snapshots;
}

function directions(count) {
  const result = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const samples = count - result.length, goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < samples; i++) {
    const y = 1 - 2 * (i + 0.5) / samples, radius = Math.sqrt(Math.max(0, 1 - y * y));
    result.push([Math.cos(i * goldenAngle) * radius, y, Math.sin(i * goldenAngle) * radius]);
  }
  return result;
}

function rankedPointCandidates(points, budgets, directionCount) {
  const started = performance.now();
  let faces, fallback = false;
  try { faces = quickHull(points); }
  catch { fallback = true; }
  const hull = faces ? [...new Set(faces.flat())].sort((a, b) => a - b).map(index => points[index]) : points;
  const dirs = directions(directionCount);
  const supportIndices = dirs.map(direction => hull.reduce((best, point, index) => dot(point, direction) > dot(hull[best], direction) ? index : best, 0));
  const support = dirs.map((direction, index) => dot(hull[supportIndices[index]], direction));
  const activeSupport = dirs.map(() => -Infinity), selected = [], snapshots = new Map();
  const requested = new Set(budgets.map(budget => Math.min(budget, hull.length)));
  const seeds = [...new Set(supportIndices.slice(0, 6))];
  const maximumCount = Math.min(maximum(budgets), hull.length);
  while (selected.length < maximumCount) {
    let next;
    if (seeds.length) next = seeds.shift();
    else {
      const worst = dirs.reduce((best, _, index) => support[index] - activeSupport[index] > support[best] - activeSupport[best] ? index : best, 0);
      next = supportIndices[worst];
      // Exhausted sampled support directions do not imply every hull vertex is selected.
      if (selected.includes(next)) next = hull.findIndex((_, index) => !selected.includes(index));
    }
    selected.push(next);
    for (let i = 0; i < dirs.length; i++) activeSupport[i] = Math.max(activeSupport[i], dot(hull[next], dirs[i]));
    if (requested.has(selected.length)) snapshots.set(selected.length, {
      points: selected.map(index => [...hull[index]]),
      gap: maximum(support.map((value, index) => value - activeSupport[index]), 0),
      generationMs: performance.now() - started,
    });
  }
  return budgets.map(budget => {
    const actual = Math.min(budget, hull.length), snapshot = snapshots.get(actual);
    return { id: `points-${budget}`, kind: "points", budget, points: snapshot.points, metadata: {
      generationMs: snapshot.generationMs, requestedBudget: budget, actualBudget: actual,
      shapeCount: 0, pointCount: actual, totalVertices: actual, geometryBytes: actual * 12,
      flatPlaneGapSampledMeters: snapshot.gap, sampledDirectionCount: dirs.length, globalHullVertexCount: hull.length,
      globalHullCandidateFallback: fallback,
      errorGuarantee: "Sampled unit-direction support gap; lower bound on worst flat-plane penetration, no obstacle-coverage guarantee.",
      algorithm: "Six axial extrema, then hull support vertex in direction of greatest sampled support gap; deterministic ties.",
    } };
  });
}

function cleanBudgets(values, label) {
  if (!Array.isArray(values) || !values.length || !values.every(value => Number.isInteger(value) && value > 0)) throw new Error(`${label} must be positive integer budgets`);
  return [...new Set(values)].sort((a, b) => a - b);
}

export function generateProxies(mesh, options = {}) {
  const started = performance.now();
  const budgets = cleanBudgets(options.budgets ?? [1, 4, 8, 16, 32, 64], "budgets");
  const pointBudgets = cleanBudgets(options.pointBudgets ?? [6, 12, 24, 48, 96], "pointBudgets");
  const directionCount = options.directionCount ?? 2048;
  if (!Number.isInteger(directionCount) || directionCount < 6) throw new Error("directionCount must be an integer of at least six");
  if (!mesh.vertices?.length || mesh.vertices.length % 3 || !Array.from(mesh.vertices).every(Number.isFinite)
    || !mesh.indices?.length || mesh.indices.length % 3) throw new Error("Mesh requires finite flat xyz vertices and triangle indices");
  const points = [], canonical = new Map(), remap = [];
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    const point = Array.from(mesh.vertices.slice(i, i + 3)), key = point.join(",");
    if (!canonical.has(key)) { canonical.set(key, points.length); points.push(point); }
    remap.push(canonical.get(key));
  }
  const triangles = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const triangle = Array.from(mesh.indices.slice(i, i + 3));
    if (triangle.some(index => !Number.isInteger(index) || index < 0 || index >= remap.length)) throw new Error("Mesh contains invalid triangle indices");
    triangles.push(triangle.map(index => remap[index]));
  }
  const preprocessingMs = performance.now() - started;
  const referenced = [...new Set(triangles.flat())].sort((a, b) => a - b).map(index => points[index]);
  const candidates = rankedPointCandidates(referenced, pointBudgets, directionCount);
  for (const candidate of candidates) {
    candidate.metadata.preprocessingMs = preprocessingMs;
    candidate.metadata.generationMs += preprocessingMs;
  }
  const snapshots = buildPartitions(points, triangles, budgets);
  const fitted = new Map();
  for (const budget of budgets) {
    const snapshot = snapshots.get(budget);
    for (const family of ["hulls", "aabb", "obb", "spheres", "capsules"]) {
      let fitMs = 0, violation = 0, fallbacks = 0;
      const shapes = snapshot.clusters.map(cluster => {
        const key = `${family}-${cluster.id}`;
        if (!fitted.has(key)) {
          const began = performance.now();
          const axes = ["obb", "capsules"].includes(family) ? principalAxes(cluster.points) : undefined;
          const result = family === "hulls" ? fitHull(cluster.points)
            : family === "spheres" ? fitSphere(cluster.points)
              : family === "capsules" ? fitCapsule(cluster.points, axes) : fitBox(cluster.points, axes);
          fitted.set(key, { ...result, fitMs: performance.now() - began });
        }
        const fit = fitted.get(key);
        fitMs += fit.fitMs;
        violation = Math.max(violation, fit.violation);
        fallbacks += Number(fit.fallback ?? false);
        return fit.shape;
      });
      const totalVertices = shapes.reduce((sum, shape) => sum + (shape.type === "hull" ? shape.vertices.length / 3 : shape.type === "box" ? 8 : 0), 0);
      const geometryBytes = shapes.reduce((sum, shape) => sum + 28 + (shape.type === "hull" ? (shape.vertices.length + shape.indices.length) * 4 : shape.type === "box" ? 12 : shape.type === "capsule" ? 8 : 4), 0);
      if (violation > PAD) throw new Error(`${family} failed source enclosure by ${violation} m`);
      candidates.push({ id: `${family}-${budget}`, kind: "shapes", budget, shapes, metadata: {
        generationMs: preprocessingMs + snapshot.generationMs + fitMs,
        sharedPartitionMs: snapshot.generationMs, shapeFitMs: fitMs, requestedBudget: budget, actualBudget: shapes.length,
        shapeCount: shapes.length, totalVertices, geometryBytes, geometryBytesMeaning: "Float32 parameters/transforms and Uint32 hull triangle indices; excludes JS objects and backend acceleration structures.",
        maximumSourceVertexEnclosureViolationMeters: violation, sourceSurfaceCovered: true, degenerateHullFallbacks: fallbacks,
        degenerateThicknessMeters: PAD * 2,
        algorithm: "Largest triangle-count cluster; median centroid split on longest centroid span; identical complete partition for each shape family.",
        coverageGuarantee: "Every whole source triangle belongs to an enclosing convex shape. Filled interior and angular sweep are not certified.",
      } });
    }
  }
  return { candidates, metadata: {
    generator: "aircraft triangle partition and sampled support benchmark v1",
    inputMetadata: mesh.metadata, uniqueVertexCount: points.length, referencedVertexCount: referenced.length, sourceTriangleCount: triangles.length,
    budgets, pointBudgets, directionCount, preprocessingMs, totalGenerationMs: performance.now() - started,
    hullLibrary: "quickhull3d 3.1.2; provided bundled ESM export", numericPaddingMeters: PAD,
  } };
}
