import {
  Color3,
  MeshBuilder,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  UniversalCamera,
  Vector3,
  type AbstractMesh,
} from "@babylonjs/core";

export type FlightViewMode = "first" | "third";

export interface AircraftEntity {
  root: TransformNode;
  cockpit: TransformNode;
  /** Parent for an external aircraft mesh; hidden in cockpit view. */
  modelRoot: TransformNode;
  /** Hide the block placeholder once a real mesh is in `modelRoot`. */
  setModelLoaded(loaded: boolean): void;
  getChaseDistanceMeters(): number;
  firstPersonCamera: UniversalCamera;
  thirdPersonCamera: UniversalCamera;
  orbitChaseCamera(yaw: number, pitch: number): void;
  zoomChaseCamera(factor: number): void;
  setViewMode(mode: FlightViewMode): void;
  toggleViewMode(): FlightViewMode;
  getViewMode(): FlightViewMode;
  dispose(): void;
}

const FIRST_PERSON_OFFSET = new Vector3(0, 0.2, 0.6);
const THIRD_PERSON_OFFSET = new Vector3(0, 2.2, -14);

function configureFlightCamera(camera: UniversalCamera): void {
  camera.rotationQuaternion = Quaternion.RotationYawPitchRoll(Math.PI, 0, 0);
  camera.minZ = 0.5;
  camera.maxZ = 250_000;
  camera.fov = 1.05;
  camera.inertia = 0.92;
}

export function createPlaceholderAircraft(scene: Scene, parent: TransformNode): AircraftEntity {
  const root = new TransformNode("aircraft-visual", scene);
  root.parent = parent;

  const fuselage = MeshBuilder.CreateBox("fuselage", { width: 1.2, height: 1.4, depth: 8 }, scene);
  fuselage.parent = root;
  fuselage.position = new Vector3(0, 0.7, 0);

  const wing = MeshBuilder.CreateBox("wing", { width: 11, height: 0.15, depth: 1.8 }, scene);
  wing.parent = root;
  wing.position = new Vector3(0, 0.8, 0.2);

  const tail = MeshBuilder.CreateBox("tail", { width: 0.15, height: 2.2, depth: 1.4 }, scene);
  tail.parent = root;
  tail.position = new Vector3(0, 1.8, -3.4);

  const material = new StandardMaterial("aircraft-mat", scene);
  material.diffuseColor = Color3.FromHexString("#d8dee9");
  material.specularColor = Color3.FromHexString("#4c566a");
  const meshes: AbstractMesh[] = [fuselage, wing, tail];
  for (const mesh of meshes) {
    mesh.material = material;
    mesh.isVisible = false;
  }

  const modelRoot = new TransformNode("aircraft-model-root", scene);
  modelRoot.parent = root;

  const cockpit = new TransformNode("cockpit", scene);
  cockpit.parent = root;
  cockpit.position = new Vector3(0, 1.1, 1.8);
  cockpit.rotationQuaternion = Quaternion.Identity();

  const firstPersonCamera = new UniversalCamera("cockpit-camera", Vector3.Zero(), scene);
  firstPersonCamera.parent = cockpit;
  firstPersonCamera.position = FIRST_PERSON_OFFSET.clone();
  configureFlightCamera(firstPersonCamera);

  const thirdPersonCamera = new UniversalCamera("chase-camera", Vector3.Zero(), scene);
  thirdPersonCamera.parent = root;
  thirdPersonCamera.position = THIRD_PERSON_OFFSET.clone();
  configureFlightCamera(thirdPersonCamera);

  let viewMode: FlightViewMode = "third";
  let chaseYaw = 0;
  let chasePitch = Math.atan2(THIRD_PERSON_OFFSET.y, -THIRD_PERSON_OFFSET.z);
  let chaseDistance = THIRD_PERSON_OFFSET.length();
  const updateChaseCamera = (): void => {
    const horizontal = chaseDistance * Math.cos(chasePitch);
    thirdPersonCamera.position.set(Math.sin(chaseYaw) * horizontal, Math.sin(chasePitch) * chaseDistance, -Math.cos(chaseYaw) * horizontal);
    thirdPersonCamera.setTarget(Vector3.Zero());
  };
  updateChaseCamera();

  let modelLoaded = false;
  const setViewMode = (mode: FlightViewMode): void => {
    viewMode = mode;
    scene.activeCamera = mode === "first" ? firstPersonCamera : thirdPersonCamera;
    const exterior = mode === "third";
    // The placeholder blocks stand in only while no real mesh is loaded.
    for (const mesh of meshes) {
      mesh.isVisible = exterior && !modelLoaded;
    }
    modelRoot.setEnabled(exterior);
  };

  setViewMode("third");

  return {
    root,
    cockpit,
    modelRoot,
    setModelLoaded(loaded: boolean): void {
      modelLoaded = loaded;
      setViewMode(viewMode);
    },
    getChaseDistanceMeters(): number {
      return chaseDistance;
    },
    firstPersonCamera,
    thirdPersonCamera,
    orbitChaseCamera(yaw, pitch): void {
      if (viewMode !== "third" || !Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
      chaseYaw = (chaseYaw + yaw) % (2 * Math.PI);
      chasePitch = Math.max(-Math.PI / 3, Math.min(Math.PI * 0.45, chasePitch + pitch));
      updateChaseCamera();
    },
    zoomChaseCamera(factor): void {
      if (viewMode !== "third" || !Number.isFinite(factor) || factor <= 0) return;
      chaseDistance = Math.max(8, Math.min(500, chaseDistance * factor));
      updateChaseCamera();
    },
    setViewMode,
    toggleViewMode(): FlightViewMode {
      setViewMode(viewMode === "first" ? "third" : "first");
      return viewMode;
    },
    getViewMode(): FlightViewMode {
      return viewMode;
    },
    dispose(): void {
      firstPersonCamera.dispose();
      thirdPersonCamera.dispose();
      cockpit.dispose();
      modelRoot.dispose();
      material.dispose();
      for (const mesh of meshes) mesh.dispose();
      root.dispose();
    },
  };
}
