import { AbstractMesh, Color3, Mesh, MultiMaterial, PBRMaterial, type BaseTexture, type Material, type TransformNode } from "@babylonjs/core";
import { whenMeshesReady } from "foss-earth/runtime";
import type { EngineExhaustOpticalProfile } from "./engineExhaustProfiles";

/** 0sfs owns engine thermal display on declared aircraft hardware. */
export function createEngineHotSurfaceGlow(attachment: TransformNode, names: readonly string[],
  profile: EngineExhaustOpticalProfile, options: {
    /** Qualification seam; production compiles while the original bindings remain shown. */
    compile?(material: PBRMaterial, mesh: AbstractMesh): Promise<void>;
  } = {}) {
  const samples = profile.surfaceEmission?.samples;
  if (!samples || samples.length < 2 || samples.some(sample => sample.length !== 3
    || sample.some(value => !Number.isFinite(value) || value < 0))) {
    throw new Error("Declared hot engine hardware needs a finite baked thermal surface table");
  }
  const allowed = new Set(names);
  const meshes = attachment.getChildMeshes();
  if (attachment instanceof AbstractMesh) meshes.unshift(attachment);
  const replacements: { mesh: AbstractMesh; original: Material; replacement: Material }[] = [];
  const clones = new Map<PBRMaterial, { material: PBRMaterial; meshes: Set<AbstractMesh>; rest: Color3 }>();
  const multiClones: MultiMaterial[] = [];
  const ownedTextures = new Set<BaseTexture>();
  let disposed = false;
  let active = false;
  let prepared = false;
  let lastEmission = "";
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
    clones.set(original, { material, meshes: new Set([mesh]), rest: original.emissiveColor.clone() });
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
    /** Returns whether the visible hardware's emission changed. */
    update(powerNorm: number, visible: boolean, amplitude: number): boolean {
      if (disposed || !active) return false;
      const finitePower = Number.isFinite(powerNorm);
      const position = (finitePower ? Math.min(1, Math.max(0, powerNorm)) : 0) * (samples.length - 1);
      const lower = Math.floor(position);
      const upper = Math.min(samples.length - 1, lower + 1);
      const fraction = position - lower;
      const gain = visible && finitePower && Number.isFinite(amplitude) ? Math.max(0, amplitude) : 0;
      const rgb = samples[lower].map((value, channel) => (value + (samples[upper][channel] - value) * fraction) * gain);
      const key = rgb.join("/");
      if (key === lastEmission) return false;
      const hadLight = lastEmission !== "" && lastEmission !== "0/0/0";
      lastEmission = key;
      for (const { material, rest } of clones.values()) {
        material.emissiveColor.set(rest.r + rgb[0], rest.g + rgb[1], rest.b + rgb[2]);
      }
      return visible || hadLight;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      controller.abort();
      cancel();
      release();
    },
  };
}
