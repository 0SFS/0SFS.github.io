import { Quaternion, TransformNode, Vector3 } from "@babylonjs/core";
import { DEG_TO_RAD } from "../../camera/cameraMath";
import { buildWorldShiftMatrix } from "./enuFrame";
import { flightAttitudeToQuaternion } from "./ecefBridge";
import type { FlightState } from "../physics/flightState";

export interface FloatingOriginHandle {
  worldShift: TransformNode;
  aircraftRoot: TransformNode;
  apply(state: FlightState): void;
  dispose(): void;
}

export function createFloatingOrigin(scene: import("@babylonjs/core").Scene, worldContent: TransformNode): FloatingOriginHandle {
  const worldShift = new TransformNode("world-shift", scene);
  worldContent.parent = worldShift;
  worldContent.position = Vector3.Zero();
  worldContent.rotationQuaternion = Quaternion.Identity();

  const aircraftRoot = new TransformNode("aircraft-root", scene);

  return {
    worldShift,
    aircraftRoot,
    apply(state: FlightState): void {
      const latRad = state.latDeg * DEG_TO_RAD;
      const lonRad = state.lonDeg * DEG_TO_RAD;
      const shift = buildWorldShiftMatrix(latRad, lonRad, state.altMeters);

      const scale = new Vector3();
      const rotation = new Quaternion();
      const position = new Vector3();
      shift.decompose(scale, rotation, position);
      worldShift.scaling.copyFrom(scale);
      worldShift.rotationQuaternion = rotation;
      worldShift.position = position;

      aircraftRoot.rotationQuaternion = flightAttitudeToQuaternion(
        state.rollRad,
        state.pitchRad,
        state.headingRad,
      );
      aircraftRoot.position = Vector3.Zero();
    },
    dispose(): void {
      worldShift.position.set(0, 0, 0);
      worldShift.rotationQuaternion = Quaternion.Identity();
      worldShift.scaling.set(1, 1, 1);
      aircraftRoot.dispose();
      worldShift.dispose();
    },
  };
}
