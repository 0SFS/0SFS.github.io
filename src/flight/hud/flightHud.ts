import { headingDegFromRad, type FlightState } from "../physics/flightState";

const ATTITUDE_CANVAS_SIZE = 220;
const ATTITUDE_HALF = 96;

export interface FlightHudOptions {
  onThrottleChange(value: number): void;
  onPitchTrimChange(value: number): void;
  onStickChange(aileron: number, elevator: number): void;
}

export interface FlightHudControls {
  pitchTrim: number;
  aileron: number;
  elevator: number;
}

export interface FlightHudHandle {
  update(state: FlightState, controls: FlightHudControls): void;
  destroy(): void;
}

function drawAttitudeIndicator(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rollRad: number,
  pitchRad: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-rollRad);

  const pitchPx = (pitchRad * 180) / Math.PI * 2.2;
  ctx.fillStyle = "rgba(30, 80, 160, 0.85)";
  ctx.fillRect(-radius, -radius + pitchPx, radius * 2, radius);
  ctx.fillStyle = "rgba(120, 80, 40, 0.85)";
  ctx.fillRect(-radius, pitchPx, radius * 2, radius);

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  for (let deg = -30; deg <= 30; deg += 10) {
    if (deg === 0) continue;
    const y = pitchPx + deg * 2.2;
    ctx.beginPath();
    ctx.moveTo(-40, y);
    ctx.lineTo(40, y);
    ctx.stroke();
  }

  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 55, cy);
  ctx.lineTo(cx - 18, cy);
  ctx.moveTo(cx + 18, cy);
  ctx.lineTo(cx + 55, cy);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy - 8);
  ctx.lineTo(cx - 10, cy + 8);
  ctx.lineTo(cx + 10, cy + 8);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,210,80,0.95)";
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - radius, cy - radius, radius * 2, radius * 2);
}

