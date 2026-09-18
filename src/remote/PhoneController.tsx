import { useCallback, useState, useSyncExternalStore } from "react";
import type { InputTiming, PhoneControllerClient } from "./phoneControllerClient";
import { PhoneBrake, PhoneCameraPad, PhoneStick } from "./PhoneStick";
import { PhoneControlPrompt } from "./PhoneControlPrompt";
import { PhoneQrScanner } from "./PhoneQrScanner";
import { PhoneEngine } from "./PhoneEngine";
import { PhoneViewSwitch } from "./PhoneViewSwitch";
import { PhoneFullscreenButton, PhoneFullscreenPrompt } from "./PhoneFullscreenPrompt";
import { useFullscreenOffer } from "./useFullscreenOffer";
import { PhoneSettings } from "./PhoneSettings";
import { PhoneYaw } from "./PhoneYaw";
import {
  readGridPosition, readYawSettings, writeGridPosition, writeYawSettings,
  type GridPosition, type YawSettings,
} from "./phoneSettingsStore";
import { ConnectionDiagnosticsPanel } from "./ConnectionDiagnosticsPanel";
import "../styles/flightControls.css";
import "./phone.css";

/**
 * The same controls as the desktop HUD, in the same places, drawn by the same
 * rules — `src/styles/flightControls.css` is shared with the desktop flight HUD, and
 * the class names here are the HUD's own. Only placement and touch sizing
 * belong to the phone, so a change to how a lever or the trim square looks
 * lands on both screens at once.
 *
 * `onPair` takes a pairing link read by the page's own QR scanner, which a
 * session that has ended offers as the way back.
 */
