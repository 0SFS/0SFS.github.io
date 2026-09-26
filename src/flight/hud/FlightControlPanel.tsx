import "foss-earth/windowing.css";

import { createParameterSection, createSavedSettingsSection, WindowOverlay, type WindowOverlayHandle } from "foss-earth/shell";
import type { SettingsRegistry } from "foss-earth/settings";
import {
  type GeodeticLocation,
  type LocationSearchProvider,
  type WindowTabDefinition,
} from "foss-earth/windowing";
import {
  Bug,
  CloudSun,
  Fan,
  Gauge,
  Navigation,
  ScrollText,
  Smartphone,
  Pause,
  Play,
  Plane,
  Volume2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { BabylonRuntimeStatus, RendererMode } from "foss-earth/runtime";
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
import { AIRCRAFT_SELECTION_PARAMETER_IDS } from "../aircraft/aircraftSelectionSetting";
import { GamepadBindingsPanel, type GamepadBindingsMount } from "./GamepadBindingsPanel";
import { flightLog, type FlightLogEntry } from "../diagnostics/flightLog";
import {
  getActiveFlightPerformanceCapture,
  type FlightPerformanceSummary,
} from "../diagnostics/flightPerformanceCapture";
import { headingDegFromRad, type FlightState } from "../physics/flightState";
import {
  KEYBOARD_STICK_PARAMETER_IDS,
  keyboardStickParameterValues,
  readKeyboardStickSettings,
  type KeyboardStickSettings,
} from "../input/keyboardStickSettings";
import { flightParameterSpec, type FlightParameterStore } from "../settings/flightParameters";
import { WHEEL_SPIN_CONFIGS, type WheelSpinMode, type WheelSpinState } from "../physics/wheelSpin";
import {
  GroundInteractionSettingsPanel,
  type GroundInteractionAction,
  type GroundInteractionPanelState,
} from "./GroundInteractionSettingsPanel";
import { AutopilotPanel, type AutopilotPanelState } from "./AutopilotPanel";
import { SoundSettingsPanel, type SoundAction } from "./SoundSettingsPanel";
import { AUDIO_PARAMETER_IDS } from "../audio/audioSettings";
import { FrameBudgetPanel } from "./FrameBudgetPanel";
import { RemoteControlTab, type MountPhonePairing } from "./RemoteControlTab";
import { PhoneCameraTuningPanel } from "./PhoneCameraTuningPanel";
import { LoggingPanel, type LoggingAction, type LoggingPanelState } from "./LoggingPanel";
import { allowCloseLoggingTab } from "./loggingTab";
import type { FlightAudioStatus } from "../audio/createFlightAudio";
import { AUTOPILOT_PARAMETER_IDS, type AutopilotSettingsV1 } from "../autopilot/autopilotSettings";
import { GROUND_PARAMETER_IDS } from "../settings/groundInteractionSettings";
import type { FlightRecorder } from "../diagnostics/flightRecorder";

export type FlightPanelTab = "weather" | "aircraft" | "autopilot" | "controls" | "remote" | "sound" | "engine" | "logging" | "debug";

const TAB_DEFINITIONS: readonly WindowTabDefinition<FlightPanelTab>[] = [
  { id: "weather", label: "Weather" },
  { id: "aircraft", label: "Aircraft" },
  { id: "autopilot", label: "Autopilot" },
  { id: "controls", label: "Controls" },
  { id: "remote", label: "Remote Control" },
  { id: "sound", label: "Sound" },
  { id: "engine", label: "Engine" },
  { id: "logging", label: "Logging" },
  { id: "debug", label: "Debug" },
];

const TAB_ICONS = {
  weather: CloudSun,
  aircraft: Plane,
  autopilot: Navigation,
  controls: Gauge,
  remote: Smartphone,
  sound: Volume2,
  engine: Fan,
  logging: ScrollText,
  debug: Bug,
} satisfies Record<FlightPanelTab, typeof Plane>;

export interface FlightWeatherState {
  windDirectionDeg: number;
  windSpeedKts: number;
}

export interface FlightControlPanelSnapshot {
  flightState: FlightState;
  fps: number;
  paused: boolean;
  viewMode: FlightViewMode;
  runtimeStatus: BabylonRuntimeStatus;
  rendererMode: RendererMode;
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
  collisionDebugEnabled: boolean;
  wheelSpinMode: WheelSpinMode | "off";
  tireSoundEnabled: boolean;
  tireAudioStatus: string | null;
  /** The shared sound runtime: engine sound and the tire cue. */
  sound: FlightAudioStatus;
  wheelSpinStates: readonly WheelSpinState[];
  groundInteraction: GroundInteractionPanelState;
  autopilot: AutopilotPanelState;
  logging: LoggingPanelState;
}

/** Every tab the panel can show: the flight's own, and the shared globe tabs. */
export type FlightOverlayTab = "location" | "map" | "renderer" | FlightPanelTab;

export interface FlightControlPanelOptions {
  /** The app's settings registry, whose sections the tabs draw. */
  settings: SettingsRegistry;
  /** The flight's own parameters in it. */
  parameters: FlightParameterStore;
  /** The shared Map tab's contents, from `createMapSourcePanel`. */
  mapTab: HTMLElement;
  /** The shared Renderer tab's contents, from `createRendererPanel`. */
  rendererTab: HTMLElement;
  initialWeather: FlightWeatherState;
  gamepadBindings?: GamepadBindingsMount;
  onLocationApply(location: GeodeticLocation): void;
  locationSearchProvider?: LocationSearchProvider;
  onWeatherChange(weather: FlightWeatherState): void;
  onPausedChange(paused: boolean): void;
  onViewModeChange(mode: FlightViewMode): void;
  /** Commit a staged aircraft and presentation choice; return a visible error if it fails. */
  onAircraftApply(selection: AircraftSelection): string | null;
  onCollisionDebugChange(enabled: boolean): void;
  onWheelSpinModeChange(mode: WheelSpinMode | "off"): void;
  onTireSoundChange(enabled: boolean): void;
  /** Must act synchronously: the control's gesture is what unlocks audio. */
  onSoundAction(action: SoundAction): void;
  onGroundInteractionAction(action: GroundInteractionAction): void;
  onAutopilotSettingsChange(settings: AutopilotSettingsV1): void;
  onAutopilotEngageChange(engaged: boolean): void;
  /** Hosts the live engine-detail readings inside the Engine tab. */
  attachEngineDetails(host: HTMLElement): () => void;
  /** Hosts the Input method section, shared with FOSS Earth, in the Controls tab. */
  attachInputMethod(host: HTMLElement): () => void;
  onLoggingAction(action: LoggingAction): void;
  flightRecorder: FlightRecorder;
  /** Pairing for the Remote Control tab, loaded the first time the tab opens. */
  loadPhonePairing(): Promise<MountPhonePairing>;
  /** Leaves the simulator for the phone controller page on this device. */
  onUseAsRemote(): void;
}

export interface FlightControlPanelHandle {
  update(snapshot: FlightControlPanelSnapshot): void;
  openOrSelectTab(tabId: FlightOverlayTab): void;
  /** For a HUD button: shows the tab, or closes it when it is already showing. */
  toggleTab(tabId: FlightOverlayTab): void;
  destroy(): void;
}

interface FlightControlPanelProps extends FlightControlPanelOptions {
  snapshot: FlightControlPanelSnapshot;
  overlayApiRef: { current: WindowOverlayHandle<FlightPanelTab> | null };
}

function getTabLabel(tabId: FlightPanelTab): string {
  return TAB_DEFINITIONS.find((definition) => definition.id === tabId)?.label ?? tabId;
}

/**
 * Touch on a touchscreen, then the mouse or trackpad choice where there is a
 * pointer. The toolbar's input-method button opens this tab; it has no popup.
 */
export function InputMethodSettings({ attach }: { attach: (host: HTMLElement) => () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    return attach(host);
  }, [attach]);
  return (
    <fieldset className="flight-panel__fieldset">
      <legend>Input method</legend>
      <div ref={ref} />
    </fieldset>
  );
}

