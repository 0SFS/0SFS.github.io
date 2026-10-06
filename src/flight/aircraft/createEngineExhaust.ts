import {
  Constants, Matrix, Mesh, MeshBuilder, Quaternion, ShaderLanguage, ShaderMaterial, Texture,
  TransformNode, Vector2, Vector3, Vector4, type Scene,
} from "@babylonjs/core";
import { whenMeshesReady } from "foss-earth/runtime";
import type { EngineExhaustOpticalProfile } from "./engineExhaustProfiles";
import { createEngineHotSurfaceGlow } from "./createEngineHotSurfaceGlow";

/** 0sfs owns aircraft engine light; this renderer writes no flight properties. */
export interface EngineExhaustSettings {
  enabled: boolean;
  /** Bounded integration work per covered fragment, 4..32. */
  sampleCount: number;
  maxDistanceMeters: number;
  /** Artistic emission amplitude, not measured radiance/SPL, 0..8. */
  intensity: number;
}

export interface EngineExhaustState {
  /** Actual burning/shaft observation; missing telemetry is false. */
  running: boolean;
  /** Genuine native augmentation, never inferred from throttle. */
  augmentation: boolean;
  powerNorm: number;
  nozzlePositionNorm?: number;
  /** Native clock supplied by the owner; a steady baked plume has no independent timer. */
  simulationTimeSeconds: number;
}

export interface EngineExhaustOptions {
  attachment: TransformNode;
  /** Authored attachment-local coordinates, before the model's conversion scale. */
  exitPosition: readonly [number, number, number];
  direction: readonly [number, number, number];
  closedRadiusMeters: number;
  openRadiusMeters: number;
  lengthMeters: number;
  opticalProfile: EngineExhaustOpticalProfile;
  /** Only matching materials beneath this attachment receive hardware glow. */
  hotSurfaceMaterialNames?: readonly string[];
  settings: EngineExhaustSettings;
  requestRender?(): void;
  /** Setup seams; production waits for the texture and both shader stages. */
  createTexture?(profile: EngineExhaustOpticalProfile, scene: Scene): Texture;
  whenReady?(meshes: readonly Mesh[], signal: AbortSignal): Promise<void>;
}

export interface EngineExhaustHandle {
  readonly ready: Promise<void>;
  /** One static 12-triangle volume, exposed for diagnostics/qualification. */
  readonly mesh: Mesh;
  update(state: EngineExhaustState, settings?: EngineExhaustSettings): void;
  dispose(): void;
}

const MAX_SAMPLES = 32;
const unit = (value: number): number => Math.min(1, Math.max(0, value));

/** One wrapped lookup per visible update; this never advances a local clock. */
function temporalEmission(profile: EngineExhaustOpticalProfile, time: number): number {
  const envelope = profile.temporalEmission;
  if (!envelope) return 1;
  const remainder = time % envelope.periodSeconds;
  const position = ((remainder < 0 ? remainder + envelope.periodSeconds : remainder) / envelope.periodSeconds) % 1 * envelope.samples.length;
  const index = Math.floor(position);
  const first = envelope.samples[index];
  const second = envelope.samples[(index + 1) % envelope.samples.length];
  return first + (second - first) * (position - index);
}

