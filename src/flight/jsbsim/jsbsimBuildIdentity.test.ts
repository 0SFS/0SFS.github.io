import { describe, expect, it } from "vitest";
import { readJsbsimBuildIdentity, type JsbsimBuildIdentity } from "./jsbsimBuildIdentity";

const identity = (): Extract<JsbsimBuildIdentity, { schemaVersion: 1 }> => ({
  // fork.1 predates the rename and keeps the name it was published under.
  schemaVersion: 1, package: { name: "@felipegalind0/jsbsim-wasm", version: "1.2.4-fork.1" },
  native: { origin: "https://github.com/Felipegalind0/jsbsim", commit: "a".repeat(40), contentSha256: "b".repeat(64), dirty: false },
  sdk: { commit: "c".repeat(40), contentSha256: "d".repeat(64), dirty: false },
  build: {
    mode: "pinned", inputSha256: "e".repeat(64),
    toolchain: { node: "test-node", npm: "test-npm", emscripten: "test-emcc", cmake: "test-cmake", clang: "test-clang", platform: "test", arch: "test", emscriptenConfigSha256: "9".repeat(64) },
    options: { buildType: "Release", cxxStandard: 17, sdkTarget: "es2022" },
  },
});

const inTreeIdentity = (): Extract<JsbsimBuildIdentity, { schemaVersion: 2 }> => {
  const source = identity();
  return {
    ...source,
    schemaVersion: 2,
    package: { name: "@felipegalind0/jsbsim", version: "1.2.4-fork.6" },
    sdk: { ...source.sdk, commit: source.native.commit, path: "wasm" },
    build: { ...source.build, mode: "in-tree" },
  };
};

describe("JSBSim build identity", () => {
  // Each version is paired with the name it was actually published under;
  // the rename landed at fork.5.
  it.each([
    ["1.2.4-fork.2", "@felipegalind0/jsbsim-wasm"],
    ["1.2.4-fork.3", "@felipegalind0/jsbsim-wasm"],
    ["1.2.4-fork.4", "@felipegalind0/jsbsim-wasm"],
    ["1.2.4-fork.5", "@felipegalind0/jsbsim"],
    ["1.2.4-fork.6", "@felipegalind0/jsbsim"],
  ])("accepts only an explicitly supported in-tree package version: %s", (version, name) => {
    const source = inTreeIdentity();
    source.package.version = version;
    source.package.name = name;
    expect(readJsbsimBuildIdentity(source).package.version).toBe(version);
  });
  it("retains the shared repository revision and distinct component digests of an in-tree build", () => {
    const source = inTreeIdentity();
    const result = readJsbsimBuildIdentity(source);
    expect(result).toEqual(source);
    expect(result.native.commit).toBe(result.sdk.commit);
    expect(result.native.contentSha256).not.toBe(result.sdk.contentSha256);
    source.sdk.contentSha256 = "f".repeat(64);
    expect(result.sdk.contentSha256).toBe("d".repeat(64));
  });
  it("labels a consistently dirty in-tree snapshot as a diagnostic candidate", () => {
    const source = inTreeIdentity();
    source.native.dirty = source.sdk.dirty = true;
    expect(readJsbsimBuildIdentity(source).native.dirty).toBe(true);
  });
  it.each([
    (source: ReturnType<typeof inTreeIdentity>) => { source.sdk.commit = "f".repeat(40); },
    (source: ReturnType<typeof inTreeIdentity>) => { source.sdk.dirty = true; },
    (source: ReturnType<typeof inTreeIdentity>) => { Reflect.deleteProperty(source.sdk, "path"); },
    (source: ReturnType<typeof inTreeIdentity>) => { Reflect.set(source.sdk, "path", "../jsbsim-wasm"); },
    (source: ReturnType<typeof inTreeIdentity>) => { Reflect.set(source.build, "mode", "pinned"); },
    (source: ReturnType<typeof inTreeIdentity>) => { source.package.version = "1.2.4-fork.1"; },
    // Retained rollback tarballs keep the name they were published under, so a
    // renamed package claiming an older version must be rejected.
    (source: ReturnType<typeof inTreeIdentity>) => { source.package.version = "1.2.4-fork.4"; },
    (source: ReturnType<typeof inTreeIdentity>) => { source.package.name = "@felipegalind0/jsbsim-wasm"; },
    (source: ReturnType<typeof inTreeIdentity>) => { source.package.version = "1.2.4-fork.7"; },
    (source: ReturnType<typeof inTreeIdentity>) => { Reflect.set(source, "schemaVersion", 1); },
  ])("rejects an inconsistent in-tree identity %#", mutate => {
    const source = inTreeIdentity();
    mutate(source);
    expect(() => readJsbsimBuildIdentity(source)).toThrow();
  });
  it("retains complete provenance as a detached diagnostic value", () => {
    const source = identity();
    const result = readJsbsimBuildIdentity(source);
    source.native.commit = "f".repeat(40);
    expect(result.native.commit).toBe("a".repeat(40));
  });
  it("distinguishes an explicit dirty local candidate from a pinned build", () => {
    const source = identity();
    source.native.dirty = true;
    expect(() => readJsbsimBuildIdentity(source)).toThrow("dirty");
    source.build.mode = "local";
    expect(readJsbsimBuildIdentity(source).build.mode).toBe("local");
  });
  it.each([
    (source: JsbsimBuildIdentity) => { source.package.name = "@0x62/jsbsim-wasm"; },
    (source: JsbsimBuildIdentity) => { source.package.version = "1.2.4-beta.4"; },
    (source: JsbsimBuildIdentity) => { source.native.commit = "unknown"; },
    (source: JsbsimBuildIdentity) => { source.sdk.contentSha256 = "dirty"; },
    (source: JsbsimBuildIdentity) => { source.build.toolchain.emscripten = ""; },
    (source: JsbsimBuildIdentity) => { source.build.toolchain.emscriptenConfigSha256 = "unidentified"; },
    (source: JsbsimBuildIdentity) => { Reflect.deleteProperty(source.build.toolchain, "emscriptenConfigSha256"); },
  ])("rejects an incomplete or mismatched identity %#", mutate => {
    const source = identity();
    mutate(source);
    expect(() => readJsbsimBuildIdentity(source)).toThrow();
  });
});
