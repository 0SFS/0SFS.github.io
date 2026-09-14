import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { isDeepStrictEqual, promisify } from "node:util";
import {
  JSBSIM_ACCEPTED_PACKAGE_NAMES, readJsbsimBuildIdentity,
} from "../src/flight/jsbsim/jsbsimBuildIdentity.ts";

const runFile = promisify(execFile);
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const hash = (bytes, algorithm = "sha256", encoding = "hex") => createHash(algorithm).update(bytes).digest(encoding);
const json = async file => JSON.parse(await readFile(file, "utf8"));

function relativeFile(value) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value)
    || value.includes("\\") || value.split("/").some(part => part === ".." || part === "." || part === "")) {
    throw new Error("Unsafe JSBSim artifact path: " + value);
  }
  return value;
}

async function fileInventory(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error("Symlink in immutable JSBSim artifact: " + relative);
    if (entry.isDirectory()) files.push(...await fileInventory(path.join(directory, entry.name), relative + "/"));
    else if (entry.isFile()) files.push(relative);
    else throw new Error("Unexpected JSBSim artifact file type: " + relative);
  }
  return files.sort();
}

/** Validate packaged bytes and exported identity, without constructing a native executive. */
export async function verifySdkDirectory(packageRoot) {
  const pkg = await json(path.join(packageRoot, "package.json"));
  // The exact name required for this artifact's version is enforced by
  // readJsbsimBuildIdentity below; a retained rollback tarball keeps the name
  // it was published under.
  if (!JSBSIM_ACCEPTED_PACKAGE_NAMES.includes(pkg.name)) {
    throw new Error("Installed JSBSim package name differs from the identified fork");
  }
  const dist = path.join(packageRoot, "dist");
  const metadata = await json(path.join(dist, "build-metadata.json"));
  if (metadata.schemaVersion !== 1) throw new Error("Unknown JSBSim artifact metadata schema");
  const identity = readJsbsimBuildIdentity(metadata.identity);
  if (pkg.version !== identity.package.version) throw new Error("Installed JSBSim package version differs from its build identity");
  if (identity.schemaVersion === 2) {
    const provenance = metadata.provenance;
    if (provenance?.repository?.commit !== identity.native.commit
      || provenance.repository.contentSha256 !== identity.native.contentSha256
      || provenance.repository.sdkPath !== identity.sdk.path
      || provenance.nativeArchive !== null || provenance.nativeSourceLockSha256 !== null) {
      throw new Error("In-tree JSBSim provenance must identify its shared repository without an external native source selection");
    }
  }
  if (metadata.validation?.status !== "passed" || !Array.isArray(metadata.validation.commands)
    || metadata.validation.commands.length === 0 || !metadata.validation.commands.every(command => typeof command === "string" && command.length > 0)) {
    throw new Error("JSBSim artifact has no completed validation record");
  }
  if (!metadata.files || typeof metadata.files !== "object" || Array.isArray(metadata.files)) throw new Error("Missing JSBSim artifact file manifest");
  const files = {};
  for (const [name, expected] of Object.entries(metadata.files)) {
    relativeFile(name);
    if (name === "build-metadata.json" || typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)) {
      throw new Error("Invalid JSBSim artifact hash for " + name);
    }
    const actual = hash(await readFile(path.join(dist, name)));
    if (actual !== expected) throw new Error("JSBSim artifact hash mismatch: " + name);
    files[name] = actual;
  }
  for (const name of ["index.js", "index.d.ts", "wasm.js", "wasm.d.ts", "wasm/jsbsim_wasm.mjs", "wasm/jsbsim_wasm.wasm"]) {
    if (!files[name]) throw new Error("JSBSim artifact lacks required file: " + name);
  }
  const actualFiles = (await fileInventory(dist)).filter(name => name !== "build-metadata.json");
  if (!isDeepStrictEqual(actualFiles, Object.keys(files).sort())) throw new Error("Unrecorded files in JSBSim artifact");
  const exported = await import(pathToFileURL(path.join(dist, "index.js")).href + "?identity=" + files["index.js"]);
  if (!isDeepStrictEqual(readJsbsimBuildIdentity(exported.buildIdentity), identity)) {
    throw new Error("JSBSim exported identity differs from the artifact manifest");
  }
  return { schemaVersion: 1, identity, files, validation: metadata.validation };
}

