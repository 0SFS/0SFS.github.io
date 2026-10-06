import type { FlightAudioStatus } from "../audio/createFlightAudio";
import { AVAILABILITY_LABELS, type TierId } from "../audio/audioQuality";
import {
  AUDIO_QUALITY_IDS, AUDIO_QUALITY_LABELS, type AudioQualityId, type AudioSettingsV1,
} from "../audio/audioSettings";

export type SoundAction =
  | { type: "enable"; enabled: boolean }
  | { type: "quality"; quality: AudioQualityId }
  | { type: "settings"; patch: Partial<Pick<AudioSettingsV1,
    "masterVolume" | "engineVolume" | "afterburnerVolume" | "listenerCockpitBlend"
    | "airframeVolume" | "engineMuted" | "reducedDynamicRange">> }
  | { type: "retest" };

const percent = (value: number): string => Number.isFinite(value) ? `${value.toFixed(0)}%` : "n/a";

/** Shows native engine state, so "the engine went quiet" can be told apart from a sound fault. */
function engineLine(engine: NonNullable<FlightAudioStatus["engine"]>): string {
  const turning = (Number.isFinite(engine.n1Pct) && engine.n1Pct > 1) || (Number.isFinite(engine.n2Pct) && engine.n2Pct > 1);
  const state = engine.combustion
    ? "burning"
    : turning ? "not burning, shafts windmilling with airspeed" : "stopped";
  const fuel = Number.isFinite(engine.fuelFlowPps) ? `${Math.round(engine.fuelFlowPps * 3600)} lb/h` : "n/a";
  return `Engine telemetry: ${state} · N1 ${percent(engine.n1Pct)} · N2 ${percent(engine.n2Pct)} · fuel ${fuel}`;
}

const TIERS: readonly AudioQualityId[] = ["low", "med", "high"];

const COMBUSTION_SOURCE_LABELS: Record<string, string> = {
  "fuel-flow": "fuel flow",
  "running-only": "the engine running flag only",
  unavailable: "nothing (no combustion signal)",
};

/**
 * sound.md §6 labels, exactly: "Unsupported on this device" only for a concrete
 * missing capability, "Not yet validated" for absent device evidence, "Audio
 * pack unavailable" for missing licensed assets. An unvalidated tier stays
 * selectable and runs as soon as it is chosen; only Auto waits for evidence.
 */
function qualityOption(state: FlightAudioStatus, id: AudioQualityId) {
  if (!TIERS.includes(id)) return { label: AUDIO_QUALITY_LABELS[id], disabled: false, reason: null };
  const availability = state.availability[id as TierId];
  if (availability.state === "available") return { label: AUDIO_QUALITY_LABELS[id], disabled: false, reason: null };
  return {
    label: `${AUDIO_QUALITY_LABELS[id]} — ${AVAILABILITY_LABELS[availability.state]}`,
    disabled: availability.state !== "unvalidated",
    reason: availability.reason,
  };
}

const tierLabel = (tier: TierId): string => tier === "off" ? "Off" : AUDIO_QUALITY_LABELS[tier];
const positionLabel = (cockpit: number): string => cockpit === 0 ? "Camera" : cockpit === 1 ? "Cockpit"
  : `${Math.round(cockpit * 100)}% Cockpit / ${Math.round((1 - cockpit) * 100)}% Camera`;

