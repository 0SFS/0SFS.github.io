import { Constants, Mesh, MeshBuilder, ShaderLanguage, ShaderMaterial, Texture, Vector3, Vector4, type Scene, type TransformNode } from "@babylonjs/core";
import { whenMeshesReady } from "foss-earth/runtime";
import type { EngineExhaustState } from "./createEngineExhaust";
import type { EngineSmokeProfile } from "./engineSmokeProfiles";

/** 0sfs owns this bounded flight-specific trail, independently of engine light. */
export interface EngineSmokeSettings {
  enabled: boolean;
  maxParticles: number;
  emissionPerSecond: number;
  lifetimeSeconds: number;
  maxDistanceMeters: number;
  opacity: number;
}
/** Double precision is needed in the source frame as well as particle history. */
export interface EngineSmokeFrame { readonly m: ArrayLike<number> }
export interface EngineSmokeOptions {
  attachment: TransformNode;
  exitPosition: readonly [number, number, number];
  direction: readonly [number, number, number];
  profile: EngineSmokeProfile;
  settings: EngineSmokeSettings;
  /** Current ECEF-to-scene affine transform; null means no reliable trail frame. */
  getWorldFromEcef(): EngineSmokeFrame | null;
  requestRender?(): void;
  createTexture?(profile: EngineSmokeProfile, scene: Scene): Texture;
  whenReady?(meshes: readonly Mesh[], signal: AbortSignal): Promise<void>;
}
export interface EngineSmokeHandle {
  readonly ready: Promise<void>;
  readonly mesh: Mesh;
  update(state: EngineExhaustState, settings?: EngineSmokeSettings): void;
  resetEpoch(): void;
  dispose(): void;
}

export const ENGINE_SMOKE_GLSL_VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 world0;
attribute vec4 world1;
attribute vec4 world2;
attribute vec4 world3;
attribute vec2 ageOpacity;
uniform mat4 viewProjection;
uniform vec3 cameraRight;
uniform vec3 cameraUp;
varying vec2 vUv;
varying vec2 vAgeOpacity;
void main() {
  vec3 p = world3.xyz + (cameraRight * position.x + cameraUp * position.y) * world0.x;
  gl_Position = viewProjection * vec4(p, 1.0);
  vUv = uv;
  vAgeOpacity = ageOpacity;
}
`;
export const ENGINE_SMOKE_GLSL_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D smokeSprite;
uniform vec4 spriteShape;
uniform vec3 smokeColor;
uniform float outputGamma;
varying vec2 vUv;
varying vec2 vAgeOpacity;
void main() {
  float frame = min(spriteShape.z * spriteShape.w - 1.0, floor(vAgeOpacity.x * spriteShape.z * spriteShape.w));
  vec2 tile = vec2(mod(frame, spriteShape.z), floor(frame / spriteShape.z));
  vec2 tilePixels = spriteShape.xy / spriteShape.zw;
  vec2 sampleUv = (tile * tilePixels + vec2(0.5) + vUv * (tilePixels - vec2(1.0))) / spriteShape.xy;
  float alpha = texture2D(smokeSprite, sampleUv).a * vAgeOpacity.y;
  if (alpha < 0.0001) discard;
  vec3 low = 12.92 * smokeColor;
  vec3 high = 1.055 * pow(smokeColor, vec3(1.0 / 2.4)) - 0.055;
  vec3 color = mix(smokeColor, mix(low, high, step(vec3(0.0031308), smokeColor)), outputGamma);
  gl_FragColor = vec4(color, alpha);
}
`;
export const ENGINE_SMOKE_WGSL_VERTEX = /* wgsl */ `
attribute position : vec3<f32>;
attribute uv : vec2<f32>;
attribute world0 : vec4<f32>;
attribute world1 : vec4<f32>;
attribute world2 : vec4<f32>;
attribute world3 : vec4<f32>;
attribute ageOpacity : vec2<f32>;
uniform viewProjection : mat4x4<f32>;
uniform cameraRight : vec3<f32>;
uniform cameraUp : vec3<f32>;
varying vUv : vec2<f32>;
varying vAgeOpacity : vec2<f32>;
@vertex
fn main(input : VertexInputs) -> FragmentInputs {
  let p = vertexInputs.world3.xyz + (uniforms.cameraRight * vertexInputs.position.x + uniforms.cameraUp * vertexInputs.position.y) * vertexInputs.world0.x;
  vertexOutputs.position = uniforms.viewProjection * vec4<f32>(p, 1.0);
  vertexOutputs.vUv = vertexInputs.uv;
  vertexOutputs.vAgeOpacity = vertexInputs.ageOpacity;
}
`;
export const ENGINE_SMOKE_WGSL_FRAGMENT = /* wgsl */ `
uniform spriteShape : vec4<f32>;
uniform smokeColor : vec3<f32>;
uniform outputGamma : f32;
var smokeSprite : texture_2d<f32>;
var smokeSpriteSampler : sampler;
varying vUv : vec2<f32>;
varying vAgeOpacity : vec2<f32>;
@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let frame = min(uniforms.spriteShape.z * uniforms.spriteShape.w - 1.0, floor(fragmentInputs.vAgeOpacity.x * uniforms.spriteShape.z * uniforms.spriteShape.w));
  let tile = vec2<f32>(frame % uniforms.spriteShape.z, floor(frame / uniforms.spriteShape.z));
  let tilePixels = uniforms.spriteShape.xy / uniforms.spriteShape.zw;
  let sampleUv = (tile * tilePixels + vec2<f32>(0.5) + fragmentInputs.vUv * (tilePixels - vec2<f32>(1.0))) / uniforms.spriteShape.xy;
  let alpha = textureSample(smokeSprite, smokeSpriteSampler, sampleUv).a * fragmentInputs.vAgeOpacity.y;
  if (alpha < 0.0001) { discard; }
  let low = 12.92 * uniforms.smokeColor;
  let high = 1.055 * pow(uniforms.smokeColor, vec3<f32>(1.0 / 2.4)) - 0.055;
  let color = mix(uniforms.smokeColor, select(high, low, uniforms.smokeColor <= vec3<f32>(0.0031308)), uniforms.outputGamma);
  fragmentOutputs.color = vec4<f32>(color, alpha);
}
`;

