import { headingDegFromRad, type FlightState } from "../physics/flightState";

export interface FlightHudOptions {
  onThrottleChange(value: number): void;
  onPitchTrimChange(value: number): void;
}

export interface FlightHudHandle {
  update(state: FlightState, pitchTrim: number): void;
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
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function formatAltitudeFt(altMeters: number): string {
  return Math.round(altMeters / 0.3048).toString().padStart(5, " ");
}

export function createFlightHud(root: HTMLElement, options: FlightHudOptions): FlightHudHandle {
  root.innerHTML = `
    <div class="flight-hud" aria-label="Flight instruments">
      <canvas class="flight-hud__attitude" width="220" height="220" aria-label="Attitude indicator"></canvas>
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

  return {
    update(state: FlightState, pitchTrim: number): void {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawAttitudeIndicator(ctx, canvas.width / 2, canvas.height / 2, 96, state.rollRad, state.pitchRad);

      iasEl.textContent = Math.round(state.airspeedKts).toString().padStart(3, "0");
      altEl.textContent = formatAltitudeFt(state.altMeters);
      hdgEl.textContent = Math.round(headingDegFromRad(state.headingRad)).toString().padStart(3, "0");

      const vsFpm = Math.round(state.verticalSpeedFps * 60);
      const vsSign = vsFpm >= 0 ? "+" : "";
      vsEl.textContent = `${vsSign}${vsFpm.toString().padStart(4, " ")}`;
      throttleInput.value = String(state.throttleNorm);
      trimInput.value = String(pitchTrim);
      throttleOutput.value = `${Math.round(state.throttleNorm * 100)}%`;
      trimOutput.value = `${Math.round(pitchTrim * 100)}%`;
    },
    destroy(): void {
      throttleInput.removeEventListener("input", onThrottleInput);
      trimInput.removeEventListener("input", onTrimInput);
      root.innerHTML = "";
    },
  };
}
