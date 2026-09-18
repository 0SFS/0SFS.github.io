import { useState } from 'react'
import { PhoneQrScanner } from './PhoneQrScanner'

/**
 * The controller with no invitation: a reload after pairing, a link that was
 * cut short, or — every time — a controller opened from its Home Screen icon.
 * An invitation pairs once, so the way forward is a new QR, read right here.
 */
export function PhoneUnpaired({ onPair }: { onPair(url: string): void }) {
  const [scanning, setScanning] = useState(false)
  return <main className="phone-app phone-app--empty">
    <div className="phone-brand"><span className="phone-brand__mark" aria-hidden="true">✈</span><strong>OSFS</strong></div>
    <h1>Scan a new QR to connect</h1>
    <p>Each QR pairs once, so this controller needs a new one. Open the <strong>Remote Control</strong> tab on the computer and scan its QR.</p>
    <button type="button" className="phone-empty-scan" onClick={() => setScanning(true)}>Scan QR code</button>
    <p className="phone-empty-hint">Keep both devices on the same non-guest Wi-Fi for the best connection.</p>
    {scanning && <PhoneQrScanner onScan={onPair} onClose={() => setScanning(false)} />}
  </main>
}
