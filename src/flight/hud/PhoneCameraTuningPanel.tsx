import { useEffect, useState } from "react";
import type { FlightParameterStore } from "../settings/flightParameters";
import {
  DEFAULT_PHONE_CAMERA_TUNING,
  PHONE_CAMERA_PARAMETER_IDS,
  RECOMMENDED_PHONE_CAMERA_TUNING,
  describePhoneCameraTuning,
  phoneCameraTuningValues,
  readPhoneCameraTuning,
  samePhoneCameraTuning,
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
 * Remote Control → Phone camera trackpad: the two measured combinations, and
 * what is set now. The parameters themselves follow, each taking effect on the
 * next swipe, so two can be compared without re-pairing. The costs quoted are
 * from the simulated measurements in `docs/phone-controller.md` → *Camera
 * trackpad tuning*, not from this device.
 */
export function PhoneCameraTuningPanel({ parameters }: PhoneCameraTuningPanelProps) {
  const tuning = usePhoneCameraTuning(parameters);
  const original = samePhoneCameraTuning(tuning, DEFAULT_PHONE_CAMERA_TUNING);
  const recommended = samePhoneCameraTuning(tuning, RECOMMENDED_PHONE_CAMERA_TUNING);
  // The chase frame changes every chase view, so the combinations leave it as it is.
  const apply = (next: PhoneCameraTuning) => parameters.setMany(phoneCameraTuningValues({ ...next, chaseFrame: tuning.chaseFrame }));
  return (
    <div className="flight-panel__fieldset">
      <p className="flight-panel__hint">
        Experimental. Each change applies on the next swipe, with no re-pairing. A phone that loaded before this
        update needs a fresh QR for <strong>Phone sends</strong> and <strong>Lost or late frames</strong> to do anything.
      </p>
      <div className="phone-pairing__actions">
        <button className="flight-panel__command" type="button" aria-pressed={original}
          onClick={() => apply(DEFAULT_PHONE_CAMERA_TUNING)}>Original</button>
        <button className="flight-panel__command" type="button" aria-pressed={recommended}
          onClick={() => apply(RECOMMENDED_PHONE_CAMERA_TUNING)}>Recommended</button>
      </div>
      <p className="flight-panel__hint" role="status">Now: {describePhoneCameraTuning(tuning)}</p>
      <p className="flight-panel__hint">
        The buffer, catch-up and prediction apply only with paced drawing. <strong>Chase camera turns with</strong> is
        in Aircraft → Camera. Open the flight with <code>?phoneCameraTrace=1</code> to record which settings each frame used.
      </p>
    </div>
  );
}
