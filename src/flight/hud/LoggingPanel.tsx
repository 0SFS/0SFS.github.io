import { formatRecorderClock } from "./loggingTab";

export type LoggingAction =
  | { type: "start" }
  | { type: "stop" }
  | { type: "mark" }
  | { type: "save" }
  | { type: "clear" };

export interface LoggingPanelState {
  recording: boolean;
  sampleCount: number;
  durationSec: number;
  markCount: number;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flight-panel__metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function LoggingPanel({
  state,
  onAction,
}: {
  state: LoggingPanelState;
  onAction(action: LoggingAction): void;
}) {
  const status = state.recording ? "Recording" : state.sampleCount > 0 ? "Stopped" : "Idle";
  const hasSamples = state.sampleCount > 0;
  return (
    <div className="flight-panel__content">
      <fieldset className="flight-panel__fieldset">
        <legend>Flight log</legend>
        <p className="flight-panel__hint">
          Records aircraft state and the control positions JSBSim received. Recording stays off until
          you start it. Keep this tab in the strip while logging — closing it ends the recording.
        </p>
        <div className="flight-panel__metrics">
          <Metric label="Status" value={status} />
          <Metric label="Duration" value={formatRecorderClock(state.durationSec)} />
          <Metric label="Samples" value={String(state.sampleCount)} />
          <Metric label="Marks" value={String(state.markCount)} />
        </div>
        {state.recording
          ? <button className="flight-panel__command" type="button" aria-label="Stop recording"
              onClick={() => onAction({ type: "stop" })}>Stop</button>
          : <button className="flight-panel__command" type="button" aria-label="Start recording"
              onClick={() => onAction({ type: "start" })}>Record</button>}
        <button className="flight-panel__command" type="button" aria-label="Mark sample"
          disabled={!hasSamples} onClick={() => onAction({ type: "mark" })}>Mark</button>
        <button className="flight-panel__command" type="button" aria-label="Save CSV"
          disabled={!hasSamples} onClick={() => onAction({ type: "save" })}>Save CSV</button>
        <button className="flight-panel__command" type="button" aria-label="Clear recording"
          disabled={!hasSamples && !state.recording} onClick={() => onAction({ type: "clear" })}>Clear</button>
        <p className="flight-panel__hint">
          M marks the current sample while recording, even if another tab is selected.
        </p>
      </fieldset>
    </div>
  );
}
