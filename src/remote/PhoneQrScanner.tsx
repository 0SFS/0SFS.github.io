import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { parsePairingUrl } from './pairing'
import {
  CameraError, closeCamera, loadQrDecoder, openRearCamera, scanVideo, type CameraProblem,
} from './qrScanner'

const PROBLEMS: Record<CameraProblem, string> = {
  insecure: 'The browser opens the camera only on a secure (https) page, and this one is not. Scan the QR with the Camera app instead.',
  unsupported: 'This browser cannot open the camera from a page. Scan the QR with the Camera app instead.',
  denied: 'Camera access was not allowed. Allow the camera for this page, then try again.',
  missing: 'No camera was found.',
  busy: 'The camera is in use by another app. Close it, then try again.',
  failed: 'The camera could not start.',
}
/** Nothing on this page can change these two. */
const FINAL = new Set<CameraProblem>(['insecure', 'unsupported'])

/**
 * The camera, full screen, until it sees the computer's pairing QR. Only a
 * controller link is accepted — anything else says so and keeps looking — and
 * the camera is off the moment one is found, or the scanner closes.
 *
 * This is how a Home Screen controller pairs: iOS opens a link from the Camera
 * app in Safari, never in the installed app, so the app reads the QR itself.
 */
export function PhoneQrScanner({ onScan, onClose }: { onScan(url: string): void; onClose(): void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [problem, setProblem] = useState<CameraProblem | null>(null)
  const [live, setLive] = useState(false)
  const [foreign, setForeign] = useState(false)
  const [read, setRead] = useState(false)
  const handOver = useEffectEvent((url: string) => onScan(url))
  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null
    let stopScan = (): void => {}
    const stop = (): void => {
      stopScan()
      if (stream) closeCamera(stream)
      stream = null
    }
    void (async () => {
      try {
        const [media, decode] = await Promise.all([openRearCamera(), loadQrDecoder()])
        if (cancelled) { closeCamera(media); return }
        stream = media
        const element = video.current!
        element.srcObject = media
        await element.play()
        if (cancelled) return
        setLive(true)
        stopScan = scanVideo(element, decode, text => {
          if (!parsePairingUrl(text)) { setForeign(true); return false }
          stop()
          setRead(true)
          handOver(text)
          return true
        })
      } catch (error) {
        stop()
        if (!cancelled) setProblem(error instanceof CameraError ? error.problem : 'failed')
      }
    })()
    return () => { cancelled = true; stop() }
  }, [attempt])
  const retry = (): void => {
    setProblem(null)
    setLive(false)
    setAttempt(value => value + 1)
  }
  const status = problem ? PROBLEMS[problem]
    : read ? 'Found it. Connecting…'
      : foreign ? 'That QR is not an OSFS controller link. Scan the one in the Remote Control tab on the computer.'
        : live ? 'Point the camera at the QR on the computer.' : 'Starting the camera…'
  return <div className="phone-scanner" role="dialog" aria-modal="true" aria-labelledby="phone-scanner-title">
    <video ref={video} className="phone-scanner__video" playsInline muted aria-hidden="true" />
    {!problem && <div className="phone-scanner__frame" aria-hidden="true" />}
    <div className="phone-scanner__panel">
      <p className="phone-scanner__title" id="phone-scanner-title">Scan the computer’s QR</p>
      <p className="phone-scanner__status" role="status">{status}</p>
      <div className="phone-scanner__actions">
        <button type="button" onClick={onClose}>Cancel</button>
        {problem && !FINAL.has(problem) && <button type="button" className="phone-scanner__primary" onClick={retry}>Try again</button>}
      </div>
    </div>
  </div>
}
