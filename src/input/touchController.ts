import type { CameraInputTarget } from "./inertialCameraController";
import type { InputSettings } from "./inputSettings";
import { attachTouchDebugOverlay, isTouchDebugEnabled, type TouchDebugEvent } from "./touchDebugOverlay";

// ─── Tuning constants ────────────────────────────────────────────────
// These encode "what sensitivity=1 feels like" for each gesture.
// They are intentionally hidden from the user — the user-facing sensitivity
// slider is a pure multiplier on top of these values (0.5 = half, 2 = double).

/**
 * Camera units panned per pixel of finger movement at sensitivity=1.
 * Tuned so that a typical one-finger swipe feels 1:1 with the globe surface.
 */
const TOUCH_PAN_SPEED = 0.48;
/**
 * Degrees of orbit per pixel of two-finger centroid movement at sensitivity=1.
 * Combined from the old TOUCH_ORBIT_DEG_PER_PX(0.5) × default_orbit_sens(2) × BASE(0.1).
 */
const TOUCH_ORBIT_DEG_PER_PX = 0.1;
/**
 * Exponent applied to the pinch scale factor at sensitivity=1.
 * Combined from old default_zoom_sens(12) × BASE(0.1).
 * Higher = faster zoom per unit of finger spread.
 */
const TOUCH_ZOOM_EXPONENT = 0.24;
/** Maximum accepted centroid movement per frame (px). Orbit jitter guard. */
const TOUCH_MAX_DELTA_PX = 80;
/**
 * Maximum accepted finger-distance change per frame (px) for zoom.
 * Higher than the centroid guard because fast pinch is a real gesture:
 * two thumbs can spread/contract >80 px in a single frame at 60 fps.
 * Frames that exceed this are clamped rather than dropped so the baseline
 * keeps advancing and subsequent frames are not cascaded-rejected.
 */
const TOUCH_MAX_ZOOM_DELTA_PX = 250;
/** Minimum one-finger translation (px) before pan is applied. */
const TOUCH_PAN_DEADZONE_PX = 0.5;
/**
 * Cumulative centroid travel (px) before orbit starts emitting deltas.
 * Just enough to suppress micro-jitter at finger landing; not a mode lock.
 */
const ORBIT_ACTIVATION_PX = 4;
/**
 * Cumulative |log(distanceRatio)| before zoom starts emitting deltas.
 * ln(1.05) ≈ 0.0488 — fingers must spread/contract ~5% before zoom kicks in.
 */
const ZOOM_ACTIVATION_LOG = Math.log(1.05);

// ─── Types ────────────────────────────────────────────────────────────

interface Point2D {
  x: number;
  y: number;
}

interface PanSession {
  kind: "pan";
  identifier: number;
  previous: Point2D;
}

interface TransformSession {
  kind: "transform";
  // Identifiers of the two contacts we're tracking (first two touches).
  identifierA: number;
  identifierB: number;
  // Previous frame's transform state — used to compute per-frame deltas.
  previousCentroid: Point2D;
  previousDistance: number;
  // Accumulated since session start — used only for activation hysteresis.
  accumulatedCentroidTravelPx: number;
  accumulatedAbsLogScale: number;
  orbitActive: boolean;
  zoomActive: boolean;
}

type Session = PanSession | TransformSession | null;

// ─── Pure geometry helpers ───────────────────────────────────────────

