import { useState } from "react";
import {
  GROUND_CHOICE_LABELS, GROUND_CHOICES, GROUND_PRESETS, groundChoiceUnavailable,
  type GroundCapabilities, type GroundInteractionSettingsV1, type GroundLockableKey, type GroundPresetId,
  type GroundResolution,
} from "../settings/groundInteractionSettings";

export interface GroundInteractionPanelState {
  settings: GroundInteractionSettingsV1;
  resolution: GroundResolution;
  capabilities: GroundCapabilities;
  profiles: readonly string[];
  readOnlyReason: string | null;
  /** Result of the latest profile/import action. */
  message: { text: string; error: boolean } | null;
  exportText: string | null;
  /** Session-only Debug A/B override, described for the pilot. */
  experimentOverride: string | null;
  hapticDevices: { gamepad: string; phone: string };
}

export type GroundInteractionAction =
  | { type: "preset"; preset: GroundPresetId }
  | { type: "set"; patch: Partial<Omit<GroundInteractionSettingsV1, "version" | "profile" | "locked">> }
  | { type: "lock"; key: GroundLockableKey; locked: boolean }
  | { type: "save-profile"; name: string }
  | { type: "load-profile"; name: string }
  | { type: "delete-profile"; name: string }
  | { type: "export" }
  | { type: "import"; text: string }
  | { type: "keep-experiment" }
  | { type: "discard-experiment" };

const ROW_LABELS: Record<GroundLockableKey, string> = {
  rotation: "Wheel response", forceModel: "Ground forces", contactModel: "Ground contact",
  tireAudio: "Tire audio", haptics: "Haptics", wheelVisuals: "Wheel visuals", backend: "Compute backend",
};

const PRESET_LABELS: Record<GroundPresetId, string> = {
  "minimal": "Minimal", "landing-feedback": "Landing feedback",
  "ground-handling": "Ground handling", "rough-terrain": "Rough terrain",
};

/** Structural unavailability only; dependencies such as audio → inertia stay selectable. */
function unimplemented<K extends GroundLockableKey>(key: K, value: GroundInteractionSettingsV1[K], capabilities: GroundCapabilities) {
  return groundChoiceUnavailable(key, value, { rotation: "inertia" }, capabilities);
}

function presetUnavailable(preset: GroundPresetId, capabilities: GroundCapabilities): string | null {
  const fields = GROUND_PRESETS[preset];
  for (const key of ["forceModel", "contactModel", "tireAudio", "haptics"] as const) {
    const reason = unimplemented(key, fields[key] as never, capabilities);
    if (reason) return reason;
  }
  return null;
}

function ChoiceRow<K extends GroundLockableKey>({ field, state, onAction }: {
  field: K; state: GroundInteractionPanelState; onAction(action: GroundInteractionAction): void;
}) {
  const entry = state.resolution.entries[field];
  const labels = GROUND_CHOICE_LABELS[field] as Record<string, string>;
  return <div className="flight-panel__ground-row">
    <label className="flight-panel__field">
      <span>{ROW_LABELS[field]}</span>
      <select aria-label={ROW_LABELS[field]} value={state.settings[field]}
        onChange={event => onAction({ type: "set", patch: { [field]: event.target.value } })}>
        {(GROUND_CHOICES[field] as readonly string[]).map(value => {
          const reason = unimplemented(field, value as never, state.capabilities);
          return <option key={value} value={value} disabled={reason !== null}>
            {labels[value]}{reason ? ` — ${reason}` : ""}
          </option>;
        })}
      </select>
    </label>
    <label className="flight-panel__field flight-panel__field--inline flight-panel__ground-lock"
      title="Auto cannot change a locked choice">
      <input type="checkbox" aria-label={`Lock ${ROW_LABELS[field]}`} checked={state.settings.locked[field] === true}
        onChange={event => onAction({ type: "lock", key: field, locked: event.target.checked })} />
      <span>Lock</span>
    </label>
    {(entry.reason || entry.requested !== entry.active) && <p className={`flight-panel__hint${entry.pending ? "" : " is-error"}`}
      role="status" aria-label={`${ROW_LABELS[field]} status`}>
      Requested: {labels[entry.requested]} · Active: {labels[entry.active]}{entry.reason ? ` · ${entry.reason}` : ""}
    </p>}
  </div>;
}

