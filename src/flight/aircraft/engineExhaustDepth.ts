import { Constants, DepthRenderer, Matrix, Texture, type Scene, type Mesh, type AbstractMesh } from "@babylonjs/core";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";

/** Perspective division maps a front-of-camera box inside its projected corners. */
function projectedBounds(mesh: AbstractMesh, matrix: Matrix): readonly number[] | undefined {
  // A transform edited twice in one render id can bypass Babylon's usual
  // computeWorldMatrix fast path. Force only an unsynchronized hierarchy.
  mesh.computeWorldMatrix(!mesh.isSynchronized());
  const m = matrix.m;
  let left = Infinity, bottom = Infinity, right = -Infinity, top = -Infinity, nearest = Infinity, farthest = -Infinity;
  for (const { x, y, z } of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
    const w = x * m[3] + y * m[7] + z * m[11] + m[15];
    // Near-plane/camera crossings are retained, never clipped by this broad phase.
    if (w <= 1e-6) return undefined;
    const px = (x * m[0] + y * m[4] + z * m[8] + m[12]) / w;
    const py = (x * m[1] + y * m[5] + z * m[9] + m[13]) / w;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return undefined;
    left = Math.min(left, px); right = Math.max(right, px);
    bottom = Math.min(bottom, py); top = Math.max(top, py);
    nearest = Math.min(nearest, w); farthest = Math.max(farthest, w);
  }
  return [left, bottom, right, top, nearest, farthest];
}

/** 0sfs owns this optional opaque-depth pass used only by aircraft gas integration. */
export function createEngineExhaustDepth(scene: Scene, plume: Mesh, requestRender: () => void) {
  const renderer = new DepthRenderer(scene, Constants.TEXTURETYPE_FLOAT, null, false,
    Texture.NEAREST_SAMPLINGMODE, true, "engine-exhaust-opaque-depth");
  const texture = renderer.getDepthMap();
  const renderList: AbstractMesh[] = [];
  texture.renderList = renderList;
  const projection = Matrix.Identity();
  // This is privately scheduled. Never replace/disable another consumer's depth renderer.
  let active = false, disposed = false, ready = false, scale = 1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: AbstractMesh[] = [];
  const eligible = (mesh: AbstractMesh) => mesh !== plume && mesh.isEnabled() && mesh.isVisible && !mesh.infiniteDistance;
  const pendingNow = () => {
    const engine = scene.getEngine(), previousPass = engine.currentRenderPassId;
    const camera = scene.activeCamera;
    if (camera) camera.getViewMatrix().multiplyToRef(camera.getProjectionMatrix(), projection);
    const plumeBounds = camera ? projectedBounds(plume, projection) : undefined;
    const size = texture.getSize(), marginX = 2 / size.width, marginY = 2 / size.height;
    renderList.length = 0;
    const unresolved: AbstractMesh[] = [];
    try {
      // DepthRenderer selects the draw wrapper using the current render-pass ID.
      // Preflight must never replace a main-pass effect with a depth effect.
      engine.currentRenderPassId = texture.renderPassId;
      for (const mesh of scene.meshes) {
        if (!eligible(mesh)) continue;
        const instanced = Boolean(mesh.hasThinInstances || mesh.hasInstances);
        // Deformed/instanced geometry may extend beyond the base mesh bounds.
        const deformed = instanced || Boolean(mesh.skeleton || (mesh as Mesh).morphTargetManager);
        const bounds = plumeBounds && !deformed ? projectedBounds(mesh, projection) : undefined;
        // Retain every possible foreground occluder, even far from the engine in
        // world space. Disjoint screen bounds and boxes wholly behind the gas
        // cannot occlude any part of it.
        if (plumeBounds && bounds && (bounds[2] < plumeBounds[0] - marginX || bounds[0] > plumeBounds[2] + marginX
          || bounds[3] < plumeBounds[1] - marginY || bounds[1] > plumeBounds[3] + marginY
          // Perspective w is forward camera distance; orthographic w is constant,
          // so this test naturally declines to cull in that projection.
          || bounds[4] > plumeBounds[5] + 1e-6 * Math.max(1, plumeBounds[5]))) continue;
        let opaque = false, unready = false;
        for (const sub of mesh.subMeshes ?? []) {
          const material = sub.getMaterial();
          if (!material || material.disableDepthWrite || material.needAlphaBlendingForMesh(mesh) || sub.verticesCount === 0) continue;
          opaque = true;
          if (!renderer.isReady(sub, instanced)) unready = true;
        }
        if (opaque) renderList.push(mesh);
        if (unready) unresolved.push(mesh);
      }
      return unresolved;
    } finally { engine.currentRenderPassId = previousPass; }
  };
  const poll = () => {
    timer = undefined;
    if (!active || disposed) return;
    pending = pendingNow();
    if (pending.length) timer = setTimeout(poll, 50);
    else { ready = true; requestRender(); }
  };
  const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const resize = () => {
    const engine = scene.getEngine(), width = Math.max(1, Math.round(engine.getRenderWidth() * scale));
    const height = Math.max(1, Math.round(engine.getRenderHeight() * scale)), size = texture.getSize();
    if (size.width !== width || size.height !== height) texture.resize({ width, height });
  };
  const resizeObserver = scene.getEngine().onResizeObservable.add(() => { if (active) resize(); });
  // Check just before the render target pass, including newly arrived opaque content.
  const before = scene.onBeforeRenderObservable.add(() => {
    if (!active) return;
    pending = pendingNow();
    if (pending.length) {
      ready = false;
      if (timer === undefined) timer = setTimeout(poll, 50);
    } else ready = true;
  });
  return {
    texture,
    get ready() { return active && ready; },
    setActive(enabled: boolean, resolutionScale: number) {
      if (disposed) return;
      scale = Math.max(0.25, Math.min(1, Number.isFinite(resolutionScale) ? resolutionScale : 1));
      if (enabled) resize();
      if (active === enabled) return;
      active = enabled;
      if (enabled) {
        scene.customRenderTargets.push(texture);
        pending = pendingNow(); ready = pending.length === 0;
        if (!ready) timer = setTimeout(poll, 50);
      } else {
        const index = scene.customRenderTargets.indexOf(texture);
        if (index >= 0) scene.customRenderTargets.splice(index, 1);
        ready = false; cancel(); pending = [];
      }
    },
    dispose() {
      if (disposed) return;
      this.setActive(false, scale); disposed = true; cancel();
      scene.onBeforeRenderObservable.remove(before);
      scene.getEngine().onResizeObservable.remove(resizeObserver);
      renderer.dispose();
      // Privately scheduled instances are not in Scene._depthRenderer; Babylon
      // only disposes the texture for entries registered in that dictionary.
      texture.dispose();
    },
  };
}
