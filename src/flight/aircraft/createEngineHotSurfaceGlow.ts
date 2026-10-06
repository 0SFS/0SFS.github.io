import { AbstractMesh, Color3, Mesh, MultiMaterial, PBRMaterial, type BaseTexture, type Material, type TransformNode } from "@babylonjs/core";
import { whenMeshesReady } from "foss-earth/runtime";
import { interpolateAbsoluteEmission } from "./engineGasOptics";
import type { EngineExhaustOpticalProfile } from "./engineExhaustProfiles";

/** 0sfs owns engine thermal display on declared aircraft hardware. */
export function createEngineHotSurfaceGlow(attachment: TransformNode, names: readonly string[],
  profile: EngineExhaustOpticalProfile, options: {
    /** Qualification seam; production compiles while the original bindings remain shown. */
    compile?(material: PBRMaterial, mesh: AbstractMesh): Promise<void>;
  } = {}) {
  const samples = profile.surfaceEmission?.samples;
  const temperatures = profile.surfaceEmission?.temperatureKelvinRange;
  if (!samples || samples.length < 2 || samples.some(sample => sample.length !== 3
    || sample.some(value => !Number.isFinite(value) || value < 0))) {
    throw new Error("Declared hot engine hardware needs a finite baked thermal surface table");
  }
  if (profile.surfaceEmission?.unit !== "cd/m2") {
    throw new Error("Declared hot engine hardware needs surface luminance in cd/m2");
  }
  if (!temperatures || temperatures.length !== 2 || temperatures.some(value => !Number.isFinite(value) || value < 0)
    || temperatures[1] <= temperatures[0]) {
    throw new Error("Declared hot engine hardware needs finite increasing Kelvin bounds");
  }
  const allowed = new Set(names);
  const meshes = attachment.getChildMeshes();
  if (attachment instanceof AbstractMesh) meshes.unshift(attachment);
  const replacements: { mesh: AbstractMesh; original: Material; replacement: Material }[] = [];
  const clones = new Map<PBRMaterial, { material: PBRMaterial; meshes: Set<AbstractMesh>; rest: Color3; direct: number; environment: number; specular: number; ambient: Color3 }>();
  const multiClones: MultiMaterial[] = [];
  const ownedTextures = new Set<BaseTexture>();
  let disposed = false;
  let active = false;
  let prepared = false;
  let lastEmission = "";
  let reflectionEnabled = true;
  let lastTemperature = Number.NaN;
  let lastGain = Number.NaN;
  const black = [0, 0, 0];
  const controller = new AbortController();
  let cancel!: () => void;
  const cancellation = new Promise<void>(resolve => { cancel = resolve; });
  const clone = (original: Material | null, mesh: AbstractMesh): Material | null => {
    if (!original || !allowed.has(original.name)) return original;
    if (!(original instanceof PBRMaterial)) throw new Error(`Hot surface ${original.name} needs a PBR material`);
    const existing = clones.get(original);
    if (existing) { existing.meshes.add(mesh); return existing.material; }
    const sourceTextures = new Set(original.getActiveTextures());
    const material = original.clone(`${original.name}-engine-thermal`);
    for (const texture of material.getActiveTextures()) if (!sourceTextures.has(texture)) ownedTextures.add(texture);
    clones.set(original, { material, meshes: new Set([mesh]), rest: original.emissiveColor.clone(),
      direct: original.directIntensity, environment: original.environmentIntensity, specular: original.specularIntensity,
      ambient: original.ambientColor.clone() });
    return material;
  };
  try {
    for (const mesh of meshes) {
      const original = mesh.material;
      if (!original) continue;
      if (original instanceof MultiMaterial) {
        const children = original.subMaterials.map(material => clone(material, mesh));
        if (children.every((material, index) => material === original.subMaterials[index])) continue;
        const replacement = original.clone(`${original.name}-engine-thermal`, false);
        replacement.subMaterials = children;
        multiClones.push(replacement);
        replacements.push({ mesh, original, replacement });
      } else {
        const replacement = clone(original, mesh)!;
        if (replacement !== original) replacements.push({ mesh, original, replacement });
      }
    }
    if (!replacements.length) throw new Error(`No declared hot-surface materials found under ${attachment.name}`);
  } catch (error) {
    release();
    throw error;
  }
  function release(): void {
    for (const { mesh, original, replacement } of replacements) {
      if (!mesh.isDisposed() && mesh.material === replacement) mesh.material = original;
    }
    for (const material of multiClones) material.dispose(false, false, false);
    for (const { material } of clones.values()) material.dispose(false, false);
    for (const texture of ownedTextures) texture.dispose();
  }
  const compile = options.compile ?? (async (material: PBRMaterial, mesh: AbstractMesh) => {
    if (!(mesh instanceof Mesh)) throw new Error("Hot-surface preparation needs an authored mesh");
    // Shared geometry, kept hidden and discarded after compilation. Unlike
    // forceCompilationAsync's private polling, this wait can be cancelled.
    const proxy = mesh.clone(`${mesh.name}-thermal-prepare`, null, true, false);
    proxy.material = material;
    proxy.isPickable = false;
    proxy.setEnabled(false);
    try {
      await whenMeshesReady([proxy], { signal: controller.signal });
      for (const subMesh of proxy.subMeshes ?? []) {
        const reason = subMesh.effect?.getCompilationError();
        if (reason) throw new Error(`Hot engine surface shader failed: ${reason}`);
      }
    } finally { proxy.dispose(false, false); }
  });
  const preparation = Promise.all([...clones.values()].flatMap(({ material, meshes }) =>
    [...meshes].map(mesh => compile(material, mesh)))).then(() => { prepared = true; });
  const ready = Promise.race([preparation, cancellation]);
  void ready.catch(() => {});
  return {
    ready,
    /** The plume and surface clones are revealed together by their owner. */
    activate(): void {
      if (disposed || active || !prepared) return;
      for (const { mesh, replacement } of replacements) if (!mesh.isDisposed()) mesh.material = replacement;
      active = true;
    },
    /** Uniform-only diagnostic switch: preserves compiled shader variants/readiness. */
    setReflectionEnabled(enabled: boolean): boolean {
      if (disposed || !active || enabled === reflectionEnabled) return false;
      reflectionEnabled = enabled;
      for (const { material, direct, environment, specular, ambient } of clones.values()) {
        material.directIntensity = enabled ? direct : 0;
        material.environmentIntensity = enabled ? environment : 0;
        material.specularIntensity = enabled ? specular : 0;
        material.ambientColor.copyFrom(enabled ? ambient : Color3.Black());
      }
      return replacements.some(({ mesh }) => mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0);
    },
    /** Returns whether the visible hardware's emission changed. */
    update(temperatureKelvin: number | undefined, visible: boolean, amplitude: number,
      referenceLuminanceCdPerSquareMeter: number): boolean {
      if (disposed || !active) return false;
      // The declared native wall state owns thermal behavior; this renderer
      // adds no thermal time step or gas-to-metal temperature substitution.
      // Fuel, running, power, augmentation and artistic plume flicker do not
      // gate hardware incandescence. Resource visibility/intensity still do.
      const validTemperature = temperatureKelvin !== undefined && Number.isFinite(temperatureKelvin)
        && temperatureKelvin >= temperatures[0];
      // A cd/m²-to-display reference is a presentation parameter, not a
      // calibrated F135 camera/exposure model. Invalid references clear heat.
      const candidateGain = visible && validTemperature && Number.isFinite(amplitude)
        && Number.isFinite(referenceLuminanceCdPerSquareMeter) && referenceLuminanceCdPerSquareMeter > 0
        ? Math.max(0, amplitude) / referenceLuminanceCdPerSquareMeter : 0;
      const gain = Number.isFinite(candidateGain) ? candidateGain : 0;
      const temperature = gain > 0 ? Math.min(temperatures[1], temperatureKelvin!) : 0;
      if (temperature === lastTemperature && gain === lastGain) return false;
      lastTemperature = temperature;
      lastGain = gain;
      const interpolated = gain > 0
        ? interpolateAbsoluteEmission(profile.surfaceEmission!, temperature)!.map(value => value * gain) : black;
      // Invalid/out-of-contract presentation inputs cannot send infinities
      // into a material even when their ratio itself was still finite.
      const rgb = interpolated.every(Number.isFinite) ? interpolated : black;
      const key = rgb.join("/");
      if (key === lastEmission) return false;
      const hadLight = lastEmission !== "" && lastEmission !== "0/0/0";
      lastEmission = key;
      for (const { material, rest } of clones.values()) {
        material.emissiveColor.set(rest.r + rgb[0], rest.g + rgb[1], rest.b + rgb[2]);
      }
      return visible || hadLight;
    },
    /** Whether restoring a visible binding changed emission or isolated reflection. */
    dispose(): boolean {
      if (disposed) return false;
      const removedVisibleEmission = active && (!reflectionEnabled || (lastEmission !== "" && lastEmission !== "0/0/0"))
        && replacements.some(({ mesh, replacement }) => !mesh.isDisposed() && mesh.material === replacement
          && mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0);
      disposed = true;
      controller.abort();
      cancel();
      release();
      return removedVisibleEmission;
    },
  };
}
