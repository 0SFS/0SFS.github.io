import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { createWheelSpinState, stepWheelSpin, WHEEL_SPIN_CONFIGS } from "./wheelSpin";
import type { WheelSpinInput, WheelSpinMode, WheelSpinState } from "./wheelSpin";

const METERS_PER_FOOT = 0.3048;
const NEWTONS_PER_POUND = 4.4482216152605;
// Matches the loaded c172p.xml. These estimate strut load; JSBSim does not bind
// a measured per-wheel normal-force property in the installed version.
const SPRING_POUNDS_PER_FOOT = [1800, 5400, 5400];
const DAMPING_POUNDS_PER_FOOT_SECOND = [600, 1600, 1600];
const GEAR_PROPERTIES = WHEEL_SPIN_CONFIGS.map((_, index) => ({
  wow: `gear/unit[${index}]/WOW`, compression: `gear/unit[${index}]/compression-ft`,
  compressionSpeed: `gear/unit[${index}]/compression-velocity-fps`,
  wheelSpeed: `gear/unit[${index}]/wheel-speed-fps`,
}));

export interface WheelSpinExperiment {
  step(dt: number, mode: WheelSpinMode): void;
  reset(): void;
  /** Stable objects updated in place; consumers must not modify them. */
  getStates(): readonly WheelSpinState[];
}

/**
 * Read-only, one-way adapter for visual/audio A/B testing. JSBSim already
 * supplies rolling/brake friction; applying it again double-counts work.
 * wheel-speed-fps is signed gear-frame contact motion, not physical tire
 * angular speed. Steering/tilted ground make this longitudinal velocity and
 * spring/damper load approximate.
 */
export function createWheelSpinExperiment(sdk: Pick<JSBSimSdk, "getPropertyValue">): WheelSpinExperiment {
  const states = WHEEL_SPIN_CONFIGS.map(() => createWheelSpinState());
  const input: WheelSpinInput = { onGround: false, rollMetersSec: 0, normalLoadNewtons: 0,
    compressionMeters: 0, steeringRad: 0, brake: 0 };
  const read = (name: string): number => {
    const value = sdk.getPropertyValue(name);
    return Number.isFinite(value) ? value : 0;
  };
  return {
    step(dt, mode) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      const leftBrake = read("fcs/left-brake-cmd-norm");
      const rightBrake = read("fcs/right-brake-cmd-norm");
      for (let index = 0; index < states.length; index++) {
        const properties = GEAR_PROPERTIES[index];
        input.onGround = read(properties.wow) > 0.5;
        input.brake = index === 1 ? leftBrake : index === 2 ? rightBrake : 0;
        input.steeringRad = 0;
        input.rollMetersSec = 0;
        input.normalLoadNewtons = 0;
        input.compressionMeters = 0;
        if (input.onGround) {
          const compressionFeet = Math.max(0, Math.min(3, read(properties.compression)));
          const compressionFeetSec = Math.max(-100, Math.min(100, read(properties.compressionSpeed)));
          input.compressionMeters = compressionFeet * METERS_PER_FOOT;
          input.normalLoadNewtons = Math.max(0, compressionFeet * SPRING_POUNDS_PER_FOOT[index]
            + compressionFeetSec * DAMPING_POUNDS_PER_FOOT_SECOND[index]) * NEWTONS_PER_POUND;
          input.rollMetersSec = read(properties.wheelSpeed) * METERS_PER_FOOT;
          if (index === 0) input.steeringRad = read("fcs/steer-pos-deg[0]") * Math.PI / 180;
        }
        stepWheelSpin(states[index], WHEEL_SPIN_CONFIGS[index], input, dt, mode);
      }
    },
    reset() {
      for (const state of states) Object.assign(state, createWheelSpinState());
    },
    getStates: () => states,
  };
}
