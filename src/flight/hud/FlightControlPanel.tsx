import "foss-earth/windowing.css";

import { MapCachePanel, WindowOverlay } from "foss-earth/shell";
import {
  type GeodeticLocation,
  type LocationSearchProvider,
  type WindowTabDefinition,
} from "foss-earth/windowing";
import {
  Bug,
  CloudSun,
  Gauge,
  Settings,
  Pause,
  Play,
  Plane,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { BabylonRuntimeStatus, GoogleTerrainDetailState, RendererMode } from "foss-earth/runtime";
import type { FlightViewMode } from "../aircraft/createPlaceholderAircraft";
import {
  AIRCRAFT_CATALOG,
  availableLods,
  getAircraftDefinition,
  type AircraftId,
  type AircraftLodDefinition,
  type AircraftLodId,
} from "../aircraft/aircraftCatalog";
import type { AircraftModelStatus } from "../aircraft/createAircraftModel";
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

type FlightPanelTab = "weather" | "aircraft" | "debug" | "settings";

const TAB_DEFINITIONS: readonly WindowTabDefinition<FlightPanelTab>[] = [
  { id: "weather", label: "Weather" },
  { id: "aircraft", label: "Aircraft" },
  { id: "debug", label: "Debug" },
  { id: "settings", label: "Settings" },
];

const TAB_ICONS = {
  weather: CloudSun,
  aircraft: Plane,
  debug: Bug,
  settings: Settings,
} satisfies Record<FlightPanelTab, typeof Plane>;

const LOD_STATUS_LABEL: Record<AircraftModelStatus, string> = {
  placeholder: "Placeholder blocks",
  loading: "Loading mesh…",
  ready: "Mesh loaded",
  error: "Load failed",
};

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
  googleTerrainDetail: GoogleTerrainDetailState | null;
  /** Whether the World detail target follows this device's first-run recommendation. */
  worldDetailIsAutomatic: boolean;
  automaticWorldDetailTarget: number;
  /** Maximum Google screen-space error accepted for ground contact. */
  flightTerrainRequirement: number;
  /** A deliberately temporary waiver of the flight terrain requirement. */
  allowCoarserTerrainThisSession: boolean;
  aircraftId: AircraftId;
  lodId: AircraftLodId;
  /** Whether the opt-in levels are switched on. */
  optInLodsEnabled: boolean;
  modelStatus: AircraftModelStatus;
  /** Level actually in the scene; differs from lodId while "Auto" is selected. */
  modelActiveLodId: AircraftLodId | null;
  modelTriangles: number | null;
  modelError: string | null;
  keyboardStick: KeyboardStickSettings;
}

export interface FlightControlPanelOptions {
  initialWeather: FlightWeatherState;
  onLocationApply(location: GeodeticLocation): void;
  locationSearchProvider?: LocationSearchProvider;
  onWeatherChange(weather: FlightWeatherState): void;
  onPausedChange(paused: boolean): void;
  onViewModeChange(mode: FlightViewMode): void;
  onAircraftChange(aircraftId: AircraftId): void;
  onLodChange(lodId: AircraftLodId): void;
  onOptInLodsChange(enabled: boolean): void;
  onGoogleTerrainDetailChange(errorTarget: number): void;
  onAutomaticGoogleTerrainDetailChange(): void;
  onFlightTerrainRequirementChange(errorTarget: number): void;
  onTerrainDetailOverrideChange(enabled: boolean): void;
  onKeyboardStickSettingsChange(settings: KeyboardStickSettings): void;
}

export interface FlightControlPanelHandle {
  update(snapshot: FlightControlPanelSnapshot): void;
  destroy(): void;
}

