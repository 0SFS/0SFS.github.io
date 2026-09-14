import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { verifyBuiltSdk, verifyInstalledSdk, verifySdkDirectory } from "./verify-jsbsim-artifact.mjs";

const runFile = promisify(execFile);
const roots = [];
const digest = (data, algorithm = "sha256", encoding = "hex") => createHash(algorithm).update(data).digest(encoding);
// Retained rollback tarballs keep the name they were published under, so the
// fixture derives the name from the version the way the identity gate does.
const POST_RENAME_VERSIONS = new Set(["1.2.4-fork.5", "1.2.4-fork.6", "1.2.4-fork.7"]);
const nameFor = version => POST_RENAME_VERSIONS.has(version) ? "@felipegalind0/jsbsim" : "@felipegalind0/jsbsim-wasm";
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture({ schemaVersion = 2, mode = schemaVersion === 2 ? "in-tree" : "pinned", dirty = false,
  version = schemaVersion === 2 ? "1.2.4-fork.7" : "1.2.4-fork.1" } = {}) {
  const pkgName = nameFor(version);
  const root = await mkdtemp(path.join(tmpdir(), "osfs-sdk-artifact-test-"));
  roots.push(root);
  const source = path.join(root, "package");
  const dist = path.join(source, "dist");
  await mkdir(path.join(dist, "wasm"), { recursive: true });
  const identity = {
    schemaVersion, package: { name: pkgName, version },
    native: { origin: "https://example.invalid/native-fixture", commit: "a".repeat(40), contentSha256: "b".repeat(64), dirty },
    sdk: { commit: (schemaVersion === 2 ? "a" : "c").repeat(40), contentSha256: "d".repeat(64), dirty, ...(schemaVersion === 2 ? { path: "wasm" } : {}) },
    build: {
      mode, inputSha256: "e".repeat(64),
      toolchain: { node: "fixture", npm: "fixture", emscripten: "fixture", cmake: "fixture", clang: "fixture", platform: "fixture", arch: "fixture", emscriptenConfigSha256: "9".repeat(64) },
      options: { buildType: "Release", cxxStandard: 17, sdkTarget: "es2022" },
    },
  };
  const contents = {
    "index.js": "export const buildIdentity = " + JSON.stringify(identity) + ";\n",
    "index.d.ts": "export declare const buildIdentity: unknown;\n",
    "wasm.js": "export const fixtureOnly = true;\n",
    "wasm.d.ts": "export declare const fixtureOnly: true;\n",
    "wasm/jsbsim_wasm.mjs": "// inert loader fixture, never instantiated\n",
    "wasm/jsbsim_wasm.wasm": "inert byte fixture, never instantiated",
  };
  const metadata = {
    schemaVersion: 1, identity, files: Object.fromEntries(Object.entries(contents).map(([name, text]) => [name, digest(text)])),
    ...(schemaVersion === 2 ? { provenance: {
      repository: { commit: identity.native.commit, contentSha256: identity.native.contentSha256, sdkPath: "wasm" },
      nativeArchive: null, nativeSourceLockSha256: null,
    } } : {}),
    validation: { status: "passed", commands: ["fixture-only source-contract test"] },
  };
  for (const [name, text] of Object.entries(contents)) await writeFile(path.join(dist, name), text);
  await writeFile(path.join(dist, "build-metadata.json"), JSON.stringify(metadata));
  await writeFile(path.join(source, "package.json"), JSON.stringify({ name: pkgName, version, type: "module" }));
  const packageRoot = path.join(root, "node_modules", pkgName);
  await mkdir(path.dirname(packageRoot), { recursive: true });
  await cp(source, packageRoot, { recursive: true });
  await mkdir(path.join(root, "deps"));
  const archive = "deps/" + pkgName.slice(1).replace("/", "-") + "-" + version + ".tgz";
  await runFile("tar", ["-czf", path.join(root, archive), "-C", root, "package"]);
  const specifier = "file:" + archive;
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: { [pkgName]: specifier } }));
  await writeFile(path.join(root, "package-lock.json"), JSON.stringify({
    lockfileVersion: 3, packages: {
      "": { dependencies: { [pkgName]: specifier } },
      ["node_modules/" + pkgName]: {
        version, resolved: specifier,
        integrity: "sha512-" + digest(await readFile(path.join(root, archive)), "sha512", "base64"),
      },
    },
  }));
  return { root, packageRoot, pkgName, dist: path.join(packageRoot, "dist"), archive, identity, metadata, contents };
}

