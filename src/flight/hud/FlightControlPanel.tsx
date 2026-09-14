import "foss-earth/windowing.css";

import { MapCachePanel, WindowOverlay, type WindowOverlayHandle } from "foss-earth/shell";
import {
  type GeodeticLocation,
  type LocationSearchProvider,
  type WindowTabDefinition,
} from "foss-earth/windowing";
import {
  Bug,
  CloudSun,
  Gauge,
  Navigation,
  Settings,
  Pause,
  Play,
  Plane,
  Volume2,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { BabylonRuntimeStatus, GoogleTerrainDetailState, RendererMode } from "foss-earth/runtime";
import type { FlightViewMode } from "../aircraft/createPlaceholderAircraft";
import {
  AIRCRAFT_FAMILIES,
  getAircraftFamilyForAircraft,
  normalizeAircraftSelection,
  type AircraftFamilyId,
  type AircraftSelection,
  type AircraftId,
  type AircraftLodId,
} from "../aircraft/aircraftCatalog";
import type { AircraftModelStatus } from "../aircraft/createAircraftModel";
import { AircraftSelectionPanel } from "./AircraftSelectionPanel";
import { GamepadBindingsPanel, type GamepadBindingsMount } from "./GamepadBindingsPanel";
import { flightLog, type FlightLogEntry } from "../diagnostics/flightLog";
import {
  getActiveFlightPerformanceCapture,
  type FlightPerformanceSummary,
} from "../diagnostics/flightPerformanceCapture";
import { headingDegFromRad, type FlightState } from "../physics/flightState";
import {
  DEFAULT_KEYBOARD_STICK_SETTINGS,
  KEYBOARD_STICK_MODES,
  type KeyboardStickSettings,
} from "../input/keyboardStickSettings";
import type { OrbitInvertSettings } from "../input/orbitInvertSettings";
import { GAMEPAD_POLLING_OPTIONS, type GamepadPollingController } from "../input/gamepadPolling";
import {
  DEFAULT_GAMEPAD_RESPONSE_SETTINGS,
  type GamepadResponseController,
  type GamepadResponseSettings,
} from "../input/gamepadResponseSettings";
import { WHEEL_SPIN_CONFIGS, type WheelSpinMode, type WheelSpinState } from "../physics/wheelSpin";
import {
  GroundInteractionSettingsPanel,
  type GroundInteractionAction,
  type GroundInteractionPanelState,
} from "./GroundInteractionSettingsPanel";
import { AutopilotPanel, type AutopilotPanelState } from "./AutopilotPanel";
import { SoundSettingsPanel, type SoundAction } from "./SoundSettingsPanel";
import type { FlightAudioStatus } from "../audio/createFlightAudio";
import type { AutopilotSettingsV1 } from "../autopilot/autopilotSettings";

export type FlightPanelTab = "weather" | "aircraft" | "autopilot" | "controls" | "sound" | "debug" | "settings";

const TAB_DEFINITIONS: readonly WindowTabDefinition<FlightPanelTab>[] = [
  { id: "weather", label: "Weather" },
  { id: "aircraft", label: "Aircraft" },
  { id: "autopilot", label: "Autopilot" },
  { id: "controls", label: "Controls" },
  { id: "sound", label: "Sound" },
  { id: "debug", label: "Debug" },
  { id: "settings", label: "Settings" },
];

const TAB_ICONS = {
  weather: CloudSun,
  aircraft: Plane,
  autopilot: Navigation,
  controls: Gauge,
  sound: Volume2,
  debug: Bug,
  settings: Settings,
} satisfies Record<FlightPanelTab, typeof Plane>;

export interface FlightWeatherState {
  windDirectionDeg: number;
  windSpeedKts: number;
}

export type FlightTerrainDetailAnchor = "aircraft" | "camera";

export interface FlightControlPanelSnapshot {
  flightState: FlightState;
  fps: number;
  paused: boolean;
  viewMode: FlightViewMode;
  runtimeStatus: BabylonRuntimeStatus;
  rendererMode: RendererMode;
  googleTerrainDetail: GoogleTerrainDetailState | null;
  /** Whether the World detail target follows this device's first-run recommendation. */
  worldDetailIsAutomatic: boolean;
  automaticWorldDetailTarget: number;
  /** Maximum Google screen-space error accepted for ground contact. */
  flightTerrainRequirement: number;
  /** A deliberately temporary waiver of the flight terrain requirement. */
  allowCoarserTerrainThisSession: boolean;
  terrainDetailAnchor: FlightTerrainDetailAnchor;
  aircraftId: AircraftId;
  generationId?: string;
  lodId: AircraftLodId;
  /** Whether the opt-in levels are switched on. */
  optInLodsEnabled: boolean;
  modelStatus: AircraftModelStatus;
  /** Level actually in the scene; differs from lodId while "Auto" is selected. */
  modelActiveLodId: AircraftLodId | null;
  modelTriangles: number | null;
  modelError: string | null;
  keyboardStick: KeyboardStickSettings;
  orbitInvert: OrbitInvertSettings;
  arcadeGroundLaunches: boolean;
  collisionDebugEnabled: boolean;
  wheelSpinMode: WheelSpinMode | "off";
  tireSoundEnabled: boolean;
  tireAudioStatus: string | null;
  /** The shared sound runtime: engine sound and the tire cue. */
  sound: FlightAudioStatus;
  wheelSpinStates: readonly WheelSpinState[];
  groundInteraction: GroundInteractionPanelState;
  autopilot: AutopilotPanelState;
}

export interface FlightControlPanelOptions {
  initialWeather: FlightWeatherState;
  gamepadBindings?: GamepadBindingsMount;
  onLocationApply(location: GeodeticLocation): void;
  locationSearchProvider?: LocationSearchProvider;
  onWeatherChange(weather: FlightWeatherState): void;
  onPausedChange(paused: boolean): void;
  onViewModeChange(mode: FlightViewMode): void;
  /** Commit a staged aircraft and presentation choice; return a visible error if it fails. */
  onAircraftApply(selection: AircraftSelection): string | null;
  onGoogleTerrainDetailChange(errorTarget: number): void;
  onAutomaticGoogleTerrainDetailChange(): void;
  onFlightTerrainRequirementChange(errorTarget: number): void;
  onTerrainDetailOverrideChange(enabled: boolean): void;
  onTerrainDetailAnchorChange(anchor: FlightTerrainDetailAnchor): void;
  onKeyboardStickSettingsChange(settings: KeyboardStickSettings): void;
  onOrbitInvertChange(settings: OrbitInvertSettings): void;
  onArcadeGroundLaunchesChange(enabled: boolean): void;
  onCollisionDebugChange(enabled: boolean): void;
  onWheelSpinModeChange(mode: WheelSpinMode | "off"): void;
  onTireSoundChange(enabled: boolean): void;
  /** Must act synchronously: the control's gesture is what unlocks audio. */
  onSoundAction(action: SoundAction): void;
  onGroundInteractionAction(action: GroundInteractionAction): void;
  onAutopilotSettingsChange(settings: AutopilotSettingsV1): void;
  onAutopilotEngageChange(engaged: boolean): void;
}

export interface FlightControlPanelHandle {
  update(snapshot: FlightControlPanelSnapshot): void;
  openOrSelectTab(tabId: "location" | FlightPanelTab): void;
  destroy(): void;
}

interface FlightControlPanelProps extends FlightControlPanelOptions {
  snapshot: FlightControlPanelSnapshot;
  overlayApiRef: { current: WindowOverlayHandle<FlightPanelTab> | null };
}

function getTabLabel(tabId: FlightPanelTab): string {
  return TAB_DEFINITIONS.find((definition) => definition.id === tabId)?.label ?? tabId;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flight-panel__metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function WeatherPanel({
  initialWeather,
  onWeatherChange,
}: Pick<FlightControlPanelProps, "initialWeather" | "onWeatherChange">) {
  const [weather, setWeather] = useState(initialWeather);

  const updateWeather = (partial: Partial<FlightWeatherState>) => {
    const next = { ...weather, ...partial };
    setWeather(next);
    onWeatherChange(next);
  };

  return (
    <div className="flight-panel__content">
      <div className="flight-panel__section-heading">
        <div><span>Conditions</span><strong>Custom wind</strong></div>
        <CloudSun size={22} aria-hidden="true" />
      </div>
      <label className="flight-panel__field">
        <span>Wind direction <output>{weather.windDirectionDeg.toFixed(0)}°</output></span>
        <input
          type="range"
          min="0"
          max="359"
          value={weather.windDirectionDeg}
          onChange={(event) => updateWeather({ windDirectionDeg: Number(event.target.value) })}
        />
      </label>
      <label className="flight-panel__field">
        <span>Wind speed <output>{weather.windSpeedKts.toFixed(0)} kt</output></span>
        <input
          type="range"
          min="0"
          max="50"
          value={weather.windSpeedKts}
          onChange={(event) => updateWeather({ windSpeedKts: Number(event.target.value) })}
        />
      </label>
      <button className="flight-panel__command" type="button" onClick={() => updateWeather({ windDirectionDeg: 0, windSpeedKts: 0 })}>
        Clear wind
      </button>
    </div>
  );
}

interface AircraftPanelProps extends FlightControlPanelProps {
  aircraftSelection: AircraftSelection;
  onAircraftSelectionChange(selection: AircraftSelection): void;
  onAircraftFamilyChange(familyId: AircraftFamilyId): void;
}

function AircraftPanel({
  snapshot,
  onPausedChange,
  onViewModeChange,
  onAircraftApply,
  aircraftSelection,
  onAircraftSelectionChange,
  onAircraftFamilyChange,
}: AircraftPanelProps) {
  return (
    <div className="flight-panel__content">
      <div className="flight-panel__metrics">
        <Metric label="Airspeed" value={`${Math.round(snapshot.flightState.airspeedKts)} kt`} />
        <Metric label="Altitude" value={`${Math.round(snapshot.flightState.altMeters / 0.3048).toLocaleString()} ft`} />
        <Metric label="Heading" value={`${Math.round(headingDegFromRad(snapshot.flightState.headingRad))}°`} />
        <Metric label="Throttle" value={`${Math.round(snapshot.flightState.throttleNorm * 100)}%`} />
      </div>
      <AircraftSelectionPanel
        snapshot={snapshot}
        selection={aircraftSelection}
        onSelectionChange={onAircraftSelectionChange}
        onFamilyChange={onAircraftFamilyChange}
        onApply={onAircraftApply}
      />
      <fieldset className="flight-panel__fieldset">
        <legend>Camera</legend>
        <div className="flight-panel__segmented">
          {(["first", "third"] as const).map((mode) => (
            <button
              key={mode}
              className={snapshot.viewMode === mode ? "is-active" : ""}
              type="button"
              onClick={() => onViewModeChange(mode)}
            >
              {mode === "first" ? "Cockpit" : "Chase"}
            </button>
          ))}
        </div>
      </fieldset>
      <button className="flight-panel__command" type="button" onClick={() => onPausedChange(!snapshot.paused)}>
        {snapshot.paused ? <Play size={16} /> : <Pause size={16} />}
        {snapshot.paused ? "Resume simulation" : "Pause simulation"}
      </button>
      <div className="flight-panel__keymap" aria-label="Flight controls">
        <span><kbd>W/S</kbd> Pitch</span><span><kbd>A/D</kbd> Roll</span>
        <span><kbd>Q/E</kbd> Rudder</span><span><kbd>⇧/⌃</kbd> Throttle</span>
      </div>
    </div>
  );
}

function formatDetail(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.join("; ")}`;
      if (value && typeof value === "object") return `${key}: ${JSON.stringify(value)}`;
      return `${key}: ${String(value)}`;
    })
    .join("\n");
}

function EventLog() {
  const [entries, setEntries] = useState<readonly FlightLogEntry[]>(flightLog.entries());
  useEffect(() => flightLog.subscribe(setEntries), []);

  if (entries.length === 0) {
    return <p className="flight-panel__hint">No events yet. Automatic pauses and faults appear here.</p>;
  }

  return (
    <ol className="flight-panel__log">
      {entries.slice(0, 40).map((entry) => (
        <li key={entry.id} data-level={entry.level}>
          <div className="flight-panel__log-head">
            <span>{(entry.atMs / 1000).toFixed(1)}s</span>
            <strong>{entry.source}</strong>
            <span>{entry.message}</span>
          </div>
          {entry.detail ? <pre>{formatDetail(entry.detail)}</pre> : null}
        </li>
      ))}
    </ol>
  );
}

function formatMilliseconds(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)} ms`;
}

function FlightPerformancePanel() {
  const [summary, setSummary] = useState<FlightPerformanceSummary | null>(
    () => getActiveFlightPerformanceCapture()?.snapshot() ?? null,
  );
  useEffect(() => {
    const refresh = () => setSummary(getActiveFlightPerformanceCapture()?.snapshot() ?? null);
    refresh();
    const interval = window.setInterval(refresh, 500);
    return () => window.clearInterval(interval);
  }, []);

  if (!summary) {
    return <p className="flight-panel__hint">Open the simulator with <code>flightPerf=1</code> in the URL to capture stutters.</p>;
  }

  const copyTrace = (): void => {
    const capture = getActiveFlightPerformanceCapture();
    if (!capture || !navigator.clipboard) return;
    void navigator.clipboard.writeText(JSON.stringify(capture.exportTrace()));
  };

  return (
    <fieldset className="flight-panel__fieldset">
      <legend>Stutter trace</legend>
      <div className="flight-panel__metrics">
        <Metric label="Samples" value={summary.sampleCount.toLocaleString()} />
        <Metric label="Frame p95" value={formatMilliseconds(summary.frame.p95Ms)} />
        <Metric label="Frame p99" value={formatMilliseconds(summary.frame.p99Ms)} />
        <Metric label="Worst frame" value={formatMilliseconds(summary.frame.maxMs)} />
        <Metric label="Physics p95" value={formatMilliseconds(summary.physicsLoop.p95Ms)} />
        <Metric label="Terrain p95" value={formatMilliseconds(summary.terrainQuery.p95Ms)} />
        <Metric label="Collision p95" value={formatMilliseconds(summary.collision.p95Ms)} />
        <Metric label="Tick p95" value={formatMilliseconds(summary.flightTick.p95Ms)} />
      </div>
      <p className="flight-panel__hint">
        {`${summary.slowFrames.over50Ms} frames over 50 ms; ${summary.slowFrames.over100Ms} over 100 ms. `}
        {`${summary.streamingFrames} frames streamed map tiles.`}
      </p>
      <button className="flight-panel__command" type="button" onClick={copyTrace}>
        Copy performance trace
      </button>
      <p className="flight-panel__hint">The same trace is available in DevTools as <code>window.osfsFlightPerformance</code>.</p>
    </fieldset>
  );
}

function formatTerrainDetailTarget(target: number): string {
  const exponent = Math.log2(target).toFixed(Number.isInteger(Math.log2(target)) ? 0 : 2);
  return `2^${exponent} = ${target.toLocaleString()} px`;
}

function OrbitInvertSettingsPanel({
  snapshot,
  onOrbitInvertChange,
}: Pick<FlightControlPanelProps, "snapshot" | "onOrbitInvertChange">) {
  const settings = snapshot.orbitInvert;
  return (
    <fieldset className="flight-panel__fieldset">
      <legend>Camera orbit</legend>
      <label className="flight-panel__field flight-panel__field--inline">
        <input
          type="checkbox"
          aria-label="Invert orbit yaw"
          checked={settings.invertYaw}
          onChange={(event) => onOrbitInvertChange({ ...settings, invertYaw: event.target.checked })}
        />
        <span>Invert yaw (left / right) for right-stick and trackpad</span>
      </label>
      <label className="flight-panel__field flight-panel__field--inline">
        <input
          type="checkbox"
          aria-label="Invert orbit pitch"
          checked={settings.invertPitch}
          onChange={(event) => onOrbitInvertChange({ ...settings, invertPitch: event.target.checked })}
        />
        <span>Invert pitch (up / down) for right-stick and trackpad</span>
      </label>
      <label className="flight-panel__field">
        <span>Behavior when holding still</span>
        <select
          aria-label="Camera orbit hold behavior"
          value={settings.recenterMode}
          onChange={(event) => onOrbitInvertChange({ ...settings, recenterMode: event.target.value as "hold" | "recenter" })}
        >
          <option value="hold">Hold camera position</option>
          <option value="recenter">Return behind aircraft on release</option>
        </select>
      </label>
      <p className="flight-panel__hint">
        Applies to right-stick, two-finger swipe, and right-drag camera orbit.
      </p>
      <p className="flight-panel__hint">
        Hold keeps the camera where you left it. Recenter smoothly returns to the default chase offset after a two-finger swipe or joystick release.
      </p>
    </fieldset>
  );
}

function SettingSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format(value: number): string;
  onChange(value: number): void;
}) {
  return (
    <label className="flight-panel__field">
      <span>{label}<output>{format(value)}</output></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function GamepadSettingsPanel({ polling, response }: {
  polling: GamepadPollingController;
  response: GamepadResponseController;
}) {
  const rate = useSyncExternalStore(polling.subscribe, polling.getRate, polling.getRate);
  const settings = useSyncExternalStore(response.subscribe, response.getSettings, response.getSettings);
  return (
    <fieldset className="flight-panel__fieldset">
      <legend>Gamepad</legend>
      <label className="flight-panel__field">
        <span>Polling rate</span>
        <select
          aria-label="Gamepad polling rate"
          value={rate}
          onChange={event => polling.setRate(event.currentTarget.value)}
        >
          {GAMEPAD_POLLING_OPTIONS.map(option => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      <p className="flight-panel__hint">
        Every frame reads input before each flight frame without an added timer cap.
        Fixed limits reduce scheduled polling and can introduce visible stepping.
        The browser frame rate remains the upper limit.
      </p>
      <p className="flight-panel__hint">
        This controls application polling, not the controller's hardware report rate.
        Keyboard events remain immediate.
      </p>
      <label className="flight-panel__field">
        <span>Analog response</span>
        <select
          aria-label="Gamepad analog response"
          value={settings.mode}
          onChange={event => response.setSettings({ mode: event.currentTarget.value as GamepadResponseSettings["mode"] })}
        >
          <option value="smooth">Smooth (original)</option>
          <option value="direct">Direct (no smoothing)</option>
        </select>
      </label>
      {settings.mode === "smooth" && <SettingSlider
        label="Response time"
        value={settings.responseTimeSec}
        min={0.05}
        max={2}
        step={0.025}
        format={value => `${Math.round(value * 1000)} ms`}
        onChange={responseTimeSec => response.setSettings({ responseTimeSec })}
      />}
      <p className="flight-panel__hint">
        Smooth updates pitch, roll, and yaw every flight frame, including between controller reports.
        The original setting is 375 ms to approach 95% of a held command; Direct holds each report unchanged.
      </p>
      <label className="flight-panel__field">
        <span>Stick deadzone behavior</span>
        <select
          aria-label="Gamepad stick deadzone behavior"
          value={settings.deadzoneMode}
          onChange={event => response.setSettings({ deadzoneMode: event.currentTarget.value as GamepadResponseSettings["deadzoneMode"] })}
        >
          <option value="cutoff">Cutoff (original magnitude)</option>
          <option value="scaled">Rescaled (reduced near-center response)</option>
        </select>
      </label>
      <p className="flight-panel__hint">
        Cutoff ignores the center zone and preserves stick magnitude outside it.
        Each binding keeps its deadzone size; the Xbox profile uses 8%.
        Rescaled subtracts that zone from the remaining travel.
      </p>
      <p className="flight-panel__hint">
        Polling and response settings are saved on this device and apply across binding profiles.
        They do not change keyboard, on-screen stick, or phone response.
      </p>
      <button className="flight-panel__command" type="button" onClick={() => {
        polling.setRate("frame");
        response.setSettings(DEFAULT_GAMEPAD_RESPONSE_SETTINGS);
      }}>
        Reset gamepad defaults
      </button>
    </fieldset>
  );
}

function KeyboardStickSettingsPanel({
  snapshot,
  onKeyboardStickSettingsChange,
}: Pick<FlightControlPanelProps, "snapshot" | "onKeyboardStickSettingsChange">) {
  const settings = snapshot.keyboardStick;
  const modeMeta = KEYBOARD_STICK_MODES.find((mode) => mode.id === settings.mode);
  const patch = (partial: Partial<KeyboardStickSettings>): void => {
    onKeyboardStickSettingsChange({ ...settings, ...partial });
  };

  return (
    <fieldset className="flight-panel__fieldset">
      <legend>Keyboard response</legend>
      <label className="flight-panel__field">
        <span>Response mode</span>
        <select
          aria-label="Keyboard stick response mode"
          value={settings.mode}
          onChange={(event) => patch({ mode: event.target.value as KeyboardStickSettings["mode"] })}
        >
          {KEYBOARD_STICK_MODES.map((mode) => (
            <option key={mode.id} value={mode.id}>{mode.label}</option>
          ))}
        </select>
      </label>
      <p className="flight-panel__hint">{modeMeta?.description}</p>

      {settings.mode === "smooth" && <>
        <SettingSlider
          label="Response time"
          value={settings.smoothResponseSec}
          min={0.05}
          max={2}
          step={0.025}
          format={(value) => `${value.toFixed(2)} s`}
          onChange={(smoothResponseSec) => patch({ smoothResponseSec })}
        />
        <SettingSlider
          label="Return time"
          value={settings.smoothReturnSec}
          min={0.05}
          max={2}
          step={0.025}
          format={(value) => `${value.toFixed(2)} s`}
          onChange={(smoothReturnSec) => patch({ smoothReturnSec })}
        />
        <p className="flight-panel__hint">Time to reach about 95% of a held deflection, and time to center after release.</p>
      </>}

      {settings.mode === "rate" && <>
        <SettingSlider
          label="Time to full"
          value={settings.rateTimeToFull}
          min={0.1}
          max={3}
          step={0.05}
          format={(value) => `${value.toFixed(2)} s`}
          onChange={(rateTimeToFull) => patch({ rateTimeToFull })}
        />
        <SettingSlider
          label="Time to center"
          value={settings.rateTimeToCenter}
          min={0.05}
          max={2}
          step={0.05}
          format={(value) => `${value.toFixed(2)} s`}
          onChange={(rateTimeToCenter) => patch({ rateTimeToCenter })}
        />
        <SettingSlider
          label="Accel after"
          value={settings.rateAccelAfterSec}
          min={0}
          max={2}
          step={0.05}
          format={(value) => `${value.toFixed(2)} s`}
          onChange={(rateAccelAfterSec) => patch({ rateAccelAfterSec })}
        />
        <SettingSlider
          label="Accel multiplier"
          value={settings.rateAccelMultiplier}
          min={1}
          max={6}
          step={0.1}
          format={(value) => `${value.toFixed(1)}×`}
          onChange={(rateAccelMultiplier) => patch({ rateAccelMultiplier })}
        />
        <SettingSlider
          label="Max deflection"
          value={settings.rateMaxDeflection}
          min={0.1}
          max={1}
          step={0.05}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(rateMaxDeflection) => patch({ rateMaxDeflection })}
        />
      </>}

      {settings.mode === "assist" && <>
        <SettingSlider
          label="Roll rate command"
          value={settings.assistRollRateDeg}
          min={5}
          max={120}
          step={1}
          format={(value) => `${Math.round(value)} °/s`}
          onChange={(assistRollRateDeg) => patch({ assistRollRateDeg })}
        />
        <SettingSlider
          label="Pitch rate command"
          value={settings.assistPitchRateDeg}
          min={5}
          max={60}
          step={1}
          format={(value) => `${Math.round(value)} °/s`}
          onChange={(assistPitchRateDeg) => patch({ assistPitchRateDeg })}
        />
        <SettingSlider
          label="Yaw rate command"
          value={settings.assistYawRateDeg}
          min={5}
          max={60}
          step={1}
          format={(value) => `${Math.round(value)} °/s`}
          onChange={(assistYawRateDeg) => patch({ assistYawRateDeg })}
        />
        <SettingSlider
          label="PID Kp"
          value={settings.assistKp}
          min={0}
          max={3}
          step={0.05}
          format={(value) => value.toFixed(2)}
          onChange={(assistKp) => patch({ assistKp })}
        />
        <SettingSlider
          label="PID Ki"
          value={settings.assistKi}
          min={0}
          max={1}
          step={0.01}
          format={(value) => value.toFixed(2)}
          onChange={(assistKi) => patch({ assistKi })}
        />
        <SettingSlider
          label="PID Kd"
          value={settings.assistKd}
          min={0}
          max={0.5}
          step={0.005}
          format={(value) => value.toFixed(3)}
          onChange={(assistKd) => patch({ assistKd })}
        />
        <SettingSlider
          label="Max deflection"
          value={settings.assistMaxDeflection}
          min={0.1}
          max={1}
          step={0.05}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(assistMaxDeflection) => patch({ assistMaxDeflection })}
        />
        <p className="flight-panel__hint">Keys command body rates. Release holds the current attitude rate near zero.</p>
      </>}

      {settings.mode === "direct" && (
        <p className="flight-panel__hint">No ramp — held keys are full deflection. Expo below still softens the output curve.</p>
      )}

      <SettingSlider
        label="Expo"
        value={settings.expo}
        min={0}
        max={1}
        step={0.05}
        format={(value) => `${Math.round(value * 100)}%`}
        onChange={(expo) => patch({ expo })}
      />
      <p className="flight-panel__hint">Applies to keyboard bindings in the selected profile. Softens small deflections while keeping full range. HUD stick, gamepad, and phone are unchanged.</p>
      <button
        className="flight-panel__command"
        type="button"
        onClick={() => onKeyboardStickSettingsChange({ ...DEFAULT_KEYBOARD_STICK_SETTINGS })}
      >
        Reset keyboard stick defaults
      </button>
    </fieldset>
  );
}

function WorldDetailSettings({
  snapshot,
  onGoogleTerrainDetailChange,
  onAutomaticGoogleTerrainDetailChange,
  onFlightTerrainRequirementChange,
  onTerrainDetailOverrideChange,
  onTerrainDetailAnchorChange,
}: Pick<FlightControlPanelProps,
  "snapshot" | "onGoogleTerrainDetailChange" | "onAutomaticGoogleTerrainDetailChange"
  | "onFlightTerrainRequirementChange" | "onTerrainDetailOverrideChange" | "onTerrainDetailAnchorChange">) {
  const detail = snapshot.googleTerrainDetail;
  if (!detail || snapshot.runtimeStatus.mode !== "google-tiles") {
    return (
      <fieldset className="flight-panel__fieldset">
        <legend>World detail</legend>
        <p className="flight-panel__hint">Switch the map source to Google 3D Tiles to control World detail.</p>
      </fieldset>
    );
  }

  // Detail targets cover several orders of magnitude, so the two handles use
  // log2(target) while their labels retain the power-of-two representation.
  const detailSliderValue = Math.log2(detail.errorTarget);
  const requirementSliderValue = Math.log2(snapshot.flightTerrainRequirement);
  const rangeStart = Math.min(detailSliderValue, requirementSliderValue);
  const rangeEnd = Math.max(detailSliderValue, requirementSliderValue);

  return (
    <fieldset className="flight-panel__fieldset">
      <legend>World detail</legend>
      <div className="flight-panel__detail-range-control">
        <div className="flight-panel__detail-range-labels">
          <span className="flight-panel__detail-range-label flight-panel__detail-range-label--world">
            <strong>World detail limit</strong>
            <output>{formatTerrainDetailTarget(detail.errorTarget)}</output>
          </span>
          <span className="flight-panel__detail-range-label flight-panel__detail-range-label--flight">
            <strong>Flight minimum</strong>
            <output>{formatTerrainDetailTarget(snapshot.flightTerrainRequirement)}</output>
          </span>
        </div>
        <div className="flight-panel__detail-range" role="group" aria-label="World detail range">
          <span className="flight-panel__detail-range-track" aria-hidden="true" />
          <span
            className="flight-panel__detail-range-selected"
            aria-hidden="true"
            style={{ left: `${rangeStart / 19 * 100}%`, width: `${(rangeEnd - rangeStart) / 19 * 100}%` }}
          />
          <input
            className="flight-panel__detail-range-input flight-panel__detail-range-input--world"
            aria-label="World detail target"
            type="range"
            min="0"
            max="19"
            step="0.05"
            value={detailSliderValue}
            onChange={(event) => onGoogleTerrainDetailChange(Math.round(2 ** Number(event.target.value)))}
          />
          <input
            className="flight-panel__detail-range-input flight-panel__detail-range-input--flight"
            aria-label="Minimum World detail for flight"
            type="range"
            min="0"
            max="19"
            step="0.05"
            value={requirementSliderValue}
            onChange={(event) => onFlightTerrainRequirementChange(Math.round(2 ** Number(event.target.value)))}
          />
        </div>
        <div className="flight-panel__detail-range-scale" aria-hidden="true">
          <span>More detail · 2^0 = 1 px</span>
          <span>Less detail · 2^19</span>
        </div>
      </div>
      <p className="flight-panel__hint">
        Move the green handle to limit renderer detail and the red handle to set the coarsest detail that can fly without an override.
      </p>
      <button
        className="flight-panel__command"
        type="button"
        disabled={snapshot.worldDetailIsAutomatic}
        onClick={onAutomaticGoogleTerrainDetailChange}
      >
        {`Use automatic detail (${formatTerrainDetailTarget(snapshot.automaticWorldDetailTarget)})`}
      </button>
      <p className="flight-panel__hint">
        {snapshot.worldDetailIsAutomatic
          ? "Automatic detail is selected from this device's browser renderer and CPU/memory hints."
          : "A manual World detail target is saved on this device."}
      </p>
      <p className="flight-panel__hint">
        Flight accepts displayed Google terrain at this target or any smaller target. The default, 2^12 = 4,096 px, is the level you selected as flyable.
      </p>
      <div className="flight-panel__section-heading">
        <span>Terrain detail follows</span>
      </div>
      <div className="flight-panel__segmented" role="group" aria-label="Terrain detail follows">
        <button
          className={snapshot.terrainDetailAnchor === "aircraft" ? "is-active" : ""}
          type="button"
          aria-pressed={snapshot.terrainDetailAnchor === "aircraft"}
          onClick={() => onTerrainDetailAnchorChange("aircraft")}
        >
          Aircraft
        </button>
        <button
          className={snapshot.terrainDetailAnchor === "camera" ? "is-active" : ""}
          type="button"
          aria-pressed={snapshot.terrainDetailAnchor === "camera"}
          onClick={() => onTerrainDetailAnchorChange("camera")}
        >
          Camera
        </button>
      </div>
      <p className="flight-panel__hint">
        Aircraft refines Google mesh by its distance from the aircraft. Camera uses the current view instead. The camera always determines which tiles are visible.
      </p>
      <label className="flight-panel__field flight-panel__field--inline">
        <input
          aria-label="Allow coarser terrain for this session"
          type="checkbox"
          checked={snapshot.allowCoarserTerrainThisSession}
          onChange={(event) => onTerrainDetailOverrideChange(event.target.checked)}
        />
        <span>Allow coarser terrain for this session</span>
      </label>
      <p className="flight-panel__hint">
        This temporary override lets you fly below your selected requirement. It resets when the game reloads.
      </p>
    </fieldset>
  );
}

function DebugPanel({ snapshot, onCollisionDebugChange, onWheelSpinModeChange, onTireSoundChange }: Pick<FlightControlPanelProps,
  "snapshot" | "onCollisionDebugChange" | "onWheelSpinModeChange" | "onTireSoundChange">) {
  return (
    <div className="flight-panel__content">
      <div className="flight-panel__metrics">
        <Metric label="Frame rate" value={`${Math.round(snapshot.fps)} fps`} />
        <Metric label="Renderer" value={snapshot.rendererMode.toUpperCase()} />
        <Metric label="Map runtime" value={snapshot.runtimeStatus.mode} />
        <Metric label="Camera" value={snapshot.viewMode} />
      </div>
      <fieldset className="flight-panel__fieldset">
        <legend>Collision geometry</legend>
        <label className="flight-panel__field flight-panel__field--inline">
          <input type="checkbox" aria-label="Show aircraft collision geometry"
            checked={snapshot.collisionDebugEnabled}
            onChange={(event) => onCollisionDebugChange(event.target.checked)} />
          <span>Show aircraft collision geometry</span>
        </label>
        <p className="flight-panel__hint">
          Visible through the aircraft in either camera view. Off by default; resets when the game reloads.
        </p>
        {snapshot.collisionDebugEnabled && <>
          <div className="flight-panel__metrics" aria-label="Collision geometry legend">
            <Metric label="Cyan" value="5 swept body probes" />
            <Metric label="Amber" value="3 wheel contacts" />
            <Metric label="Purple" value="4 structural contacts" />
            <Metric label="White" value="Centre of gravity" />
          </div>
          <p className="flight-panel__hint">
            These are contact points, not a solid collision mesh. Marker sizes and lines from the centre
            are visual guides. Body probes sweep between physics steps near the ground.
          </p>
          <p className="flight-panel__hint">
            Shows the current C172 physics geometry, including when a different visual aircraft is selected.
          </p>
        </>}
      </fieldset>
      <fieldset className="flight-panel__fieldset">
        <legend>Wheel spin experiment</legend>
        <label className="flight-panel__field">
          <span>Wheel response</span>
          <select aria-label="Wheel spin experiment" value={snapshot.wheelSpinMode}
            onChange={event => onWheelSpinModeChange(event.target.value as WheelSpinMode | "off")}>
            <option value="off">Off</option>
            <option value="instant">A · Instant rolling</option>
            <option value="inertia">B · Gradual spin-up</option>
          </select>
        </label>
        <p className="flight-panel__hint">
          Compare wheel rotation and touchdown sound. Aircraft handling and braking stay the same.
          Changing modes resets the wheels; compare from an airborne approach. These choices are a
          session-only override of Settings → Ground interaction, which can keep them.
        </p>
        <label className="flight-panel__field flight-panel__field--inline">
          <input type="checkbox" aria-label="Enable tire sound" checked={snapshot.tireSoundEnabled}
            disabled={snapshot.wheelSpinMode === "off"}
            onChange={event => onTireSoundChange(event.target.checked)} />
          <span>Enable tire sound</span>
        </label>
        {snapshot.tireAudioStatus && <p className="flight-panel__hint" role="status">{snapshot.tireAudioStatus}</p>}
        {snapshot.wheelSpinMode !== "off" && <>
          <p className="flight-panel__hint">
            Enable collision geometry above to see tire outlines and rotating spokes.
            The outlines show estimated tire size; amber dots remain the contact references.
            Spin-up sound fades as the tread matches ground speed.
          </p>
          <div className="flight-panel__metrics" aria-label="Wheel spin telemetry">
            {snapshot.wheelSpinStates.map((wheel, index) => <Metric key={index}
              label={WHEEL_SPIN_CONFIGS[index].name.replaceAll("_", " ")}
              value={`${Math.round(wheel.omegaRadSec * 60 / (2 * Math.PI))} rpm · ${wheel.slipMetersSec.toFixed(1)} m/s slip${wheel.onGround ? " · contact" : " · air"}`} />)}
          </div>
        </>}
      </fieldset>
      <div className="flight-panel__debug-status">
        <Gauge size={18} aria-hidden="true" />
        <span>{snapshot.runtimeStatus.lastError ?? snapshot.runtimeStatus.message}</span>
      </div>
      <FlightPerformancePanel />
      <fieldset className="flight-panel__fieldset">
        <legend>Event log</legend>
        <EventLog />
        <button className="flight-panel__command" type="button" onClick={() => flightLog.clear()}>
          Clear log
        </button>
      </fieldset>
    </div>
  );
}

export function FlightControlPanel(props: FlightControlPanelProps) {
  // Keep drafts above the tabs so visiting Weather/Settings does not discard them.
  // Each family remembers its own generation and model choices for this session.
  const [selectedAircraftFamily, setSelectedAircraftFamily] = useState<AircraftFamilyId>(
    () => getAircraftFamilyForAircraft(props.snapshot.aircraftId).id,
  );
  const [aircraftSelections, setAircraftSelections] = useState<AircraftSelection[]>(() => {
    const activeFamily = getAircraftFamilyForAircraft(props.snapshot.aircraftId);
    return AIRCRAFT_FAMILIES.map(family => normalizeAircraftSelection(
      family.id === activeFamily.id ? props.snapshot : {
        aircraftId: family.defaultAircraftId,
        lodId: props.snapshot.lodId,
        optInLodsEnabled: props.snapshot.optInLodsEnabled,
      },
    ));
  });
  const aircraftSelection = aircraftSelections.find(
    selection => getAircraftFamilyForAircraft(selection.aircraftId).id === selectedAircraftFamily,
  ) ?? normalizeAircraftSelection(props.snapshot);
  const onAircraftSelectionChange = (selection: AircraftSelection) => {
    const familyId = getAircraftFamilyForAircraft(selection.aircraftId).id;
    setAircraftSelections(previous => previous.map(entry =>
      getAircraftFamilyForAircraft(entry.aircraftId).id === familyId ? selection : entry,
    ));
    setSelectedAircraftFamily(familyId);
  };

  return (
    <WindowOverlay<FlightPanelTab>
      enableAirportPresets
      overlayApiRef={props.overlayApiRef}
      getViewState={() => props.snapshot.flightState}
      setViewState={props.onLocationApply}
      locationSearchProvider={props.locationSearchProvider}
      additionalTabs={TAB_DEFINITIONS}
      renderAdditionalTab={(tabId) => {
        const Icon = TAB_ICONS[tabId];
        return <>
          {tabId !== "controls" && <div className="flight-panel__title">
            <Icon size={17} aria-hidden="true" />
            <span>{getTabLabel(tabId)}</span>
          </div>}
          {tabId === "weather" ? <WeatherPanel initialWeather={props.initialWeather} onWeatherChange={props.onWeatherChange} />
            : tabId === "aircraft" ? <AircraftPanel {...props}
              aircraftSelection={aircraftSelection}
              onAircraftSelectionChange={onAircraftSelectionChange}
              onAircraftFamilyChange={setSelectedAircraftFamily} />
              : tabId === "autopilot" ? <AutopilotPanel
                state={props.snapshot.autopilot}
                onSettingsChange={props.onAutopilotSettingsChange}
                onEngageChange={props.onAutopilotEngageChange} />
              : tabId === "controls" ? <div className="flight-panel__content">
                {props.gamepadBindings
                  ? <GamepadBindingsPanel mount={props.gamepadBindings} />
                  : <p className="flight-panel__hint">Controller bindings are unavailable in this session.</p>}
                {props.gamepadBindings?.polling && props.gamepadBindings.response && <GamepadSettingsPanel
                  polling={props.gamepadBindings.polling}
                  response={props.gamepadBindings.response}
                />}
                <KeyboardStickSettingsPanel {...props} />
                <OrbitInvertSettingsPanel {...props} />
              </div>
              : tabId === "sound" ? <SoundSettingsPanel state={props.snapshot.sound} onAction={props.onSoundAction} />
              : tabId === "settings" ? <>
                <fieldset className="flight-panel__fieldset">
                  <legend>Ground impacts</legend>
                  <label className="flight-panel__field flight-panel__field--inline">
                    <input type="checkbox" aria-label="Arcade ground launches"
                      checked={props.snapshot.arcadeGroundLaunches}
                      onChange={(event) => props.onArcadeGroundLaunchesChange(event.target.checked)} />
                    <span>Arcade ground launches</span>
                  </label>
                  <p className="flight-panel__hint">Exaggerated bounces for fun. With this off, deep ground impacts stop the flight before the gear springs can launch it.</p>
                </fieldset>
                <GroundInteractionSettingsPanel state={props.snapshot.groundInteraction}
                  onAction={props.onGroundInteractionAction} />
                <WorldDetailSettings {...props} />
                <MapCachePanel />
              </> : <DebugPanel snapshot={props.snapshot} onCollisionDebugChange={props.onCollisionDebugChange}
                onWheelSpinModeChange={props.onWheelSpinModeChange} onTireSoundChange={props.onTireSoundChange} />}
        </>;
      }}
    />
  );
}
