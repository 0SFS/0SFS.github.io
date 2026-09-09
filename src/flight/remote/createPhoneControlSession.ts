import { createPeerEndpoint, type SessionTransport, type PeerEndpoint } from "../../remote/peerTransport";
import { createJoinSecret, createPairingUrl, INVITATION_TTL_MS } from "../../remote/pairing";
import {
  HANDOFF_MS, HEARTBEAT_MS, STALE_MS, isCentered, neutralize, parseMessage,
  type ActionMessage, type AircraftStatus, type ControlFrame, type ControlSurfaceState, type RemoteMessage,
} from "../../remote/protocol";

export interface PhoneSessionSnapshot {
  phase: "off" | "preparing" | "invitation" | "authenticating" | "paired" | "error" | "expired";
  message: string;
  owner: "local" | "phone";
  invitationUrl: string | null;
  expiresAt: number | null;
  signalingAvailable: boolean;
}
export interface PhoneControlSessionOptions {
  getStatus(): AircraftStatus;
  hasActiveLocalInput(): boolean;
  isPageVisible?(): boolean;
  onOwnershipChange(owner: "local" | "phone", controls: ControlSurfaceState): void;
  setPaused(paused: boolean): void;
  setViewMode(mode: "first" | "third"): void;
  now?: () => number;
  createEndpoint?: typeof createPeerEndpoint;
}
interface PendingHandoff {
  id: number; baseline: ControlSurfaceState; paused: boolean; deadline: number; ack: boolean; frame: ControlFrame | null;
}

