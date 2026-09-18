import { createRoot } from 'react-dom/client'
import { isAppPath } from '../appRoute'
import { parsePairingUrl } from './pairing'
import { createPhoneControllerClient, type PhoneControllerClient } from './phoneControllerClient'
import { PhoneController } from './PhoneController'
import { PhoneUnpaired } from './PhoneUnpaired'
import './phone.css'

export async function createPhoneControllerApp(container: HTMLElement): Promise<{ destroy(): void }> {
  const consumeInvitation = () => {
    const invitation = parsePairingUrl(window.location.href)
    const cleanUrl = new URL(window.location.href)
    cleanUrl.hash = ''
    // Clear the bearer credential before mounting or initializing networking.
    window.history.replaceState(window.history.state, '', cleanUrl.href)
    return invitation
  }
  const invitation = consumeInvitation()
  const root = createRoot(container)
  let client: PhoneControllerClient | null = null
  let generation = 0
  let disposed = false
  /**
   * A QR read by the page's own scanner. One for this page pairs here, and its
   * credential never touches the address bar. One for another copy of the site
   * loads that copy, as the Camera app would, so the phone runs the code the
   * computer that showed it runs.
   */
  const pair = (url: string) => {
    if (disposed) return
    const scanned = new URL(url)
    if (scanned.origin === window.location.origin && isAppPath(scanned.pathname, 'rc')) connect(parsePairingUrl(url))
    else window.location.assign(url)
  }
  const connect = (next: ReturnType<typeof parsePairingUrl>) => {
    client?.destroy()
    client = null
    if (!next) {
      root.render(<PhoneUnpaired onPair={pair} />)
      return
    }
    // Networking stays outside React effects: one live client per invitation.
    try {
      client = createPhoneControllerClient(next)
    } finally {
      next.secret = ''
    }
    // Reset touch component state when the same browser tab scans another QR.
    root.render(<PhoneController key={++generation} client={client} onPair={pair} />)
  }
  const onHashChange = () => {
    // replaceState does not emit hashchange. Ignore empty/stale queued events
    // after consumption instead of interrupting the newly paired client.
    if (disposed || !window.location.hash) return
    connect(consumeInvitation())
  }
  connect(invitation)
  window.addEventListener('hashchange', onHashChange)
  return { destroy() {
    if (disposed) return
    disposed = true
    window.removeEventListener('hashchange', onHashChange)
    root.unmount()
    client?.destroy()
    client = null
  } }
}
