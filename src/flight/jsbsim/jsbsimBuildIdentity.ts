/** Expected public contract of the packaged fork; no native handles are exposed. */
export const JSBSIM_PACKAGE_NAME = "@felipegalind0/jsbsim";
export const JSBSIM_PACKAGE_VERSION = "1.2.4-fork.5";

/**
 * The package was renamed from `@felipegalind0/jsbsim-wasm` at fork.5: engine
 * and SDK had shared one repository and one revision for several releases, so
 * the old name described a source split that no longer exists. Retained
 * rollback tarballs keep the name they were published under, so every accepted
 * version is paired with its exact name. No version range, name substitution or
 * implicit fallback is accepted. A full rollback also restores that release's
 * preserved declaration, lock and this module.
 */
const RENAMED_FROM = "@felipegalind0/jsbsim-wasm";
const acceptedPackages: Record<1 | 2, Readonly<Record<string, string>>> = {
  1: { "1.2.4-fork.1": RENAMED_FROM },
  2: {
    "1.2.4-fork.2": RENAMED_FROM,
    "1.2.4-fork.3": RENAMED_FROM,
    "1.2.4-fork.4": RENAMED_FROM,
    [JSBSIM_PACKAGE_VERSION]: JSBSIM_PACKAGE_NAME,
  },
};

/** Every package name an identified artifact may carry, newest first. */
export const JSBSIM_ACCEPTED_PACKAGE_NAMES: readonly string[] = [JSBSIM_PACKAGE_NAME, RENAMED_FROM];

/** The one name a given schema/version pair must carry, or undefined if unaccepted. */
export function expectedJsbsimPackageName(schemaVersion: unknown, version: unknown): string | undefined {
  if ((schemaVersion !== 1 && schemaVersion !== 2) || typeof version !== "string") return undefined;
  return acceptedPackages[schemaVersion][version];
}

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
  const expectedName = expectedJsbsimPackageName(schema, pkg.version);
  if (expectedName === undefined || pkg.name !== expectedName) {
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
