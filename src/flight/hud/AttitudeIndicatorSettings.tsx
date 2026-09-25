import { useSyncExternalStore } from "react";
import type { AttitudeRendererPreference } from "./attitudeRenderer";
import type { AttitudeRendererSetting, AttitudeRendererSettingState } from "../settings/attitudeRendererSetting";

const LABELS: Record<AttitudeRendererPreference, string> = {
  auto: "Auto",
  webgpu: "WebGPU",
  canvas2d: "Canvas 2D",
};

function describe({ preference, status }: AttitudeRendererSettingState): string {
  if (!status || status.preference !== preference || !status.backend) return "Setting up the renderer…";
  const drawing = status.backend === "webgpu" ? "WebGPU, on the globe's GPU device" : "Canvas 2D";
  return status.reason ? `Drawing with ${drawing}. ${status.reason}` : `Drawing with ${drawing}.`;
}

/** Settings → Attitude indicator. */
export function AttitudeIndicatorSettings({ setting }: { setting: AttitudeRendererSetting }) {
  const state = useSyncExternalStore(setting.subscribe, setting.getState);
  return (
    <fieldset className="flight-panel__fieldset">
      <legend>Attitude indicator</legend>
      <label className="flight-panel__field">
        <span>Renderer</span>
        <select aria-label="Attitude indicator renderer" value={state.preference}
          onChange={event => setting.setPreference(event.target.value as AttitudeRendererPreference)}>
          {(Object.keys(LABELS) as AttitudeRendererPreference[]).map(preference =>
            <option key={preference} value={preference}>{LABELS[preference]}</option>)}
        </select>
      </label>
      <p className="flight-panel__hint" role="status">{describe(state)}</p>
      <p className="flight-panel__hint">
        Auto draws on the GPU when the globe runs on WebGPU, and in Canvas 2D otherwise. Canvas 2D costs
        more: the browser rasterises its lines and text every frame.
      </p>
    </fieldset>
  );
}
