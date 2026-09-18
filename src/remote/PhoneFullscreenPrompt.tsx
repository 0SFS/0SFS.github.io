import type { FullscreenOffer } from './useFullscreenOffer'
import {
  FullscreenBlockedCase, FullscreenBlockedIntro, FullscreenBlockedOptions,
  FULLSCREEN_BLOCKED_TITLE, FULLSCREEN_DECLINED_TITLE, FULLSCREEN_OFFER_TITLE,
} from './fullscreenMessage'

/**
 * Where the browser can hide its own bars, this is a one-time question with a
 * button that does it. On an iPhone there is no such button to offer, because
 * Apple does not allow one, so it is a notice instead — what it costs you, what
 * you can do about it, and who decided.
 *
 * Every word of it lives in `fullscreenMessage.tsx`, on purpose: the wording is
 * the owner's, and it must be editable without touching a component.
 */
export function PhoneFullscreenPrompt({ offer }: { offer: FullscreenOffer }) {
  if (offer.kind === 'none' || !offer.asking) return null
  const blocked = offer.kind === 'home-screen'
  return <div className="phone-popup" role="dialog" aria-modal="true" aria-labelledby="phone-fullscreen-title">
    <div className="phone-popup__card">
      <p className={blocked ? 'phone-popup__title' : undefined} id="phone-fullscreen-title">
        {offer.declined ? FULLSCREEN_DECLINED_TITLE
          : blocked ? FULLSCREEN_BLOCKED_TITLE : FULLSCREEN_OFFER_TITLE}
      </p>
      {blocked && !offer.declined && <>
        <FullscreenBlockedIntro />
        <FullscreenBlockedOptions />
        <FullscreenBlockedCase />
      </>}
      <div className="phone-popup__actions">
        <button type="button" onClick={offer.dismiss}>{blocked ? 'Got it' : 'Dismiss'}</button>
        {offer.kind === 'fullscreen' &&
          <button type="button" className="phone-popup__primary" onClick={offer.enter}>⛶ Fullscreen</button>}
      </div>
    </div>
  </div>
}

/** The flight page's toolbar glyph, lit while the page is fullscreen. */
export function PhoneFullscreenButton({ offer }: { offer: FullscreenOffer }) {
  if (offer.kind === 'none') return null
  const label = offer.kind === 'home-screen' ? 'Full screen: blocked by Apple, add to Home Screen'
    : offer.full ? 'Leave fullscreen' : 'Enter fullscreen'
  return <button type="button" className="phone-icon" aria-label={label} title={label}
    aria-pressed={offer.kind === 'fullscreen' ? offer.full : undefined} onClick={offer.toggle}>⛶</button>
}
