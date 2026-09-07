import "foss-earth/windowing.css";

import { WindowOverlay } from "foss-earth/shell";
import {
  type GeodeticLocation,
  type LocationSearchProvider,
  type WindowTabDefinition,
} from "foss-earth/windowing";
import {
  Bug,
  CloudSun,
  Gauge,
  Pause,
  Play,
  Plane,
} from "lucide-react";
import { useState } from "react";
import type { BabylonRuntimeStatus, RendererMode } from "foss-earth/runtime";
import type { FlightViewMode } from "../aircraft/createPlaceholderAircraft";
import { headingDegFromRad, type FlightState } from "../physics/flightState";

type FlightPanelTab = "weather" | "aircraft" | "debug";

const TAB_DEFINITIONS: readonly WindowTabDefinition<FlightPanelTab>[] = [
  { id: "weather", label: "Weather" },
  { id: "aircraft", label: "Aircraft" },
  { id: "debug", label: "Debug" },
];

const TAB_ICONS = {
  weather: CloudSun,
  aircraft: Plane,
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
}

export interface FlightControlPanelOptions {
  initialWeather: FlightWeatherState;
  onLocationApply(location: GeodeticLocation): void;
  locationSearchProvider?: LocationSearchProvider;
  onWeatherChange(weather: FlightWeatherState): void;
  onPausedChange(paused: boolean): void;
  onViewModeChange(mode: FlightViewMode): void;
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

function AircraftPanel({ snapshot, onPausedChange, onViewModeChange }: FlightControlPanelProps) {
  return (
    <div className="flight-panel__content">
      <div className="flight-panel__metrics">
        <Metric label="Airspeed" value={`${Math.round(snapshot.flightState.airspeedKts)} kt`} />
        <Metric label="Altitude" value={`${Math.round(snapshot.flightState.altMeters / 0.3048).toLocaleString()} ft`} />
        <Metric label="Heading" value={`${Math.round(headingDegFromRad(snapshot.flightState.headingRad))}°`} />
        <Metric label="Throttle" value={`${Math.round(snapshot.flightState.throttleNorm * 100)}%`} />
      </div>
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
    </div>
  );
}

export function FlightControlPanel(props: FlightControlPanelProps) {
  return (
    <WindowOverlay<FlightPanelTab>
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
              : <DebugPanel snapshot={props.snapshot} />}
        </>;
      }}
    />
  );
}
