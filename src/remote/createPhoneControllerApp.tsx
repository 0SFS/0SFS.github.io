import { createRoot } from 'react-dom/client'
import { parsePairingUrl } from './pairing'
import { createPhoneControllerClient, type PhoneControllerClient } from './phoneControllerClient'
import { PhoneController } from './PhoneController'
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
  const connect = (next: ReturnType<typeof parsePairingUrl>) => {
    client?.destroy()
    client = null
    if (!next) {
      root.render(<main className="phone-app phone-app--empty"><div className="phone-brand"><span className="phone-brand__mark" aria-hidden="true">✈</span><strong>OSFS</strong></div><h1>Scan a new QR to connect</h1><p>This controller link is incomplete or has already been cleared. Open <strong>Phone controller</strong> on the computer and scan its QR with your phone camera.</p><p className="phone-empty-hint">Keep both devices on the same non-guest Wi-Fi for the best connection.</p></main>)
      return
    }
    // Networking stays outside React effects: one live client per invitation.
    try {
      client = createPhoneControllerClient(next)
    } finally {
      next.secret = ''
    }
    // Reset touch component state when the same browser tab scans another QR.
    root.render(<PhoneController key={++generation} client={client} />)
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
