import { headingDegFromRad, type FlightState } from "../physics/flightState";
import type { FrameProfiler } from "foss-earth/perf";
import {
  ATTITUDE_HALF_SHARE,
  createAttitudeRenderer,
  type AttitudeRendererPreference,
  type AttitudeRendererStatus,
} from "./attitudeRenderer";

export interface FlightHudOptions {
  onGearChange(down: boolean): void;
  onThrottleChange(value: number): void;
  onPitchTrimChange(value: number): void;
  onRollTrimChange(value: number): void;
  onPitchAutoTrimChange(enabled: boolean): void;
  onRollAutoTrimChange(enabled: boolean): void;
  onAutopilotEngageChange(engaged: boolean): void;
  onFlapsChange(value: number): void;
  onRudderChange(value: number): void;
  onStickChange(aileron: number, elevator: number): void;
  /** The globe's WebGPU device, so the attitude indicator draws on the GPU; null on WebGL. */
  gpuDevice?: GPUDevice | null;
  /** Renderer → Instruments → Attitude indicator: osfs.renderer.attitudeIndicator. */
  attitudeRenderer?: AttitudeRendererPreference;
  /** Told what the attitude indicator draws with, whenever that changes. */
  onAttitudeStatus?(status: AttitudeRendererStatus): void;
  profiler?: FrameProfiler | null;
  pitchAutoTrim?: boolean;
  rollAutoTrim?: boolean;
  autopilotEngaged?: boolean;
}

export interface FlightHudControls {
  pitchTrim: number;
  rollTrim: number;
  flaps: number;
  rudder: number;
  aileron: number;
  elevator: number;
}

export interface FlightHudAutoTrim {
  pitch: boolean;
  roll: boolean;
}

export interface FlightHudMasterAp {
  engaged: boolean;
  canEngage: boolean;
  blockedReason: string | null;
  ownsPitch: boolean;
  ownsRoll: boolean;
  ownsGear: boolean;
  ownsFlaps: boolean;
}

export const FLIGHT_HUD_MASTER_OFF: FlightHudMasterAp = {
  engaged: false,
  canEngage: true,
  blockedReason: null,
  ownsPitch: false,
  ownsRoll: false,
  ownsGear: false,
  ownsFlaps: false,
};

