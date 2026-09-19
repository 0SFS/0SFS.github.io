/** Expected public contract of the packaged fork; no native handles are exposed. */
export const JSBSIM_PACKAGE_NAME = "@felipegalind0/jsbsim-wasm";
export const JSBSIM_PACKAGE_VERSION = "1.2.4-fork.4";
const packageVersions = { 1: ["1.2.4-fork.1"], 2: ["1.2.4-fork.2", "1.2.4-fork.3", JSBSIM_PACKAGE_VERSION] } as const;

type SourceIdentity = { commit: string; contentSha256: string; dirty: boolean };
type BuildRecipe = {
  inputSha256: string;
  toolchain: Record<"node" | "npm" | "emscripten" | "cmake" | "clang" | "platform" | "arch", string> & { emscriptenConfigSha256: string };
  options: { buildType: "Release"; cxxStandard: 17; sdkTarget: "es2022" };
};
type CommonIdentity = {
  package: { name: string; version: string };
  native: SourceIdentity & { origin: string };
};
export type JsbsimBuildIdentity = CommonIdentity & ({
  schemaVersion: 1;
  sdk: SourceIdentity;
  build: BuildRecipe & { mode: "pinned" | "local" };
} | {
  schemaVersion: 2;
  sdk: SourceIdentity & { path: "wasm" };
  build: BuildRecipe & { mode: "in-tree" };
});

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Missing JSBSim " + name);
  return value as Record<string, unknown>;
}

export function readJsbsimBuildIdentity(value: unknown): JsbsimBuildIdentity {
  const identity = object(value, "build identity");
  const pkg = object(identity.package, "package");
  const schema = identity.schemaVersion;
  if ((schema !== 1 && schema !== 2) || pkg.name !== JSBSIM_PACKAGE_NAME || !packageVersions[schema].some(version => pkg.version === version)) {
    throw new Error("Unexpected JSBSim package identity; install an identified fork artifact.");
  }
  const native = object(identity.native, "native source");
  const sdk = object(identity.sdk, "SDK source");
  for (const [name, source] of [["native", native], ["SDK", sdk]] as const) {
    if (typeof source.commit !== "string" || !/^[a-f0-9]{40}$/.test(source.commit)
      || typeof source.contentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(source.contentSha256)
      || typeof source.dirty !== "boolean") throw new Error("Invalid JSBSim " + name + " source identity");
  }
  if (typeof native.origin !== "string" || native.origin.length === 0) throw new Error("Missing JSBSim native origin");
  const build = object(identity.build, "build");
  if (schema === 1) {
    if (build.mode !== "pinned" && build.mode !== "local") throw new Error("Unknown JSBSim build mode");
    if (build.mode === "pinned" && (native.dirty || sdk.dirty)) throw new Error("Pinned JSBSim build contains dirty source");
  } else {
    if (build.mode !== "in-tree") throw new Error("Unknown in-tree JSBSim build mode");
    if (sdk.path !== "wasm" || native.commit !== sdk.commit || native.dirty !== sdk.dirty) {
      throw new Error("In-tree JSBSim engine and SDK must identify the same repository snapshot and wasm path");
    }
  }
  if (typeof build.inputSha256 !== "string" || !/^[a-f0-9]{64}$/.test(build.inputSha256)) throw new Error("Invalid JSBSim build input hash");
  const toolchain = object(build.toolchain, "toolchain");
  for (const key of ["node", "npm", "emscripten", "cmake", "clang", "platform", "arch"]) {
    if (typeof toolchain[key] !== "string" || toolchain[key].length === 0) throw new Error("Missing JSBSim toolchain " + key);
  }
  if (typeof toolchain.emscriptenConfigSha256 !== "string" || !/^[a-f0-9]{64}$/.test(toolchain.emscriptenConfigSha256)) {
    throw new Error("Invalid JSBSim Emscripten configuration hash");
  }
  const options = object(build.options, "build options");
  if (options.buildType !== "Release" || options.cxxStandard !== 17 || options.sdkTarget !== "es2022") {
    throw new Error("Unexpected JSBSim build options");
  }
  return JSON.parse(JSON.stringify(identity)) as JsbsimBuildIdentity;
}