function centroid(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// ─── Controller ──────────────────────────────────────────────────────

/**
 * Continuous two-touch transform recognizer (MapLibre / Google Maps style).
 *
 * One finger pans.
 *
 * Two fingers produce a continuous transform that is applied every frame:
 *   - centroid translation drives orbit
 *   - distance ratio drives zoom
 *
 * The two components are independent — both can be active in the same gesture
 * (you can orbit and zoom simultaneously, exactly like a real map).  A small
 * activation hysteresis suppresses jitter at finger landing; after that all
 * motion is applied directly.  There is no "intent commit", no delay, no
 * mode lock — the only thing classified at any moment is *this frame's*
 * motion.
 *
 * Uses TouchEvent rather than PointerEvent because Android Firefox can
 * deliver wildly asymmetric pointermove streams during a two-finger swipe
 * (one finger fires 10 events while the other fires 0), making a per-pointer
 * model unreliable.  TouchEvent always reports the full active TouchList per
 * event, so each frame has both finger positions.
 *
 * @returns Cleanup function that removes all registered listeners.
 */
export function attachTouchController(
  canvas: HTMLCanvasElement,
  camera: CameraInputTarget,
  options: { getSettings?: () => InputSettings; onDebug?: (event: TouchDebugEvent) => void } = {},
): () => void {
  // ── Debug overlay wiring ────────────────────────────────────────
  let debugOverlayDestroy: (() => void) | null = null;
  let debugSink: ((event: TouchDebugEvent) => void) | null = options.onDebug ?? null;
  if (typeof window !== "undefined" && isTouchDebugEnabled()) {
    const overlay = attachTouchDebugOverlay();
    debugOverlayDestroy = overlay.destroy;
    const userSink = debugSink;
    debugSink = (e) => {
      overlay.onDebug(e);
      userSink?.(e);
    };
  }

  let session: Session = null;
  const touchMoveCount = new Map<number, number>();

  function activeIds(touches: TouchList): number[] {
    return Array.from(touches, (t) => t.identifier).sort((a, b) => a - b);
  }

  function moveCountSnapshot(): Record<number, number> {
    const out: Record<number, number> = {};
    for (const [id, count] of touchMoveCount) out[id] = count;
    return out;
  }

  function sessionKindLabel(): "none" | "single" | "multi" {
    if (!session) return "none";
    return session.kind === "pan" ? "single" : "multi";
  }

  function emitDebug(event: TouchDebugEvent, touches: TouchList): void {
    if (!debugSink) return;
    debugSink({
      ...event,
      activePointerIds: activeIds(touches),
      sessionKind: sessionKindLabel(),
      perPointerMoveCount: moveCountSnapshot(),
    });
  }

  function pointFromTouch(t: Touch): Point2D {
    return { x: t.clientX, y: t.clientY };
  }

  function firstTwo(touches: TouchList): [Touch, Touch] | null {
    if (touches.length < 2) return null;
    return [touches[0], touches[1]];
  }

  // ── Session transitions ─────────────────────────────────────────

  function startPanSession(touches: TouchList): void {
    if (touches.length < 1) {
      session = null;
      return;
    }
    const t = touches[0];
    session = { kind: "pan", identifier: t.identifier, previous: pointFromTouch(t) };
  }

  function startTransformSession(touches: TouchList): void {
    const pair = firstTwo(touches);
    if (!pair) {
      session = null;
      return;
    }
    const [a, b] = pair;
    const pa = pointFromTouch(a);
    const pb = pointFromTouch(b);
    session = {
      kind: "transform",
      identifierA: a.identifier,
      identifierB: b.identifier,
      previousCentroid: centroid(pa, pb),
      previousDistance: distance(pa, pb),
      accumulatedCentroidTravelPx: 0,
      accumulatedAbsLogScale: 0,
      orbitActive: false,
      zoomActive: false,
    };
  }

  function reconcileSession(touches: TouchList): void {
    if (touches.length === 0) {
      session = null;
      return;
    }
    if (touches.length === 1) {
      if (!session || session.kind !== "pan" || session.identifier !== touches[0].identifier) {
        startPanSession(touches);
      } else {
        // Re-baseline previous to current to avoid jumps after multi-touch end.
        session.previous = pointFromTouch(touches[0]);
      }
      return;
    }
    // Two or more touches — track the first two.  If they don't match the
    // active session, restart.
    const pair = firstTwo(touches)!;
    const [a, b] = pair;
    if (
      !session
      || session.kind !== "transform"
      || (session.identifierA !== a.identifier && session.identifierA !== b.identifier)
      || (session.identifierB !== a.identifier && session.identifierB !== b.identifier)
    ) {
      startTransformSession(touches);
    } else {
      // Same pair, but touch count changed (e.g. third finger lifted).
      // Re-baseline previous metrics so the next frame's delta is zero.
      const pa = pointFromTouch(a);
      const pb = pointFromTouch(b);
      session.previousCentroid = centroid(pa, pb);
      session.previousDistance = distance(pa, pb);
    }
  }

  // ── Frame application ───────────────────────────────────────────

  function applyPan(touches: TouchList): void {
    if (!session || session.kind !== "pan") return;
    const s = session;
    const t = Array.from(touches).find((x) => x.identifier === s.identifier);
    if (!t) return;
    const p = pointFromTouch(t);
    const dx = p.x - session.previous.x;
    const dy = p.y - session.previous.y;
    session.previous = p;
    if (Math.abs(dx) > TOUCH_MAX_DELTA_PX || Math.abs(dy) > TOUCH_MAX_DELTA_PX) return;
    if (Math.abs(dx) < TOUCH_PAN_DEADZONE_PX && Math.abs(dy) < TOUCH_PAN_DEADZONE_PX) return;
    const sensitivity = options.getSettings?.().sensitivity.touch.pan ?? 1;
    camera.panBy(
      -dx * sensitivity * TOUCH_PAN_SPEED,
      -dy * sensitivity * TOUCH_PAN_SPEED,
      canvas.clientHeight,
    );
  }

  function applyTransform(touches: TouchList, timestamp: number): void {
    if (!session || session.kind !== "transform") return;
    const pair = firstTwo(touches);
    if (!pair) return;
    const [a, b] = pair;
    // Re-pair if a tracked finger lifted and another took its slot.
    if (
      (session.identifierA !== a.identifier && session.identifierA !== b.identifier)
      || (session.identifierB !== a.identifier && session.identifierB !== b.identifier)
    ) {
      startTransformSession(touches);
      return;
    }

    const pa = pointFromTouch(a);
    const pb = pointFromTouch(b);
    const c = centroid(pa, pb);
    const d = distance(pa, pb);
    if (d <= 0 || session.previousDistance <= 0) {
      session.previousCentroid = c;
      session.previousDistance = d;
      return;
    }

    const dCx = c.x - session.previousCentroid.x;
    const dCy = c.y - session.previousCentroid.y;
    const centroidStepPx = Math.hypot(dCx, dCy);

    // ── Centroid jitter guard (orbit) ─────────────────────────────────────
    // A centroid jump > 80 px is physically impossible on glass — it's a
    // glitch.  Drop the whole frame and keep the old baseline so the next
    // real frame has a clean reference.
    if (Math.abs(dCx) > TOUCH_MAX_DELTA_PX || Math.abs(dCy) > TOUCH_MAX_DELTA_PX) {
      return;
    }

    // ── Distance clamp (zoom) ──────────────────────────────────────────────
    // A fast pinch can legitimately produce large per-frame distance changes.
    // Instead of dropping those frames (which would cascade-reject a whole
    // fast-zoom gesture), clamp the effective distance change and always
    // advance the baseline.  Values beyond TOUCH_MAX_ZOOM_DELTA_PX are true
    // hardware glitches and get capped to the maximum plausible step.
    const clampedD =
      Math.abs(d - session.previousDistance) > TOUCH_MAX_ZOOM_DELTA_PX
        ? session.previousDistance + Math.sign(d - session.previousDistance) * TOUCH_MAX_ZOOM_DELTA_PX
        : d;
    const clampedScaleStep = clampedD / session.previousDistance;
    const clampedLogScaleStep = Math.log(clampedScaleStep);

    session.accumulatedCentroidTravelPx += centroidStepPx;
    session.accumulatedAbsLogScale += Math.abs(clampedLogScaleStep);

    if (!session.orbitActive && session.accumulatedCentroidTravelPx >= ORBIT_ACTIVATION_PX) {
      session.orbitActive = true;
    }
    if (!session.zoomActive && session.accumulatedAbsLogScale >= ZOOM_ACTIVATION_LOG) {
      session.zoomActive = true;
    }

    if (session.orbitActive) {
      const sensitivity = options.getSettings?.().sensitivity.touch.orbit ?? 1;
      camera.orbitBy(
        dCy * TOUCH_ORBIT_DEG_PER_PX * sensitivity,
        dCx * TOUCH_ORBIT_DEG_PER_PX * sensitivity,
      );
    }
    if (session.zoomActive && Math.abs(clampedLogScaleStep) > 0.0001) {
      // zoomBy is multiplicative; factor < 1 zooms in, > 1 zooms out.
      // Fingers spreading apart (clampedD > previousDistance) must zoom in,
      // so factor = previousDistance / clampedD = 1 / clampedScaleStep.
      const sensitivity = options.getSettings?.().sensitivity.touch.zoom ?? 1;
      const factor = 1 / clampedScaleStep;
      camera.zoomBy(Math.pow(factor, sensitivity * TOUCH_ZOOM_EXPONENT));
    }

    session.previousCentroid = c;
    // Always advance the distance baseline — even on a clamped frame — so
    // subsequent frames don't keep seeing a large delta from a stale value.
    session.previousDistance = d;

    // Debug — repurpose "classify" as a per-frame activity snapshot.
    if (debugSink) {
      const intent = session.orbitActive && session.zoomActive
        ? "swipe" // overlay paints orbit-only as green; "swipe" + note shows combined
        : session.orbitActive
          ? "swipe"
          : session.zoomActive
            ? "pinch"
            : null;
      emitDebug({
        type: "classify",
        timestamp,
        centroidTranslationPx: session.accumulatedCentroidTravelPx,
        distanceDeltaPx: session.accumulatedAbsLogScale,
        hasTwoMovingTouches: true,
        touchesMovingTogether: false,
        intent,
        note: `orbit=${session.orbitActive ? 1 : 0} zoom=${session.zoomActive ? 1 : 0} cStep=${centroidStepPx.toFixed(1)} sStep=${clampedScaleStep.toFixed(3)}`,
      }, touches);
    }
  }

  // ── Event handlers ──────────────────────────────────────────────

  function stop(e: TouchEvent): void {
    if (e.cancelable) e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onTouchStart(e: TouchEvent): void {
    stop(e);
    camera.cancel?.();
    for (const t of Array.from(e.changedTouches)) {
      touchMoveCount.set(t.identifier, 0);
      emitDebug({
        type: "down",
        timestamp: e.timeStamp,
        pointerId: t.identifier,
        pointerType: "touch",
        clientX: Math.round(t.clientX),
        clientY: Math.round(t.clientY),
      }, e.touches);
    }
    reconcileSession(e.touches);
  }

  function onTouchMove(e: TouchEvent): void {
    stop(e);
    for (const t of Array.from(e.changedTouches)) {
      touchMoveCount.set(t.identifier, (touchMoveCount.get(t.identifier) ?? 0) + 1);
      emitDebug({
        type: "move",
        timestamp: e.timeStamp,
        pointerId: t.identifier,
        clientX: Math.round(t.clientX),
        clientY: Math.round(t.clientY),
      }, e.touches);
    }
    if (e.touches.length === 1) {
      if (!session || session.kind !== "pan") startPanSession(e.touches);
      applyPan(e.touches);
    } else if (e.touches.length >= 2) {
      if (!session || session.kind !== "transform") startTransformSession(e.touches);
      applyTransform(e.touches, e.timeStamp);
    }
  }

  function onTouchEnd(e: TouchEvent): void {
    stop(e);
    for (const t of Array.from(e.changedTouches)) {
      touchMoveCount.delete(t.identifier);
      emitDebug({
        type: e.type === "touchcancel" ? "cancel" : "up",
        timestamp: e.timeStamp,
        pointerId: t.identifier,
      }, e.touches);
    }
    reconcileSession(e.touches);
  }

  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

  return () => {
    canvas.removeEventListener("touchstart", onTouchStart);
    canvas.removeEventListener("touchmove", onTouchMove);
    canvas.removeEventListener("touchend", onTouchEnd);
    canvas.removeEventListener("touchcancel", onTouchEnd);
    debugOverlayDestroy?.();
  };
}
