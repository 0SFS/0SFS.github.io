/** 0sfs owns this optional pilot assist; aircraft data declares its schedule. */
export type AutomaticFlaps = {
  kind: "native";
  commandProperty: string;
} | {
  kind: "assist";
  /** Increasing indicated airspeed, with piecewise-linear commanded travel. */
  approach: readonly (readonly [airspeedKts: number, positionNorm: number])[];
  takeoffNorm: number;
  takeoffRetractionKts: readonly [start: number, complete: number];
  climbThrottleNorm: number;
  retractWithGear: boolean;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** A commanded position only. The native actuator still determines actual travel. */
export function automaticFlapCommand(schedule: Extract<AutomaticFlaps, { kind: "assist" }>, flight: {
  airspeedKts: number;
  throttleNorm: number;
  gearDown: boolean;
  onGround: boolean;
  currentCommand: number;
}): number {
  if (!Number.isFinite(flight.airspeedKts) || !Number.isFinite(flight.throttleNorm)) {
    return flight.currentCommand;
  }
  const speed = Math.max(0, flight.airspeedKts);
  // Keep landing flap through the rollout. A takeoff power request selects
  // the takeoff configuration; merely touching the runway does not retract it.
  if (flight.onGround && flight.throttleNorm < schedule.climbThrottleNorm) return clamp(flight.currentCommand);
  const points = schedule.approach;
  let command = points[points.length - 1][1];
  if (speed <= points[0][0]) command = points[0][1];
  else for (let i = 1; i < points.length; i++) {
    const [highSpeed, highPosition] = points[i];
    if (speed > highSpeed) continue;
    const [lowSpeed, lowPosition] = points[i - 1];
    command = lowPosition + (highPosition - lowPosition) * (speed - lowSpeed) / (highSpeed - lowSpeed);
    break;
  }
  // A speed-only schedule would deploy landing flap during the takeoff roll
  // and every slow climb. Use each aircraft's declared takeoff configuration.
  if (flight.throttleNorm >= schedule.climbThrottleNorm
    || (schedule.retractWithGear && !flight.gearDown)) {
    const [start, complete] = schedule.takeoffRetractionKts;
    command = Math.min(command, schedule.takeoffNorm * (1 - clamp((speed - start) / (complete - start))));
  }
  return clamp(command);
}
