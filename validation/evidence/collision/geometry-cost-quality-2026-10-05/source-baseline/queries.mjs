/** Aircraft collision experiment. CPU scene queries only; no rigid-body solver. */
import RAPIER from "../../../build/tools/collision/node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs";

export const identity = { x: 0, y: 0, z: 0, w: 1 };
const zero = { x: 0, y: 0, z: 0 };
export const vector = a => ({ x: a[0], y: a[1], z: a[2] });
export const quaternion = a => ({ x: a[0], y: a[1], z: a[2], w: a[3] });
export function rotate(q, a) {
  const tx = 2 * (q.y * a[2] - q.z * a[1]);
  const ty = 2 * (q.z * a[0] - q.x * a[2]);
  const tz = 2 * (q.x * a[1] - q.y * a[0]);
  return [a[0] + q.w * tx + q.y * tz - q.z * ty,
    a[1] + q.w * ty + q.z * tx - q.x * tz,
    a[2] + q.w * tz + q.x * ty - q.y * tx];
}
function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function randomRotation(random) {
  const a = random(), b = 2 * Math.PI * random(), c = 2 * Math.PI * random();
  return { x: Math.sqrt(1 - a) * Math.sin(b), y: Math.sqrt(1 - a) * Math.cos(b),
    z: Math.sqrt(a) * Math.sin(c), w: Math.sqrt(a) * Math.cos(c) };
}
function trianglePoint(mesh, random, areaCumulative) {
  const target = random() * areaCumulative.at(-1);
  let low = 0, high = areaCumulative.length - 1;
  while (low < high) { const middle = (low + high) >>> 1; if (areaCumulative[middle] < target) low = middle + 1; else high = middle; }
  const t = low * 3;
  const r = Math.sqrt(random()), b = random(), weights = [1 - r, r * (1 - b), r * b];
  return [0, 1, 2].map(axis => weights.reduce((sum, weight, i) =>
    sum + weight * mesh.vertices[mesh.indices[t + i] * 3 + axis], 0));
}

/** Fixed orientations during each cast; distances correspond to 120 Hz steps. */
export function makeScenarios(mesh, { count = 128, seed = 20261005 } = {}) {
  const random = rng(seed), scenarios = [];
  const bounds = mesh.metadata.bounds;
  const areaCumulative = []; let area = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const points = [0, 1, 2].map(i => mesh.vertices.slice(mesh.indices[t + i] * 3, mesh.indices[t + i] * 3 + 3));
    const a = points[1].map((v, i) => v - points[0][i]), b = points[2].map((v, i) => v - points[0][i]);
    area += Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) / 2;
    areaCumulative.push(area);
  }
  for (const workload of ["ground-dense", "pole", "corner", "wall", "far-miss"]) {
    const cases = [];
    for (let i = 0; i < count; i++) {
      const q = workload === "pole" ? identity : randomRotation(random);
      const distance = [0.005, 0.25, 1.5][i % 3];
      let position, velocity, expected = null;
      if (workload === "ground-dense" || workload === "far-miss") {
        let bottom = Infinity;
        for (let j = 0; j < mesh.vertices.length; j += 3) {
          bottom = Math.min(bottom, rotate(q, mesh.vertices.slice(j, j + 3))[1]);
        }
        // Include noncontacts and stationary overlap separately in the labels.
        const clearance = workload === "far-miss" ? 100 : distance * (i % 4 === 0 ? 1.2 : 0.5);
        position = [(random() - 0.5) * 8, -bottom + clearance, (random() - 0.5) * 8];
        velocity = [0, -distance, 0];
        expected = clearance <= distance ? clearance / distance : null;
      } else {
        // Half surface-targeted, half bounding-box-space probes. Sampling is
        // intentionally geometric, not an estimate of accident frequencies.
        const p = i % 2 === 0 ? trianglePoint(mesh, random, areaCumulative)
          : bounds.min.map((min, axis) => min + random() * bounds.size[axis]);
        const rotated = rotate(q, p);
        if (workload === "pole") velocity = [0, 0, distance];
        else if (workload === "wall") velocity = [distance, 0, 0];
        else {
          const azimuth = 2 * Math.PI * random(), y = 2 * random() - 1;
          const radial = Math.sqrt(1 - y * y);
          velocity = [Math.cos(azimuth) * radial * distance, y * distance, Math.sin(azimuth) * radial * distance];
        }
        position = rotated.map((v, axis) => -v - 0.5 * velocity[axis]);
      }
      cases.push({ position, rotation: q, velocity, distance, expected,
        sampling: i % 2 === 0 ? "area-weighted-surface" : "bbox", index: i });
    }
    scenarios.push({ id: workload, cases });
  }
  return scenarios;
}

