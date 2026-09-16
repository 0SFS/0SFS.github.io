import type { FlightRecorder } from "../diagnostics/flightRecorder";

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

export const LOGGING_CLOSE_WARNING =
  "Closing Logging will end the recording. The tab must stay open to log data. Unsaved samples will be discarded.";

export function formatRecorderClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

export function downloadCsv(fileName: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** M marks the current sample while recording, including when another tab is selected. */
export function bindRecorderMarkHotkey(
  recorder: Pick<FlightRecorder, "isRecording" | "mark">,
  target: Window = window,
): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "KeyM" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    if (!recorder.isRecording()) return;
    event.preventDefault();
    recorder.mark();
  };
  target.addEventListener("keydown", onKeyDown);
  return () => target.removeEventListener("keydown", onKeyDown);
}

export function allowCloseLoggingTab(
  recorder: Pick<FlightRecorder, "isRecording" | "getSampleCount" | "stop" | "clear">,
  confirmFn: (message: string) => boolean = (message) => window.confirm(message),
): boolean {
  if (!recorder.isRecording() && recorder.getSampleCount() === 0) return true;
  if (!confirmFn(LOGGING_CLOSE_WARNING)) return false;
  recorder.stop();
  recorder.clear();
  return true;
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
