import { useCallback, useEffect, useState } from 'react'
import {
  canRequestFullscreen, enterFullscreen, isFullscreen, isStandaloneDisplay, onFullscreenChange,
  prefersHomeScreenInstall, readFullscreenEveryVisit, readFullscreenPromptDismissed, toggleFullscreen,
  writeFullscreenPromptDismissed,
} from '../fullscreen/fullscreen'

/**
 * Fullscreen on the controller: a popup that asks once, and a ⛶ button in the
 * chip grid for every time after that.
 *
 * Three constraints shape this, all of them from `src/fullscreen/fullscreen.ts`:
 * browsers grant fullscreen only inside a tap, so both are buttons and never an
 * effect; iPhone Safari has no page fullscreen at all, so there is nothing to
 * offer there but Add to Home Screen; and a controller that asks again every
 * time you pick the phone up is worse than the bars it is offering to hide, so
 * a dismissal is remembered the way the flight page remembers its own choice.
 *
 * The iPhone popup is asked deliberately, and once. What makes "add this to
 * your Home Screen" an app-install interstitial is not that it is said, it is
 * being told to install something with no reason given and no way to check the
 * claim — so the reason is in the popup, the technical case and who decided it
 * are one tap away inside it, and the cost of ignoring it is stated plainly.
 *
 * The flight page's own `offerFullscreen` cannot be reused: it renders into
 * `GameLog`, which is flight-only and does not exist on `/rc/`.
 */
export interface FullscreenOffer {
  /** What this browser can be offered. None of it changes without a reload. */
  kind: 'none' | 'fullscreen' | 'home-screen'
  full: boolean
  /** The popup is up. */
  asking: boolean
  declined: boolean
  /** The popup's Fullscreen button. */
  enter(): void
  /** The popup's Dismiss button: answered, here and on every later visit. */
  dismiss(): void
  /** The grid button: in or out of fullscreen, or the Home Screen steps where there is no fullscreen. */
  toggle(): void
}

export function useFullscreenOffer(): FullscreenOffer {
  const [kind] = useState<FullscreenOffer['kind']>(() => {
    if (isStandaloneDisplay()) return 'none'
    if (canRequestFullscreen()) return 'fullscreen'
    return prefersHomeScreenInstall() ? 'home-screen' : 'none'
  })
  const [full, setFull] = useState(isFullscreen)
  const [declined, setDeclined] = useState(false)
  // Someone who already asked for fullscreen every visit has answered the
  // question; their first tap is taken as the gesture instead.
  const [asking, setAsking] = useState(() => kind !== 'none' && !readFullscreenPromptDismissed()
    && !isFullscreen() && !(kind === 'fullscreen' && readFullscreenEveryVisit()))
  useEffect(() => onFullscreenChange(() => setFull(isFullscreen())), [])
  useEffect(() => {
    if (kind !== 'fullscreen' || !readFullscreenEveryVisit()) return
    const onGesture = (): void => {
      window.removeEventListener('pointerup', onGesture, true)
      if (!isFullscreen()) void enterFullscreen().catch(() => { setDeclined(true); setAsking(true) })
    }
    window.addEventListener('pointerup', onGesture, true)
    return () => window.removeEventListener('pointerup', onGesture, true)
  }, [kind])
  // A popup already answered this visit does not come back when fullscreen ends.
  const enter = useCallback(() => {
    setDeclined(false)
    setAsking(false)
    void enterFullscreen().catch(() => { setDeclined(true); setAsking(true) })
  }, [])
  const dismiss = useCallback(() => {
    setAsking(false)
    writeFullscreenPromptDismissed(true)
  }, [])
  const toggle = useCallback(() => {
    if (kind === 'home-screen') { setAsking(true); return }
    setDeclined(false)
    void toggleFullscreen().catch(() => { setDeclined(true); setAsking(true) })
  }, [kind])
  return { kind, full, asking: asking && !full, declined, enter, dismiss, toggle }
}
