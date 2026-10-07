/**
 * Two pilots on one aircraft: a phone that has taken control while sharing is
 * Blend both, and this computer, whose own controls stay live. Spec:
 * `docs/proposals/phone-controller.md` → *Sharing the controls*.
 */
import type { ControlSurfaceState } from "../input/flightInputManager";
import type { BlendPriority } from "./controlSharing";

const LEVERS = ["throttle", "pitchTrim", "rollTrim", "flaps"] as const;
export type LeverSettings = Pick<ControlSurfaceState, (typeof LEVERS)[number]>;

/**
 * The priority's input, and whatever authority it leaves free given to the
 * other's: continuous, never past full travel, and the priority's full
 * deflection is all of it. A brake, 0 to 1, mixes the same way.
 */
export function mixAxis(priority: number, other: number): number {
  return priority + (1 - Math.abs(priority)) * other;
}

const levers = (controls: ControlSurfaceState): LeverSettings => ({
  throttle: controls.throttle, pitchTrim: controls.pitchTrim, rollTrim: controls.rollTrim, flaps: controls.flaps,
});

/**
 * Sticks, rudder and brake mix. A lever — throttle, trim, flaps — is where it
 * was last moved, by either pilot, the priority's when both move it at once;
 * the host then sets this computer's levers to the result, and the phone's
 * follow it from the status.
 *
 * A lever counts as moved here when it differs from what this computer was
 * last given, so automation writing it — trim assist, an engine holding its
 * throttle at idle — reaches the result as it would without a phone. Flaps
 * are the exception: automatic flaps write the actual travel back every
 * frame, so for them only the pilot's own flap input counts, by its revision.
 */
export function createControlBlend(start: ControlSurfaceState, localFlapsRevision: number) {
  const phone = levers(start);
  const local = levers(start);
  const applied = levers(start);
  let flapsRevision = localFlapsRevision;
  return {
    /** One physics step's controls from the phone's latest frame and this computer's. */
    step(phoneControls: ControlSurfaceState, localControls: ControlSurfaceState, localFlapsRevisionNow: number, priority: BlendPriority): ControlSurfaceState {
      for (const key of LEVERS) {
        const phoneMoved = phoneControls[key] !== phone[key];
        const localMoved = key === "flaps" ? localFlapsRevisionNow !== flapsRevision : localControls[key] !== local[key];
        if (phoneMoved && (!localMoved || priority === "phone")) applied[key] = phoneControls[key];
        else if (localMoved) applied[key] = localControls[key];
        phone[key] = phoneControls[key];
        local[key] = applied[key];
      }
      flapsRevision = localFlapsRevisionNow;
      const [first, second] = priority === "phone" ? [phoneControls, localControls] : [localControls, phoneControls];
      return {
        elevator: mixAxis(first.elevator, second.elevator),
        aileron: mixAxis(first.aileron, second.aileron),
        rudder: mixAxis(first.rudder, second.rudder),
        brake: mixAxis(first.brake, second.brake),
        ...applied,
      };
    },
    /** Where the levers are: what both pilots' levers should show. */
    levers: (): LeverSettings => ({ ...applied }),
  };
}
export type ControlBlend = ReturnType<typeof createControlBlend>;
