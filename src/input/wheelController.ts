import type { CameraInputTarget } from "./inertialCameraController";
import { MOVEMENT_SENSITIVITY_BASE, type InputSettings } from "./inputSettings";

type WheelGestureMode = "pan" | "pinchZoom" | "wheelZoom" | "orbit" | "ignore";

const WHEEL_GESTURE_IDLE_MS = 180;
const PIXEL_DELTA_MODE = 0;
const FRACTIONAL_DELTA_EPSILON = 0.001;
const MOUSE_WHEEL_ZOOM_SENSITIVITY_BASE = 0.03;

interface WheelGestureSession {
  mode: WheelGestureMode;
  lastEventTimeMs: number;
}

function hasFractionalDelta(value: number): boolean {
  return Math.abs(value - Math.round(value)) > FRACTIONAL_DELTA_EPSILON;
}

function isLikelyVerticalMouseWheel(e: WheelEvent): boolean {
  if (e.deltaMode !== PIXEL_DELTA_MODE) {
    return Math.abs(e.deltaY) > FRACTIONAL_DELTA_EPSILON;
  }

  const absDeltaX = Math.abs(e.deltaX);
  const absDeltaY = Math.abs(e.deltaY);
  const hasHorizontalDelta = absDeltaX > FRACTIONAL_DELTA_EPSILON;
  const hasFineDelta = hasFractionalDelta(e.deltaX) || hasFractionalDelta(e.deltaY);

  // Smooth mouse wheels often report modest integer pixel deltas such as 40
  // or 53. Treating those as trackpad pan moves lat/lon violently at high
  // altitude, so vertical-only integer wheel deltas should zoom regardless
  // of magnitude. Trackpad pans normally expose fractional deltas and/or a
  // horizontal component.
  return !hasHorizontalDelta && !hasFineDelta && absDeltaY > FRACTIONAL_DELTA_EPSILON;
}

function isLikelyHorizontalMouseWheel(e: WheelEvent): boolean {
  const absDeltaX = Math.abs(e.deltaX);
  const absDeltaY = Math.abs(e.deltaY);
  if (e.deltaMode !== PIXEL_DELTA_MODE) {
    return absDeltaX > FRACTIONAL_DELTA_EPSILON && absDeltaY <= FRACTIONAL_DELTA_EPSILON;
  }

  const hasFineDelta = hasFractionalDelta(e.deltaX) || hasFractionalDelta(e.deltaY);
  return !hasFineDelta && absDeltaX > FRACTIONAL_DELTA_EPSILON && absDeltaY <= FRACTIONAL_DELTA_EPSILON;
}

function classifyWheelGestureMode(
  e: WheelEvent,
  isSafariWithGestures: boolean,
  isOrbitMode: boolean,
  inputMode: InputSettings["mode"],
): WheelGestureMode {
  if (e.shiftKey) return inputMode === "trackpad" ? "pinchZoom" : "orbit";
  if (e.ctrlKey && !isSafariWithGestures) return "pinchZoom";
  if (inputMode === "trackpad") return isOrbitMode ? "orbit" : "pan";
  if (inputMode === "mouse") return isLikelyHorizontalMouseWheel(e) ? "ignore" : "wheelZoom";
  if (isLikelyVerticalMouseWheel(e)) return "wheelZoom";
  if (isLikelyHorizontalMouseWheel(e)) return "ignore";
  // When the camera is locked to a POI the user expects two-finger swipe to
  // orbit around the selected point rather than pan away from it.
  return isOrbitMode ? "orbit" : "pan";
}

/**
 * Attach a trackpad-aware wheel event handler to the canvas.
 *
 * Behavior matrix (matches foss-earth / Cesium parity):
 *   - Trackpad two-finger swipe (no modifier)  → pan lat/lon
 *   - Shift + wheel / swipe                     → orbit heading/pitch
 *   - Ctrl + wheel (non-Safari, i.e. pinch)     → zoom
 *   - Mouse wheel (no modifier)                 → zoom
 *
 * Runs in capture phase with stopImmediatePropagation so Babylon's
 * built-in camera wheel handler never fires.
 *
 * @returns Cleanup function that removes all registered listeners.
 */
export function attachWheelController(
  canvas: HTMLCanvasElement,
  camera: CameraInputTarget,
  options: { isSafariWithGestures: boolean; isOrbitMode?: () => boolean; getSettings?: () => InputSettings },
): () => void {
  const { isSafariWithGestures } = options;
  let session: WheelGestureSession | null = null;

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    // Prevent Babylon's own wheel/zoom handler from firing on the same event.
    e.stopImmediatePropagation();

    const now = performance.now();
    if (!session || now - session.lastEventTimeMs > WHEEL_GESTURE_IDLE_MS) {
      session = {
        mode: classifyWheelGestureMode(
          e,
          isSafariWithGestures,
          options.isOrbitMode?.() ?? false,
          options.getSettings?.().mode ?? "auto",
        ),
        lastEventTimeMs: now,
      };
    } else {
      session.lastEventTimeMs = now;
    }

    // ── Trackpad two-finger swipe = pan ──────────────────────────────────
    if (session.mode === "pan") {
      const sensitivity = options.getSettings?.().sensitivity.trackpad.pan ?? 1;
      camera.panBy(e.deltaX * sensitivity * MOVEMENT_SENSITIVITY_BASE, e.deltaY * sensitivity * MOVEMENT_SENSITIVITY_BASE, canvas.clientHeight);
      return;
    }

    // ── Shift+wheel = orbit (heading + pitch) ────────────────────────────
    if (session.mode === "orbit") {
      const settings = options.getSettings?.();
      const sensitivity = settings?.mode === "mouse"
        ? settings.sensitivity.mouse.orbit
        : settings?.sensitivity.trackpad.orbit ?? 1;
      const pitchDeltaDeg = e.deltaY * 0.15 * sensitivity * MOVEMENT_SENSITIVITY_BASE;
      const headingDeltaDeg = -e.deltaX * 0.15 * sensitivity * MOVEMENT_SENSITIVITY_BASE;
      camera.orbitBy(pitchDeltaDeg, headingDeltaDeg);
      return;
    }

    if (session.mode === "ignore") {
      return;
    }

    // ── Ctrl+wheel = macOS trackpad pinch-to-zoom (non-Safari browsers) ──
    if (session.mode === "pinchZoom") {
      const sensitivity = options.getSettings?.().sensitivity.trackpad.zoom ?? 1;
      const factor = 1 + e.deltaY * 0.01 * sensitivity * MOVEMENT_SENSITIVITY_BASE;
      camera.zoomBy(factor);
      return;
    }

    // ── Mouse wheel = coarser zoom ───────────────────────────────────────
    // Scroll down (deltaY>0) = zoom out; scroll up (deltaY<0) = zoom in.
    if (Math.abs(e.deltaY) <= FRACTIONAL_DELTA_EPSILON) return;
    const sensitivity = options.getSettings?.().sensitivity.mouse.zoom ?? 1;
    const factor = Math.pow(e.deltaY > 0 ? 1.08 : 0.92, sensitivity * MOUSE_WHEEL_ZOOM_SENSITIVITY_BASE);
    camera.zoomBy(factor);
  }

  canvas.addEventListener("wheel", onWheel, { capture: true, passive: false });

  return () => {
    canvas.removeEventListener("wheel", onWheel, { capture: true });
  };
}
