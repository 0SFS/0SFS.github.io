import { createRoot } from 'react-dom/client'
import { parsePairingUrl } from './pairing'
import { createPhoneControllerClient } from './phoneControllerClient'
import { PhoneController } from './PhoneController'
import './phone.css'

export async function createPhoneControllerApp(container: HTMLElement): Promise<{ destroy(): void }> {
  const invitation = parsePairingUrl(window.location.href)
  const cleanUrl = new URL(window.location.href)
  cleanUrl.hash = ''
  // Clear the bearer credential before mounting or initializing networking.
  window.history.replaceState(window.history.state, '', cleanUrl.href)
  const root = createRoot(container)
  if (!invitation) {
    root.render(<main className="phone-app phone-app--empty"><div className="phone-brand"><span className="phone-brand__mark" aria-hidden="true">✈</span><strong>FLIGHT SIM</strong></div><h1>Scan a new QR to connect</h1><p>This controller link is incomplete or has already been cleared. Open <strong>Phone controller</strong> on the computer and scan its QR with your phone camera.</p><p className="phone-empty-hint">Keep both devices on the same non-guest Wi-Fi for the best connection.</p></main>)
    return { destroy: () => root.unmount() }
  }
  // Networking lives outside React effects: exactly one client per app lifetime.
  const client = createPhoneControllerClient(invitation)
  invitation.secret = ''
  root.render(<PhoneController client={client} />)
  return { destroy() { root.unmount(); client.destroy() } }
}
