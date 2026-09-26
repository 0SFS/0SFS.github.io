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
import { flightParameterDefaults, type FlightParameters } from "../settings/flightParameters";

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
  /**
   * What the chase camera orbits in. `null` rides on the aircraft and turns
   * with every rotation it makes (the original). A world rotation — say,
   * heading alone — keeps the camera on the aircraft but out of the rotations
   * left out of it, so the horizon stays level through a roll. Call it each
   * frame after the aircraft moves.
   */
  setChaseFrame(rotation: Quaternion | null): void;
  /** Both flight cameras' vertical field of view, in degrees. */
  setFieldOfView(degrees: number): void;
  setViewMode(mode: FlightViewMode): void;
  toggleViewMode(): FlightViewMode;
  getViewMode(): FlightViewMode;
  dispose(): void;
}

const FIRST_PERSON_OFFSET = new Vector3(0, 0.2, 0.6);
const RADIANS_PER_DEGREE = Math.PI / 180;

function configureFlightCamera(camera: UniversalCamera, fieldOfViewDeg: number): void {
  camera.rotationQuaternion = Quaternion.RotationYawPitchRoll(Math.PI, 0, 0);
  camera.minZ = 0.5;
  camera.maxZ = 250_000;
  camera.fov = fieldOfViewDeg * RADIANS_PER_DEGREE;
  camera.inertia = 0.92;
}

/**
 * The osfs.camera.* parameters. The chase offset is read once, when the
 * aircraft is created; the limits are read on every orbit and zoom.
 */
export function createPlaceholderAircraft(
  scene: Scene,
  parent: TransformNode,
  parameters: FlightParameters = flightParameterDefaults(),
): AircraftEntity {
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
  configureFlightCamera(firstPersonCamera, parameters.get("osfs.camera.fieldOfView"));

  const thirdPersonCamera = new UniversalCamera("chase-camera", Vector3.Zero(), scene);
  thirdPersonCamera.parent = root;
  // Only used when the chase camera should not turn with the whole aircraft.
  const chasePivot = new TransformNode("chase-pivot", scene);
  chasePivot.rotationQuaternion = Quaternion.Identity();
  const chaseOffset = new Vector3(0, parameters.get("osfs.camera.chaseHeight"), -parameters.get("osfs.camera.chaseDistance"));
  thirdPersonCamera.position = chaseOffset.clone();
  configureFlightCamera(thirdPersonCamera, parameters.get("osfs.camera.fieldOfView"));

  let viewMode: FlightViewMode = "third";
  let chaseYaw = 0;
  let chasePitch = Math.atan2(chaseOffset.y, -chaseOffset.z);
  let chaseDistance = chaseOffset.length();
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
      const limits = parameters.get("osfs.camera.orbitPitchLimits");
      chaseYaw = (chaseYaw + yaw) % (2 * Math.PI);
      chasePitch = Math.max(limits.min * RADIANS_PER_DEGREE, Math.min(limits.max * RADIANS_PER_DEGREE, chasePitch + pitch));
      updateChaseCamera();
    },
    setChaseFrame(rotation): void {
      if (rotation === null) {
        if (thirdPersonCamera.parent !== root) thirdPersonCamera.parent = root;
        return;
      }
      chasePivot.position.copyFrom(root.getAbsolutePosition());
      chasePivot.rotationQuaternion!.copyFrom(rotation);
      if (thirdPersonCamera.parent !== chasePivot) thirdPersonCamera.parent = chasePivot;
    },
    setFieldOfView(degrees): void {
      firstPersonCamera.fov = degrees * RADIANS_PER_DEGREE;
      thirdPersonCamera.fov = degrees * RADIANS_PER_DEGREE;
    },
    zoomChaseCamera(factor): void {
      if (viewMode !== "third" || !Number.isFinite(factor) || factor <= 0) return;
      const limits = parameters.get("osfs.camera.chaseZoomLimits");
      chaseDistance = Math.max(limits.min, Math.min(limits.max, chaseDistance * factor));
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
      chasePivot.dispose();
      cockpit.dispose();
      modelRoot.dispose();
      material.dispose();
      for (const mesh of meshes) mesh.dispose();
      root.dispose();
    },
  };
}