export function GroundInteractionSettingsPanel({ state, onAction }: {
  state: GroundInteractionPanelState; onAction(action: GroundInteractionAction): void;
}) {
  const [profileName, setProfileName] = useState("");
  const [savedProfile, setSavedProfile] = useState("");
  const [importText, setImportText] = useState("");
  const settings = state.settings;
  const selectedSaved = state.profiles.includes(savedProfile) ? savedProfile : state.profiles[0] ?? "";
  return (
    <fieldset className="flight-panel__fieldset" aria-label="Ground interaction">
      <legend>Ground interaction</legend>
      <label className="flight-panel__field">
        <span>Profile</span>
        <select aria-label="Ground interaction profile" value={settings.profile}
          onChange={event => onAction({ type: "preset", preset: event.target.value as GroundPresetId })}>
          {(Object.keys(PRESET_LABELS) as GroundPresetId[]).map(preset => {
            const reason = presetUnavailable(preset, state.capabilities);
            return <option key={preset} value={preset} disabled={reason !== null}>
              {PRESET_LABELS[preset]}{reason ? ` — ${reason}` : ""}
            </option>;
          })}
          <option value="custom" disabled>Custom</option>
        </select>
      </label>
      <div className="flight-panel__segmented" role="group" aria-label="Ground interaction selection">
        {(["auto", "manual"] as const).map(selection => <button key={selection} type="button"
          className={settings.selection === selection ? "is-active" : ""} aria-pressed={settings.selection === selection}
          onClick={() => onAction({ type: "set", patch: { selection } })}>
          {selection === "auto" ? "Auto within my choices" : "Manual"}
        </button>)}
      </div>
      <p className="flight-panel__hint">
        Auto only substitutes a cheaper implemented choice when a request cannot run; it never changes forces,
        contact or the wheel model during a landing. Wheel response and force/contact changes apply when paused or reset.
      </p>
      <ChoiceRow field="rotation" state={state} onAction={onAction} />
      <ChoiceRow field="forceModel" state={state} onAction={onAction} />
      <ChoiceRow field="contactModel" state={state} onAction={onAction} />
      <ChoiceRow field="tireAudio" state={state} onAction={onAction} />
      <label className="flight-panel__field">
        <span>Tire audio volume<output>{Math.round(settings.tireAudioVolume * 100)}%</output></span>
        <input type="range" aria-label="Tire audio volume" min={0} max={1} step={0.05} value={settings.tireAudioVolume}
          onChange={event => onAction({ type: "set", patch: { tireAudioVolume: Number(event.target.value) } })} />
      </label>
      <ChoiceRow field="haptics" state={state} onAction={onAction} />
      <label className="flight-panel__field">
        <span>Haptic strength<output>{Math.round(settings.hapticStrength * 100)}%</output></span>
        <input type="range" aria-label="Haptic strength" min={0} max={1} step={0.05} value={settings.hapticStrength}
          onChange={event => onAction({ type: "set", patch: { hapticStrength: Number(event.target.value) } })} />
      </label>
      <p className="flight-panel__hint" aria-label="Haptic devices">
        Gamepad: {state.hapticDevices.gamepad} · Phone: {state.hapticDevices.phone}
      </p>
      <ChoiceRow field="wheelVisuals" state={state} onAction={onAction} />
      <ChoiceRow field="backend" state={state} onAction={onAction} />
      <p className="flight-panel__hint">
        Performance: not profiled on this device, so no live cost is shown. Recorded terminal benchmarks
        cover one Apple M5 machine and are not a hardware policy.
      </p>
      {state.experimentOverride && <div role="status" aria-label="Wheel experiment override">
        <p className="flight-panel__hint">Debug experiment active for this session: {state.experimentOverride}.</p>
        <button className="flight-panel__command" type="button" onClick={() => onAction({ type: "keep-experiment" })}>
          Keep experiment choices
        </button>
        <button className="flight-panel__command" type="button" onClick={() => onAction({ type: "discard-experiment" })}>
          Return to saved settings
        </button>
      </div>}
      <details>
        <summary>Named profiles</summary>
        <label className="flight-panel__field">
          <span>Save current as</span>
          <input type="text" aria-label="Profile name" maxLength={40} value={profileName}
            onChange={event => setProfileName(event.target.value)} />
        </label>
        <button className="flight-panel__command" type="button"
          onClick={() => onAction({ type: "save-profile", name: profileName })}>Save as…</button>
        {state.profiles.length > 0 && <>
          <label className="flight-panel__field">
            <span>Saved profiles</span>
            <select aria-label="Saved profiles" value={selectedSaved} onChange={event => setSavedProfile(event.target.value)}>
              {state.profiles.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <button className="flight-panel__command" type="button"
            onClick={() => onAction({ type: "load-profile", name: selectedSaved })}>Use profile</button>
          <button className="flight-panel__command" type="button"
            onClick={() => onAction({ type: "delete-profile", name: selectedSaved })}>Delete</button>
        </>}
        <label className="flight-panel__field">
          <span>Import / export</span>
          <textarea aria-label="Profile text" rows={3} value={importText || state.exportText || ""}
            onChange={event => setImportText(event.target.value)} />
        </label>
        <button className="flight-panel__command" type="button" onClick={() => { setImportText(""); onAction({ type: "export" }); }}>
          Export current
        </button>
        <button className="flight-panel__command" type="button"
          onClick={() => onAction({ type: "import", text: importText || state.exportText || "" })}>Import</button>
      </details>
      {state.message && <p className={`flight-panel__hint${state.message.error ? " is-error" : ""}`} role="status">{state.message.text}</p>}
      {state.readOnlyReason && <p className="flight-panel__hint is-error" role="status">{state.readOnlyReason}</p>}
    </fieldset>
  );
}