function drawStickOverlay(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  stickX: number,
  stickY: number,
  active: boolean,
): void {
  if (!active && stickX === 0 && stickY === 0) return;

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.stroke();

  const knobX = cx + stickX * radius;
  const knobY = cy + stickY * radius;
  ctx.beginPath();
  ctx.fillStyle = active ? "rgba(255,210,80,0.95)" : "rgba(255,210,80,0.55)";
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.arc(knobX, knobY, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function stickResponse(value: number): number {
  return Math.abs(value) <= 0.035 ? 0 : Math.sign(value) * (Math.abs(value) - 0.035) / 0.965;
}

function inverseStickResponse(value: number): number {
  if (value === 0) return 0;
  return Math.sign(value) * (Math.abs(value) * 0.965 + 0.035);
}

function clampStickSquare(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(-1, Math.min(1, x)),
    y: Math.max(-1, Math.min(1, y)),
  };
}

function controlsToStickDisplay(aileron: number, elevator: number): { x: number; y: number } {
  return clampStickSquare(
    inverseStickResponse(aileron),
    inverseStickResponse(-elevator),
  );
}

function formatAltitudeFt(altMeters: number): string {
  return Math.round(altMeters / 0.3048).toString().padStart(5, " ");
}

export function createFlightHud(root: HTMLElement, options: FlightHudOptions): FlightHudHandle {
  root.innerHTML = `
    <div class="flight-hud" aria-label="Flight instruments">
      <canvas class="flight-hud__attitude" width="220" height="220" role="button" tabindex="0" aria-label="Attitude indicator and pitch roll control. Drag to steer."></canvas>
      <div class="flight-hud__tapes">
        <div class="flight-hud__tape">
          <span class="flight-hud__label">IAS</span>
          <span class="flight-hud__value" data-metric="ias">000</span>
          <span class="flight-hud__unit">kt</span>
        </div>
        <div class="flight-hud__tape">
          <span class="flight-hud__label">ALT</span>
          <span class="flight-hud__value" data-metric="alt">00000</span>
          <span class="flight-hud__unit">ft</span>
        </div>
        <div class="flight-hud__tape">
          <span class="flight-hud__label">HDG</span>
          <span class="flight-hud__value" data-metric="hdg">000</span>
          <span class="flight-hud__unit">°</span>
        </div>
        <div class="flight-hud__tape">
          <span class="flight-hud__label">VS</span>
          <span class="flight-hud__value" data-metric="vs">+0000</span>
          <span class="flight-hud__unit">fpm</span>
        </div>
      </div>
      <div class="flight-hud__controls" aria-label="Engine and trim controls">
        <label class="flight-hud__slider-control">
          <span>THR</span>
          <input data-control="throttle" type="range" min="0" max="1" step="0.01" value="0.1" aria-label="Throttle" />
          <output data-output="throttle">10%</output>
        </label>
        <label class="flight-hud__slider-control">
          <span>TRIM</span>
          <input data-control="pitch-trim" type="range" min="-1" max="1" step="0.01" value="0" aria-label="Pitch trim" />
          <output data-output="pitch-trim">0%</output>
        </label>
      </div>
    </div>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>(".flight-hud__attitude");
  const iasEl = root.querySelector<HTMLElement>('[data-metric="ias"]');
  const altEl = root.querySelector<HTMLElement>('[data-metric="alt"]');
  const hdgEl = root.querySelector<HTMLElement>('[data-metric="hdg"]');
  const vsEl = root.querySelector<HTMLElement>('[data-metric="vs"]');
  const throttleInput = root.querySelector<HTMLInputElement>('[data-control="throttle"]');
  const trimInput = root.querySelector<HTMLInputElement>('[data-control="pitch-trim"]');
  const throttleOutput = root.querySelector<HTMLOutputElement>('[data-output="throttle"]');
  const trimOutput = root.querySelector<HTMLOutputElement>('[data-output="pitch-trim"]');

  if (!canvas || !iasEl || !altEl || !hdgEl || !vsEl || !throttleInput || !trimInput || !throttleOutput || !trimOutput) {
    throw new Error("Flight HUD markup failed to initialize.");
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Flight HUD canvas context unavailable.");
  }

  const onThrottleInput = (): void => options.onThrottleChange(Number(throttleInput.value));
  const onTrimInput = (): void => options.onPitchTrimChange(Number(trimInput.value));
  throttleInput.addEventListener("input", onThrottleInput);
  trimInput.addEventListener("input", onTrimInput);

  let stickX = 0;
  let stickY = 0;
  let stickActive = false;
  let capturedPointer: number | null = null;
  const stickKeys = new Set<string>();

  const applyStick = (x: number, y: number): void => {
    stickX = x;
    stickY = y;
    options.onStickChange(stickResponse(x), -stickResponse(y));
  };

  const releaseStick = (): void => {
    if (capturedPointer !== null && canvas.hasPointerCapture(capturedPointer)) {
      canvas.releasePointerCapture(capturedPointer);
    }
    capturedPointer = null;
    stickKeys.clear();
    stickActive = false;
    canvas.removeAttribute("data-active");
    applyStick(0, 0);
  };

  const moveStick = (clientX: number, clientY: number): void => {
    const rect = canvas.getBoundingClientRect();
    const half = Math.max(1, Math.min(rect.width, rect.height) * (ATTITUDE_HALF / ATTITUDE_CANVAS_SIZE));
    const { x, y } = clampStickSquare(
      (clientX - rect.left - rect.width / 2) / half,
      (clientY - rect.top - rect.height / 2) / half,
    );
    applyStick(x, y);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (capturedPointer !== null || event.button !== 0) return;
    event.preventDefault();
    capturedPointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    canvas.setAttribute("data-active", "");
    stickActive = true;
    moveStick(event.clientX, event.clientY);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (capturedPointer !== event.pointerId) return;
    event.preventDefault();
    moveStick(event.clientX, event.clientY);
  };

  const onPointerEnd = (event: PointerEvent): void => {
    if (capturedPointer !== event.pointerId) return;
    releaseStick();
  };

  const applyKeyboardStick = (): void => {
    const { x, y } = clampStickSquare(
      Number(stickKeys.has("ArrowRight")) - Number(stickKeys.has("ArrowLeft")),
      Number(stickKeys.has("ArrowDown")) - Number(stickKeys.has("ArrowUp")),
    );
    stickActive = x !== 0 || y !== 0;
    applyStick(x, y);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || capturedPointer !== null) return;
    event.preventDefault();
    stickKeys.add(event.key);
    applyKeyboardStick();
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || capturedPointer !== null) return;
    event.preventDefault();
    stickKeys.delete(event.key);
    if (stickKeys.size === 0) releaseStick();
    else applyKeyboardStick();
  };

  const onBlur = (): void => releaseStick();
  const onVisibilityChange = (): void => {
    if (document.hidden) releaseStick();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerEnd);
  canvas.addEventListener("pointercancel", onPointerEnd);
  canvas.addEventListener("lostpointercapture", onPointerEnd);
  canvas.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("blur", onBlur);
  const onContextMenu = (event: Event): void => event.preventDefault();
  canvas.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("blur", onBlur);
  window.addEventListener("resize", onBlur);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return {
    update(state: FlightState, controls: FlightHudControls): void {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const center = canvas.width / 2;
      drawAttitudeIndicator(ctx, center, center, ATTITUDE_HALF, state.rollRad, state.pitchRad);

      const localStick = capturedPointer !== null || stickKeys.size > 0;
      const { x: displayX, y: displayY } = localStick
        ? clampStickSquare(stickX, stickY)
        : controlsToStickDisplay(controls.aileron, controls.elevator);
      const displayActive = localStick || stickActive
        || Math.hypot(controls.aileron, controls.elevator) > 0.001;
      drawStickOverlay(ctx, center, center, ATTITUDE_HALF, displayX, displayY, displayActive);

      iasEl.textContent = Math.round(state.airspeedKts).toString().padStart(3, "0");
      altEl.textContent = formatAltitudeFt(state.altMeters);
      hdgEl.textContent = Math.round(headingDegFromRad(state.headingRad)).toString().padStart(3, "0");

      const vsFpm = Math.round(state.verticalSpeedFps * 60);
      const vsSign = vsFpm >= 0 ? "+" : "";
      vsEl.textContent = `${vsSign}${vsFpm.toString().padStart(4, " ")}`;
      throttleInput.value = String(state.throttleNorm);
      trimInput.value = String(controls.pitchTrim);
      throttleOutput.value = `${Math.round(state.throttleNorm * 100)}%`;
      trimOutput.value = `${Math.round(controls.pitchTrim * 100)}%`;
    },
    destroy(): void {
      releaseStick();
      throttleInput.removeEventListener("input", onThrottleInput);
      trimInput.removeEventListener("input", onTrimInput);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerEnd);
      canvas.removeEventListener("pointercancel", onPointerEnd);
      canvas.removeEventListener("lostpointercapture", onPointerEnd);
      canvas.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("blur", onBlur);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      root.innerHTML = "";
    },
  };
}