function EngineDetailsHost({ attach }: { attach: (host: HTMLElement) => () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    return attach(host);
  }, [attach]);
  return <div className="flight-engine-host" ref={ref} />;
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

/**
 * One section of a tab, drawn by FOSS Earth from the settings registry: the
 * section's own controls (`children`, when it has any), a control for each
 * main-level parameter they do not cover, and Show all parameters.
 */
function ParameterSection({ settings, tab, section, covers, children }: {
  settings: SettingsRegistry;
  tab: string;
  section: string;
  /** Parameters `children` already edit, which the section should not draw again. */
  covers?: readonly string[];
  children?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [main] = useState(() => document.createElement("div"));
  const hasMain = children !== undefined;
  // Ids joined, so a new array with the same ids does not rebuild the section.
  const coverKey = covers?.join(" ") ?? "";
  useLayoutEffect(() => {
    const handle = createParameterSection(settings, {
      tab,
      section,
      main: hasMain ? main : undefined,
      covers: coverKey === "" ? undefined : coverKey.split(" "),
    });
    host.current?.append(handle.element);
    return () => handle.destroy();
  }, [settings, tab, section, main, coverKey, hasMain]);
  return <>
    <div className="flight-panel__parameter-section" ref={host} />
    {children !== undefined && createPortal(children, main)}
  </>;
}

/**
 * Debug → Saved settings: every value this device keeps, at once. Export,
 * import and reset of the whole record, and "Keep these values" for values a
 * link set for this visit.
 */
function SavedSettings({ settings }: { settings: SettingsRegistry }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const handle = createSavedSettingsSection(settings);
    host.current?.append(handle.element);
    return () => handle.destroy();
  }, [settings]);
  return (
    <fieldset className="flight-panel__fieldset">
      <legend>Saved settings</legend>
      <div ref={host} />
    </fieldset>
  );
}

