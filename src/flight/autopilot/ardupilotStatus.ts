/**
 * ArduPilot connection/readiness as the HUD and Autopilot tab understand it.
 * Stage-0 SITL is not in this slice: the selector is real, but engagement is
 * refused until a later bridge can report a confirmed Plane session.
 *
 * First user-facing capability (see docs/proposals/ardupilot-sitl.md): Circle /
 * LOITER after a manual climb. Do not invent a different ArduPilot product.
 */

export type ArduPilotLink = "not-connected" | "connecting" | "connected";

export interface ArduPilotStatus {
  link: ArduPilotLink;
  /** Confirmed vehicle identity, e.g. "ArduPlane". */
  identity: string | null;
  /** Confirmed mode, e.g. "LOITER". Stale reports stay labeled as such. */
  mode: string | null;
  /** True only after confirmed identity, estimator health, and actuator traffic. */
  ready: boolean;
  /** Fresh decoded servo commands from the bridge. Without this, AP must not own axes. */
  hasActuators: boolean;
  detail: string;
}

export const ARDUPILOT_NOT_CONNECTED_DETAIL =
  "ArduPilot SITL is not connected. Circle/LOITER after a manual climb is the first planned mode. JSBSim stays the flight dynamics model.";

export const DISCONNECTED_ARDUPILOT_STATUS: ArduPilotStatus = Object.freeze({
  link: "not-connected",
  identity: null,
  mode: null,
  ready: false,
  hasActuators: false,
  detail: ARDUPILOT_NOT_CONNECTED_DETAIL,
});

export function ardupilotCanOwnControls(status: ArduPilotStatus): boolean {
  return status.link === "connected" && status.ready && status.hasActuators;
}

export function describeArduPilotLink(status: ArduPilotStatus): string {
  if (status.link === "connecting") return "Connecting";
  if (status.link === "connected") return status.ready ? "Ready" : "Connected, not ready";
  return "Not connected";
}
