import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length !== 1 || !args[0].startsWith("--out=") || !args[0].slice(6)) {
  throw new Error("Usage: node scripts/collect-sf50-public-evidence.mjs --out=NEW_DIRECTORY");
}
const output = resolve(args[0].slice(6));
const manifest = JSON.parse(readFileSync(new URL("../planes/Cirrus_Vision_Jet/tests/public-evidence/manifest.json", import.meta.url), "utf8"));
mkdirSync(output); // Refuse to overwrite an existing evidence collection.
const attempts = [];
for (const source of manifest.sources) {
  try {
    if (basename(source.file) !== source.file) throw new Error("Unsafe source filename.");
    const response = await fetch(source.url, {
      signal: AbortSignal.timeout(60000),
      headers: { "User-Agent": "OSFS-SF50-public-evidence-collector" },
    });
    if (!response.ok || !response.body) throw new Error("HTTP " + response.status);
    const maximum = Math.min(64 * 1024 * 1024, Math.ceil(source.bytes * 1.1) + 1024);
    if (Number(response.headers.get("content-length")) > maximum) throw new Error("Source size changed.");
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maximum) throw new Error("Source exceeds pinned size limit.");
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (size !== source.bytes || actualHash !== source.sha256) {
      throw new Error("Source content changed; reconcile the revision instead of silently replacing evidence.");
    }
    writeFileSync(join(output, source.file), bytes, { flag: "wx" });
    attempts.push({ id: source.id, status: "downloaded", sha256: actualHash, bytes: size });
    process.stdout.write(source.id + ": archived\n");
  } catch (error) {
    attempts.push({ id: source.id, status: "failed", error: String(error) });
    process.stderr.write(source.id + ": " + error + "\n");
  }
}
writeFileSync(join(output, "acquisition-report.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  manifest: fileURLToPath(new URL("../planes/Cirrus_Vision_Jet/tests/public-evidence/manifest.json", import.meta.url)),
  attempts, aircraftValidated: false,
}, null, 2) + "\n", { flag: "wx" });
if (attempts.some(attempt => attempt.status === "failed")) process.exitCode = 1;
