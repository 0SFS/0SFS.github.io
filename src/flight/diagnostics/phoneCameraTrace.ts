/**
 * Opt-in trace for investigating a phone camera trackpad that feels jumpy.
 *
 * Dormant unless `phoneCameraTrace=1` is in the flight URL. Then the paired
 * phone attaches its own timings to every control frame (see `ControlTrace`
 * in the protocol), and this records each hop: when the phone's touch events
 * fired and when their frame left, when the frame arrived here and what became
 * of it, and how much orbit each rendered frame drew. The last two minutes are
 * kept, and export as one JSON document from `window.osfsPhoneCameraTrace`.
 *
 * The two devices' clocks are not related. Every phone time is on the phone's
 * `performance.now()`, every desktop time on this page's; an analysis lines
 * them up from the fastest transit it sees, never by subtracting them.
 */
import type { ControlFrameOutcome, PhoneControlTraceSink } from "../remote/createPhoneControlSession";
import type { ControlFrame, ControlTrace } from "../../remote/protocol";
import type { PhoneCameraTuning } from "../remote/phoneCameraTuning";

const DEFAULT_CAPACITY = 7_200;

export interface PhoneCameraControlRecord {
  /** Desktop time the frame was handled. */
  receivedAt: number;
  seq: number;
  epoch: number;
  outcome: ControlFrameOutcome;
  /** Camera movement it carried, in the phone's CSS pixels; zoom as a ratio. */
  dxPx: number;
  dyPx: number;
  zoom: number;
  /** The phone's own account of the frame, when the phone supports tracing. */
  phone: ControlTrace | null;
}

export interface PhoneCameraRenderRecord {
  /** Desktop time the frame drained the camera, just before drawing. */
  at: number;
  intervalMs: number;
  /** Orbit drawn this frame, in the phone's CSS pixels (before `PHONE_SWIPE_RADIANS`). */
  dxPx: number;
  dyPx: number;
  zoom: number;
  /** Whether a phone gesture counted as in progress (suppresses recentring). */
  gestureActive: boolean;
  /** Orbit angle after this frame, radians. */
  orbitYaw: number;
  orbitPitch: number;
  /** Aircraft attitude drawn this frame, degrees: the chase camera turns with it. */
  rollDeg: number;
  pitchDeg: number;
  headingDeg: number;
  viewMode: "first" | "third";
  mapDownloadBytesPerSecond: number;
  /**
   * The A/B camera settings in force (`describePhoneCameraTuning`), so one
   * trace can switch between variants and still be split apart afterwards.
   */
  variant?: string;
}

export interface PhoneCameraTraceExport {
  version: 1;
  createdAt: string;
  userAgent: string;
  /** As they were when the trace was exported; per-frame settings are `renderFrames[].variant`. */
  settings: { recenterMode: string; phoneSwipeRadians: number; tuning?: PhoneCameraTuning };
  controlFrames: PhoneCameraControlRecord[];
  renderFrames: PhoneCameraRenderRecord[];
}

export interface PhoneCameraTraceSummary {
  controlFrames: number;
  outcomes: Record<ControlFrameOutcome, number>;
  /** Sequence numbers never seen: lost on the way, or discarded on the phone. */
  missingSeq: number;
  discardedOnPhone: number;
  renderFrames: number;
  /** Rendered frames during a gesture that drew no orbit at all. */
  idleGestureFrames: number;
}

export interface PhoneCameraTrace extends PhoneControlTraceSink {
  renderFrame(record: PhoneCameraRenderRecord): void;
  summary(): PhoneCameraTraceSummary;
  export(): PhoneCameraTraceExport;
  /** Saves the export as a JSON file through the browser's download. */
  download(): void;
  clear(): void;
}

export interface PhoneCameraTraceOptions {
  capacity?: number;
  getSettings?: () => PhoneCameraTraceExport["settings"];
}

function push<T>(list: T[], item: T, capacity: number): void {
  list.push(item);
  if (list.length > capacity) list.shift();
}

export function createPhoneCameraTrace(options: PhoneCameraTraceOptions = {}): PhoneCameraTrace {
  const capacity = Math.max(1, Math.floor(options.capacity ?? DEFAULT_CAPACITY));
  const controlFrames: PhoneCameraControlRecord[] = [];
  const renderFrames: PhoneCameraRenderRecord[] = [];
  const settings = options.getSettings ?? (() => ({ recenterMode: "unknown", phoneSwipeRadians: Number.NaN }));

  const trace: PhoneCameraTrace = {
    controlFrame(frame: ControlFrame, outcome: ControlFrameOutcome, receivedAt: number): void {
      push(controlFrames, {
        receivedAt, seq: frame.seq, epoch: frame.epoch, outcome,
        dxPx: (frame.camera?.yaw ?? 0) * 1000, dyPx: (frame.camera?.pitch ?? 0) * 1000, zoom: frame.camera?.zoom ?? 1,
        phone: frame.trace ?? null,
      }, capacity);
    },
    renderFrame(record: PhoneCameraRenderRecord): void {
      push(renderFrames, { ...record }, capacity);
    },
    summary(): PhoneCameraTraceSummary {
      const outcomes: Record<ControlFrameOutcome, number> = {
        "accepted": 0, "not-owner": 0, "out-of-order": 0, "stale-lease": 0, "handoff-mismatch": 0, "rate-window": 0,
      };
      for (const frame of controlFrames) outcomes[frame.outcome] += 1;
      let missingSeq = 0;
      const byEpoch = new Map<number, Set<number>>();
      for (const frame of controlFrames) {
        const seen = byEpoch.get(frame.epoch) ?? new Set<number>();
        seen.add(frame.seq);
        byEpoch.set(frame.epoch, seen);
      }
      for (const seen of byEpoch.values()) {
        const seqs = [...seen];
        missingSeq += Math.max(...seqs) - Math.min(...seqs) + 1 - seqs.length;
      }
      return {
        controlFrames: controlFrames.length,
        outcomes,
        missingSeq,
        discardedOnPhone: controlFrames.reduce((sum, frame) => sum + (frame.phone?.drop[0] ?? 0), 0),
        renderFrames: renderFrames.length,
        idleGestureFrames: renderFrames.filter((frame) => frame.gestureActive && frame.dxPx === 0 && frame.dyPx === 0).length,
      };
    },
    export(): PhoneCameraTraceExport {
      return {
        version: 1,
        createdAt: new Date().toISOString(),
        userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
        settings: settings(),
        controlFrames: controlFrames.map((frame) => ({ ...frame })),
        renderFrames: renderFrames.map((frame) => ({ ...frame })),
      };
    },
    download(): void {
      const blob = new Blob([JSON.stringify(trace.export())], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `phone-camera-trace-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    },
    clear(): void {
      controlFrames.length = 0;
      renderFrames.length = 0;
    },
  };
  return trace;
}

declare global {
  interface Window {
    /** Available in DevTools while the flight was opened with `phoneCameraTrace=1`. */
    osfsPhoneCameraTrace?: PhoneCameraTrace;
  }
}

export function isPhoneCameraTraceEnabled(search = window.location.search): boolean {
  return new URLSearchParams(search).get("phoneCameraTrace") === "1";
}

export function setActivePhoneCameraTrace(trace: PhoneCameraTrace | null): void {
  if (trace) window.osfsPhoneCameraTrace = trace;
  else delete window.osfsPhoneCameraTrace;
}
