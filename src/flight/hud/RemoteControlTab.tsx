import { useEffect, useRef, useState } from "react";
import type { PhonePairingPanel, PhonePairingPanelOptions } from "./createPhonePairingPanel";
import { PhoneCameraTuningPanel, type PhoneCameraTuningPanelProps } from "./PhoneCameraTuningPanel";

export type MountPhonePairing = (host: HTMLElement, options: PhonePairingPanelOptions) => PhonePairingPanel;

export interface RemoteControlTabProps {
  /** Loads pairing on first use; the session behind it outlives the tab. */
  loadPhonePairing(): Promise<MountPhonePairing>;
  /** Leaves the simulator for the controller page on this device. */
  onUseAsRemote(): void;
  /** The trackpad's A/B settings; absent, the tab shows none. */
  cameraTuning?: PhoneCameraTuningPanelProps;
}

/** A phone's primary pointer is coarse; a computer's is not, touchscreen or no. */
function isPhoneLike(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Both directions of the phone controller: pair a phone to fly this aircraft,
 * or turn this device into the controller. A phone opens the tab for the
 * second far more often, so there that comes first and no QR is made until
 * asked for.
 */
export function RemoteControlTab({ loadPhonePairing, onUseAsRemote, cameraTuning }: RemoteControlTabProps) {
  const [phone] = useState(isPhoneLike);
  const [mount, setMount] = useState<MountPhonePairing | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    loadPhonePairing().then(
      next => { if (current) setMount(() => next); },
      () => { if (current) setFailed(true); },
    );
    return () => { current = false; };
  }, [loadPhonePairing, attempt]);

  useEffect(() => {
    const host = hostRef.current;
    if (!mount || !host) return;
    const panel = mount(host, { pairOnOpen: !phone });
    return () => panel.destroy();
  }, [mount, phone]);

  const pairing = <fieldset key="pair" className="flight-panel__fieldset">
    <legend>Pair a phone</legend>
    {failed
      ? <>
        <p className="flight-panel__hint is-error" role="status">Pairing could not load. Check the connection and try again.</p>
        <button className="flight-panel__command" type="button" onClick={() => { setFailed(false); setAttempt(count => count + 1); }}>
          Try again
        </button>
      </>
      : !mount && <p className="flight-panel__hint">Loading…</p>}
    <div ref={hostRef} />
  </fieldset>;
  const thisDevice = <fieldset key="this" className="flight-panel__fieldset">
    <legend>Use this device as the remote</legend>
    <p className="flight-panel__hint">
      Opens the controller here, to fly a simulator on another screen: scan the QR in that screen's Remote Control tab.
      The simulator on this device closes.
    </p>
    <button className="flight-panel__command" type="button" onClick={onUseAsRemote}>Switch to RC mode</button>
  </fieldset>;
  const tuning = cameraTuning && <PhoneCameraTuningPanel key="tuning" {...cameraTuning} />;
  return <div className="flight-panel__content">{phone ? [thisDevice, pairing, tuning] : [pairing, tuning, thisDevice]}</div>;
}
