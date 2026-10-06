import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newOutputDirectory } from "./outputDirectory.mjs";
import { encodeRgbaPng } from "./exhaustOptics/bake.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
export function generateEngineSmokeSprite() {
  const tile = 32, columns = 4, rows = 4, width = tile * columns, height = tile * rows;
  const rgba = new Uint8Array(width * height * 4);
  // A deterministic, offline soft alpha cloud: sixteen evolving silhouettes.
  // There is no runtime noise evaluation, spectral model or downloaded imagery.
  for (let frame = 0; frame < columns * rows; frame++) {
    const age = frame / (columns * rows - 1);
    for (let y = 0; y < tile; y++) for (let x = 0; x < tile; x++) {
      const px = (x + 0.5) / tile * 2 - 1, py = (y + 0.5) / tile * 2 - 1;
      const radius2 = px * px + py * py;
      let density = 0;
      for (let lobe = 0; lobe < 5; lobe++) {
        const angle = lobe * 2.3999632297 + age * 0.8;
        const offset = lobe === 0 ? 0 : 0.18 + 0.12 * age;
        const dx = px - Math.cos(angle) * offset, dy = py - Math.sin(angle) * offset;
        density += Math.exp(-(dx * dx + dy * dy) * (5 + lobe * 0.7)) / 5;
      }
      const edge = Math.max(0, 1 - radius2);
      const alpha = Math.min(1, density * edge * edge * 1.8);
      const index = ((Math.floor(frame / columns) * tile + y) * width + frame % columns * tile + x) * 4;
      rgba.set([255, 255, 255, Math.round(alpha * 255)], index);
    }
  }
  const png = encodeRgbaPng(width, height, rgba);
  const manifest = {
    schemaVersion: 1, id: "faint-aircraft-aerosol-v1", assetLicense: "AGPL-3.0-only",
    method: "Original deterministic procedural alpha flipbook; 16 frames, one sample per covered fragment.",
    orientation: "PNG first/top row is frame 0; invertY=false, no mipmaps, clamp, bilinear. Texel-centred tile UVs prevent bleed.",
    assumptions: ["Uncalibrated faint aircraft aerosol appearance, not a measured F135 soot rate or contrail.",
      "Radius growth and ambient-frame drift are artistic transport; no wind, buoyancy, chemistry or CFD.",
      "Alpha blending and screen coverage affect cost. No energy saving is claimed without device measurement."],
    sources: [{ url: "https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-6-fire-vulcan-demo",
      purpose: "Precomputed animated smoke sprites and alpha blending method; no source imagery copied." }],
    inputs: ["scripts/build-engine-smoke.mjs", "scripts/exhaustOptics/bake.mjs"].map(name => ({
      path: name, sha256: hash(readFileSync(path.join(root, name))),
    })),
    outputs: [{ path: "engine-smoke-flipbook.png", width, height, columns, rows, bytes: png.length, sha256: hash(png) }],
  };
  return { "engine-smoke-flipbook.png": png, "engine-smoke-flipbook.manifest.json": Buffer.from(JSON.stringify(manifest, null, 2) + "\n") };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !["--install", "--check"].includes(arg))) throw new Error("Use build-engine-smoke.mjs [--install | --check]");
  const files = generateEngineSmokeSprite();
  const outputDirectory = newOutputDirectory("engine-smoke");
  const installed = path.join(root, "src/flight/aircraft/generated");
  if (args[0] === "--check") {
    for (const [name, bytes] of Object.entries(files)) {
      if (!readFileSync(path.join(installed, name)).equals(bytes)) throw new Error(`${name} is stale`);
    }
  } else {
    const destination = args[0] === "--install" ? installed : outputDirectory;
    mkdirSync(destination, { recursive: true });
    for (const [name, bytes] of Object.entries(files)) writeFileSync(path.join(destination, name), bytes);
  }
  const report = { success: true, mode: args[0] ?? "scratch", artifacts: Object.entries(files).map(([name, bytes]) => ({ name, bytes: bytes.length, sha256: hash(bytes) })) };
  writeFileSync(path.join(outputDirectory, "bake-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report, outputDirectory }, null, 2));
}
