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
 * (Phone camera: original and recommended, in Settings → Presets); the costs
 * they quote are from the simulated measurements in `docs/phone-controller.md`
 * → *Camera trackpad tuning*, not from this device.
 */
export function PhoneCameraTuningPanel({ parameters }: PhoneCameraTuningPanelProps) {
  const tuning = usePhoneCameraTuning(parameters);
  return (
    <div className="flight-panel__fieldset">
      <p className="flight-panel__hint">
        Experimental. Each change applies on the next swipe, with no re-pairing. A phone that loaded before this
        update needs a fresh QR for <strong>Phone sends</strong> and <strong>Lost or late frames</strong> to do anything.
        The measured combinations are the presets <strong>Phone camera: original</strong> and
        <strong> Phone camera: recommended</strong>, in Settings → Presets.
      </p>
      <p className="flight-panel__hint" role="status">Now: {describePhoneCameraTuning(tuning)}</p>
      <p className="flight-panel__hint">
        The buffer, catch-up and prediction apply only with paced drawing. <strong>Chase camera turns with</strong> is
        in Aircraft → Camera. Open the flight with <code>?phoneCameraTrace=1</code> to record which settings each frame used.
      </p>
    </div>
  );
}