export function PhoneController({ client, onPair }: { client: PhoneControllerClient; onPair?(url: string): void }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const [scanning, setScanning] = useState(false);
  const status = state.status;
  const fullscreen = useFullscreenOffer();
  const [gridPosition, setGridPosition] = useState(readGridPosition);
  const moveGrid = useCallback((position: GridPosition) => { setGridPosition(position); writeGridPosition(position); }, []);
  const [yaw, setYaw] = useState(readYawSettings);
  const changeYaw = useCallback((settings: YawSettings) => { setYaw(settings); writeYawSettings(settings); }, []);
  const rudder = useCallback((value: number) => client.updateControls({ rudder: value }), [client]);
  const stick = useCallback((x: number, y: number, input?: InputTiming) => client.updateControls({ aileron: x, elevator: -y }, input), [client]);
  // The desktop's own drag signs: right orbits right, down lifts the camera.
  const camera = useCallback((gesture: { yaw: number; pitch: number; zoom?: number }, input?: InputTiming) => client.nudgeCamera(gesture, input), [client]);
  const brake = useCallback((held: boolean) => client.updateControls({ brake: held ? 1 : 0 }), [client]);
  const ended = state.phase === "error" || state.phase === "disconnected";
  const connected = state.phase === "ready";
  const locked = !state.canControl;
  const owner = status?.owner === "phone" ? "PHONE" : "DESKTOP";
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  // Fixed-width values keep a chip from resizing as its number grows.
  const pad = (value: string, width: number) => value.padStart(width, " ");
  const tape = (label: string, unit: string, value: string) => (
    <div className="flight-hud__tape" key={label}>
      <div className="flight-hud__tape-header">
        <span className="flight-hud__label">{label}</span>
        <span className="flight-hud__unit">{unit}</span>
      </div>
      <span className="flight-hud__value">{value}</span>
    </div>
  );
  // An absent `gearDown` means the host predates gear support; do not offer it.
  const gearKnown = status?.gearDown !== undefined;
  /**
   * The link chip is the connection's whole status line. It used to be backed
   * by a notice banner for every message the client emits, which cost a row of
   * screen to say "delayed" — so the chip says it, at a width that does not
   * change between its labels, and the full sentence goes to assistive tech.
   */
  const link = ended ? "OFFLINE" : !connected ? "PAIRING" : !state.hostFresh ? "DELAYED" : owner;
  // A host with no engine reading sends none; the throttle then keeps the whole column.
  const engine = status?.engine;
  const paused = status?.paused === true;
  // Anything short of flying from this phone puts the take-control popup up.
  const flying = connected && status?.owner === "phone";
  return <main className={`phone-app${flying ? "" : " phone-app--needs-control"}`}>
    <PhoneFullscreenPrompt offer={fullscreen} />
    {!flying && <PhoneControlPrompt state={state} onTakeControl={() => client.requestControl()}
      onScan={onPair && (() => setScanning(true))} />}
    {scanning && onPair && <PhoneQrScanner onScan={onPair} onClose={() => setScanning(false)} />}
    <section className={`phone-controls phone-controls--grid-${gridPosition}`} aria-label="Aircraft controls">
      <div className="phone-cluster" aria-label="Attitude, trim and flaps">
        <div className="flight-hud__auto-trims" role="group" aria-label="Center trim">
          <button type="button" className="flight-hud__auto-trim flight-hud__auto-trim--roll" disabled={locked}
            aria-label="Center roll trim" onClick={() => client.updateControls({ rollTrim: 0 })}><span>ROLL</span></button>
          <button type="button" className="flight-hud__auto-trim flight-hud__auto-trim--pitch" disabled={locked}
            aria-label="Center pitch trim" onClick={() => client.updateControls({ pitchTrim: 0 })}><span>PITCH</span></button>
        </div>
        <label className="flight-hud__lever flight-hud__lever--pitch">
          <span className="flight-hud__lever-meta"><span>PITCH</span><output>{percent(state.controls.pitchTrim)}</output></span>
          <span className="flight-hud__lever-track">
            <input type="range" min="-1" max="1" step=".01" value={state.controls.pitchTrim} disabled={locked}
              aria-label="Pitch trim" onChange={event => client.updateControls({ pitchTrim: Number(event.target.value) })} />
          </span>
        </label>
        {/* Roll trim and the pad share a column of their own so the slider is
            exactly as wide as the square below it, in both orientations. */}
        <div className="phone-cluster__pad">
          <label className="flight-hud__slider-control flight-hud__slider-control--roll-trim">
            <span>ROLL</span>
            <input type="range" min="-1" max="1" step=".01" value={state.controls.rollTrim} disabled={locked}
              aria-label="Roll trim" onChange={event => client.updateControls({ rollTrim: Number(event.target.value) })} />
            <output>{percent(state.controls.rollTrim)}</output>
          </label>
          <PhoneStick label="PITCH / ROLL" disabled={locked} onChange={stick} />
        </div>
        <label className="flight-hud__lever flight-hud__lever--flaps">
          <span className="flight-hud__lever-meta"><span>FLAPS</span><output>{percent(state.controls.flaps)}</output></span>
          <span className="flight-hud__lever-track">
            <input type="range" min="0" max="1" step=".01" value={state.controls.flaps} disabled={locked}
              aria-label="Flaps" onChange={event => client.updateControls({ flaps: Number(event.target.value) })} />
          </span>
        </label>
      </div>
      <div className={`phone-yaw-throttle${engine ? " phone-yaw-throttle--engine" : ""}`} aria-label="Yaw, engine, camera and throttle">
        {/* Rudder is a transient control by default: releasing it returns to
            centre, the way letting go of the desktop slider does. Settings →
            Yaw decides that, and how long the return takes. */}
        <PhoneYaw value={state.controls.rudder} disabled={locked} settings={yaw} onChange={rudder} />
        {/* The desktop HUD's engine widget, just above the throttle it answers to,
            notched into the camera pad's corner rather than widening the column. */}
        {engine && <PhoneEngine engine={engine} />}
        {/* The slot the desktop HUD gives its engine monitor, spent on the view:
            the phone's engine widget sits over the throttle instead. */}
        {/* The view switch sits over the pad's corner, not inside it: a switch
            inside the pad's button would be a button in a button. */}
        <div className="phone-camera-slot">
          <PhoneCameraPad disabled={locked} onGesture={camera} />
          <PhoneViewSwitch mode={status?.viewMode} disabled={locked} onChange={mode => client.setViewMode(mode)} />
        </div>
        <label className="flight-hud__slider-control phone-throttle">
          <span>THR</span>
          <output>{percent(state.controls.throttle)}</output>
          <input type="range" min="0" max="1" step=".01" value={state.controls.throttle} disabled={locked}
            aria-label="Throttle" onChange={event => client.updateControls({ throttle: Number(event.target.value) })} />
        </label>
      </div>
      {/* Everything that is not a flight surface, in one chip grid at FOSS Earth
          HUD density: instruments first, then the buttons. Below the controls
          by default, above them if Settings says so; never a separate bar. */}
      <div className="phone-actions" aria-label="Instruments and buttons">
        {tape("IAS", "kt", status ? pad(String(Math.round(status.airspeedKts)), 3) : "---")}
        {tape("ALT", "ft", status ? pad(String(Math.round(status.altitudeFt)), 5) : "-----")}
        {tape("HDG", "°", status ? pad(String(Math.round(status.headingDeg) % 360), 3) : "---")}
        <button type="button" className={`flight-hud__gear${status?.gearDown ? " is-down" : ""}`}
          disabled={locked || !gearKnown} onClick={() => client.setGearDown(!status?.gearDown)}
          aria-pressed={status?.gearDown === true}
          title={gearKnown ? (status?.gearDown ? "Landing gear down — tap to raise" : "Landing gear up — tap to lower")
            : "This simulator does not report gear position"}>G</button>
        <span className={`phone-link${connected && state.hostFresh ? " phone-link--live" : ""}`}>
          <span className="phone-link__dot" aria-hidden="true" />{link}
          <span className="phone-sr-only" role="status">{state.message}</span>
        </span>
        {/* Only while flying: taking control is the popup's job, not the grid's. */}
        {flying && <>
          {/* The flight page's own pause glyphs, lit while paused the way its bar lights. */}
          <button type="button" className="phone-pause" disabled={locked} aria-pressed={paused}
            aria-label={paused ? "Resume simulation" : "Pause simulation"} title={paused ? "Resume simulation" : "Pause simulation"}
            onClick={() => client.setPaused(!paused)}>{paused ? "▶" : "Ⅱ"}</button>
          <button type="button" disabled={locked} onClick={() => client.releaseControl()}>Release</button>
        </>}
        <button type="button" className="phone-haptics" aria-pressed={state.hapticsEnabled} disabled={!state.hapticsSupported}
          title={state.hapticsSupported ? "Touchdown pulses while you fly" : "Unavailable on this device"}
          onClick={() => client.setHapticsEnabled(!state.hapticsEnabled)}>Haptics</button>
        <ConnectionDiagnosticsPanel log={client.log} transport={state.diagnostics} rttMs={state.rttMs}
          receiveToApplyMs={state.receiveToApplyMs} appliedSeq={state.appliedSeq} signalingAvailable={state.signalingAvailable}
          recovery={ended ? "On the computer, open the Remote Control tab and create a new QR, then scan it." : undefined} />
        <PhoneFullscreenButton offer={fullscreen} />
        <PhoneSettings gridPosition={gridPosition} onGridPositionChange={moveGrid} yaw={yaw} onYawChange={changeYaw} />
        {/* Last in the grid. A chip like the rest, held rather than tapped. */}
        <PhoneBrake disabled={locked} onChange={brake} />
      </div>
    </section>
  </main>;
}
