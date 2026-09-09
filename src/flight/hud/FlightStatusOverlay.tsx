import { AlertTriangle, Loader } from "lucide-react";

/**
 * Centre-screen notice for the two ways the simulation stops on its own.
 *
 * A fault pauses it outright. A missing terrain sample is quieter and was the
 * more confusing of the two: the fixed-step loop declines to step at all, so
 * the aircraft simply stops moving while nothing reports a problem. That hold
 * now only applies within gear range of the ground - higher up the surface
 * cannot reach the aircraft, so a missing sample is not worth stopping for.
 */
export type FlightStatusOverlayState =
  | { kind: "fault"; message: string; failed: readonly string[] }
  | { kind: "waiting"; message: string; heldSeconds: number }
  | null;

export interface FlightStatusOverlayOptions {
  onResume(): void;
}

export interface FlightStatusOverlayProps extends FlightStatusOverlayOptions {
  state: FlightStatusOverlayState;
}

export function FlightStatusOverlay({ state, onResume }: FlightStatusOverlayProps) {
  if (!state) return null;

  if (state.kind === "waiting") {
    return (
      <div className="flight-status-overlay" data-kind="waiting" role="status">
        <div className="flight-status-overlay__card">
          <Loader size={20} aria-hidden="true" />
          <div>
            <strong>{state.message}</strong>
            <p>
              The aircraft is low enough for the ground to matter, and the map has
              not published a height here yet, so the simulation is holding rather
              than guessing one.
              {state.heldSeconds >= 5
                ? " Still waiting after several seconds — climb away or reposition if it does not clear."
                : ""}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flight-status-overlay" data-kind="fault" role="alert">
      <div className="flight-status-overlay__card">
        <AlertTriangle size={20} aria-hidden="true" />
        <div>
          <strong>Simulation paused</strong>
          <p>{state.message}</p>
          {state.failed.length > 0 ? (
            <ul className="flight-status-overlay__reasons">
              {state.failed.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          ) : null}
          <button className="flight-panel__command" type="button" onClick={onResume}>
            Resume
          </button>
        </div>
      </div>
    </div>
  );
}