interface AircraftPanelProps extends FlightControlPanelProps {
  aircraftSelection: AircraftSelection;
  onAircraftSelectionChange(selection: AircraftSelection): void;
  onAircraftFamilyChange(familyId: AircraftFamilyId): void;
}

function AircraftPanel({
  settings,
  snapshot,
  onPausedChange,
  onViewModeChange,
  onAircraftApply,
  onGroundInteractionAction,
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
      <ParameterSection settings={settings} tab="aircraft" section="model" covers={AIRCRAFT_SELECTION_PARAMETER_IDS}>
        <AircraftSelectionPanel
          snapshot={snapshot}
          selection={aircraftSelection}
          onSelectionChange={onAircraftSelectionChange}
          onFamilyChange={onAircraftFamilyChange}
          onApply={onAircraftApply}
        />
      </ParameterSection>
      <ParameterSection settings={settings} tab="aircraft" section="camera">
        <div className="flight-panel__segmented" role="group" aria-label="Camera view">
          {(["first", "third"] as const).map((mode) => (
            <button
              key={mode}
              className={snapshot.viewMode === mode ? "is-active" : ""}
              type="button"
              aria-pressed={snapshot.viewMode === mode}
              onClick={() => onViewModeChange(mode)}
            >
              {mode === "first" ? "Cockpit" : "Chase"}
            </button>
          ))}
        </div>
      </ParameterSection>
      <button className="flight-panel__command" type="button" onClick={() => onPausedChange(!snapshot.paused)}>
        {snapshot.paused ? <Play size={16} /> : <Pause size={16} />}
        {snapshot.paused ? "Resume simulation" : "Pause simulation"}
      </button>
      <div className="flight-panel__keymap" aria-label="Flight controls">
        <span><kbd>W/S</kbd> Pitch</span><span><kbd>A/D</kbd> Roll</span>
        <span><kbd>Q/E</kbd> Rudder</span><span><kbd>⇧/⌃</kbd> Throttle</span>
      </div>
      <ParameterSection settings={settings} tab="aircraft" section="assists" />
      <ParameterSection settings={settings} tab="aircraft" section="ground" covers={GROUND_PARAMETER_IDS}>
        <GroundInteractionSettingsPanel state={snapshot.groundInteraction} onAction={onGroundInteractionAction} />
      </ParameterSection>
      <ParameterSection settings={settings} tab="aircraft" section="start" />
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

const KEYBOARD_STICK_MODES = flightParameterSpec("osfs.input.keyboard.mode").choices;

/** The keyboard stick as its parameters stand, following every change. */
function useKeyboardStickSettings(parameters: FlightParameterStore): KeyboardStickSettings {
  const [settings, setSettings] = useState(() => readKeyboardStickSettings(parameters));
  useEffect(() => {
    const update = () => setSettings(readKeyboardStickSettings(parameters));
    const stops = KEYBOARD_STICK_PARAMETER_IDS.map(id => parameters.watch(id, update));
    update();
    return () => { for (const stop of stops) stop(); };
  }, [parameters]);
  return settings;
}

/**
 * Controls → Keyboard response: the mode, and only the parameters that mode
 * uses. Show all parameters below lists every one of them.
 */
function KeyboardStickSettingsPanel({ parameters }: { parameters: FlightParameterStore }) {
  const settings = useKeyboardStickSettings(parameters);
  const modeMeta = KEYBOARD_STICK_MODES.find((mode) => mode.id === settings.mode);
  const patch = (partial: Partial<KeyboardStickSettings>): void => {
    parameters.setMany(keyboardStickParameterValues(partial));
  };

  return (
    <div className="flight-panel__fieldset">
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
        onClick={() => { for (const id of KEYBOARD_STICK_PARAMETER_IDS) parameters.reset(id); }}
      >
        Reset keyboard stick defaults
      </button>
    </div>
  );
}

function DebugPanel({ settings, snapshot, onCollisionDebugChange, onWheelSpinModeChange, onTireSoundChange }: Pick<FlightControlPanelProps,
  "settings" | "snapshot" | "onCollisionDebugChange" | "onWheelSpinModeChange" | "onTireSoundChange">) {
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
          session-only override of Aircraft → Ground handling, which can keep them.
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
      <FrameBudgetPanel />
      <FlightPerformancePanel />
      <fieldset className="flight-panel__fieldset">
        <legend>Event log</legend>
        <EventLog />
        <button className="flight-panel__command" type="button" onClick={() => flightLog.clear()}>
          Clear log
        </button>
      </fieldset>
      <SavedSettings settings={settings} />
    </div>
  );
}

export function FlightControlPanel(props: FlightControlPanelProps) {
  // Keep drafts above the tabs so visiting another tab does not discard them.
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
      mapTab={props.mapTab}
      rendererTab={props.rendererTab}
      getViewState={() => props.snapshot.flightState}
      setViewState={props.onLocationApply}
      locationSearchProvider={props.locationSearchProvider}
      additionalTabs={TAB_DEFINITIONS}
      onBeforeCloseTab={(tabId) => {
        if (tabId !== "logging") return;
        if (!allowCloseLoggingTab(props.flightRecorder)) return false;
      }}
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
              : tabId === "autopilot" ? <ParameterSection settings={props.settings} tab="autopilot" section="package"
                covers={AUTOPILOT_PARAMETER_IDS}>
                <AutopilotPanel
                  state={props.snapshot.autopilot}
                  onSettingsChange={props.onAutopilotSettingsChange}
                  onEngageChange={props.onAutopilotEngageChange} />
              </ParameterSection>
              : tabId === "controls" ? <div className="flight-panel__content">
                <InputMethodSettings attach={props.attachInputMethod} />
                {props.gamepadBindings
                  ? <GamepadBindingsPanel mount={props.gamepadBindings} />
                  : <p className="flight-panel__hint">Controller bindings are unavailable in this session.</p>}
                <ParameterSection settings={props.settings} tab="controls" section="gamepad">
                  <p className="flight-panel__hint">
                    Polling and response apply across binding profiles, and are saved on this device.
                    They do not change keyboard, on-screen stick, or phone response.
                  </p>
                </ParameterSection>
                <ParameterSection settings={props.settings} tab="controls" section="keyboard" covers={KEYBOARD_STICK_PARAMETER_IDS}>
                  <KeyboardStickSettingsPanel parameters={props.parameters} />
                </ParameterSection>
                <ParameterSection settings={props.settings} tab="controls" section="orbit" />
                <ParameterSection settings={props.settings} tab="controls" section="feedback" />
              </div>
              : tabId === "remote" ? <RemoteControlTab loadPhonePairing={props.loadPhonePairing} onUseAsRemote={props.onUseAsRemote}
                cameraTuning={<ParameterSection settings={props.settings} tab="remote" section="camera">
                  <PhoneCameraTuningPanel parameters={props.parameters} />
                </ParameterSection>} />
              : tabId === "sound" ? <ParameterSection settings={props.settings} tab="sound" section="sound" covers={AUDIO_PARAMETER_IDS}>
                <SoundSettingsPanel state={props.snapshot.sound} onAction={props.onSoundAction} />
              </ParameterSection>
              : tabId === "engine" ? <>
                <EngineDetailsHost attach={props.attachEngineDetails} />
                <ParameterSection settings={props.settings} tab="engine" section="engine" />
              </>
              : tabId === "logging" ? <LoggingPanel state={props.snapshot.logging} onAction={props.onLoggingAction} />
              : <DebugPanel settings={props.settings} snapshot={props.snapshot} onCollisionDebugChange={props.onCollisionDebugChange}
                onWheelSpinModeChange={props.onWheelSpinModeChange} onTireSoundChange={props.onTireSoundChange} />}
        </>;
      }}
    />
  );
}