export const ENGINE_EXHAUST_GLSL_VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vLocal;
void main() {
  vLocal = position + vec3(0.0, 0.0, 0.5);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

export const ENGINE_EXHAUST_GLSL_FRAGMENT = /* glsl */ `
precision highp float;
uniform mat4 worldViewProjection;
uniform sampler2D opticalLut;
uniform vec3 cameraLocal;
uniform vec4 lutShape;
uniform vec2 lutBank;
uniform vec3 volumeMeters;
uniform float powerNorm;
uniform float intensity;
uniform float outputGamma;
uniform int sampleCount;
varying vec3 vLocal;

vec3 encodeOutput(vec3 c) {
  vec3 low = 12.92 * c;
  vec3 high = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(c, mix(low, high, step(vec3(0.0031308), c)), outputGamma);
}
void main() {
  vec3 delta = vLocal - cameraLocal;
  if (dot(delta, delta) < 0.0000000001) discard;
  vec3 ray = normalize(delta);
  vec3 safe = vec3(ray.x < 0.0 ? -max(abs(ray.x), 0.00001) : max(abs(ray.x), 0.00001),
    ray.y < 0.0 ? -max(abs(ray.y), 0.00001) : max(abs(ray.y), 0.00001),
    ray.z < 0.0 ? -max(abs(ray.z), 0.00001) : max(abs(ray.z), 0.00001));
  vec3 a = (vec3(-1.0, -1.0, 0.0) - cameraLocal) / safe;
  vec3 b = (vec3(1.0) - cameraLocal) / safe;
  vec3 near = min(a, b);
  vec3 far = max(a, b);
  float begin = max(0.0, max(max(near.x, near.y), near.z));
  float end = min(min(far.x, far.y), far.z);
  if (end <= begin) discard;
  float width = (end - begin) / float(sampleCount);
  float pathMetres = width * length(ray * volumeMeters);
  vec3 emission = vec3(0.0);
  vec3 firstLight = vec3(0.0);
  bool hasLight = false;
  for (int i = 0; i < ${MAX_SAMPLES}; i++) {
    if (i >= sampleCount) break;
    vec3 p = cameraLocal + ray * (begin + (float(i) + 0.5) * width);
    float axial = clamp(p.z, 0.0, 1.0);
    float radius = max(0.12, 1.0 - 0.6 * axial);
    float radial = max(0.0, 1.0 - dot(p.xy, p.xy) / (radius * radius));
    vec2 uv = vec2((0.5 + axial * (lutShape.x - 1.0)) / lutShape.x,
      (lutBank.x + 0.5 + powerNorm * (lutBank.y - 1.0)) / lutShape.y);
    vec4 light = texture2D(opticalLut, uv);
    vec3 contribution = light.rgb * light.a * radial * radial * pathMetres;
    if (!hasLight && max(max(contribution.r, contribution.g), contribution.b) > 0.000001) {
      firstLight = p;
      hasLight = true;
    }
    // Optical alpha is relative emission per metre, not calibrated radiance.
    emission += contribution;
  }
  emission *= intensity;
  if (!hasLight || max(max(emission.r, emission.g), emission.b) < 0.000001) discard;
  vec3 color = emission / (vec3(1.0) + emission);
  gl_FragColor = vec4(encodeOutput(color), 1.0);
  vec4 clip = worldViewProjection * vec4(firstLight - vec3(0.0, 0.0, 0.5), 1.0);
  if (abs(clip.w) < 0.000001) discard;
  gl_FragDepthEXT = clamp(0.5 * clip.z / clip.w + 0.5, 0.0, 1.0);
}
`;

export const ENGINE_EXHAUST_WGSL_VERTEX = /* wgsl */ `
attribute position : vec3<f32>;
uniform worldViewProjection : mat4x4<f32>;
varying vLocal : vec3<f32>;
@vertex
fn main(input : VertexInputs) -> FragmentInputs {
  vertexOutputs.vLocal = vertexInputs.position + vec3<f32>(0.0, 0.0, 0.5);
  vertexOutputs.position = uniforms.worldViewProjection * vec4<f32>(vertexInputs.position, 1.0);
}
`;

export const ENGINE_EXHAUST_WGSL_FRAGMENT = /* wgsl */ `
uniform worldViewProjection : mat4x4<f32>;
uniform cameraLocal : vec3<f32>;
uniform lutShape : vec4<f32>;
uniform lutBank : vec2<f32>;
uniform volumeMeters : vec3<f32>;
uniform powerNorm : f32;
uniform intensity : f32;
uniform outputGamma : f32;
uniform sampleCount : i32;
var opticalLut : texture_2d<f32>;
var opticalLutSampler : sampler;
varying vLocal : vec3<f32>;
fn encodeOutput(c: vec3<f32>) -> vec3<f32> {
  let low = 12.92 * c;
  let high = 1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055;
  return mix(c, select(high, low, c <= vec3<f32>(0.0031308)), uniforms.outputGamma);
}
@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let delta = fragmentInputs.vLocal - uniforms.cameraLocal;
  if (dot(delta, delta) < 0.0000000001) { discard; }
  let ray = normalize(delta);
  let safe = select(max(abs(ray), vec3<f32>(0.00001)), -max(abs(ray), vec3<f32>(0.00001)), ray < vec3<f32>(0.0));
  let a = (vec3<f32>(-1.0, -1.0, 0.0) - uniforms.cameraLocal) / safe;
  let b = (vec3<f32>(1.0) - uniforms.cameraLocal) / safe;
  let near = min(a, b);
  let far = max(a, b);
  let begin = max(0.0, max(max(near.x, near.y), near.z));
  let end = min(min(far.x, far.y), far.z);
  if (end <= begin) { discard; }
  let width = (end - begin) / f32(uniforms.sampleCount);
  let pathMetres = width * length(ray * uniforms.volumeMeters);
  var emission = vec3<f32>(0.0);
  var firstLight = vec3<f32>(0.0);
  var hasLight = false;
  for (var i: i32 = 0; i < ${MAX_SAMPLES}; i = i + 1) {
    if (i >= uniforms.sampleCount) { break; }
    let p = uniforms.cameraLocal + ray * (begin + (f32(i) + 0.5) * width);
    let axial = clamp(p.z, 0.0, 1.0);
    let radius = max(0.12, 1.0 - 0.6 * axial);
    let radial = max(0.0, 1.0 - dot(p.xy, p.xy) / (radius * radius));
    let uv = vec2<f32>((0.5 + axial * (uniforms.lutShape.x - 1.0)) / uniforms.lutShape.x,
      (uniforms.lutBank.x + 0.5 + uniforms.powerNorm * (uniforms.lutBank.y - 1.0)) / uniforms.lutShape.y);
    let light = textureSampleLevel(opticalLut, opticalLutSampler, uv, 0.0);
    let contribution = light.rgb * light.a * radial * radial * pathMetres;
    if (!hasLight && max(max(contribution.r, contribution.g), contribution.b) > 0.000001) {
      firstLight = p;
      hasLight = true;
    }
    // Optical alpha is relative emission per metre, not calibrated radiance.
    emission = emission + contribution;
  }
  emission = emission * uniforms.intensity;
  if (!hasLight || max(max(emission.r, emission.g), emission.b) < 0.000001) { discard; }
  let color = emission / (vec3<f32>(1.0) + emission);
  fragmentOutputs.color = vec4<f32>(encodeOutput(color), 1.0);
  let clip = uniforms.worldViewProjection * vec4<f32>(firstLight - vec3<f32>(0.0, 0.0, 0.5), 1.0);
  if (abs(clip.w) < 0.000001) { discard; }
  fragmentOutputs.fragDepth = clamp(clip.z / clip.w, 0.0, 1.0);
}
`;

/** One baked optical texture and one bounded volume draw; no runtime spectroscopy or particles. */
export function createEngineExhaust(scene: Scene, options: EngineExhaustOptions): EngineExhaustHandle {
  for (const value of [options.closedRadiusMeters, options.openRadiusMeters, options.lengthMeters]) {
    if (!Number.isFinite(value) || value <= 0) throw new Error("Engine exhaust needs finite positive metre dimensions");
  }
  const direction = new Vector3(...options.direction);
  if (!options.exitPosition.every(Number.isFinite) || !options.direction.every(Number.isFinite)
    || direction.lengthSquared() < 1e-12) throw new Error("Engine exhaust needs a finite attachment and direction");
  direction.normalize();
  const metresPerUnit = Vector3.TransformNormal(direction, options.attachment.computeWorldMatrix(true)).length();
  if (!Number.isFinite(metresPerUnit) || metresPerUnit <= 1e-9) throw new Error("Engine exhaust attachment has invalid scale");
  // A cylinder under nonuniform scale becomes elliptical. Reject that asset
  // declaration rather than silently assign incorrect metre radii.
  const axes = [Vector3.Right(), Vector3.Up(), Vector3.Forward()].map(axis =>
    Vector3.TransformNormal(axis, options.attachment.getWorldMatrix()));
  if (axes.some(axis => Math.abs(axis.length() - metresPerUnit) > metresPerUnit * 1e-5)
    || Math.abs(Vector3.Dot(axes[0], axes[1])) > metresPerUnit * metresPerUnit * 1e-5
    || Math.abs(Vector3.Dot(axes[0], axes[2])) > metresPerUnit * metresPerUnit * 1e-5
    || Math.abs(Vector3.Dot(axes[1], axes[2])) > metresPerUnit * metresPerUnit * 1e-5) {
    throw new Error("Engine exhaust attachment requires uniform unsheared model scale");
  }
  const profile = options.opticalProfile;
  if (profile.colorSpace !== "linear-srgb" || !Number.isInteger(profile.width) || !Number.isInteger(profile.height)
    || profile.width < 1 || profile.height < 1
    || [profile.dry, profile.afterburner].some(bank => !Number.isInteger(bank.firstRow) || !Number.isInteger(bank.rowCount)
      || bank.firstRow < 0 || bank.rowCount < 1 || bank.firstRow + bank.rowCount > profile.height)) {
    throw new Error("Unsupported exhaust optical data");
  }
  const envelope = profile.temporalEmission;
  if (envelope && (!Number.isFinite(envelope.periodSeconds) || envelope.periodSeconds <= 0 || envelope.samples.length < 2
    || envelope.samples.some(value => !Number.isFinite(value) || value < 0))) {
    throw new Error("Unsupported exhaust temporal emission data");
  }
  if (options.attachment.isDisposed()) throw new Error("Engine exhaust attachment is disposed");
  const hotSurface = options.hotSurfaceMaterialNames?.length
    ? createEngineHotSurfaceGlow(options.attachment, options.hotSurfaceMaterialNames, profile,
      options.whenReady ? { compile: async () => {} } : {}) : null;

  const anchor = new TransformNode("engine-exhaust-anchor", scene);
  anchor.parent = options.attachment;
  anchor.position = new Vector3(...options.exitPosition);
  anchor.rotationQuaternion = Quaternion.Identity();
  Quaternion.FromUnitVectorsToRef(Vector3.Forward(), direction, anchor.rotationQuaternion);
  const mesh = MeshBuilder.CreateBox("engine-exhaust", { width: 2, height: 2, depth: 1, sideOrientation: Mesh.BACKSIDE }, scene);
  mesh.parent = anchor;
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  mesh.metadata = { aircraftVisualOnly: true, castsShadows: false, opticalProfileId: profile.id };
  mesh.setEnabled(false);
  const webGpu = scene.getEngine().isWebGPU;
  const material = new ShaderMaterial("engine-exhaust", scene, {
    vertexSource: webGpu ? ENGINE_EXHAUST_WGSL_VERTEX : ENGINE_EXHAUST_GLSL_VERTEX,
    fragmentSource: webGpu ? ENGINE_EXHAUST_WGSL_FRAGMENT : ENGINE_EXHAUST_GLSL_FRAGMENT,
  }, {
    attributes: ["position"], uniforms: ["worldViewProjection", "cameraLocal", "lutShape", "lutBank", "volumeMeters", "powerNorm", "intensity", "sampleCount", "outputGamma"],
    samplers: ["opticalLut"], shaderLanguage: webGpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
    needAlphaBlending: true,
  });
  material.alphaMode = Constants.ALPHA_ADD;
  material.disableDepthWrite = true;
  material.backFaceCulling = true;
  mesh.material = material;
  const texture = options.createTexture?.(profile, scene) ?? new Texture(profile.textureUrl, scene, {
    noMipmap: true, invertY: false, samplingMode: Texture.BILINEAR_SAMPLINGMODE, gammaSpace: false,
    useSRGBBuffer: false,
    onError: message => queueMicrotask(() => fail(new Error(`Engine exhaust texture failed: ${message ?? profile.textureUrl}`))),
  });
  texture.gammaSpace = false;
  texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  material.setTexture("opticalLut", texture);
  material.setVector4("lutShape", new Vector4(profile.width, profile.height, 0, 0));
  material.setVector2("lutBank", new Vector2(profile.dry.firstRow, profile.dry.rowCount));
  material.setVector3("volumeMeters", new Vector3(1, 1, 1));
  material.setFloat("powerNorm", 0);
  material.setFloat("intensity", 0);
  material.setInt("sampleCount", 4);
  material.setFloat("outputGamma", scene.imageProcessingConfiguration.applyByPostProcess ? 0 : 1);
  const cameraLocal = Vector3.Zero();
  const inverse = Matrix.Identity();
  material.setVector3("cameraLocal", cameraLocal);
  material.onBindObservable.add(() => {
    if (!scene.activeCamera || mesh.isDisposed()) return;
    mesh.computeWorldMatrix(true).invertToRef(inverse);
    Vector3.TransformCoordinatesToRef(scene.activeCamera.globalPosition, inverse, cameraLocal);
    cameraLocal.z += 0.5;
    material.setVector3("cameraLocal", cameraLocal);
    // ShaderMaterial's stored-uniform upload precedes onBindObservable. The
    // current draw needs this camera, rather than the preceding draw's view.
    material.getEffect()?.setVector3("cameraLocal", cameraLocal);
  });

  const controller = new AbortController();
  let disposed = false;
  let settled = false;
  let settings = options.settings;
  let state: EngineExhaustState | null = null;
  let lastKey = "";
  let failed: Error | null = null;
  let resolveTerminal!: () => void;
  let rejectTerminal!: (error: Error) => void;
  const terminal = new Promise<void>((resolve, reject) => { resolveTerminal = resolve; rejectTerminal = reject; });
  let lastAperture = 0;
  const synchronize = (): void => {
    if (disposed) return;
    const inputFinite = state && Number.isFinite(state.powerNorm) && Number.isFinite(state.simulationTimeSeconds);
    const power = inputFinite ? unit(state!.powerNorm) : 0;
    if (Number.isFinite(state?.nozzlePositionNorm)) lastAperture = unit(state!.nozzlePositionNorm!);
    const aperture = lastAperture;
    const samples = Number.isFinite(settings.sampleCount) ? Math.max(4, Math.min(MAX_SAMPLES, Math.round(settings.sampleCount))) : 4;
    const intensity = Number.isFinite(settings.intensity) ? Math.min(8, Math.max(0, settings.intensity)) : 0;
    const distance = Number.isFinite(settings.maxDistanceMeters) ? Math.min(20_000, Math.max(1, settings.maxDistanceMeters)) : 0;
    const camera = scene.activeCamera;
    const source = anchor.getAbsolutePosition();
    const inRange = camera && Vector3.DistanceSquared(camera.globalPosition, source) <= distance * distance;
    const visible = Boolean(settled && !failed && inputFinite && state!.running && settings.enabled && intensity > 0 && inRange
      && !options.attachment.isDisposed() && options.attachment.isEnabled());
    const augmented = state?.augmentation === true;
    // These are declared visual extents, not a predicted F135 flow field.
    const length = options.lengthMeters * (augmented ? 0.7 + 0.3 * power : 0.2);
    const radius = options.closedRadiusMeters + aperture * (options.openRadiusMeters - options.closedRadiusMeters);
    // Only a visible source samples the artistic temporal envelope. Physics
    // owns the supplied time, so a paused partial state holds exactly.
    const emissionIntensity = intensity * (visible ? temporalEmission(profile, state!.simulationTimeSeconds) : 1);
    const key = [visible, augmented, power, samples, emissionIntensity, length, radius, scene.imageProcessingConfiguration.applyByPostProcess].join("/");
    if (key === lastKey) return;
    lastKey = key;
    mesh.scaling.set(radius / metresPerUnit, radius / metresPerUnit, length / metresPerUnit);
    mesh.position.z = length / metresPerUnit / 2;
    mesh.computeWorldMatrix(true);
    material.setFloat("powerNorm", power);
    material.setFloat("intensity", emissionIntensity);
    material.setInt("sampleCount", samples);
    material.setFloat("outputGamma", scene.imageProcessingConfiguration.applyByPostProcess ? 0 : 1);
    material.setVector3("volumeMeters", new Vector3(radius, radius, length));
    const bank = augmented ? profile.afterburner : profile.dry;
    material.setVector2("lutBank", new Vector2(bank.firstRow, bank.rowCount));
    const wasVisible = mesh.isEnabled();
    mesh.setEnabled(visible);
    const surfaceChanged = hotSurface?.update(power, visible, emissionIntensity);
    if (visible || wasVisible || surfaceChanged) options.requestRender?.();
  };
  function fail(error: Error): void {
    if (disposed) return;
    failed = error;
    rejectTerminal(error);
    cleanup();
  }
  function cleanup(external?: TransformNode): void {
    if (disposed) return;
    disposed = true;
    options.attachment.onDisposeObservable.remove(attachmentDisposed);
    mesh.onDisposeObservable.remove(meshDisposed);
    controller.abort();
    resolveTerminal();
    const wasVisible = mesh.isEnabled();
    // Model/LOD removal may already be recursively disposing a child. Never
    // re-enter that node's disposal; materials/textures are owned here.
    if (external !== mesh && !mesh.isDisposed()) mesh.dispose();
    material.dispose();
    texture.dispose();
    hotSurface?.dispose();
    if (external !== options.attachment && !anchor.isDisposed()) anchor.dispose();
    if (wasVisible) options.requestRender?.();
  }
  const attachmentDisposed = options.attachment.onDisposeObservable.add(() => cleanup(options.attachment));
  const meshDisposed = mesh.onDisposeObservable.add(() => cleanup(mesh));
  material.onError = (_effect, reason) => fail(new Error(`Engine exhaust shader failed: ${reason}`));
  const prepare = options.whenReady ?? ((meshes: readonly Mesh[], signal: AbortSignal) => whenMeshesReady(meshes, { signal }));
  const prepared = Promise.all([hotSurface?.ready, Promise.resolve().then(() => prepare([mesh], controller.signal))]);
  const ready = Promise.race([terminal, prepared]).then(() => {
    if (disposed) return;
    if (failed) throw failed;
    settled = true;
    hotSurface?.activate();
    synchronize();
  }).catch(error => {
    if (disposed && !failed) return;
    const reason = failed ?? (error instanceof Error ? error : new Error(String(error)));
    fail(reason);
    throw reason;
  });
  // The consumer can attach its error handler later in the same task; an
  // async texture failure during replacement must not become unhandled.
  void ready.catch(() => {});

  return {
    ready, mesh,
    update(next, nextSettings) {
      if (disposed) return;
      state = next;
      if (nextSettings) settings = nextSettings;
      anchor.computeWorldMatrix(true);
      synchronize();
    },
    dispose: () => cleanup(),
  };
}
