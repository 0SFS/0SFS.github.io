import { useEffect, useState } from "react";
import type { FlightParameterStore } from "../settings/flightParameters";
import {
  PHONE_CAMERA_PARAMETER_IDS,
  describePhoneCameraTuning,
  readPhoneCameraTuning,
  type PhoneCameraTuning,
} from "../remote/phoneCameraTuning";

export interface PhoneCameraTuningPanelProps {
  parameters: FlightParameterStore;
}

function usePhoneCameraTuning(parameters: FlightParameterStore): PhoneCameraTuning {
  const [tuning, setTuning] = useState(() => readPhoneCameraTuning(parameters));
  useEffect(() => {
    const update = () => setTuning(readPhoneCameraTuning(parameters));
    const stops = PHONE_CAMERA_PARAMETER_IDS.map(id => parameters.watch(id, update));
    update();
    return () => { for (const stop of stops) stop(); };
  }, [parameters]);
  return tuning;
}

/**
 * Remote Control → Phone camera trackpad: what is set now. The parameters
 * themselves follow, each taking effect on the next swipe, so two can be
 * compared without re-pairing. The two measured combinations are presets
 * (Phone camera: original and recommended, in Settings → Presets), and the
 * defaults are the recommended one. The costs the options quote are from
 * simulated measurements, not from this device: `docs/phone-controller.md`
 * → *Camera trackpad*.
 */
export function PhoneCameraTuningPanel({ parameters }: PhoneCameraTuningPanelProps) {
  const tuning = usePhoneCameraTuning(parameters);
  return (
    <div className="flight-panel__fieldset">
      <p className="flight-panel__hint">
        Smooth by default: movement is drawn on the phone&apos;s timeline, a playout buffer behind it. For the lowest
        delay, draw it <strong>As soon as it arrives</strong>; the camera then jumps whenever Wi-Fi delivers unevenly.
        Each change applies on the next swipe, with no re-pairing. The defaults are the preset
        <strong> Phone camera: recommended</strong>; <strong>Phone camera: original</strong> is how it first worked.
      </p>
      <p className="flight-panel__hint" role="status">Now: {describePhoneCameraTuning(tuning)}</p>
      <p className="flight-panel__hint">
        The buffer, catch-up and prediction apply only with paced drawing. <strong>Chase camera turns with</strong> is
        in Aircraft → Camera. Open the flight with <code>?phoneCameraTrace=1</code> to record which settings each frame used.
      </p>
    </div>
  );
}
