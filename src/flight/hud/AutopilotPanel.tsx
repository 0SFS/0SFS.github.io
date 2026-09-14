import {
  AUTOPILOT_AXIS_COPY,
  AUTOPILOT_AXIS_IDS,
  allAutopilotAxesEnabled,
  patchAutopilotSettings,
  type AutopilotAxisId,
  type AutopilotBackend,
  type AutopilotSettingsV1,
  type AutopilotThrottleMode,
  withAllAutopilotAxes,
} from "../autopilot/autopilotSettings";
import {
  describeArduPilotLink,
  type ArduPilotStatus,
} from "../autopilot/ardupilotStatus";
import type { AutopilotOwners, AxisOwner } from "../autopilot/controlArbiter";

export interface AutopilotPanelState {
  settings: AutopilotSettingsV1;
  engaged: boolean;
  owners: AutopilotOwners;
  ardupilot: ArduPilotStatus;
  blockedReason: string | null;
  readOnlyReason: string | null;
}

export interface AutopilotPanelProps {
  state: AutopilotPanelState;
  onSettingsChange(settings: AutopilotSettingsV1): void;
  onEngageChange(engaged: boolean): void;
}

const OWNER_LABEL: Record<AxisOwner, string> = {
  "pilot": "Pilot",
  "our-ap": "Our AP",
  "ardupilot": "ArduPilot",
};

const BACKENDS: { id: AutopilotBackend; label: string }[] = [
  { id: "ours", label: "Our AP" },
  { id: "ardupilot", label: "ArduPilot" },
];

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flight-panel__metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function AutopilotPanel({ state, onSettingsChange, onEngageChange }: AutopilotPanelProps) {
  const settings = state.settings;
  const patch = (partial: Partial<Omit<AutopilotSettingsV1, "version">>) => {
    onSettingsChange(patchAutopilotSettings(settings, partial));
  };
  const setAxis = (id: AutopilotAxisId, enabled: boolean) => {
    patch({ axes: { ...settings.axes, [id]: enabled } });
  };
  const ardupilotSelected = settings.backend === "ardupilot";

  return (
    <div className="flight-panel__content">
      <fieldset className="flight-panel__fieldset">
        <legend>Backend</legend>
        <div className="flight-panel__segmented" role="group" aria-label="Autopilot backend">
          {BACKENDS.map((backend) => (
            <button
              key={backend.id}
              type="button"
              className={settings.backend === backend.id ? "is-active" : ""}
              aria-pressed={settings.backend === backend.id}
              onClick={() => patch({ backend: backend.id })}
            >
              {backend.label}
            </button>
          ))}
        </div>
        <p className="flight-panel__hint">
          Our AP runs in the browser and only flies the axes enabled below. ArduPilot, when connected, owns those automated axes while JSBSim stays the flight dynamics model.
        </p>
      </fieldset>

      <fieldset className="flight-panel__fieldset" aria-label="ArduPilot status">
        <legend>ArduPilot</legend>
        <div className="flight-panel__metrics">
          <StatusMetric label="Link" value={describeArduPilotLink(state.ardupilot)} />
          <StatusMetric label="Identity" value={state.ardupilot.identity ?? "—"} />
          <StatusMetric label="Mode" value={state.ardupilot.mode ?? "—"} />
          <StatusMetric label="Actuators" value={state.ardupilot.hasActuators ? "Live" : "None"} />
        </div>
        <p className={`flight-panel__hint${ardupilotSelected ? " is-error" : ""}`} role="status">
          {state.ardupilot.detail}
        </p>
        <button className="flight-panel__command" type="button" disabled>
          Connect SITL
        </button>
        <p className="flight-panel__hint">
          The first planned ArduPilot mode is Circle/LOITER after a manual climb. Connect stays disabled until the local bridge exists.
        </p>
      </fieldset>

      <fieldset className="flight-panel__fieldset">
        <legend>Automated axes</legend>
        <p className="flight-panel__hint">
          These flags are the package the HUD Autopilot button engages. Unchecked axes stay with the pilot.
        </p>
        {AUTOPILOT_AXIS_IDS.map((id) => {
          const copy = AUTOPILOT_AXIS_COPY[id];
          return (
            <label key={id} className="flight-panel__field flight-panel__field--inline">
              <input
                type="checkbox"
                aria-label={`Automate ${copy.label}`}
                checked={settings.axes[id]}
                onChange={(event) => setAxis(id, event.target.checked)}
              />
              <span>{copy.label}</span>
            </label>
          );
        })}
        <button
          className="flight-panel__command"
          type="button"
          disabled={allAutopilotAxesEnabled(settings.axes)}
          onClick={() => onSettingsChange(withAllAutopilotAxes(settings))}
        >
          Control everything our AP can own
        </button>
      </fieldset>

      <fieldset className="flight-panel__fieldset">
        <legend>Throttle</legend>
        <label className="flight-panel__field">
          <span>Behaviour</span>
          <select
            aria-label="Throttle behaviour"
            value={settings.throttleMode}
            disabled={!settings.axes.throttle}
            onChange={(event) => patch({ throttleMode: event.target.value as AutopilotThrottleMode })}
          >
            <option value="airspeed">Hold airspeed (capture on engage)</option>
            <option value="hold">Hold current lever</option>
          </select>
        </label>
        <p className="flight-panel__hint">
          Moving the throttle lever takes that axis back. Attitude axes yield while that stick is deflected or on the ground — the same idea as the HUD TRIM assists, which only drive trim wheels when AP does not own that axis.
        </p>
      </fieldset>

      <fieldset className="flight-panel__fieldset">
        <legend>Master engage</legend>
        <div className="flight-panel__metrics">
          <StatusMetric label="Master" value={state.engaged ? "On" : "Off"} />
          <StatusMetric label="Can engage" value={state.blockedReason ? "No" : "Yes"} />
        </div>
        <button
          className="flight-panel__command"
          type="button"
          aria-pressed={state.engaged}
          aria-label="Autopilot master engage"
          onClick={() => onEngageChange(!state.engaged)}
        >
          {state.engaged ? "Disengage autopilot" : "Engage autopilot"}
        </button>
        {state.blockedReason ? (
          <p className="flight-panel__hint is-error" role="status">{state.blockedReason}</p>
        ) : (
          <p className="flight-panel__hint">
            The HUD Autopilot button next to the gear lever turns this same package on and off.
          </p>
        )}
        {state.readOnlyReason ? (
          <p className="flight-panel__hint is-error" role="status">{state.readOnlyReason}</p>
        ) : null}
      </fieldset>

      <fieldset className="flight-panel__fieldset" aria-label="Control owners">
        <legend>Who is flying</legend>
        <div className="flight-panel__metrics">
          {AUTOPILOT_AXIS_IDS.map((id) => (
            <StatusMetric
              key={id}
              label={AUTOPILOT_AXIS_COPY[id].label}
              value={OWNER_LABEL[state.owners[id]]}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
