import { isSafariGestureSupported, type HudInputMode, type InputSensitivitySettings } from "foss-earth/input";

export interface FlightCameraInputOptions {
  getMode(): HudInputMode;
  getSensitivity(): InputSensitivitySettings;
  orbit(dx: number, dy: number): void;
  zoom(factor: number): void;
}

/** Canvas gestures only; keyboard/gamepad physics input remains independent. */
export function attachFlightCameraInput(canvas: HTMLCanvasElement, options: FlightCameraInputOptions): () => void {
  const owner = canvas.ownerDocument.defaultView!;
  const safari = isSafariGestureSupported();
  const previousTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = "none";
  let drag: { id: number; x: number; y: number } | null = null;
  let gestureScale: number | null = null;
  let touch: { x: number; y: number; distance: number } | null = null;
  const listeners: Array<() => void> = [];
  function listen<E extends Event>(target: EventTarget, name: string, handler: (event: E) => void): void {
    const listener = handler as EventListener;
    target.addEventListener(name, listener, { passive: false });
    listeners.push(() => target.removeEventListener(name, listener));
  }
  const orbit = (x: number, y: number) => {
    const sensitivity = options.getSensitivity()[options.getMode()].orbit;
    options.orbit(x * 0.005 * sensitivity, y * 0.005 * sensitivity);
  };
  const zoom = (factor: number) => options.zoom(Math.pow(factor, options.getSensitivity()[options.getMode()].zoom));
  const clearDrag = () => {
    const id = drag?.id;
    drag = null;
    if (id !== undefined && canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
  };
  listen(canvas, "pointerdown", (event: PointerEvent) => {
    if (options.getMode() !== "mouse" || event.button !== 2) return;
    event.preventDefault();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture?.(event.pointerId);
  });
  listen(owner, "pointermove", (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (options.getMode() !== "mouse" || !(event.buttons & 2)) { clearDrag(); return; }
    event.preventDefault();
    orbit(event.clientX - drag.x, event.clientY - drag.y);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    listen(owner, name, (event: PointerEvent) => { if (event.pointerId === drag?.id) clearDrag(); });
  }
  listen(owner, "blur", () => { clearDrag(); touch = null; gestureScale = null; });
  // Suppress the native right-button menu, including platforms firing it after pointerup.
  listen(canvas, "contextmenu", (event: MouseEvent) => { event.preventDefault(); });
  listen(canvas, "wheel", (event: WheelEvent) => {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight || 800 : 1;
    if (options.getMode() === "mouse") zoom(Math.exp(Math.max(-1, Math.min(1, event.deltaY * unit * 0.002))));
    else if (event.ctrlKey) {
      // Safari emits native GestureEvents for the same pinch; never apply both streams.
      if (!safari) zoom(Math.exp(Math.max(-1, Math.min(1, event.deltaY * unit * 0.01))));
    } else if (gestureScale === null) orbit(-event.deltaX * unit, -event.deltaY * unit);
  });
  listen(canvas, "gesturestart", (event: Event & { scale?: number }) => {
    event.preventDefault();
    gestureScale = options.getMode() === "trackpad" ? event.scale ?? 1 : null;
  });
  listen(canvas, "gesturechange", (event: Event & { scale?: number }) => {
    event.preventDefault();
    const scale = event.scale;
    if (options.getMode() === "trackpad" && gestureScale !== null && scale && Number.isFinite(scale) && scale > 0) {
      zoom(gestureScale / scale);
      gestureScale = scale;
    }
  });
  listen(canvas, "gestureend", (event: Event) => { event.preventDefault(); gestureScale = null; });
  const readTouch = (event: TouchEvent) => {
    if (event.touches.length !== 2) return null;
    const [a, b] = [event.touches[0], event.touches[1]];
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
  };
  listen(canvas, "touchstart", (event: TouchEvent) => { event.preventDefault(); touch = readTouch(event); });
  listen(canvas, "touchmove", (event: TouchEvent) => {
    event.preventDefault();
    const next = readTouch(event);
    if (options.getMode() === "trackpad" && touch && next && gestureScale === null) {
      orbit(touch.x - next.x, touch.y - next.y);
      if (touch.distance > 0 && next.distance > 0) zoom(touch.distance / next.distance);
    }
    touch = next;
  });
  for (const name of ["touchend", "touchcancel"]) listen(canvas, name, (event: TouchEvent) => { event.preventDefault(); touch = null; });
  return () => {
    clearDrag();
    listeners.forEach((remove) => remove());
    canvas.style.touchAction = previousTouchAction;
  };
}
