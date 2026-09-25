import { useEffect, useRef } from "react";
import type { GamepadPollingController } from "../input/gamepadPolling";
import type { GamepadResponseController } from "@felipegalind0/gamepad-tools/core";

export interface GamepadBindingsMount {
  polling?: GamepadPollingController;
  response?: GamepadResponseController;
  mount(root: HTMLElement): { destroy(): void };
}

export function GamepadBindingsPanel({ mount }: { mount: GamepadBindingsMount }): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current) {
      return;
    }
    const handle = mount.mount(root.current);
    return () => handle.destroy();
  }, [mount]);
  return <div className="flight-panel__gamepad-bindings" ref={root} />;
}
