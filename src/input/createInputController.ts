import type { CameraInputTarget } from "./inertialCameraController";
import { attachWheelController } from "./wheelController";
import { attachSafariGestures, isSafariGestureSupported } from "./safariGestures";
import { attachTouchController } from "./touchController";
import { attachMouseController } from "./mouseController";
import {
  DEFAULT_INPUT_SETTINGS,
  normalizeSensitivitySettings,
  type InputModePreference,
  type InputSensitivitySettings,
  type InputSettings,
} from "./inputSettings";

export interface InputController {
  setMode(mode: InputModePreference): void;
  setSensitivity(sensitivity: Partial<InputSensitivitySettings>): void;
  destroy(): void;
}

/**
 * Create and attach all input controllers to the canvas.
 *
 * Wires:
 *  - Trackpad-aware wheel handler (pan / orbit / zoom)
 *  - Safari GestureEvent handler (rotation + pinch on macOS Safari)
 *  - Two-finger touch handler (orbit + pinch on touch devices)
 *
 * Also registers document-level wheel/gesture prevention to stop the
 * browser from scrolling or zooming the page during globe interaction.
 *
 * @returns An `InputController` whose `destroy()` removes every listener.
 */
export function createInputController(
  canvas: HTMLCanvasElement,
  camera: CameraInputTarget,
  options: { isOrbitMode?: () => boolean } = {},
): InputController {
  const hasSafariGestures = isSafariGestureSupported();
  const settings: InputSettings = {
    mode: DEFAULT_INPUT_SETTINGS.mode,
    sensitivity: normalizeSensitivitySettings(DEFAULT_INPUT_SETTINGS.sensitivity),
  };

  // ── Document-level prevention ────────────────────────────────────
  // Prevent the page from scrolling or zooming while the user interacts
  // with the globe canvas. Scope to events targeting the canvas so wheel
  // gestures over HTML overlays (menus, panels) continue to scroll normally.
  const isCanvasEvent = (e: Event): boolean => {
    const t = e.target as Node | null;
    return t === canvas || (t != null && canvas.contains(t));
  };
  const docWheelHandler = (e: Event): void => { if (isCanvasEvent(e)) e.preventDefault(); };
  document.addEventListener("wheel", docWheelHandler, { passive: false });

  const docGestureCleanup: Array<() => void> = [];
  if (hasSafariGestures) {
    for (const type of ["gesturestart", "gesturechange", "gestureend"] as const) {
      const handler = (e: Event): void => { if (isCanvasEvent(e)) e.preventDefault(); };
      document.addEventListener(type, handler, { passive: false } as AddEventListenerOptions);
      docGestureCleanup.push(() => document.removeEventListener(type, handler));
    }
  }

  // ── Canvas-level handlers ────────────────────────────────────────
  const detachWheel = attachWheelController(canvas, camera, { isSafariWithGestures: hasSafariGestures, isOrbitMode: options.isOrbitMode, getSettings: () => settings });
  const detachSafari = hasSafariGestures ? attachSafariGestures(canvas, camera, { getSettings: () => settings }) : (): void => undefined;
  const detachTouch = attachTouchController(canvas, camera, { getSettings: () => settings });
  const detachMouse = attachMouseController(canvas, camera, { isOrbitMode: options.isOrbitMode, getSettings: () => settings });

  return {
    setMode(mode: InputModePreference): void {
      settings.mode = mode;
    },
    setSensitivity(sensitivity: Partial<InputSensitivitySettings>): void {
      settings.sensitivity = normalizeSensitivitySettings({
        mouse: { ...settings.sensitivity.mouse, ...sensitivity.mouse },
        trackpad: { ...settings.sensitivity.trackpad, ...sensitivity.trackpad },
        touch: { ...settings.sensitivity.touch, ...sensitivity.touch },
      });
    },
    destroy(): void {
      detachWheel();
      detachSafari();
      detachTouch();
      detachMouse();
      document.removeEventListener("wheel", docWheelHandler);
      for (const cleanup of docGestureCleanup) cleanup();
    },
  };
}