const bound = (value: number, lower: number, upper: number): number => Number.isFinite(value) ? Math.min(upper, Math.max(lower, value)) : lower;

/** Invert the affine transform in double precision: never round Earth-radius
 * birth/history coordinates through Babylon's optionally Float32 Matrix. */
function inverseAffine(matrix: EngineSmokeFrame, target: Float64Array): boolean {
  const m = matrix.m;
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return false;
  target.set([(e * i - f * h) / determinant, (c * h - b * i) / determinant, (b * f - c * e) / determinant,
    (f * g - d * i) / determinant, (a * i - c * g) / determinant, (c * d - a * f) / determinant,
    (d * h - e * g) / determinant, (b * g - a * h) / determinant, (a * e - b * d) / determinant]);
  for (let row = 0; row < 3; row++) target[9 + row] = -(target[row * 3] * m[12] + target[row * 3 + 1] * m[13] + target[row * 3 + 2] * m[14]);
  return target.every(Number.isFinite);
}
function sceneToEcef(inverse: Float64Array, point: Vector3, target: Float64Array): void {
  for (let row = 0; row < 3; row++) target[row] = inverse[row * 3] * point.x + inverse[row * 3 + 1] * point.y + inverse[row * 3 + 2] * point.z + inverse[9 + row];
}

