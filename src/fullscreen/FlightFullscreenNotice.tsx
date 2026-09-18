import { useEffect } from "react";
import { PhoneFullscreenPrompt } from "../remote/PhoneFullscreenPrompt";
import { useFullscreenOffer } from "../remote/useFullscreenOffer";

/**
 * The controller's popup, driven by the controller's hook. `bind` receives the
 * hook's own way to put the popup back up, for a host that is not React.
 */
export function FlightFullscreenNotice({ bind }: { bind(open: () => void): void }) {
  const offer = useFullscreenOffer();
  useEffect(() => bind(offer.toggle), [bind, offer.toggle]);
  return <PhoneFullscreenPrompt offer={offer} />;
}
