import {
  Axis,
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import type { LinesMesh, Scene } from "@babylonjs/core";

export interface OrbitCompassScaleParams {
  radiusScale: number;
  minRadius: number;
  maxRadius: number;
  labelSizeScale: number;
}

export const DEFAULT_ORBIT_COMPASS_SCALE_PARAMS: OrbitCompassScaleParams = {
  radiusScale: 0.035,
  minRadius: 750,
  maxRadius: 240_000,
  labelSizeScale: 0.16,
};

const LABEL_RADIUS_SCALE = 1.28;
const SURFACE_LIFT_SCALE = 0.08;
const MIN_SURFACE_LIFT_METERS = 150;
const MAX_SURFACE_LIFT_METERS = 16_000;
const ANCHOR_EPSILON_METERS = 1;
const RADIUS_EPSILON_METERS = 500;
const COMPASS_OPACITY = 0.5;
const WHITE_LINE_ALPHA_FACTOR = 0.25;
const RED_LINE_ALPHA_FACTOR = 1;
// Lines fade out over this fraction of minRadius as the natural (pre-clamp) radius drops below it.
const LINE_FADE_BAND = 0.5;

export interface OrbitCompassHandle {
  update(anchor: Vector3 | null, zoomDistance: number): void;
  setScaleParams(params: OrbitCompassScaleParams): void;
  isMesh(mesh: Mesh | null | undefined): boolean;
  destroy(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeScaleParams(params: OrbitCompassScaleParams): OrbitCompassScaleParams {
  const radiusScale = Math.max(0.000001, params.radiusScale);
  const minRadius = Math.max(1, params.minRadius);
  const maxRadius = Math.max(minRadius, params.maxRadius);
  const labelSizeScale = Math.max(0.000001, params.labelSizeScale);
  return { radiusScale, minRadius, maxRadius, labelSizeScale };
}

function createLine(name: string, color: Color3, scene: Scene, width = 1): LinesMesh {
  const line = MeshBuilder.CreateLines(
    name,
    { points: [Vector3.Zero(), Vector3.Zero()], updatable: true },
    scene,
  );
  line.color = color;
  line.alpha = (color === Color3.White() ? WHITE_LINE_ALPHA_FACTOR : RED_LINE_ALPHA_FACTOR) * COMPASS_OPACITY;
  line.enableEdgesRendering();
  line.edgesWidth = width;
  line.isPickable = false;
  line.setEnabled(false);
  return line;
}

function createLabel(text: string, color: string, scene: Scene): Mesh {
  const texture = new DynamicTexture(`orbit-compass-label-${text}-texture`, { width: 128, height: 128 }, scene, true);
  texture.hasAlpha = true;
  texture.drawText(text, null, null, "bold 72px system-ui", color, "transparent", true, true);

  const material = new StandardMaterial(`orbit-compass-label-${text}-material`, scene);
  material.diffuseTexture = texture;
  material.opacityTexture = texture;
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  material.useAlphaFromDiffuseTexture = true;
  material.alpha = COMPASS_OPACITY;
  material.backFaceCulling = false;

  const label = MeshBuilder.CreatePlane(`orbit-compass-label-${text}`, { size: 1 }, scene);
  label.material = material;
  label.billboardMode = Mesh.BILLBOARDMODE_ALL;
  label.isPickable = false;
  label.setEnabled(false);
  return label;
}

function getAnchorBasis(anchor: Vector3): { east: Vector3; north: Vector3; up: Vector3 } {
  const up = anchor.normalizeToNew();
  const poleSafeAxis = Math.abs(Vector3.Dot(up, Axis.Z)) > 0.98 ? Axis.Y : Axis.Z;
  const east = Vector3.Cross(poleSafeAxis, up).normalize();
  const north = Vector3.Cross(up, east).normalize();
  return { east, north, up };
}

function offsetPoint(
  base: Vector3,
  east: Vector3,
  north: Vector3,
  up: Vector3,
  eastMeters: number,
  northMeters: number,
  upMeters = 0,
): Vector3 {
  return base
    .add(east.scale(eastMeters))
    .add(north.scale(northMeters))
    .add(up.scale(upMeters));
}

function setLine(line: LinesMesh, start: Vector3, end: Vector3, scene: Scene): void {
  MeshBuilder.CreateLines(line.name, { points: [start, end], instance: line }, scene);
}

export function createOrbitCompass(scene: Scene): OrbitCompassHandle {
  const eastWestAxis = createLine("orbit-compass-east-west-axis", Color3.White(), scene);
  const northSouthAxis = createLine("orbit-compass-north-south-axis", Color3.White(), scene);
  const northNeedle = createLine("orbit-compass-north-needle", Color3.FromHexString("#ef4444"), scene, 3);
  const northLabel = createLabel("N", "#ef4444", scene);
  const eastLabel = createLabel("E", "rgba(255,255,255,0.78)", scene);
  const southLabel = createLabel("S", "rgba(255,255,255,0.64)", scene);
  const westLabel = createLabel("W", "rgba(255,255,255,0.78)", scene);
  const meshes = [eastWestAxis, northSouthAxis, northNeedle, northLabel, eastLabel, southLabel, westLabel];
  const meshSet = new Set<Mesh>(meshes);
  let scaleParams = DEFAULT_ORBIT_COMPASS_SCALE_PARAMS;
  let lastAnchor: Vector3 | null = null;
  let lastRadiusMeters = -1;

  function hide(): void {
    for (const mesh of meshes) {
      mesh.setEnabled(false);
    }
  }

  function rebuildGeometry(anchor: Vector3, radiusMeters: number): void {
    const { east, north, up } = getAnchorBasis(anchor);
    const surfaceLift = clamp(radiusMeters * SURFACE_LIFT_SCALE, MIN_SURFACE_LIFT_METERS, MAX_SURFACE_LIFT_METERS);
    const labelRadius = radiusMeters * LABEL_RADIUS_SCALE;
    const labelLift = surfaceLift * 0.4;
    const center = offsetPoint(anchor, east, north, up, 0, 0, surfaceLift);

    setLine(
      eastWestAxis,
      offsetPoint(center, east, north, up, -radiusMeters, 0),
      offsetPoint(center, east, north, up, radiusMeters, 0),
      scene,
    );
    setLine(
      northSouthAxis,
      offsetPoint(center, east, north, up, 0, -radiusMeters),
      center,
      scene,
    );
    setLine(
      northNeedle,
      center,
      offsetPoint(center, east, north, up, 0, radiusMeters * 0.95),
      scene,
    );

    const labelScale = clamp(radiusMeters * scaleParams.labelSizeScale, 800, 32_000);
    for (const label of [northLabel, eastLabel, southLabel, westLabel]) {
      label.scaling.setAll(labelScale);
    }
    northLabel.position.copyFrom(offsetPoint(center, east, north, up, 0, labelRadius, labelLift));
    eastLabel.position.copyFrom(offsetPoint(center, east, north, up, labelRadius, 0, labelLift));
    southLabel.position.copyFrom(offsetPoint(center, east, north, up, 0, -labelRadius, labelLift));
    westLabel.position.copyFrom(offsetPoint(center, east, north, up, -labelRadius, 0, labelLift));
  }

  return {
    update(anchor: Vector3 | null, zoomDistance: number): void {
      if (!anchor) {
        lastAnchor = null;
        lastRadiusMeters = -1;
        hide();
        return;
      }

      const naturalRadius = zoomDistance * scaleParams.radiusScale;
      const radiusMeters = clamp(naturalRadius, scaleParams.minRadius, scaleParams.maxRadius);
      const anchorChanged = !lastAnchor || Vector3.Distance(anchor, lastAnchor) > ANCHOR_EPSILON_METERS;
      const radiusChanged = Math.abs(radiusMeters - lastRadiusMeters) > RADIUS_EPSILON_METERS;
      if (anchorChanged || radiusChanged) {
        rebuildGeometry(anchor, radiusMeters);
        lastAnchor = anchor.clone();
        lastRadiusMeters = radiusMeters;
      }

      // Fade axis lines (not labels) as the camera zooms in past the minRadius clamp.
      const fadeStart = scaleParams.minRadius;
      const fadeEnd = scaleParams.minRadius * (1 - LINE_FADE_BAND);
      const fadeFactor = fadeStart <= fadeEnd
        ? 1
        : clamp((naturalRadius - fadeEnd) / (fadeStart - fadeEnd), 0, 1);
      const linesVisible = fadeFactor > 0.001;
      eastWestAxis.alpha = WHITE_LINE_ALPHA_FACTOR * COMPASS_OPACITY * fadeFactor;
      northSouthAxis.alpha = WHITE_LINE_ALPHA_FACTOR * COMPASS_OPACITY * fadeFactor;
      northNeedle.alpha = RED_LINE_ALPHA_FACTOR * COMPASS_OPACITY * fadeFactor;

      for (const mesh of meshes) {
        if (mesh === eastWestAxis || mesh === northSouthAxis || mesh === northNeedle) {
          mesh.setEnabled(linesVisible);
        } else {
          mesh.setEnabled(true);
        }
      }
    },

    setScaleParams(params: OrbitCompassScaleParams): void {
      scaleParams = normalizeScaleParams(params);
      lastRadiusMeters = -1;
    },

    isMesh(mesh: Mesh | null | undefined): boolean {
      return mesh !== null && mesh !== undefined && meshSet.has(mesh);
    },

    destroy(): void {
      for (const mesh of meshes) {
        mesh.dispose();
      }
    },
  };
}