export function createEngineSmoke(scene: Scene, options: EngineSmokeOptions): EngineSmokeHandle {
  const profile = options.profile;
  if (![...options.exitPosition, ...options.direction, ...profile.colorLinear, profile.initialRadiusMeters,
    profile.finalRadiusMeters, profile.exitSpeedMetersPerSecond].every(Number.isFinite)
    || Vector3.FromArray(options.direction).lengthSquared() < 1e-12 || profile.initialRadiusMeters <= 0
    || profile.finalRadiusMeters <= 0 || profile.exitSpeedMetersPerSecond < 0
    || ![profile.width, profile.height, profile.columns, profile.rows].every(value => Number.isInteger(value) && value > 0)) {
    throw new Error("Engine smoke needs finite declared geometry and sprite data");
  }
  const mesh = MeshBuilder.CreatePlane(`engine-smoke-${profile.id}`, { size: 2 }, scene);
  mesh.setEnabled(false);
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  // Custom vertex positions are projected from ECEF each update. Ordinary
  // geometry bounds do not describe them; distance culling is explicit below.
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;
  mesh.metadata = { aircraftVisualOnly: true, castsShadows: false, smokeProfileId: profile.id };
  const webGpu = scene.getEngine().isWebGPU;
  const material = new ShaderMaterial(`${mesh.name}-material`, scene, {
    vertexSource: webGpu ? ENGINE_SMOKE_WGSL_VERTEX : ENGINE_SMOKE_GLSL_VERTEX,
    fragmentSource: webGpu ? ENGINE_SMOKE_WGSL_FRAGMENT : ENGINE_SMOKE_GLSL_FRAGMENT,
  }, {
    // ShaderMaterial appends world0..world3 when compiling the instanced
    // variant. Listing them here as well duplicates WebGPU attribute slots.
    attributes: ["position", "uv", "ageOpacity"],
    uniforms: ["viewProjection", "cameraRight", "cameraUp", "spriteShape", "smokeColor", "outputGamma"],
    samplers: ["smokeSprite"], needAlphaBlending: true,
    shaderLanguage: webGpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
  });
  mesh.material = material;
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.alphaMode = Constants.ALPHA_COMBINE;
  const texture = options.createTexture?.(profile, scene) ?? new Texture(profile.textureUrl, scene, {
    noMipmap: true, invertY: false, samplingMode: Texture.BILINEAR_SAMPLINGMODE,
    onError: reason => queueMicrotask(() => fail(new Error(`Engine smoke texture failed: ${reason ?? profile.textureUrl}`))),
  });
  texture.gammaSpace = false;
  texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  material.setTexture("smokeSprite", texture);
  material.setVector4("spriteShape", new Vector4(profile.width, profile.height, profile.columns, profile.rows));
  material.setVector3("smokeColor", Vector3.FromArray(profile.colorLinear));
  material.setFloat("outputGamma", scene.imageProcessingConfiguration.applyByPostProcess ? 0 : 1);
  const cameraRight = Vector3.Right(), cameraUp = Vector3.Up();
  material.setVector3("cameraRight", cameraRight); material.setVector3("cameraUp", cameraUp);
  material.onBindObservable.add(() => {
    const camera = scene.activeCamera;
    if (!camera) return;
    const m = camera.getWorldMatrix().m;
    cameraRight.set(m[0], m[1], m[2]).normalize(); cameraUp.set(m[4], m[5], m[6]).normalize();
    const effect = material.getEffect();
    effect?.setVector3("cameraRight", cameraRight); effect?.setVector3("cameraUp", cameraUp);
  });
  let settings = options.settings;
  let capacity = -1;
  let births = new Float64Array(), positions = new Float64Array(), velocities = new Float64Array();
  let matrices = new Float32Array(), ages = new Float32Array();
  let nextSlot = 0, emissionRemainder = 0, lastTime = Number.NaN;
  const previousBirth = new Float64Array(3), birth = new Float64Array(3), directionPoint = new Float64Array(3);
  const inverse = new Float64Array(12);
  const exit = Vector3.Zero(), worldDirection = Vector3.Zero(), directionWorldPoint = Vector3.Zero();
  let disposed = false, prepared = false, failed: Error | null = null;
  let state: EngineExhaustState | null = null;
  const controller = new AbortController();
  let resolveTerminal!: () => void, rejectTerminal!: (error: Error) => void;
  const terminal = new Promise<void>((resolve, reject) => { resolveTerminal = resolve; rejectTerminal = reject; });
  const allocate = (): void => {
    const nextCapacity = Math.round(bound(settings.maxParticles, 0, 512));
    if (capacity === nextCapacity) return;
    capacity = nextCapacity;
    births = new Float64Array(capacity).fill(Number.NaN);
    positions = new Float64Array(capacity * 3); velocities = new Float64Array(capacity * 3);
    matrices = new Float32Array(Math.max(1, capacity) * 16); ages = new Float32Array(Math.max(1, capacity) * 2);
    matrices[15] = 1;
    mesh.thinInstanceSetBuffer("matrix", matrices, 16, false);
    mesh.thinInstanceSetBuffer("ageOpacity", ages, 2, false);
    // Compile the instanced variant even if no live particles exist yet.
    mesh.thinInstanceCount = prepared ? 0 : 1;
    nextSlot = 0; emissionRemainder = 0; lastTime = Number.NaN;
  };
  allocate();
  const hide = (): void => {
    const visible = mesh.isEnabled(); mesh.setEnabled(false);
    if (visible) options.requestRender?.();
  };
  const reset = (): void => {
    if (disposed) return;
    births.fill(Number.NaN); emissionRemainder = 0; lastTime = Number.NaN; nextSlot = 0;
    mesh.thinInstanceCount = prepared ? 0 : 1;
    hide();
  };
  const synchronize = (): void => {
    if (disposed) return;
    allocate();
    const finiteState = state && Number.isFinite(state.simulationTimeSeconds) && Number.isFinite(state.powerNorm);
    if (!finiteState || options.attachment.isDisposed()
      || !settings.enabled || capacity === 0) { reset(); return; }
    const time = state!.simulationTimeSeconds;
    const lifetime = bound(settings.lifetimeSeconds, 0.1, 10);
    const opacity = bound(settings.opacity, 0, 1);
    const rate = bound(settings.emissionPerSecond, 0, 128);
    const distance = bound(settings.maxDistanceMeters, 1, 20_000);
    const attachmentWorld = options.attachment.computeWorldMatrix(true);
    Vector3.TransformCoordinatesFromFloatsToRef(...options.exitPosition, attachmentWorld, exit);
    const inRange = scene.activeCamera && Vector3.DistanceSquared(scene.activeCamera.globalPosition, exit) <= distance * distance;
    if (!inRange || opacity === 0 || !options.attachment.isEnabled()) { reset(); return; }
    const frame = options.getWorldFromEcef();
    let frameFinite = frame !== null && frame.m.length === 16;
    if (frameFinite) for (let index = 0; index < 16; index++) if (!Number.isFinite(frame!.m[index])) frameFinite = false;
    if (!frame || !frameFinite) { reset(); return; }
    Vector3.TransformNormalFromFloatsToRef(...options.direction, attachmentWorld, worldDirection);
    worldDirection.normalize();
    directionWorldPoint.copyFrom(exit).addInPlace(worldDirection);
    if (!inverseAffine(frame, inverse)) { reset(); return; }
    sceneToEcef(inverse, exit, birth); sceneToEcef(inverse, directionWorldPoint, directionPoint);
    const canEmit = state!.running && options.attachment.isEnabled() && opacity > 0 && inRange;
    let delta = Number.isFinite(lastTime) ? time - lastTime : 0;
    if (delta < 0 || delta > lifetime) { reset(); delta = 0; }
    if (delta === 0 && !Number.isFinite(lastTime)) previousBirth.set(birth);
    if (canEmit && delta > 0 && rate > 0) {
      const total = emissionRemainder + delta * rate;
      const count = Math.floor(total);
      const oldRemainder = emissionRemainder;
      emissionRemainder = total - count;
      // At most the user-selected capacity is spawned. Interpolate births
      // along motion; retain only the latest events when the budget is full.
      for (let event = Math.max(0, count - capacity); event < count; event++) {
        const elapsed = (event + 1 - oldRemainder) / rate;
        const fraction = Math.min(1, Math.max(0, elapsed / delta));
        const slot = nextSlot++ % capacity;
        births[slot] = time - delta + elapsed;
        for (let axis = 0; axis < 3; axis++) {
          positions[slot * 3 + axis] = previousBirth[axis] + (birth[axis] - previousBirth[axis]) * fraction;
          velocities[slot * 3 + axis] = (directionPoint[axis] - birth[axis]) * profile.exitSpeedMetersPerSecond;
        }
      }
    } else if (!canEmit || rate === 0) emissionRemainder = 0;
    previousBirth.set(birth); lastTime = time;
    let active = 0, buffersChanged = false;
    const write = (array: Float32Array, index: number, value: number): void => {
      const rounded = Math.fround(value);
      if (array[index] !== rounded) { array[index] = rounded; buffersChanged = true; }
    };
    const m = frame.m;
    for (let slot = 0; slot < capacity; slot++) {
      const age = time - births[slot];
      if (!Number.isFinite(age) || age < 0) continue;
      if (age >= lifetime) { births[slot] = Number.NaN; continue; }
      const fraction = age / lifetime;
      const base = slot * 3;
      const x = positions[base] + velocities[base] * age;
      const y = positions[base + 1] + velocities[base + 1] * age;
      const z = positions[base + 2] + velocities[base + 2] * age;
      // All ECEF arithmetic remains double until the small current-frame
      // projection is complete. Never upload planet-scale coordinates.
      const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
      if (!Number.isFinite(wx) || !Number.isFinite(wy) || !Number.isFinite(wz)) continue;
      const radius = profile.initialRadiusMeters + (profile.finalRadiusMeters - profile.initialRadiusMeters) * fraction;
      const matrixBase = active * 16;
      write(matrices, matrixBase, radius); write(matrices, matrixBase + 5, radius); write(matrices, matrixBase + 10, radius);
      write(matrices, matrixBase + 12, wx); write(matrices, matrixBase + 13, wy); write(matrices, matrixBase + 14, wz); write(matrices, matrixBase + 15, 1);
      write(ages, active * 2, fraction);
      const fade = Math.min(1, fraction * 8) * (1 - fraction) * (1 - fraction);
      write(ages, active * 2 + 1, opacity * fade);
      active++;
    }
    const oldCount = mesh.thinInstanceCount;
    mesh.thinInstanceCount = prepared ? active : Math.max(1, active);
    if (buffersChanged) {
      mesh.thinInstanceBufferUpdated("matrix"); mesh.thinInstanceBufferUpdated("ageOpacity");
    }
    material.setFloat("outputGamma", scene.imageProcessingConfiguration.applyByPostProcess ? 0 : 1);
    const wasVisible = mesh.isEnabled();
    const visible = Boolean(prepared && active > 0 && opacity > 0 && inRange && options.attachment.isEnabled());
    mesh.setEnabled(visible);
    if (visible !== wasVisible || visible && (buffersChanged || oldCount !== active)) options.requestRender?.();
  };
  function fail(error: Error): void { if (!disposed) { failed = error; rejectTerminal(error); cleanup(); } }
  function cleanup(externalMesh = false): void {
    if (disposed) return;
    disposed = true; controller.abort(); resolveTerminal();
    options.attachment.onDisposeObservable.remove(attachmentDisposed);
    mesh.onDisposeObservable.remove(meshDisposed);
    const visible = mesh.isEnabled();
    if (!externalMesh && !mesh.isDisposed()) mesh.dispose();
    material.dispose(); texture.dispose();
    if (visible) options.requestRender?.();
  }
  const attachmentDisposed = options.attachment.onDisposeObservable.add(() => cleanup());
  const meshDisposed = mesh.onDisposeObservable.add(() => cleanup(true));
  material.onError = (_effect, reason) => fail(new Error(`Engine smoke shader failed: ${reason}`));
  const prepare = options.whenReady ?? ((meshes: readonly Mesh[], signal: AbortSignal) => whenMeshesReady(meshes, { signal }));
  const ready = Promise.race([terminal, Promise.resolve().then(() => prepare([mesh], controller.signal))]).then(() => {
    if (disposed) return;
    prepared = true; synchronize();
  }).catch(error => {
    if (disposed && !failed) return;
    const reason = failed ?? (error instanceof Error ? error : new Error(String(error)));
    fail(reason); throw reason;
  });
  void ready.catch(() => {});
  return {
    ready, mesh,
    update(next, nextSettings) { if (!disposed) { state = next; if (nextSettings) settings = nextSettings; synchronize(); } },
    resetEpoch: reset,
    dispose: () => cleanup(),
  };
}