export interface FlightHudHandle {
  /**
   * `gearDown`, auto-trim, and master AP are passed separately rather than
   * added to `FlightHudControls` because they are latching switches, not
   * smoothed axes.
   */
  update(
    state: FlightState,
    controls: FlightHudControls,
    gearDown: boolean,
    autoTrim: FlightHudAutoTrim,
    masterAp?: FlightHudMasterAp,
  ): void;
  /** Repaint just the gear button, for when the key moves it between frames. */
  setGearDown(down: boolean): void;
  setAttitudeRenderer(preference: AttitudeRendererPreference): void;
  destroy(): void;
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
      <div class="flight-hud__attitude-cluster" aria-label="Attitude and adjacent levers">
        <div class="flight-hud__auto-trims" role="group" aria-label="Trim assists">
          <button class="flight-hud__auto-trim flight-hud__auto-trim--roll" data-control="auto-roll-trim" type="button" aria-pressed="false"><span>TRIM</span><span>AUTO</span></button>
          <button class="flight-hud__auto-trim flight-hud__auto-trim--pitch" data-control="auto-pitch-trim" type="button" aria-pressed="false"><span>AUTO</span><span>TRIM</span></button>
        </div>
        <label class="flight-hud__slider-control flight-hud__slider-control--roll-trim">
          <span>ROLL</span>
          <input data-control="roll-trim" type="range" min="-1" max="1" step="0.01" value="0" aria-label="Roll trim" />
          <output data-output="roll-trim">0%</output>
        </label>
        <label class="flight-hud__lever flight-hud__lever--pitch">
          <span class="flight-hud__lever-meta">
            <span>PITCH</span>
            <output data-output="pitch-trim">0%</output>
          </span>
          <span class="flight-hud__lever-track">
            <input data-control="pitch-trim" type="range" min="-1" max="1" step="0.01" value="0" aria-label="Pitch trim" />
          </span>
        </label>
        <div class="flight-hud__attitude" role="button" tabindex="0" aria-label="Attitude indicator and pitch roll control. Drag to steer."></div>
        <label class="flight-hud__lever flight-hud__lever--flaps">
          <span class="flight-hud__lever-meta">
            <span>FLAPS</span>
            <output data-output="flaps">0%</output>
          </span>
          <span class="flight-hud__lever-track">
            <input data-control="flaps" type="range" min="0" max="1" step="0.01" value="0" aria-label="Flaps" />
          </span>
        </label>
      </div>
      <div class="flight-hud__tapes">
        <div class="flight-hud__tape">
          <div class="flight-hud__tape-header">
            <span class="flight-hud__label">IAS</span>
            <span class="flight-hud__unit">kt</span>
          </div>
          <span class="flight-hud__value" data-metric="ias">000</span>
        </div>
        <div class="flight-hud__tape">
          <div class="flight-hud__tape-header">
            <span class="flight-hud__label">ALT</span>
            <span class="flight-hud__unit">ft</span>
          </div>
          <span class="flight-hud__value" data-metric="alt">00000</span>
        </div>
        <div class="flight-hud__tape">
          <div class="flight-hud__tape-header">
            <span class="flight-hud__label">HDG</span>
            <span class="flight-hud__unit">°</span>
          </div>
          <span class="flight-hud__value" data-metric="hdg">000</span>
        </div>
        <div class="flight-hud__tape">
          <div class="flight-hud__tape-header">
            <span class="flight-hud__label">VS</span>
            <span class="flight-hud__unit">fpm</span>
          </div>
          <span class="flight-hud__value" data-metric="vs">+0000</span>
        </div>
        <div class="flight-hud__aoa" data-slot="aoa"></div>
        <button class="flight-hud__gear" data-control="gear" type="button" aria-pressed="true">G</button>
        <button class="flight-hud__ap" data-control="autopilot" type="button" aria-pressed="false">AP</button>
      </div>
      <div class="flight-hud__yaw-throttle" aria-label="Yaw and throttle">
        <div class="flight-hud__eval" data-slot="eval"></div>
        <div class="flight-hud__yaw">
          <label class="flight-hud__yaw-control">
            <span class="flight-hud__yaw-heading">
              <span>YAW</span>
              <output data-output="rudder">0%</output>
            </span>
            <input data-control="rudder" type="range" min="-1" max="1" step="0.01" value="0" aria-label="Yaw rudder. Drag left or right; releases to center." />
          </label>
        </div>
        <div class="flight-hud__engine" data-slot="engine"></div>
        <div class="flight-hud__throttle">
          <label class="flight-hud__slider-control">
            <span>THR</span>
            <output data-output="throttle">10%</output>
            <input data-control="throttle" type="range" min="0" max="1" step="0.01" value="0.1" aria-label="Throttle" />
          </label>
        </div>
      </div>
    </div>
  `;

  // The pad takes the pointer and the keys; the renderer draws into a canvas inside it.
  const pad = root.querySelector<HTMLElement>(".flight-hud__attitude");
  const iasEl = root.querySelector<HTMLElement>('[data-metric="ias"]');
  const altEl = root.querySelector<HTMLElement>('[data-metric="alt"]');
  const hdgEl = root.querySelector<HTMLElement>('[data-metric="hdg"]');
  const vsEl = root.querySelector<HTMLElement>('[data-metric="vs"]');
  const throttleInput = root.querySelector<HTMLInputElement>('[data-control="throttle"]');
  const pitchTrimInput = root.querySelector<HTMLInputElement>('[data-control="pitch-trim"]');
  const rollTrimInput = root.querySelector<HTMLInputElement>('[data-control="roll-trim"]');
  const pitchAutoTrimButton = root.querySelector<HTMLButtonElement>('[data-control="auto-pitch-trim"]');
  const rollAutoTrimButton = root.querySelector<HTMLButtonElement>('[data-control="auto-roll-trim"]');
  const flapsInput = root.querySelector<HTMLInputElement>('[data-control="flaps"]');
  const rudderInput = root.querySelector<HTMLInputElement>('[data-control="rudder"]');
  const throttleOutput = root.querySelector<HTMLOutputElement>('[data-output="throttle"]');
  const pitchTrimOutput = root.querySelector<HTMLOutputElement>('[data-output="pitch-trim"]');
  const rollTrimOutput = root.querySelector<HTMLOutputElement>('[data-output="roll-trim"]');
  const flapsOutput = root.querySelector<HTMLOutputElement>('[data-output="flaps"]');
  const rudderOutput = root.querySelector<HTMLOutputElement>('[data-output="rudder"]');
  const gearButton = root.querySelector<HTMLButtonElement>('[data-control="gear"]');
  const apButton = root.querySelector<HTMLButtonElement>('[data-control="autopilot"]');

  if (!pad || !gearButton || !apButton || !pitchAutoTrimButton || !rollAutoTrimButton
    || !iasEl || !altEl || !hdgEl || !vsEl
    || !throttleInput || !pitchTrimInput || !rollTrimInput || !flapsInput || !rudderInput
    || !throttleOutput || !pitchTrimOutput || !rollTrimOutput || !flapsOutput || !rudderOutput) {
    throw new Error("Flight HUD markup failed to initialize.");
  }

  const attitude = createAttitudeRenderer(pad, {
    device: options.gpuDevice ?? null,
    preference: options.attitudeRenderer,
    onStatusChange: options.onAttitudeStatus,
    profiler: options.profiler,
  });

  let gearDown = true;
  let pitchAutoTrim = options.pitchAutoTrim === true;
  let rollAutoTrim = options.rollAutoTrim === true;
  let masterAp: FlightHudMasterAp = {
    ...FLIGHT_HUD_MASTER_OFF,
    engaged: options.autopilotEngaged === true,
  };
  const renderGearButton = (): void => {
    gearButton.setAttribute("aria-pressed", String(gearDown));
    gearButton.classList.toggle("is-down", gearDown);
    gearButton.title = masterAp.ownsGear
      ? "Landing gear is held by Autopilot. Click or press G to take it back."
      : gearDown ? "Landing gear down (G) — click to raise" : "Landing gear up (G) — click to lower";
    gearButton.setAttribute("aria-label", gearButton.title);
  };
  const renderMasterApButton = (): void => {
    apButton.setAttribute("aria-pressed", String(masterAp.engaged));
    apButton.classList.toggle("is-on", masterAp.engaged);
    apButton.classList.toggle("is-blocked", !masterAp.canEngage);
    apButton.title = masterAp.engaged
      ? "Autopilot on — flying the axes selected on the Autopilot tab. Click to disengage."
      : masterAp.canEngage
        ? "Autopilot off — click to engage the package from the Autopilot tab."
        : (masterAp.blockedReason ?? "Autopilot cannot engage.");
    apButton.setAttribute("aria-label", apButton.title);
  };
  const renderAxisAutoTrim = (
    button: HTMLButtonElement,
    input: HTMLInputElement,
    enabled: boolean,
    axis: "pitch" | "roll",
    apOwns: boolean,
  ): void => {
    button.setAttribute("aria-pressed", String(enabled));
    button.classList.toggle("is-on", enabled && !apOwns);
    button.title = apOwns
      ? `${axis} is owned by Autopilot. TRIM is a wheel assist; disengage AP to use it.`
      : enabled
        ? `Trim assist on — the ${axis} wheel cancels leftover moment in real time, including while you fly. Click to turn off.`
        : `Trim assist off — click to cancel leftover ${axis} moment on the trim wheel.`;
    button.setAttribute("aria-label", button.title);
    input.disabled = enabled || apOwns;
  };
  const renderAutoTrimButtons = (): void => {
    renderAxisAutoTrim(pitchAutoTrimButton, pitchTrimInput, pitchAutoTrim, "pitch", masterAp.ownsPitch);
    renderAxisAutoTrim(rollAutoTrimButton, rollTrimInput, rollAutoTrim, "roll", masterAp.ownsRoll);
  };
  const onGearClick = (): void => options.onGearChange(!gearDown);
  const onPitchAutoTrimClick = (): void => options.onPitchAutoTrimChange(!pitchAutoTrim);
  const onRollAutoTrimClick = (): void => options.onRollAutoTrimChange(!rollAutoTrim);
  const onAutopilotClick = (): void => options.onAutopilotEngageChange(!masterAp.engaged);
  gearButton.addEventListener("click", onGearClick);
  pitchAutoTrimButton.addEventListener("click", onPitchAutoTrimClick);
  rollAutoTrimButton.addEventListener("click", onRollAutoTrimClick);
  apButton.addEventListener("click", onAutopilotClick);
  renderGearButton();
  renderMasterApButton();
  renderAutoTrimButtons();

  let rudderDragging = false;
  const onThrottleInput = (): void => options.onThrottleChange(Number(throttleInput.value));
  const onPitchTrimInput = (): void => options.onPitchTrimChange(Number(pitchTrimInput.value));
  const onRollTrimInput = (): void => options.onRollTrimChange(Number(rollTrimInput.value));
  const onFlapsInput = (): void => options.onFlapsChange(Number(flapsInput.value));
  const onRudderInput = (): void => options.onRudderChange(Number(rudderInput.value));
  const releaseRudder = (): void => {
    if (!rudderDragging) return;
    rudderDragging = false;
    rudderInput.value = "0";
    rudderOutput.value = "0%";
    options.onRudderChange(0);
  };
  const onRudderPointerDown = (): void => { rudderDragging = true; };
  const onRudderPointerUp = (): void => releaseRudder();
  const onRudderBlur = (): void => releaseRudder();
  throttleInput.addEventListener("input", onThrottleInput);
  pitchTrimInput.addEventListener("input", onPitchTrimInput);
  rollTrimInput.addEventListener("input", onRollTrimInput);
  flapsInput.addEventListener("input", onFlapsInput);
  rudderInput.addEventListener("input", onRudderInput);
  rudderInput.addEventListener("pointerdown", onRudderPointerDown);
  rudderInput.addEventListener("pointerup", onRudderPointerUp);
  rudderInput.addEventListener("pointercancel", onRudderPointerUp);
  rudderInput.addEventListener("lostpointercapture", onRudderPointerUp);
  rudderInput.addEventListener("blur", onRudderBlur);

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
    if (capturedPointer !== null && pad.hasPointerCapture(capturedPointer)) {
      pad.releasePointerCapture(capturedPointer);
    }
    capturedPointer = null;
    stickKeys.clear();
    stickActive = false;
    pad.removeAttribute("data-active");
    applyStick(0, 0);
  };

  const moveStick = (clientX: number, clientY: number): void => {
    const rect = pad.getBoundingClientRect();
    const half = Math.max(1, Math.min(rect.width, rect.height) * ATTITUDE_HALF_SHARE);
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
    pad.setPointerCapture(event.pointerId);
    pad.setAttribute("data-active", "");
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

  pad.addEventListener("pointerdown", onPointerDown);
  pad.addEventListener("pointermove", onPointerMove);
  pad.addEventListener("pointerup", onPointerEnd);
  pad.addEventListener("pointercancel", onPointerEnd);
  pad.addEventListener("lostpointercapture", onPointerEnd);
  pad.addEventListener("keydown", onKeyDown);
  pad.addEventListener("keyup", onKeyUp);
  pad.addEventListener("blur", onBlur);
  const onContextMenu = (event: Event): void => event.preventDefault();
  pad.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("blur", onBlur);
  window.addEventListener("resize", onBlur);
  document.addEventListener("visibilitychange", onVisibilityChange);

  const setGearDown = (next: boolean): void => {
    if (next === gearDown) return;
    gearDown = next;
    renderGearButton();
  };
  const setAutoTrim = (next: FlightHudAutoTrim): void => {
    if (next.pitch === pitchAutoTrim && next.roll === rollAutoTrim) return;
    pitchAutoTrim = next.pitch;
    rollAutoTrim = next.roll;
    renderAutoTrimButtons();
  };
  const setMasterAp = (next: FlightHudMasterAp): void => {
    const same = next.engaged === masterAp.engaged
      && next.canEngage === masterAp.canEngage
      && next.blockedReason === masterAp.blockedReason
      && next.ownsPitch === masterAp.ownsPitch
      && next.ownsRoll === masterAp.ownsRoll
      && next.ownsGear === masterAp.ownsGear
      && next.ownsFlaps === masterAp.ownsFlaps;
    if (same) return;
    masterAp = { ...next };
    renderMasterApButton();
    renderGearButton();
    renderAutoTrimButtons();
  };

  return {
    setGearDown,
    setAttitudeRenderer: preference => attitude.setPreference(preference),
    update(
      state: FlightState,
      controls: FlightHudControls,
      nextGearDown: boolean,
      nextAutoTrim: FlightHudAutoTrim,
      nextMasterAp = FLIGHT_HUD_MASTER_OFF,
    ): void {
      setGearDown(nextGearDown);
      setAutoTrim(nextAutoTrim);
      setMasterAp(nextMasterAp);
      const localStick = capturedPointer !== null || stickKeys.size > 0;
      const { x: displayX, y: displayY } = localStick
        ? clampStickSquare(stickX, stickY)
        : controlsToStickDisplay(controls.aileron, controls.elevator);
      const displayActive = localStick || stickActive
        || Math.hypot(controls.aileron, controls.elevator) > 0.001;
      attitude.draw(state, { x: displayX, y: displayY, active: displayActive });

      iasEl.textContent = Math.round(state.airspeedKts).toString().padStart(3, "0");
      altEl.textContent = formatAltitudeFt(state.altMeters);
      hdgEl.textContent = Math.round(headingDegFromRad(state.headingRad)).toString().padStart(3, "0");

      // Sign then magnitude, each fixed width: signing the padded number gave
      // "+ 738" against "-738", so the chip changed width across zero. The
      // instrument row is left-anchored now, and that shunts everything after
      // it sideways.
      const vsFpm = Math.round(state.verticalSpeedFps * 60);
      vsEl.textContent = `${vsFpm < 0 ? "-" : "+"}${Math.abs(vsFpm).toString().padStart(4, " ")}`;
      throttleInput.value = String(state.throttleNorm);
      pitchTrimInput.value = String(controls.pitchTrim);
      rollTrimInput.value = String(controls.rollTrim);
      flapsInput.value = String(controls.flaps);
      if (!rudderDragging) rudderInput.value = String(controls.rudder);
      throttleOutput.value = `${Math.round(state.throttleNorm * 100)}%`;
      pitchTrimOutput.value = `${Math.round(controls.pitchTrim * 100)}%`;
      rollTrimOutput.value = `${Math.round(controls.rollTrim * 100)}%`;
      flapsOutput.value = `${Math.round(controls.flaps * 100)}%`;
      rudderOutput.value = `${Math.round((rudderDragging ? Number(rudderInput.value) : controls.rudder) * 100)}%`;
    },
    destroy(): void {
      attitude.destroy();
      releaseStick();
      releaseRudder();
      gearButton.removeEventListener("click", onGearClick);
      pitchAutoTrimButton.removeEventListener("click", onPitchAutoTrimClick);
      rollAutoTrimButton.removeEventListener("click", onRollAutoTrimClick);
      apButton.removeEventListener("click", onAutopilotClick);
      throttleInput.removeEventListener("input", onThrottleInput);
      pitchTrimInput.removeEventListener("input", onPitchTrimInput);
      rollTrimInput.removeEventListener("input", onRollTrimInput);
      flapsInput.removeEventListener("input", onFlapsInput);
      rudderInput.removeEventListener("input", onRudderInput);
      rudderInput.removeEventListener("pointerdown", onRudderPointerDown);
      rudderInput.removeEventListener("pointerup", onRudderPointerUp);
      rudderInput.removeEventListener("pointercancel", onRudderPointerUp);
      rudderInput.removeEventListener("lostpointercapture", onRudderPointerUp);
      rudderInput.removeEventListener("blur", onRudderBlur);
      pad.removeEventListener("pointerdown", onPointerDown);
      pad.removeEventListener("pointermove", onPointerMove);
      pad.removeEventListener("pointerup", onPointerEnd);
      pad.removeEventListener("pointercancel", onPointerEnd);
      pad.removeEventListener("lostpointercapture", onPointerEnd);
      pad.removeEventListener("keydown", onKeyDown);
      pad.removeEventListener("keyup", onKeyUp);
      pad.removeEventListener("blur", onBlur);
      pad.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      root.innerHTML = "";
    },
  };
}
