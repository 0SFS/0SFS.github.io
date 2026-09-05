import type { CameraInputTarget } from "./inertialCameraController";
import { MOVEMENT_SENSITIVITY_BASE, type InputSettings } from "./inputSettings";

/**
 * Detect whether the current browser supports macOS Safari GestureEvents.
 * These are non-standard events fired by Safari on macOS for trackpad
 * rotation (two-finger twist) and pinch zoom.
 *
 * Conditions:
 *  - `GestureEvent` class exists in the window
 *  - Running in Safari (not Chrome/Firefox/Edge/Opera masquerading as Safari)
 *  - Not on Apple mobile (iOS fires touch events, not gesture events)
 */
export function isSafariGestureSupported(): boolean {
  const ua = navigator.userAgent;
  const isAppleMobile = /iPhone|iPad|iPod/i.test(ua);
  return (
    "GestureEvent" in window &&
    /Safari/i.test(ua) &&
    !isAppleMobile &&
    !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPR|Android/i.test(ua)
  );
}

/**
 * Attach Safari-specific macOS GestureEvent handlers to the canvas.
 *
 * - `gesturechange` rotation delta  → orbit by heading
 * - `gesturechange` scale delta     → zoom
 *
 * The scale-to-zoom formula mirrors the foss-earth reference:
 *   factor = 1.5 − scaleDelta × 0.5
 *   scaleDelta > 1 (pinch open)  → factor < 1 = zoom in
 *   scaleDelta < 1 (pinch close) → factor > 1 = zoom out
 *
 * @returns Cleanup function that removes all registered listeners.
 */
export function attachSafariGestures(
  canvas: HTMLCanvasElement,
  camera: CameraInputTarget,
  options: { getSettings?: () => InputSettings } = {},
): () => void {
  let lastRotation = 0;
  let lastScale = 1;

  function onGestureStart(e: Event): void {
    e.preventDefault();
    const ge = e as unknown as { rotation: number; scale: number };
    lastRotation = ge.rotation;
    lastScale = ge.scale;
  }

  function onGestureChange(e: Event): void {
    e.preventDefault();
    const ge = e as unknown as { rotation: number; scale: number };

    // Rotation is in degrees, CCW positive on Safari.
    // Negate so clockwise drag increases heading (eastward = positive heading).
    const rotDelta = ge.rotation - lastRotation;
    lastRotation = ge.rotation;
    if (Math.abs(rotDelta) > 0.1) {
      const sensitivity = options.getSettings?.().sensitivity.trackpad.orbit ?? 1;
      camera.orbitBy(0, -rotDelta * sensitivity * MOVEMENT_SENSITIVITY_BASE);
    }

    const scaleDelta = ge.scale / lastScale;
    lastScale = ge.scale;
    // Apply zoom only when there is a meaningful scale change.
    const factor = 1.5 - scaleDelta * 0.5;
    if (Math.abs(factor - 1) > 0.001) {
      const sensitivity = options.getSettings?.().sensitivity.trackpad.zoom ?? 1;
      camera.zoomBy(Math.pow(factor, sensitivity * MOVEMENT_SENSITIVITY_BASE));
    }
  }

  function onGestureEnd(e: Event): void {
    e.preventDefault();
  }

  const opts = { passive: false } as AddEventListenerOptions;
  canvas.addEventListener("gesturestart", onGestureStart, opts);
  canvas.addEventListener("gesturechange", onGestureChange, opts);
  canvas.addEventListener("gestureend", onGestureEnd, opts);

  return () => {
    canvas.removeEventListener("gesturestart", onGestureStart, opts as EventListenerOptions);
    canvas.removeEventListener("gesturechange", onGestureChange, opts as EventListenerOptions);
    canvas.removeEventListener("gestureend", onGestureEnd, opts as EventListenerOptions);
  };
}