export function SoundSettingsPanel({ state, onAction }: {
  state: FlightAudioStatus;
  onAction(action: SoundAction): void;
}) {
  const { settings } = state;
  const audible = state.mode === "sound" && state.effective !== "off" && !state.gestureLocked;
  const requestedReason = qualityOption(state, settings.requested).reason;
  return (
    <fieldset className="flight-panel__fieldset">
      <legend>Sound</legend>
      {!audible && <button className="flight-panel__command" type="button"
        onClick={() => onAction({ type: "enable", enabled: true })}>Enable sound</button>}
      {settings.enabled && <button className="flight-panel__command" type="button"
        onClick={() => onAction({ type: "enable", enabled: false })}>Turn sound off</button>}
      <label className="flight-panel__field">
        <span>Quality</span>
        <select aria-label="Sound quality" value={settings.requested}
          onChange={event => onAction({ type: "quality", quality: event.target.value as AudioQualityId })}>
          {AUDIO_QUALITY_IDS.map(id => {
            const option = qualityOption(state, id);
            return <option key={id} value={id} disabled={option.disabled}>{option.label}</option>;
          })}
        </select>
      </label>
      <p className="flight-panel__hint" role="status">
        Requested {AUDIO_QUALITY_LABELS[settings.requested]} · Effective {tierLabel(state.effective)}
        {state.mode === "tire-only" ? " (tire cue only)" : ""}
        {state.held ? " · held while paused or hidden" : ""}
      </p>
      {requestedReason && <p className="flight-panel__hint">{requestedReason}</p>}
      {settings.requested === "high" && <p className="flight-panel__hint">
        High synthesises engine spectra and directionality. Acoustic calibration is pending.
      </p>}
      {state.message && <p className="flight-panel__hint" role="alert">{state.message}</p>}
      {settings.downgradedFrom && <>
        <p className="flight-panel__hint">
          Quality was lowered from {AUDIO_QUALITY_LABELS[settings.downgradedFrom]} after an overload and
          stays lowered until you re-test.
        </p>
        <button className="flight-panel__command" type="button" onClick={() => onAction({ type: "retest" })}>
          Re-test {AUDIO_QUALITY_LABELS[settings.downgradedFrom]}
        </button>
      </>}
      <label className="flight-panel__field">
        <span>Master volume · {percent(settings.masterVolume * 100)}</span>
        <input type="range" aria-label="Master volume" min={0} max={8} step={0.05} value={settings.masterVolume}
          onChange={event => onAction({ type: "settings", patch: { masterVolume: Number(event.target.value) } })} />
      </label>
      <label className="flight-panel__field">
        <span>Engine volume · {percent(settings.engineVolume * 100)}</span>
        <input type="range" aria-label="Engine volume" min={0} max={8} step={0.05} value={settings.engineVolume}
          onChange={event => onAction({ type: "settings", patch: { engineVolume: Number(event.target.value) } })} />
      </label>
      <label className="flight-panel__field">
        <span>Afterburner volume · {percent(settings.afterburnerVolume * 100)}</span>
        <input type="range" aria-label="Afterburner volume" min={0} max={1} step={0.05} value={settings.afterburnerVolume}
          onChange={event => onAction({ type: "settings", patch: { afterburnerVolume: Number(event.target.value) } })} />
      </label>
      <p className="flight-panel__hint">
        Scales the extra afterburner roar; 100% keeps its original level. Engine volume also scales it.
      </p>
      <label className="flight-panel__field">
        <span>Sound position · {positionLabel(settings.listenerCockpitBlend)}</span>
        <input type="range" aria-label="Sound position" aria-valuetext={positionLabel(settings.listenerCockpitBlend)}
          min={0} max={1} step={0.01} value={settings.listenerCockpitBlend}
          onChange={event => onAction({ type: "settings", patch: { listenerCockpitBlend: Number(event.target.value) } })} />
        <span>Camera ↔ Cockpit</span>
      </label>
      <p className="flight-panel__hint">
        Listen from Camera, Cockpit, or a position between them.
      </p>
      <label className="flight-panel__field">
        <span>Airframe wind volume</span>
        <input type="range" aria-label="Airframe wind volume" min={0} max={1} step={0.05} value={settings.airframeVolume}
          onChange={event => onAction({ type: "settings", patch: { airframeVolume: Number(event.target.value) } })} />
      </label>
      <p className="flight-panel__hint">
        Wind and gear/flap turbulence grow with airspeed. Independent of engine volume and engine mute.
      </p>
      <label className="flight-panel__field flight-panel__field--inline">
        <input type="checkbox" aria-label="Mute engine" checked={settings.engineMuted}
          onChange={event => onAction({ type: "settings", patch: { engineMuted: event.target.checked } })} />
        <span>Mute engine</span>
      </label>
      <label className="flight-panel__field flight-panel__field--inline">
        <input type="checkbox" aria-label="Reduced dynamic range" checked={settings.reducedDynamicRange}
          onChange={event => onAction({ type: "settings", patch: { reducedDynamicRange: event.target.checked } })} />
        <span>Reduced dynamic range</span>
      </label>
      <p className="flight-panel__hint">
        {state.telemetry?.profileLabel && <>{state.telemetry.profileLabel}. </>}
        {state.telemetry
          ? `Engine sound follows the flight model. Combustion is read from ${
            COMBUSTION_SOURCE_LABELS[state.telemetry.combustionSource] ?? state.telemetry.combustionSource}.`
          : "This aircraft has no engine sound model; only the tire cue plays."}
        {" "}Tire sound and its volume are under Aircraft → Ground handling. For live engine data, click
        ENGINE on the flight display. Muting sound never hides engine gauges or warnings.
      </p>
      {state.telemetry?.approximation && <p className="flight-panel__hint">{state.telemetry.approximation}</p>}
      {state.telemetry && state.telemetry.missing.length > 0 && <p className="flight-panel__hint">
        Not published by this model, so left silent rather than guessed: {state.telemetry.missing.join(", ")}.
      </p>}
      {state.engine && <p className="flight-panel__hint" aria-label="Engine telemetry">{engineLine(state.engine)}</p>}
      {state.core && <p className="flight-panel__hint" aria-label="Sound timeline">
        Timeline: epoch {state.core.epoch} · resyncs {state.core.resyncs} · stale fades {state.core.staleFades}
        {" "}· dropped snapshots {state.core.snapshotsDropped}{state.held ? " · held" : ""}
      </p>}
      {state.readOnlyReason && <p className="flight-panel__hint">{state.readOnlyReason}</p>}
      <p className="flight-panel__hint" aria-label="Sound diagnostics">{state.stats}</p>
    </fieldset>
  );
}
