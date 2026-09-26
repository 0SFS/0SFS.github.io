import type { FlightRecorder } from "../diagnostics/flightRecorder";

/** The Logging tab's behaviour outside its component: saving, the M hotkey and closing. */

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