/** The desktop, not PeerJS Cloud, authenticates the invitation and owns flight authority. */
export function createPhoneControlSession(options: PhoneControlSessionOptions) {
  const now = options.now ?? (() => performance.now());
  const isPageVisible = options.isPageVisible ?? (() => true);
  const listeners = new Set<() => void>();
  const transports = new Set<SessionTransport>();
  const cleanup = new Map<SessionTransport, () => void>();
  let snapshot: PhoneSessionSnapshot = {
    phase: "off", message: "Phone controller", owner: "local", invitationUrl: null, expiresAt: null, signalingAvailable: true,
  };
  let endpoint: PeerEndpoint | null = null;
  let active: SessionTransport | null = null;
  let generation = 0;
  let disposed = false;
  let secret: string | null = null;
  let session = "";
  let epoch = 0;
  let leaseCounter = 0;
  const leases = new Map<number, { time: number; epoch: number }>();
  let pending: PendingHandoff | null = null;
  let latest: { frame: ControlFrame; receivedAt: number } | null = null;
  let lastSeq = -1;
  let localReady = false;
  let remoteReady = false;
  let setupTimer: ReturnType<typeof setTimeout> | undefined;
  let ticks = 0;
  let lastAppliedSeq: number | undefined;
  let receiveToApplyMs: number | undefined;
  const frameTimes: number[] = [];
  const actions = new Map<number, RemoteMessage>();
  let maxActionId = -1;

  const publish = (patch: Partial<PhoneSessionSnapshot> = {}) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(listener => listener());
  };
  const envelope = () => ({ v: 1 as const, session, epoch });
  const status = (): AircraftStatus => ({ ...options.getStatus(), owner: snapshot.owner });
  const send = (message: RemoteMessage) => active?.sendReliable(message) ?? false;
  const publishStatus = (message: string) => {
    if (active && localReady && remoteReady) send({ ...envelope(), type: "status", message, status: status() });
    publish({ message });
  };
  const freshLease = (id: number) => {
    const lease = leases.get(id);
    return Boolean(lease && lease.epoch === epoch && now() - lease.time <= STALE_MS);
  };
  const freshInput = () => Boolean(latest && now() - latest.receivedAt <= STALE_MS && freshLease(latest.frame.lease));
  const newEpoch = () => {
    epoch += 1; latest = null; lastSeq = -1; leases.clear(); actions.clear(); pending = null;
    maxActionId = -1; lastAppliedSeq = undefined; receiveToApplyMs = undefined; frameTimes.length = 0;
  };
  const issueLease = () => {
    const time = now();
    for (const [id, lease] of leases) if (time - lease.time > STALE_MS) leases.delete(id);
    const id = ++leaseCounter;
    leases.set(id, { time, epoch });
    return id;
  };
  const acknowledge = (id: number, ok: boolean, message: string) => {
    const result: RemoteMessage = { ...envelope(), type: "ack", id, ok, message, status: status() };
    actions.set(id, result);
    if (actions.size > 64) actions.delete(actions.keys().next().value!);
    send(result);
  };
  const revoke = (message: string, pause: boolean, force = false) => {
    const wasPhone = snapshot.owner === "phone";
    if (!wasPhone && !pending && !force) return;
    const canceled = pending?.id;
    const controls = neutralize(options.getStatus().controls);
    newEpoch();
    snapshot = { ...snapshot, owner: "local" };
    if (wasPhone) options.onOwnershipChange("local", controls);
    if (pause && wasPhone) options.setPaused(true);
    if (canceled !== undefined) acknowledge(canceled, false, message);
    publishStatus(message);
  };
  const closeAll = () => {
    clearTimeout(setupTimer); setupTimer = undefined;
    active = null;
    for (const detach of cleanup.values()) detach();
    cleanup.clear();
    for (const transport of transports) transport.close();
    transports.clear();
    endpoint?.destroy(); endpoint = null;
    secret = null; session = ""; localReady = remoteReady = false;
    newEpoch();
  };
  const disconnect = (message = "Phone disconnected. Create a new QR to pair.") => {
    if (disposed) return;
    revoke(message, true);
    generation += 1;
    closeAll();
    publish({ phase: "off", invitationUrl: null, expiresAt: null, message });
  };
  const fail = (message: string) => {
    if (disposed) return;
    revoke(message, true);
    generation += 1;
    closeAll();
    publish({ phase: "error", invitationUrl: null, expiresAt: null, message });
  };
  const maybeGrant = () => {
    if (!pending || !pending.ack || !pending.frame) return;
    if (now() >= pending.deadline || !freshInput() || handoffChanged()) {
      revoke("Center controls and tap Fly again.", false); return;
    }
    const { id, baseline } = pending;
    pending = null;
    snapshot = { ...snapshot, owner: "phone" };
    options.onOwnershipChange("phone", baseline);
    const result: RemoteMessage = { ...envelope(), type: "granted", requestId: id, status: status() };
    actions.set(id, result);
    send(result);
    publish({ message: options.getStatus().paused ? "Phone controls · Simulation paused" : "Phone controls" });
  };
  const handoffChanged = () => {
    if (!pending) return false;
    const current = options.getStatus();
    return !isPageVisible() || options.hasActiveLocalInput() || !isCentered(current.controls) || current.paused !== pending.paused
      || (["throttle", "pitchTrim", "flaps"] as const).some(key => current.controls[key] !== pending!.baseline[key]);
  };
  const handleAction = (message: ActionMessage) => {
    if (actions.has(message.id)) { send(actions.get(message.id)!); return; }
    if (pending?.id === message.id || message.id <= maxActionId) return;
    maxActionId = message.id;
    if (!freshLease(message.lease)) { acknowledge(message.id, false, "Connection is stale. Try again."); return; }
    if (message.action === "requestControl") {
      if (snapshot.owner === "phone" || pending) { acknowledge(message.id, false, "Control request already active."); return; }
      if (!isPageVisible()) { acknowledge(message.id, false, "Return to the desktop tab before taking control."); return; }
      const baseline = neutralize(options.getStatus().controls);
      if (options.hasActiveLocalInput() || !isCentered(options.getStatus().controls)) {
        acknowledge(message.id, false, "Center controls to take over."); return;
      }
      newEpoch();
      pending = { id: message.id, baseline, paused: options.getStatus().paused, deadline: now() + HANDOFF_MS, ack: false, frame: null };
      if (!send({ ...envelope(), type: "handoff", requestId: message.id, controls: baseline, lease: issueLease() })) {
        revoke("Control transfer could not be sent. Tap Fly again.", false); return;
      }
      publish({ message: "Transferring control to phone…" });
      return;
    }
    if (message.action === "releaseControl" && pending) {
      revoke("Phone control transfer canceled.", false);
      acknowledge(message.id, true, "Control transfer canceled."); return;
    }
    if (snapshot.owner !== "phone") { acknowledge(message.id, false, "Tap Fly before using flight controls."); return; }
    if (message.action === "releaseControl") {
      revoke("Phone released control · Simulation paused", true);
    } else if (message.action === "setPaused") {
      if (message.value === false && !freshInput()) { acknowledge(message.id, false, "Fresh phone input is required to resume."); return; }
      options.setPaused(message.value as boolean);
    } else if (message.action === "setViewMode") {
      options.setViewMode(message.value as "first" | "third");
    }
    acknowledge(message.id, true, "Applied");
    publishStatus(snapshot.owner === "phone" ? "Phone controls" : "Desktop controls");
  };
  const onNative = (input: unknown) => {
    const message = parseMessage(input);
    if (!message || !("session" in message) || message.session !== session || message.epoch !== epoch || !localReady || !remoteReady) return;
    if (message.type === "ping") { active?.sendNative({ ...message, type: "pong" }, true); return; }
    if (message.type !== "controls" || (!pending && snapshot.owner !== "phone") || message.seq <= lastSeq || !freshLease(message.lease)) return;
    if (pending && (!isCentered(message.controls)
      || ["throttle", "pitchTrim", "flaps"].some(key => message.controls[key as keyof ControlSurfaceState] !== pending!.baseline[key as keyof ControlSurfaceState]))) return;
    const receivedAt = now();
    while (frameTimes.length && receivedAt - frameTimes[0] >= 1000) frameTimes.shift();
    // The phone schedules 60 Hz plus prompt touch/release events up to 120 Hz.
    // Also bound accepted input here so excessive frames cannot refresh authority.
    if (frameTimes.length >= 120) return;
    frameTimes.push(receivedAt);
    lastSeq = message.seq;
    latest = { frame: message, receivedAt };
    if (pending) { pending.frame = message; maybeGrant(); }
  };

  const accept = (transport: SessionTransport) => {
    if (disposed || active || !secret || snapshot.phase !== "invitation" || transports.size >= 4) { transport.close(); return; }
    const currentGeneration = generation;
    transports.add(transport);
    // PeerJS reports an incoming connection before its reliable data channel is
    // necessarily open. Starting this deadline here races a slow ICE/DTLS
    // setup and can close a legitimate phone before it gets a chance to send
    // `hello`. The transport already bounds that setup at 15 seconds; this
    // shorter deadline is only for an opened, unauthenticated connection.
    let helloTimer: ReturnType<typeof setTimeout> | undefined;
    const startHelloTimer = () => {
      if (disposed || currentGeneration !== generation || !transports.has(transport) || active) return;
      helloTimer = setTimeout(() => transport.close(), 5000);
    };
    const detach = [
      transport.onReliable(input => {
        if (disposed || currentGeneration !== generation) return;
        const message = parseMessage(input);
        if (!message) { transport.close(); return; }
        if (transport !== active) {
          if (message.type !== "hello" || !secret || message.secret !== secret || snapshot.expiresAt === null || now() >= snapshot.expiresAt) {
            transport.sendReliable({ v: 1, type: "reject", reason: "Invitation expired or unavailable. Scan a new QR." });
            transport.close(); return;
          }
          // Consume the invitation before any asynchronous native channel setup.
          active = transport; secret = null; session = crypto.randomUUID(); maxActionId = -1;
          clearTimeout(helloTimer);
          newEpoch();
          publish({ phase: "authenticating", invitationUrl: null, expiresAt: null, message: "Connecting phone controls…" });
          setupTimer = setTimeout(() => {
            if (!disposed && currentGeneration === generation && active === transport && (!localReady || !remoteReady)) {
              fail("Could not connect directly. Try the same non-guest Wi-Fi network.");
            }
          }, 15_000);
          for (const other of [...transports]) if (other !== active) other.close();
          const ready = transport.openNative();
          const streamId = transport.nativeStreamId;
          if (streamId === null) { void ready.catch(() => {}); fail("Could not create the phone control channel."); return; }
          if (!send({ ...envelope(), type: "welcome", streamId, status: status() })) {
            void ready.catch(() => {}); fail("Could not send phone connection setup. Create a new QR."); return;
          }
          void ready.then(() => {
            if (disposed || currentGeneration !== generation || active !== transport) return;
            localReady = true;
            if (!send({ ...envelope(), type: "ready" })) { fail("Could not finish phone connection setup. Create a new QR."); return; }
            if (remoteReady) {
              clearTimeout(setupTimer); setupTimer = undefined;
              publish({ phase: "paired", message: "Phone paired · Desktop controls" });
            }
          }).catch(() => { if (!disposed && currentGeneration === generation) fail("Could not connect directly. Try the same non-guest Wi-Fi network."); });
          return;
        }
        if (!("session" in message) || message.session !== session || message.epoch !== epoch) return;
        if (message.type === "ready") {
          remoteReady = true;
          if (localReady) {
            clearTimeout(setupTimer); setupTimer = undefined;
            publish({ phase: "paired", message: "Phone paired · Desktop controls" });
          }
        } else if (localReady && remoteReady && message.type === "action") handleAction(message);
        else if (message.type === "handoffAck" && pending?.id === message.requestId) { pending.ack = true; maybeGrant(); }
      }),
      transport.onNative(input => { if (active === transport && currentGeneration === generation) onNative(input); }),
      transport.onClose(() => {
        clearTimeout(helloTimer);
        cleanup.get(transport)?.(); cleanup.delete(transport); transports.delete(transport);
        if (!disposed && active === transport && currentGeneration === generation) disconnect("Connection lost. Scan a new QR to pair again.");
      }),
    ];
    cleanup.set(transport, () => { clearTimeout(helloTimer); detach.forEach(fn => fn()); });
    void transport.ready.then(startHelloTimer).catch(() => transport.close());
  };

  const timer = setInterval(() => {
    if (disposed) return;
    if (snapshot.phase === "invitation" && snapshot.expiresAt !== null && now() >= snapshot.expiresAt) {
      generation += 1;
      closeAll(); publish({ phase: "expired", invitationUrl: null, expiresAt: null, message: "QR expired. Create a new QR." }); return;
    }
    if (pending && (now() >= pending.deadline || handoffChanged())) revoke("Control transfer canceled. Tap Fly again.", false);
    if (snapshot.owner === "phone" && !isPageVisible()) revoke("Desktop hidden · Simulation paused", true);
    if (snapshot.owner === "phone" && !freshInput()) revoke("Phone input lost · Simulation paused", true);
    if (!active || !localReady || !remoteReady) return;
    const lease = issueLease();
    ticks += 1;
    active.sendNative({ ...envelope(), type: "heartbeat", lease,
      ...(ticks % 2 === 0 ? { status: status(), appliedSeq: lastAppliedSeq, receiveToApplyMs } : {}),
    }, true);
  }, HEARTBEAT_MS);

  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    async startPairing() {
      if (disposed) return;
      disconnect();
      const currentGeneration = generation;
      publish({ phase: "preparing", message: "Preparing connection…" });
      try {
        const next = (options.createEndpoint ?? createPeerEndpoint)({ onConnection: transport => {
          if (disposed || currentGeneration !== generation) { transport.close(); return; }
          accept(transport);
        }, onSignalingState: available => {
          if (!disposed && currentGeneration === generation) publish({ signalingAvailable: available });
        } });
        endpoint = next;
        const peerId = await next.ready;
        if (disposed || currentGeneration !== generation) { next.destroy(); return; }
        secret = createJoinSecret();
        publish({ phase: "invitation", message: "Scan with your phone camera", invitationUrl: createPairingUrl(peerId, secret), expiresAt: now() + INVITATION_TTL_MS });
      } catch { if (!disposed && currentGeneration === generation) fail("Pairing service unavailable. Retry."); }
    },
    disconnect,
    takeControl(message = "Desktop controls") { revoke(message, false); },
    cancelHandoff(message = "Flight settings changed. Tap Fly again.") { if (pending) revoke(message, false); },
    reset() { revoke("Aircraft reset · Desktop controls", false, true); },
    syncStatus() { if (active) publishStatus(snapshot.owner === "phone" ? "Phone controls" : "Phone paired · Desktop controls"); },
    beforeStep(localControls: ControlSurfaceState): ControlSurfaceState | false {
      if (snapshot.owner !== "phone") return localControls;
      if (!isPageVisible()) { revoke("Desktop hidden · Simulation paused", true); return false; }
      if (!freshInput()) { revoke("Phone input lost · Simulation paused", true); return false; }
      if (latest!.frame.seq !== lastAppliedSeq) receiveToApplyMs = now() - latest!.receivedAt;
      lastAppliedSeq = latest!.frame.seq;
      return { ...latest!.frame.controls };
    },
    onHidden() { revoke("Desktop hidden · Simulation paused", true); },
    destroy() {
      if (disposed) return;
      disconnect(); disposed = true; clearInterval(timer); listeners.clear();
    },
  };
}
export type PhoneControlSession = ReturnType<typeof createPhoneControlSession>;
