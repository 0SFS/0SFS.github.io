import {
  DEFAULT_PHONE_CAMERA_TUNING,
  PHONE_CAMERA_BUFFER_OPTIONS,
  PHONE_CAMERA_CATCH_UP_OPTIONS,
  PHONE_CAMERA_PREDICT_OPTIONS,
  RECOMMENDED_PHONE_CAMERA_TUNING,
  describePhoneCameraTuning,
  samePhoneCameraTuning,
  type PhoneCameraTuning,
} from "../remote/phoneCameraTuning";

export interface PhoneCameraTuningPanelProps {
  tuning: PhoneCameraTuning;
  onChange(tuning: PhoneCameraTuning): void;
}

/**
 * The phone trackpad's A/B settings. Each takes effect on the next swipe, so
 * two can be compared without re-pairing. The costs quoted are from the
 * simulated measurements in `docs/phone-controller.md` → *Camera trackpad
 * tuning*, not from this device.
 */
export function PhoneCameraTuningPanel({ tuning, onChange }: PhoneCameraTuningPanelProps) {
  const set = <K extends keyof PhoneCameraTuning>(key: K, value: PhoneCameraTuning[K]) => onChange({ ...tuning, [key]: value });
  const original = samePhoneCameraTuning(tuning, DEFAULT_PHONE_CAMERA_TUNING);
  const recommended = samePhoneCameraTuning(tuning, RECOMMENDED_PHONE_CAMERA_TUNING);
  const playout = tuning.present === "playout";
  return (
    <fieldset className="flight-panel__fieldset">
      <legend>Phone camera trackpad (A/B)</legend>
      <p className="flight-panel__hint">
        Experimental. Each change applies on the next swipe, with no re-pairing. A phone that loaded before this
        update needs a fresh QR for <strong>Phone sends</strong> and <strong>Lost frames</strong> to do anything.
      </p>
      <div className="phone-pairing__actions">
        <button className="flight-panel__command" type="button" aria-pressed={original}
          onClick={() => onChange({ ...DEFAULT_PHONE_CAMERA_TUNING, chaseFrame: tuning.chaseFrame })}>Original</button>
        <button className="flight-panel__command" type="button" aria-pressed={recommended}
          onClick={() => onChange({ ...RECOMMENDED_PHONE_CAMERA_TUNING, chaseFrame: tuning.chaseFrame })}>Recommended</button>
      </div>
      <p className="flight-panel__hint" role="status">Now: {describePhoneCameraTuning(tuning)}</p>
      <label className="flight-panel__field">
        <span>Phone sends</span>
        <select aria-label="Phone send timing" value={tuning.send}
          onChange={event => set("send", event.target.value as PhoneCameraTuning["send"])}>
          <option value="timer">On each touch, capped at 120/s, plus a 60 Hz timer (original)</option>
          <option value="batch">Once per touch frame (about 10–17 ms sooner, steadier)</option>
        </select>
      </label>
      <label className="flight-panel__field">
        <span>Lost or late frames</span>
        <select aria-label="Lost camera frames" value={tuning.source}
          onChange={event => set("source", event.target.value as PhoneCameraTuning["source"])}>
          <option value="delta">Lose their movement (original)</option>
          <option value="total">Recover it from the running total (no delay)</option>
        </select>
      </label>
      <label className="flight-panel__field">
        <span>Draw movement</span>
        <select aria-label="Camera drawing" value={tuning.present}
          onChange={event => set("present", event.target.value as PhoneCameraTuning["present"])}>
          <option value="arrival">As soon as it arrives (original)</option>
          <option value="playout">Paced on the phone's own timeline</option>
        </select>
      </label>
      <label className="flight-panel__field">
        <span>Playout buffer</span>
        <select aria-label="Playout buffer" value={tuning.bufferMs} disabled={!playout}
          onChange={event => set("bufferMs", Number(event.target.value))}>
          {PHONE_CAMERA_BUFFER_OPTIONS.map(ms => <option key={ms} value={ms}>
            {ms === 0 ? "0 ms: only smooths stalls" : `${ms} ms added${ms === 12 ? " (recommended)" : ms === 16 ? " (smooth on 120 Hz)" : ""}`}
          </option>)}
        </select>
      </label>
      <label className="flight-panel__field">
        <span>After a stall</span>
        <select aria-label="Playout catch-up" value={tuning.catchUp} disabled={!playout}
          onChange={event => set("catchUp", Number(event.target.value))}>
          {PHONE_CAMERA_CATCH_UP_OPTIONS.map(speed => <option key={speed} value={speed}>
            {speed === 0 ? "Jump to where the finger is" : `Catch up at ${speed}× speed${speed === 2 ? " (recommended)" : ""}`}
          </option>)}
        </select>
      </label>
      <label className="flight-panel__field">
        <span>Predict ahead</span>
        <select aria-label="Playout prediction" value={tuning.predictMs} disabled={!playout}
          onChange={event => set("predictMs", Number(event.target.value))}>
          {PHONE_CAMERA_PREDICT_OPTIONS.map(ms => <option key={ms} value={ms}>
            {ms === 0 ? "Off" : `${ms} ms (overshoots when the finger stops)`}
          </option>)}
        </select>
      </label>
      <label className="flight-panel__field">
        <span>Chase camera turns with</span>
        <select aria-label="Chase camera frame" value={tuning.chaseFrame}
          onChange={event => set("chaseFrame", event.target.value as PhoneCameraTuning["chaseFrame"])}>
          <option value="attitude">Roll, pitch and heading (original)</option>
          <option value="no-roll">Pitch and heading: wings level</option>
          <option value="heading">Heading only: horizon level</option>
        </select>
      </label>
      <p className="flight-panel__hint">
        <strong>Chase camera turns with</strong> changes every chase view, not only the phone's. The presets leave it
        as it is. Open the flight with <code>?phoneCameraTrace=1</code> to record which settings each frame used.
      </p>
    </fieldset>
  );
}
