import { createBrowserInputSource } from "@felipegalind0/gamepad-tools/browser";
import { BindingRuntime } from "@felipegalind0/gamepad-tools/core";
import { createStandardFlightProfile, FLIGHT_GAMEPAD_ACTIONS } from "./gamepadToolsAdapter";

export interface StartupPause {
  isPaused(): boolean;
  /** Stops listening: the flight's own input takes pause over from here. */
  dispose(): void;
}

/**
 * Pause from the first moment of loading, before the simulator and the
 * flight's own input exist: the flight's starting bindings, the P key and the
 * controller's Start button, choose whether the flight starts paused.
 */
export function createStartupPause(options: {
  paused: boolean;
  onChange(paused: boolean): void;
  /** Whether to read the controller this frame: the flight's polling rate. */
  shouldPoll(): boolean;
}): StartupPause {
  let paused = options.paused;
  const source = createBrowserInputSource({ target: window });
  const runtime = new BindingRuntime({
    profile: createStandardFlightProfile(source.getSelectedDevice()?.slot ?? 0),
    adapter: {
      namespace: "0sfs",
      actions: FLIGHT_GAMEPAD_ACTIONS,
      getContext: () => "flight",
      applyIntents(frame) {
        const pressed = frame.intents.some(intent => intent.actionId === "flight.pause"
          && intent.kind === "command" && intent.edge === "press");
        if (!pressed) return;
        paused = !paused;
        options.onChange(paused);
      },
      setBindingCapture() {},
    },
  });
  const unsubscribe = source.subscribe(frame => runtime.dispatch(frame));
  source.start({ useAnimationFrame: true, shouldPoll: options.shouldPoll });
  let disposed = false;
  return {
    isPaused: () => paused,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      source.stop();
      runtime.dispose();
      source.dispose();
    },
  };
}