/** First contacts are approached from outside the complete aircraft bounds. */
export function prepareContactWindows(mesh, scenarios) {
  const experiment = createExperiment(mesh, []);
  const enclosingDiameter = Math.hypot(...mesh.metadata.bounds.size);
  try {
    const outside = [];
    for (const scenario of scenarios.slice()) {
      if (["ground-dense", "far-miss"].includes(scenario.id) || scenario.id.endsWith("-outside")) continue;
      const outsideCases = [];
      for (const c of scenario.cases) {
        const direction = c.velocity.map(v => v / c.distance);
        const pathLength = enclosingDiameter * 2 + 2;
        const midpoint = c.position.map((p, axis) => p + c.velocity[axis] * 0.5);
        const long = { ...c, position: midpoint.map((p, axis) => p - direction[axis] * pathLength / 2),
          velocity: direction.map(v => v * pathLength) };
        const contact = experiment.cast({ kind: "exact" }, scenario.id, long);
        const traveled = contact === null ? pathLength / 2 : contact * pathLength - c.distance * 0.5;
        c.position = long.position.map((p, axis) => p + direction[axis] * traveled);
        c.longApproachDistanceMeters = pathLength;
        c.longApproachContactFraction = contact;
        outsideCases.push({ ...long, distance: pathLength, expected: null,
          sampling: c.sampling, outsideStart: true });
      }
      outside.push({ id: `${scenario.id}-outside`, cases: outsideCases });
    }
    scenarios.push(...outside);
  } finally { experiment.close(); }
  return scenarios;
}

