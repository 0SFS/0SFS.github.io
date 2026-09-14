import "./evaluationInstruments.css";
import {
  propertyInCatalog, type FlightRecorder, type FlightRecorderPropertyReader,
} from "../diagnostics/flightRecorder";

/**
 * Engine and warning readouts, and flight recorder controls, for pilot
 * evaluation. The SF50 is flown by N1, and its stall protection announces
 * STALL WARNING and STICK PUSHER on the CAS; the main HUD shows neither.
 *
 * Readouts appear only for properties the loaded aircraft has, so the C172
 * shows fuel flow and AoA without an N1 or CAS line.
 */

export interface EvaluationInstrumentsOptions {
  recorder: FlightRecorder;
  /** File name for a saved recording, without the extension. */
  recordingName(): string;
  /** Receives the CSV; defaults to a browser download. */
  saveRecording?(fileName: string, csv: string): void;
}

export interface EvaluationInstrumentsHandle {
  update(reader: FlightRecorderPropertyReader): void;
  destroy(): void;
}

const N1 = "propulsion/engine[0]/n1";
const FUEL_FLOW = "propulsion/engine[0]/fuel-flow-rate-gph";
const ALPHA = "aero/alpha-deg";
const STALL_WARNING = "fcs/stall-warning";
const STICK_PUSHER = "fcs/stick-pusher";
const MARK_FLASH_MS = 2500;

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (v: number) => v.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

function downloadCsv(fileName: string, csv: string): void {
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

export function createEvaluationInstruments(
  root: HTMLElement,
  options: EvaluationInstrumentsOptions,
): EvaluationInstrumentsHandle {
  const container = document.createElement("div");
  container.className = "flight-eval";
  container.innerHTML = `
    <div class="flight-eval__readouts" aria-label="Engine and angle of attack">
      <div class="flight-hud__tape flight-eval__readout" data-readout="n1" hidden>
        <div class="flight-hud__tape-header"><span class="flight-hud__label">N1</span><span class="flight-hud__unit">%</span></div>
        <span class="flight-hud__value" data-value="n1">  0.0</span>
      </div>
      <div class="flight-hud__tape flight-eval__readout" data-readout="ff" hidden>
        <div class="flight-hud__tape-header"><span class="flight-hud__label">FF</span><span class="flight-hud__unit">gph</span></div>
        <span class="flight-hud__value" data-value="ff">  0</span>
      </div>
      <div class="flight-hud__tape flight-eval__readout" data-readout="aoa" hidden>
        <div class="flight-hud__tape-header"><span class="flight-hud__label">AOA</span><span class="flight-hud__unit">°</span></div>
        <span class="flight-hud__value" data-value="aoa">  0.0</span>
      </div>
    </div>
    <div class="flight-eval__cas" aria-live="assertive"></div>
    <div class="flight-eval__recorder" role="group" aria-label="Flight recorder">
      <span class="flight-eval__rec" data-value="rec" title="Recording aircraft state and controls">REC 00:00</span>
      <button type="button" class="flight-eval__button" data-control="mark" title="Mark this moment in the recording (M)">MARK</button>
      <button type="button" class="flight-eval__button" data-control="save" title="Save the recording as CSV">SAVE CSV</button>
      <span class="flight-eval__status" data-value="status" aria-live="polite"></span>
    </div>
  `;
  root.appendChild(container);

  const query = <T extends HTMLElement>(selector: string): T => {
    const el = container.querySelector<T>(selector);
    if (!el) throw new Error(`Evaluation instruments markup is missing ${selector}.`);
    return el;
  };
  const readouts = {
    n1: { box: query('[data-readout="n1"]'), value: query('[data-value="n1"]'), property: N1 },
    ff: { box: query('[data-readout="ff"]'), value: query('[data-value="ff"]'), property: FUEL_FLOW },
    aoa: { box: query('[data-readout="aoa"]'), value: query('[data-value="aoa"]'), property: ALPHA },
  };
  const cas = query(".flight-eval__cas");
  const recValue = query('[data-value="rec"]');
  const status = query('[data-value="status"]');
  const markButton = query<HTMLButtonElement>('[data-control="mark"]');
  const saveButton = query<HTMLButtonElement>('[data-control="save"]');

  let available: Record<"n1" | "ff" | "aoa" | "stallWarning" | "stickPusher", boolean> | null = null;
  let statusTimer: ReturnType<typeof setTimeout> | null = null;
  let lastCas = "";

  const flash = (text: string): void => {
    status.textContent = text;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = ""; statusTimer = null; }, MARK_FLASH_MS);
  };
  const mark = (): void => {
    const placed = options.recorder.mark();
    flash(placed ? `MARK ${placed.number} · ${formatClock(placed.simTimeSec)}` : "Nothing recorded yet");
  };
  const save = (): void => {
    if (options.recorder.getSampleCount() === 0) {
      flash("Nothing recorded yet");
      return;
    }
    const fileName = `${options.recordingName()}.csv`;
    (options.saveRecording ?? downloadCsv)(fileName, options.recorder.toCsv());
    flash(`Saved ${fileName}`);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "KeyM" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    mark();
  };
  markButton.addEventListener("click", mark);
  saveButton.addEventListener("click", save);
  window.addEventListener("keydown", onKeyDown);

  return {
    update(reader: FlightRecorderPropertyReader): void {
      // Property sets are fixed once an aircraft is loaded; changing aircraft reloads the app.
      if (!available) {
        available = {
          n1: propertyInCatalog(reader, N1),
          ff: propertyInCatalog(reader, FUEL_FLOW),
          aoa: propertyInCatalog(reader, ALPHA),
          stallWarning: propertyInCatalog(reader, STALL_WARNING),
          stickPusher: propertyInCatalog(reader, STICK_PUSHER),
        };
        readouts.n1.box.hidden = !available.n1;
        readouts.ff.box.hidden = !available.ff;
        readouts.aoa.box.hidden = !available.aoa;
      }
      if (available.n1) readouts.n1.value.textContent = reader.getPropertyValue(N1).toFixed(1).padStart(5, " ");
      if (available.ff) readouts.ff.value.textContent = Math.round(reader.getPropertyValue(FUEL_FLOW)).toString().padStart(3, " ");
      if (available.aoa) readouts.aoa.value.textContent = reader.getPropertyValue(ALPHA).toFixed(1).padStart(5, " ");

      // STICK PUSHER outranks STALL WARNING; both are red CAS warnings in the AFM.
      const next = available.stickPusher && reader.getPropertyValue(STICK_PUSHER) > 0.5 ? "STICK PUSHER"
        : available.stallWarning && reader.getPropertyValue(STALL_WARNING) > 0.5 ? "STALL WARNING" : "";
      if (next !== lastCas) {
        lastCas = next;
        cas.textContent = next;
        cas.classList.toggle("is-active", next !== "");
      }
      recValue.textContent = `REC ${formatClock(options.recorder.getDurationSec())}`;
    },
    destroy(): void {
      markButton.removeEventListener("click", mark);
      saveButton.removeEventListener("click", save);
      window.removeEventListener("keydown", onKeyDown);
      if (statusTimer) clearTimeout(statusTimer);
      container.remove();
    },
  };
}
