import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import {
  Color3, Constants, Material, MeshBuilder, StandardMaterial, TransformNode, Vector3, VertexBuffer,
  type LinesMesh, type Mesh, type Scene,
} from "@babylonjs/core";
import { BODY_COLLISION_PROBES, C172_GROUND_CONTACTS, groundContactBodyPosition } from "../physics/collisionGeometry";

type MarkerKind = "body" | "wheel" | "structure" | "cg";
const COLORS: Record<MarkerKind, string> = {
  body: "#39dfff", wheel: "#ffbb46", structure: "#cc82ff", cg: "#ffffff",
};

/** Shows the actual point contacts, not an invented solid collision hull.
 * Local coordinates are aircraft left/up/forward in metres, centred on its CG.
 * Marker sizes and spokes are visibility aids, not physical collision geometry.
 */
export function createCollisionDebugOverlay(scene: Scene, parent: TransformNode, sdk: JSBSimSdk) {
  let enabled = false;
  let disposed = false;
  let root: TransformNode | null = null;
  let guides: LinesMesh | null = null;
  const materials: StandardMaterial[] = [];
  const bodyMarkers: Mesh[] = [];
  const groundMarkers: Mesh[] = [];
  const guidePositions = new Float32Array((BODY_COLLISION_PROBES.length + C172_GROUND_CONTACTS.length) * 6);
  const lastCg = { xIn: NaN, yIn: NaN, zIn: NaN };

  function createGeometry(): void {
    root = new TransformNode("collision-debug", scene);
    root.parent = parent;
    root.doNotSerialize = true;
    const palette = {} as Record<MarkerKind, StandardMaterial>;
    for (const kind of Object.keys(COLORS) as MarkerKind[]) {
      const material = new StandardMaterial(`collision-debug/${kind}-material`, scene);
      material.disableLighting = true;
      material.emissiveColor = Color3.FromHexString(COLORS[kind]);
      material.diffuseColor = material.emissiveColor;
      material.specularColor = Color3.Black();
      material.alpha = 0.95;
      material.transparencyMode = Material.MATERIAL_ALPHABLEND;
      material.depthFunction = Constants.ALWAYS;
      material.disableDepthWrite = true;
      material.doNotSerialize = true;
      materials.push(material);
      palette[kind] = material;
    }

    function marker(kind: MarkerKind, name: string): Mesh {
      const mesh = MeshBuilder.CreateSphere(`collision-debug/${kind}/${name}`,
        { diameter: kind === "cg" ? 0.18 : 0.24, segments: 4 }, scene);
      mesh.parent = root;
      mesh.material = palette[kind];
      mesh.isPickable = false;
      mesh.doNotSerialize = true;
      mesh.alwaysSelectAsActiveMesh = true;
      // Draw after the aircraft's transparent surfaces without changing the
      // scene's render groups or depth-buffer clearing policy.
      mesh.alphaIndex = 10001;
      mesh.metadata = { collisionDebug: { kind, name } };
      return mesh;
    }

    marker("cg", "center-of-gravity");
    for (const probe of BODY_COLLISION_PROBES) {
      const mesh = marker("body", probe.name);
      mesh.position.set(probe.left, probe.up, probe.forward);
      bodyMarkers.push(mesh);
    }
    for (const contact of C172_GROUND_CONTACTS) {
      const mesh = marker(contact.kind, contact.name);
      mesh.isVisible = false;
      groundMarkers.push(mesh);
    }
    const markers = [...bodyMarkers, ...groundMarkers];
    guides = MeshBuilder.CreateLineSystem("collision-debug/guides", {
      lines: markers.map(mesh => [Vector3.Zero(), mesh.position]), updatable: true,
    }, scene);
    guides.parent = root;
    guides.color = Color3.White();
    guides.alpha = 0.3;
    guides.alphaIndex = 10000;
    guides.isPickable = false;
    guides.alwaysSelectAsActiveMesh = true;
    guides.doNotSerialize = true;
    guides.metadata = { collisionDebug: { kind: "guides" } };
    // `CreateLineSystem` supplies a line material, but keep the nullable
    // public Babylon type honest rather than asserting it exists.
    const guideMaterial = guides.material;
    if (guideMaterial) {
      guideMaterial.depthFunction = Constants.ALWAYS;
      guideMaterial.disableDepthWrite = true;
    }
    for (let index = 0; index < bodyMarkers.length; index++) {
      bodyMarkers[index].position.toArray(guidePositions, index * 6 + 3);
    }
    guides.updateVerticesData(VertexBuffer.PositionKind, guidePositions);
  }

  function update(): void {
    if (!enabled || disposed || !guides) return;
    const xIn = sdk.getPropertyValue("inertia/cg-x-in");
    const yIn = sdk.getPropertyValue("inertia/cg-y-in");
    const zIn = sdk.getPropertyValue("inertia/cg-z-in");
    const valid = Number.isFinite(xIn) && Number.isFinite(yIn) && Number.isFinite(zIn);
    if (valid && xIn === lastCg.xIn && yIn === lastCg.yIn && zIn === lastCg.zIn) return;
    lastCg.xIn = xIn; lastCg.yIn = yIn; lastCg.zIn = zIn;
    for (let index = 0; index < groundMarkers.length; index++) {
      const mesh = groundMarkers[index];
      mesh.isVisible = valid;
      if (valid) {
        const position = groundContactBodyPosition(C172_GROUND_CONTACTS[index], lastCg);
        mesh.position.set(position.left, position.up, position.forward);
      } else {
        // Hide unknown contacts and collapse their guides, instead of showing
        // NaNs or a plausible-looking position based on a guessed CG.
        mesh.position.setAll(0);
      }
      mesh.position.toArray(guidePositions, (bodyMarkers.length + index) * 6 + 3);
    }
    guides.updateVerticesData(VertexBuffer.PositionKind, guidePositions);
  }

  return {
    setEnabled(value: boolean): void {
      if (disposed || value === enabled) return;
      enabled = value;
      if (enabled && !root) createGeometry();
      root?.setEnabled(enabled);
      if (enabled) update();
    },
    update,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      enabled = false;
      root?.dispose();
      for (const material of materials) material.dispose();
      root = null;
      guides = null;
    },
  };
}