interface FlightControlPanelProps extends FlightControlPanelOptions {
  snapshot: FlightControlPanelSnapshot;
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

function AircraftPanel({
  snapshot,
  onPausedChange,
  onViewModeChange,
  onAircraftChange,
  onLodChange,
  onOptInLodsChange,
}: FlightControlPanelProps) {
  const definition = getAircraftDefinition(snapshot.aircraftId);
  const offered = availableLods(definition, snapshot.optInLodsEnabled);
  const hasModel = offered.length > 0;
  const activeLod = definition.lods.find((lod) => lod.id === snapshot.modelActiveLodId);
  const optInLods = definition.lods.filter((lod) => lod.optIn);
  // Credited once each, finest first, so a ladder by two artists says so.
  const credited = offered.reduce<AircraftLodDefinition[]>((keep, lod) => {
    if (!keep.some((seen) => seen.credit.artist === lod.credit.artist)) keep.push(lod);
    return keep;
  }, []);

  return (
    <div className="flight-panel__content">
      <div className="flight-panel__metrics">
        <Metric label="Airspeed" value={`${Math.round(snapshot.flightState.airspeedKts)} kt`} />
        <Metric label="Altitude" value={`${Math.round(snapshot.flightState.altMeters / 0.3048).toLocaleString()} ft`} />
        <Metric label="Heading" value={`${Math.round(headingDegFromRad(snapshot.flightState.headingRad))}°`} />
        <Metric label="Throttle" value={`${Math.round(snapshot.flightState.throttleNorm * 100)}%`} />
      </div>
      <fieldset className="flight-panel__fieldset">
        <legend>Airframe</legend>
        <div className="flight-panel__radio-list">
          {AIRCRAFT_CATALOG.map((entry) => (
            <label key={entry.id} className={entry.id === snapshot.aircraftId ? "is-active" : ""}>
              <input
                type="radio"
                name="flight-aircraft"
                value={entry.id}
                checked={entry.id === snapshot.aircraftId}
                onChange={() => onAircraftChange(entry.id)}
              />
              <span className="flight-panel__option">
                <strong>{entry.label}</strong>
                <em>{entry.summary}</em>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="flight-panel__fieldset">
        <legend>Model detail</legend>
        <label className="flight-panel__field">
          <span>Level of detail</span>
          <select
            className="flight-panel__select"
            value={snapshot.lodId}
            disabled={!hasModel}
            onChange={(event) => onLodChange(event.target.value as AircraftLodId)}
          >
            <option value="auto">Auto (by chase distance)</option>
            {offered.map((lod) => (
              <option key={lod.id} value={lod.id}>
                {`${lod.label} — ${lod.triangles.toLocaleString()} tris`}
              </option>
            ))}
          </select>
        </label>
        {optInLods.length > 0 ? (
          <label className="flight-panel__field flight-panel__field--inline">
            <input
              type="checkbox"
              checked={snapshot.optInLodsEnabled}
              onChange={(event) => onOptInLodsChange(event.target.checked)}
            />
            <span>
              {`Higher-detail models (${optInLods
                .map((lod) => `${lod.triangles.toLocaleString()} tris`)
                .join(", ")})`}
            </span>
          </label>
        ) : null}
        <div className="flight-panel__metrics">
          <Metric label="Model" value={LOD_STATUS_LABEL[snapshot.modelStatus]} />
          <Metric
            label="Triangles"
            value={snapshot.modelTriangles === null ? "—" : snapshot.modelTriangles.toLocaleString()}
          />
        </div>
        {snapshot.lodId === "auto" && activeLod ? (
          <p className="flight-panel__hint">Auto selected {activeLod.label}.</p>
        ) : null}
        {credited.map((lod) => (
          <p className="flight-panel__hint" key={lod.credit.artist}>
            <strong>{lod.credit.artist}</strong>
            {` — ${lod.credit.note}`}
            {lod.credit.licence ? ` ${lod.credit.licence}.` : null}
            {lod.credit.sourceUrl ? (
              <>
                {" "}
                <a href={lod.credit.sourceUrl} target="_blank" rel="noreferrer noopener">
                  Source
                </a>
              </>
            ) : null}
          </p>
        ))}
        {!hasModel ? (
          <p className="flight-panel__hint">
            No mesh exists for this airframe yet, so the block placeholder is drawn instead.
          </p>
        ) : null}
        {snapshot.modelError ? <p className="flight-panel__hint is-error">{snapshot.modelError}</p> : null}
      </fieldset>
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
      <legend>Keyboard stick (WASD / QE)</legend>
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
      <p className="flight-panel__hint">Softens small keyboard deflections while keeping full range. HUD stick, gamepad, and phone are unchanged.</p>
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
}: Pick<FlightControlPanelProps,
  "snapshot" | "onGoogleTerrainDetailChange" | "onAutomaticGoogleTerrainDetailChange"
  | "onFlightTerrainRequirementChange" | "onTerrainDetailOverrideChange">) {
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
        Move the amber handle to limit renderer detail and the blue handle to set the coarsest detail that can fly without an override.
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

function DebugPanel({ snapshot }: Pick<FlightControlPanelProps, "snapshot">) {
  return (
    <div className="flight-panel__content">
      <div className="flight-panel__metrics">
        <Metric label="Frame rate" value={`${Math.round(snapshot.fps)} fps`} />
        <Metric label="Renderer" value={snapshot.rendererMode.toUpperCase()} />
        <Metric label="Map runtime" value={snapshot.runtimeStatus.mode} />
        <Metric label="Camera" value={snapshot.viewMode} />
      </div>
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
  return (
    <WindowOverlay<FlightPanelTab>
      enableAirportPresets
      getViewState={() => props.snapshot.flightState}
      setViewState={props.onLocationApply}
      locationSearchProvider={props.locationSearchProvider}
      additionalTabs={TAB_DEFINITIONS}
      renderAdditionalTab={(tabId) => {
        const Icon = TAB_ICONS[tabId];
        return <>
          <div className="flight-panel__title">
            <Icon size={17} aria-hidden="true" />
            <span>{getTabLabel(tabId)}</span>
          </div>
          {tabId === "weather" ? <WeatherPanel initialWeather={props.initialWeather} onWeatherChange={props.onWeatherChange} />
            : tabId === "aircraft" ? <AircraftPanel {...props} />
              : tabId === "settings" ? <>
                <KeyboardStickSettingsPanel {...props} />
                <WorldDetailSettings {...props} />
                <MapCachePanel />
              </> : <DebugPanel snapshot={props.snapshot} />}
        </>;
      }}
    />
  );
}
