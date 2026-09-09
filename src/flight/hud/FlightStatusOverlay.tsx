import { AlertTriangle, Loader } from "lucide-react";

/**
 * Centre-screen notice for the two ways the simulation stops on its own.
 *
 * A fault pauses it outright. A missing terrain sample is quieter and was the
 * more confusing of the two: the fixed-step loop declines to step at all, so
 * the aircraft simply stops moving while nothing reports a problem.
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
              The simulation only integrates against terrain it can measure, so it is
              holding position rather than guessing a ground height.
              {state.heldSeconds >= 5
                ? " Still waiting after several seconds — try repositioning if it does not clear."
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