/** The local tarball is a declared, portable dependency, not an implicit SDK sibling override. */
export async function verifyInstalledSdk(root = appRoot) {
  root = await realpath(root);
  const pkg = await json(path.join(root, "package.json"));
  const declared = JSBSIM_ACCEPTED_PACKAGE_NAMES.filter(name => pkg.dependencies?.[name] !== undefined);
  if (declared.length !== 1) {
    throw new Error("Declare exactly one identified JSBSim fork package");
  }
  const packageName = declared[0];
  const specifier = pkg.dependencies[packageName];
  if (typeof specifier !== "string" || !specifier.startsWith("file:deps/") || !specifier.endsWith(".tgz")) {
    throw new Error("Declare the immutable JSBSim tarball under file:deps/ before building");
  }
  const relative = relativeFile(specifier.slice(5));
  const lock = await json(path.join(root, "package-lock.json"));
  const locked = lock.packages?.["node_modules/" + packageName];
  if (lock.packages?.[""]?.dependencies?.[packageName] !== specifier
    || locked?.resolved !== specifier) {
    throw new Error("JSBSim package lock does not match the selected tarball; install the declared artifact");
  }
  const tarBytes = await readFile(path.join(root, relative));
  const integrity = "sha512-" + hash(tarBytes, "sha512", "base64");
  if (locked.integrity !== integrity) throw new Error("JSBSim package tarball integrity differs from the lock");
  const packageRoot = path.join(root, "node_modules", packageName);
  if (await realpath(packageRoot) !== path.resolve(packageRoot)) throw new Error("JSBSim dependency must be an installed tarball, not a live source link");
  const artifact = await verifySdkDirectory(packageRoot);
  if (locked.version !== artifact.identity.package.version) throw new Error("JSBSim package lock version differs from the installed artifact");
  const stableMode = artifact.identity.schemaVersion === 1
    ? artifact.identity.build.mode === "pinned" : artifact.identity.build.mode === "in-tree";
  if (!stableMode || artifact.identity.native.dirty || artifact.identity.sdk.dirty) {
    throw new Error("Stable app dependency requires a clean pinned or in-tree SDK artifact; use an explicit candidate directory for local diagnostics.");
  }
  const archiveMetadata = JSON.parse((await runFile("tar", ["-xOf", path.join(root, relative), "package/dist/build-metadata.json"], {
    encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  })).stdout);
  const archivePackage = JSON.parse((await runFile("tar", ["-xOf", path.join(root, relative), "package/package.json"], {
    encoding: "utf8", maxBuffer: 1024 * 1024,
  })).stdout);
  if (!isDeepStrictEqual(archiveMetadata, await json(path.join(packageRoot, "dist/build-metadata.json")))
    || !isDeepStrictEqual(archivePackage, await json(path.join(packageRoot, "package.json")))) {
    throw new Error("Installed JSBSim package differs from the locked tarball");
  }
  return { ...artifact, packageArchive: { path: relative, sha256: hash(tarBytes), integrity } };
}

export async function verifyBuiltSdk(dist, artifact) {
  const files = await fileInventory(dist);
  const emitted = {};
  for (const [extension, source] of [
    [".mjs", "wasm/jsbsim_wasm.mjs"], [".wasm", "wasm/jsbsim_wasm.wasm"],
  ]) {
    const candidates = files.filter(name => path.basename(name).startsWith("jsbsim_wasm") && name.endsWith(extension));
    if (candidates.length !== 1) throw new Error("Expected exactly one emitted JSBSim " + extension + " asset");
    const name = candidates[0];
    const actual = hash(await readFile(path.join(dist, name)));
    if (actual !== artifact.files[source]) throw new Error("Emitted JSBSim asset differs from installed package: " + name);
    emitted[name] = actual;
  }
  const report = { ...artifact, emitted, browserLoadedAssetsVerified: false };
  await writeFile(path.join(dist, "jsbsim-artifact.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !arg.startsWith("--dist="))) throw new Error("Usage: verify-jsbsim-artifact.mjs [--dist=dist]");
  const artifact = await verifyInstalledSdk();
  const dist = args.find(arg => arg.startsWith("--dist="))?.slice(7);
  const result = dist ? await verifyBuiltSdk(path.resolve(appRoot, dist), artifact) : artifact;
  process.stdout.write(JSON.stringify({
    package: result.identity.package, mode: result.identity.build.mode,
    inputSha256: result.identity.build.inputSha256, verifiedFiles: Object.keys(result.files).length,
    packageArchive: result.packageArchive, ...(result.emitted ? { emitted: result.emitted } : {}),
  }, null, 2) + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