describe("packaged JSBSim artifact verification", () => {
  it("verifies the retained fork.2 in-tree archive for deliberate rollback", async () => {
    const t = await fixture({ version: "1.2.4-fork.2" });
    const artifact = await verifyInstalledSdk(t.root);
    expect(artifact.identity.package.version).toBe("1.2.4-fork.2");
    expect(artifact.packageArchive.path).toBe(t.archive);
  });
  it.each([1, 2])("ties schema %s installed bytes to the portable declared tarball and lock integrity", async schemaVersion => {
    const t = await fixture({ schemaVersion });
    const result = await verifyInstalledSdk(t.root);
    expect(result.identity).toEqual(t.identity);
    expect(result.packageArchive.path).toBe(t.archive);
    expect(result.files).toEqual(t.metadata.files);
  });

  it.each([false, true])("rejects a consistent local-mode package from the stable app route (dirty: %s)", async dirty => {
    const t = await fixture({ schemaVersion: 1, mode: "local", dirty });
    const candidate = await verifySdkDirectory(t.packageRoot);
    expect(candidate.identity.build.mode).toBe("local");
    expect(candidate.identity.native.dirty).toBe(dirty);
    await expect(verifyInstalledSdk(t.root)).rejects.toThrow("clean pinned or in-tree SDK artifact");
  });

  it.each(["repository-commit", "repository-content", "sdk-path", "external-archive", "external-lock", "missing-provenance"])(
    "rejects contradictory in-tree provenance: %s", async failure => {
      const t = await fixture();
      if (failure === "repository-commit") t.metadata.provenance.repository.commit = "f".repeat(40);
      if (failure === "repository-content") t.metadata.provenance.repository.contentSha256 = "f".repeat(64);
      if (failure === "sdk-path") t.metadata.provenance.repository.sdkPath = "../jsbsim-wasm";
      if (failure === "external-archive") t.metadata.provenance.nativeArchive = { path: "sources/other.tar.gz", sha256: "f".repeat(64) };
      if (failure === "external-lock") t.metadata.provenance.nativeSourceLockSha256 = "f".repeat(64);
      if (failure === "missing-provenance") delete t.metadata.provenance;
      await writeFile(path.join(t.dist, "build-metadata.json"), JSON.stringify(t.metadata));
      await expect(verifySdkDirectory(t.packageRoot)).rejects.toThrow("In-tree JSBSim provenance");
    },
  );

  it("rejects an internally consistent dirty in-tree artifact from stable installation", async () => {
    const t = await fixture({ dirty: true });
    expect((await verifySdkDirectory(t.packageRoot)).identity.sdk.dirty).toBe(true);
    await expect(verifyInstalledSdk(t.root)).rejects.toThrow("clean pinned or in-tree SDK artifact");
  });

  it("rejects a declared lock version different from the verified package identity", async () => {
    const t = await fixture();
    const lockFile = path.join(t.root, "package-lock.json");
    const lock = JSON.parse(await readFile(lockFile, "utf8"));
    lock.packages["node_modules/" + t.pkgName].version = "1.2.4-fork.1";
    await writeFile(lockFile, JSON.stringify(lock));
    await expect(verifyInstalledSdk(t.root)).rejects.toThrow("package lock version");
  });

  it("rejects package metadata claiming a version different from the exported identity", async () => {
    const t = await fixture();
    const packageFile = path.join(t.packageRoot, "package.json");
    const pkg = JSON.parse(await readFile(packageFile, "utf8"));
    pkg.version = "1.2.4-fork.1";
    await writeFile(packageFile, JSON.stringify(pkg));
    await expect(verifySdkDirectory(t.packageRoot)).rejects.toThrow("package version differs");
  });

  it.each(["modified-wasm", "missing-declaration", "unrecorded-file", "unsafe-path", "missing-validation", "export-mismatch"])(
    "rejects %s before a native runtime is constructed", async failure => {
      const t = await fixture();
      if (failure === "modified-wasm") await writeFile(path.join(t.dist, "wasm/jsbsim_wasm.wasm"), "different bytes");
      if (failure === "missing-declaration") await rm(path.join(t.dist, "index.d.ts"));
      if (failure === "unrecorded-file") await writeFile(path.join(t.dist, "unexpected.js"), "unrecorded");
      if (failure === "unsafe-path") t.metadata.files["../outside"] = "f".repeat(64);
      if (failure === "missing-validation") t.metadata.validation.status = "pending";
      if (failure === "export-mismatch") {
        const other = structuredClone(t.identity);
        other.native.commit = other.sdk.commit = "f".repeat(40);
        const source = "export const buildIdentity = " + JSON.stringify(other) + ";\n";
        await writeFile(path.join(t.dist, "index.js"), source);
        t.metadata.files["index.js"] = digest(source);
      }
      await writeFile(path.join(t.dist, "build-metadata.json"), JSON.stringify(t.metadata));
      await expect(verifySdkDirectory(t.packageRoot)).rejects.toThrow();
    },
  );

  it("rejects a different internally consistent build installed under the same version", async () => {
    const t = await fixture();
    t.metadata.identity.build.inputSha256 = "f".repeat(64);
    const source = "export const buildIdentity = " + JSON.stringify(t.metadata.identity) + ";\n";
    await writeFile(path.join(t.dist, "index.js"), source);
    t.metadata.files["index.js"] = digest(source);
    await writeFile(path.join(t.dist, "build-metadata.json"), JSON.stringify(t.metadata));
    await expect(verifySdkDirectory(t.packageRoot)).resolves.toBeDefined();
    await expect(verifyInstalledSdk(t.root)).rejects.toThrow("differs from the locked tarball");
  });

  it("rejects modified archives and a lock left pointing at another dependency", async () => {
    const t = await fixture();
    const archive = await readFile(path.join(t.root, t.archive));
    await writeFile(path.join(t.root, t.archive), Buffer.concat([archive, Buffer.from("changed")]));
    await expect(verifyInstalledSdk(t.root)).rejects.toThrow("integrity");
    const lockFile = path.join(t.root, "package-lock.json");
    const lock = JSON.parse(await readFile(lockFile, "utf8"));
    lock.packages["node_modules/" + t.pkgName].resolved = "https://example.invalid/other.tgz";
    await writeFile(lockFile, JSON.stringify(lock));
    await expect(verifyInstalledSdk(t.root)).rejects.toThrow("package lock");
  });

  it("records matching emitted assets without claiming a browser loaded them", async () => {
    const t = await fixture();
    const artifact = await verifyInstalledSdk(t.root);
    const output = path.join(t.root, "output");
    await mkdir(path.join(output, "assets"), { recursive: true });
    await writeFile(path.join(output, "assets/jsbsim_wasm-fixture.mjs"), t.contents["wasm/jsbsim_wasm.mjs"]);
    await writeFile(path.join(output, "assets/jsbsim_wasm-fixture.wasm"), t.contents["wasm/jsbsim_wasm.wasm"]);
    const result = await verifyBuiltSdk(output, artifact);
    expect(result.browserLoadedAssetsVerified).toBe(false);
    expect(Object.keys(result.emitted)).toHaveLength(2);
    await writeFile(path.join(output, "assets/jsbsim_wasm-fixture.wasm"), "stale emitted binary");
    await expect(verifyBuiltSdk(output, artifact)).rejects.toThrow("differs from installed package");
  });
});
