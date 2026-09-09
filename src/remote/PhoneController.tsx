import { useCallback, useSyncExternalStore } from "react";
import type { PhoneControllerClient } from "./phoneControllerClient";
import { FLAP_PRESETS } from "./protocol";
import { PhoneBrake, PhoneStick } from "./PhoneStick";
import "./phone.css";

export function PhoneController({ client }: { client: PhoneControllerClient }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const status = state.status;
  const stick = useCallback((x: number, y: number) => client.updateControls({ aileron: x, elevator: -y }), [client]);
  const rudder = useCallback((x: number) => client.updateControls({ rudder: x }), [client]);
  const brake = useCallback((held: boolean) => client.updateControls({ brake: held ? 1 : 0 }), [client]);
  const ended = state.phase === "error" || state.phase === "disconnected";
  const connected = state.phase === "ready";
  const heading = status ? String(Math.round(status.headingDeg) % 360).padStart(3, "0") : "—";
  return <main className="phone-app">
    <header className="phone-header">
      <div className="phone-brand"><span className="phone-brand__mark" aria-hidden="true">✈</span><div><strong>FLIGHT SIM</strong><span>PHONE CONTROLLER</span></div></div>
      <span className={`phone-connection${connected && state.hostFresh ? " phone-connection--online" : ""}`}><span aria-hidden="true" />{ended ? "Disconnected" : connected ? state.hostFresh ? "Connected" : "Delayed" : "Connecting"}</span>
    </header>
    <div className="phone-flight-status"><span>{status?.owner === "phone" ? "Phone controls" : "Desktop controls"}</span><span className={status?.paused ? "phone-paused" : ""}>{status ? status.paused ? "PAUSED" : "IN FLIGHT" : "PAIRING"}</span></div>
    <div className="phone-telemetry" aria-label="Aircraft instruments">
      <div><span>AIRSPEED</span><strong>{status ? Math.round(status.airspeedKts) : "—"}</strong><small>KT</small></div>
      <div><span>ALTITUDE</span><strong>{status ? Math.round(status.altitudeFt).toLocaleString() : "—"}</strong><small>FT</small></div>
      <div><span>HEADING</span><strong>{heading}</strong><small>DEG</small></div>
    </div>
    <div className={`phone-notice${ended ? " phone-notice--error" : ""}`} role="status"><span>{state.message}</span>{ended && <small>On the computer, open Phone controller and create a new QR. Scan it to pair again.</small>}</div>
    <section className="phone-controls" aria-label="Aircraft controls">
      <div className="phone-controls__left">
        <div className="phone-throttle phone-panel"><label htmlFor="phone-throttle">THROTTLE <output>{Math.round(state.controls.throttle * 100)}%</output></label>
          <input id="phone-throttle" type="range" min="0" max="1" step=".01" value={state.controls.throttle} disabled={!state.canControl} onChange={event => client.updateControls({ throttle: Number(event.target.value) })} />
          <div className="phone-range-labels"><span>IDLE</span><span>FULL</span></div>
        </div>
        <PhoneStick label="RUDDER" horizontal disabled={!state.canControl} onChange={rudder} />
        <PhoneBrake disabled={!state.canControl} onChange={brake} />
      </div>
      <div className="phone-controls__right"><PhoneStick label="PITCH / ROLL" disabled={!state.canControl} onChange={stick} /><p className="phone-stick-help">Pull down to climb · Release to center</p></div>
    </section>
    <section className="phone-settings" aria-label="Aircraft settings">
      <div className="phone-panel phone-trim"><label htmlFor="phone-trim">PITCH TRIM <output>{Math.round(state.controls.pitchTrim * 100)}%</output></label>
        <div><input id="phone-trim" type="range" min="-1" max="1" step=".01" value={state.controls.pitchTrim} disabled={!state.canControl} onChange={event => client.updateControls({ pitchTrim: Number(event.target.value) })} />
          <button type="button" disabled={!state.canControl} onClick={() => client.updateControls({ pitchTrim: 0 })}>Center</button></div>
      </div>
      <fieldset className="phone-panel phone-flaps" disabled={!state.canControl}><legend>FLAPS</legend><div>{FLAP_PRESETS.map((value, index) => <button type="button" key={value} aria-pressed={Math.abs(state.controls.flaps - value) < .01} onClick={() => client.updateControls({ flaps: value })}>{index === 0 ? "UP" : `${index * 10}°`}</button>)}</div></fieldset>
    </section>
    <footer className="phone-actions">
      {status?.owner !== "phone"
        ? <button type="button" className="phone-primary" disabled={!state.canFly} onClick={() => client.requestControl()}>{state.requestingControl ? "Taking control…" : "Fly"}</button>
        : <><button type="button" className="phone-primary" disabled={!state.canControl} onClick={() => client.setPaused(!status.paused)}>{status.paused ? "Resume flight" : "Pause flight"}</button><button type="button" disabled={!state.canControl} onClick={() => client.releaseControl()}>Release control</button></>}
      <div className="phone-view" role="group" aria-label="Camera view"><button type="button" disabled={!state.canControl} aria-pressed={status?.viewMode === "first"} onClick={() => client.setViewMode("first")}>Cockpit</button><button type="button" disabled={!state.canControl} aria-pressed={status?.viewMode === "third"} onClick={() => client.setViewMode("third")}>Chase</button></div>
    </footer>
    <details className="phone-diagnostics"><summary>Connection details{state.rttMs === null ? "" : ` · ${Math.round(state.rttMs)} ms round trip`}</summary>
      <dl><div><dt>Connection</dt><dd>{state.diagnostics?.path ?? "Checking"}</dd></div><div><dt>Pairing service</dt><dd>{state.signalingAvailable ? "Available" : "Unavailable · Direct connection may continue"}</dd></div>
        <div><dt>Round trip</dt><dd>{state.rttMs === null ? "—" : `${state.rttMs.toFixed(1)} ms`}</dd></div><div><dt>Buffered controls</dt><dd>{state.diagnostics?.bufferedAmount ?? 0} bytes</dd></div>
        <div><dt>Receive to physics</dt><dd>{state.receiveToApplyMs === null ? "—" : `${state.receiveToApplyMs.toFixed(1)} ms`}</dd></div><div><dt>Latest applied frame</dt><dd>{state.appliedSeq ?? "—"}</dd></div></dl>
      <p>Best on the same non-guest Wi-Fi. Flight controls use a direct connection. Round trip is a network measurement, not touch-to-screen latency.</p>
    </details>
  </main>;
}