function denseGround() {
  const vertices = [], indices = [], side = 128, scale = 64;
  for (let z = 0; z <= side; z++) for (let x = 0; x <= side; x++) {
    vertices.push((x / side - 0.5) * scale, 0, (z / side - 0.5) * scale);
  }
  for (let z = 0; z < side; z++) for (let x = 0; x < side; x++) {
    const a = z * (side + 1) + x, b = a + 1, c = a + side + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  return RAPIER.ColliderDesc.trimesh(new Float32Array(vertices), new Uint32Array(indices));
}
function shapeOf(s) {
  if (s.type === "hull") return new RAPIER.ConvexPolyhedron(new Float32Array(s.vertices.flat()),
    s.indices ? new Uint32Array(s.indices) : undefined);
  if (s.type === "box") return new RAPIER.Cuboid(...s.halfExtents);
  if (s.type === "sphere") return new RAPIER.Ball(s.radius);
  if (s.type === "capsule") return new RAPIER.Capsule(s.halfHeight, s.radius);
  throw new Error(`Unknown proxy type ${s.type}`);
}

export async function initialize() { await RAPIER.init(); return RAPIER.version(); }

export function createExperiment(mesh, candidates) {
  const world = new RAPIER.World(zero);
  const environments = new Map([
    ["ground-dense", world.createCollider(denseGround())],
    ["far-miss", world.createCollider(denseGround())],
    ["pole", world.createCollider(RAPIER.ColliderDesc.cuboid(0.04, 12, 0.04))],
    ["corner", world.createCollider(RAPIER.ColliderDesc.cuboid(0.075, 0.075, 0.075))],
    ["wall", world.createCollider(RAPIER.ColliderDesc.cuboid(0.05, 12, 12))],
  ]);
  const buildStarted = performance.now();
  const exact = world.createCollider(RAPIER.ColliderDesc.trimesh(
    new Float32Array(mesh.vertices), new Uint32Array(mesh.indices)));
  const exactBuildMs = performance.now() - buildStarted;
  const resident = new Map();
  const builds = [];
  for (const candidate of candidates) {
    if (candidate.kind === "points") continue;
    const started = performance.now();
    const shape = new RAPIER.Compound(candidate.shapes.map(shapeOf),
      candidate.shapes.map(s => vector(s.center ?? [0, 0, 0])),
      candidate.shapes.map(s => quaternion(s.rotation ?? [0, 0, 0, 1])));
    const collider = world.createCollider(new RAPIER.ColliderDesc(shape));
    resident.set(candidate.id, collider);
    builds.push({ id: candidate.id, residentBuildMs: performance.now() - started });
  }
  // Direct collider queries operate on resident native geometry, and need no
  // world.step or stale broad-phase update. We query exactly one terrain chunk.
  // All candidates get this same chunk selection; streaming selection is excluded.
  const ray = new RAPIER.Ray({ ...zero }, { ...zero });
  function cast(candidate, workload, c) {
    const environment = environments.get(workload.replace(/-outside$/, ""));
    if (candidate.kind === "points") {
      let nearest = Infinity;
      for (const p of candidate.points) {
        const transformed = rotate(c.rotation, p);
        ray.origin.x = c.position[0] + transformed[0];
        ray.origin.y = c.position[1] + transformed[1];
        ray.origin.z = c.position[2] + transformed[2];
        ray.dir.x = c.velocity[0]; ray.dir.y = c.velocity[1]; ray.dir.z = c.velocity[2];
        const hit = environment.castRayAndGetNormal(ray, 1, true);
        if (hit) nearest = Math.min(nearest, hit.timeOfImpact);
      }
      return Number.isFinite(nearest) ? nearest : null;
    }
    const collider = candidate.kind === "exact" ? exact : resident.get(candidate.id);
    collider.setTranslation(vector(c.position)); collider.setRotation(c.rotation);
    return collider.castCollider(vector(c.velocity), environment, zero, 0, 1, true)?.time_of_impact ?? null;
  }
  function reverseReference(workload, c) {
    const environment = environments.get(workload.replace(/-outside$/, ""));
    exact.setTranslation(vector(c.position)); exact.setRotation(c.rotation);
    return environment.castCollider(zero, exact, vector(c.velocity), 0, 1, true)?.time_of_impact ?? null;
  }
  return { cast, reverseReference, builds, exactBuildMs, close: () => world.free() };
}

export function quality(experiment, candidate, scenario, references, toleranceMeters = 0.002) {
  let missed = 0, extra = 0, late = 0, early = 0, hits = 0, initialOverlaps = 0, candidateInitialOverlaps = 0;
  const earlyErrors = [], lateErrors = [], outputs = [];
  scenario.cases.forEach((c, i) => {
    const expected = references[i], actual = experiment.cast(candidate, scenario.id, c);
    outputs.push(actual);
    if (actual === 0) candidateInitialOverlaps++;
    if (expected !== null) { hits++; if (expected === 0) initialOverlaps++; }
    if (actual === null && expected !== null) missed++;
    else if (actual !== null && expected === null) extra++;
    else if (actual !== null && expected !== null) {
      const error = (actual - expected) * c.distance;
      if (error > toleranceMeters) { late++; lateErrors.push(error); }
      if (error < -toleranceMeters) { early++; earlyErrors.push(-error); }
    }
  });
  const stat = values => {
    const sorted = values.slice().sort((a, b) => a - b);
    return { maxMeters: sorted.at(-1) ?? 0, p95Meters: sorted[Math.floor(sorted.length * 0.95)] ?? 0 };
  };
  return { cases: scenario.cases.length, referenceHits: hits, initialReferenceOverlaps: initialOverlaps, candidateInitialOverlaps,
    missedHits: missed, extraHits: extra, lateHits: late, earlyHits: early,
    earlyError: stat(earlyErrors), lateError: stat(lateErrors), outputs };
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function conditions(before, after) {
  const disturbed = [];
  if (!before || !after) return { disturbed, observed: false };
  const elapsed = (after.timeMs - before.timeMs) / 1000;
  const busyCores = before.cpuTotalMs.reduce((sum, total, i) => {
    const delta = after.cpuTotalMs[i] - total;
    return sum + (delta > 0 ? 1 - (after.cpuIdleMs[i] - before.cpuIdleMs[i]) / delta : 0);
  }, 0);
  if (after.secondsSinceInput !== null && after.secondsSinceInput < elapsed) disturbed.push("input");
  if (busyCores > 2.5) disturbed.push("load");
  const b = before.memory, a = after.memory;
  const memory = b && a ? { pressureBefore: b.pressure, pressureAfter: a.pressure,
    compressedMiB: (a.compressions - b.compressions) * a.pageBytes / 2 ** 20,
    swappedOutMiB: (a.swapouts - b.swapouts) * a.pageBytes / 2 ** 20 } : null;
  if (memory && (b.pressure !== 1 || a.pressure !== 1 || memory.compressedMiB > 16 || memory.swappedOutMiB > 0)) disturbed.push("memory");
  return { disturbed, observed: true, busyCores, elapsedSeconds: elapsed, memory };
}

/** Alternating order, varied cases, calibrated blocks. Block p95 is throughput. */
export async function runTiming(mesh, candidates, scenarios, { rounds = 11, minimumBlockMs = 20, machineState } = {}) {
  const experiment = createExperiment(mesh, candidates);
  const all = [{ id: "exact-triangles", kind: "exact", budget: mesh.indices.length / 3 }, ...candidates];
  const rows = [], checks = [];
  let checksum = 0;
  try {
    for (const scenario of scenarios) {
      const references = scenario.cases.map(c => {
        const exact = experiment.cast(all[0], scenario.id, c);
        if (c.expected !== null || scenario.id === "ground-dense" || scenario.id === "far-miss") {
          if ((exact === null) !== (c.expected === null)
            || exact !== null && Math.abs(exact - c.expected) * c.distance > 0.002) {
            throw new Error(`Exact plane reference disagrees: ${scenario.id}/${c.index}: ${exact} vs ${c.expected}`);
          }
        } else {
          const reversed = experiment.reverseReference(scenario.id, c);
          if ((exact === null) !== (reversed === null)
            || exact !== null && Math.abs(exact - reversed) * c.distance > 0.002) {
            throw new Error(`Reverse cast reference disagrees: ${scenario.id}/${c.index}: ${exact} vs ${reversed}`);
          }
        }
        return exact;
      });
      checks.push({ workload: scenario.id, cases: references.length, referenceChecksPassed: true,
        referenceKind: ["ground-dense", "far-miss"].includes(scenario.id) ? "analytic plane support" : "exact source triangles plus Rapier reverse-pair symmetry" });
      const local = all.map(candidate => ({ candidate, quality: quality(experiment, candidate, scenario, references), samples: [] }));
      function block(candidate, repetitions) {
        const started = performance.now();
        for (let repeat = 0; repeat < repetitions; repeat++) {
          for (const c of scenario.cases) checksum += experiment.cast(candidate, scenario.id, c) ?? 2;
        }
        return performance.now() - started;
      }
      for (const row of local) {
        block(row.candidate, 3);
        const elapsed = block(row.candidate, 1);
        row.repetitions = Math.min(1000, Math.max(1, Math.ceil(minimumBlockMs / Math.max(elapsed, 0.01))));
      }
      const roundConditions = [];
      for (let round = 0; round < rounds; round++) {
        for (let attempt = 0; attempt < 3; attempt++) {
          const before = machineState ? await machineState() : null;
          const order = (round + attempt) % 2 ? local.slice().reverse() : local;
          for (const row of order) row.samples.push(block(row.candidate, row.repetitions)
            / (row.repetitions * scenario.cases.length));
          await new Promise(resolve => setTimeout(resolve, 0));
          const after = machineState ? await machineState() : null;
          const status = conditions(before, after);
          roundConditions.push({ round, attempt, before, after, ...status });
          if (!status.disturbed.length) break;
        }
      }
      checks.at(-1).roundConditions = roundConditions;
      for (const row of local) {
        const acceptedIndices = roundConditions.flatMap((c, i) => c.disturbed.length ? [] : [i]);
        const accepted = acceptedIndices.map(i => row.samples[i]);
        rows.push({ workload: scenario.id, candidate: row.candidate.id,
        quality: row.quality, timing: { unit: "ms per complete aircraft/chunk query",
          state: "awake hot-cache repeated blocks; includes pose, bridge, all probes/compound traversal, nearest hit",
          samplesMs: row.samples, acceptedSampleIndices: acceptedIndices,
          cleanSampleCount: accepted.length, medianMs: percentile(accepted, 0.5),
          p95BlockAverageMs: percentile(accepted, 0.95), repetitions: row.repetitions } });
      }
      console.log(`aircraft-collision: ${mesh.id}/${scenario.id} complete (${local.length} candidates)`);
    }
    return { rows, checks, checksum, residentBuilds: experiment.builds, exactResidentBuildMs: experiment.exactBuildMs };
  } finally { experiment.close(); }
}
