/**
 * The camera and the decoder behind the controller's QR scanner, without any UI.
 *
 * A Home Screen controller needs this: the invitation arrives in the QR link's
 * hash, and iOS opens a link scanned by the Camera app in Safari, never in a
 * Home Screen app. So the installed controller reads the QR itself.
 *
 * The decoder is jsQR, loaded only when a scan starts. iPhone Safari has no
 * `BarcodeDetector`, and one decoder everywhere is one thing to test.
 */

/** Hands the decoder at most this many pixels on a side: enough for a QR a laptop shows, fast enough on a phone. */
const FRAME_SIZE = 640
const FRAME_INTERVAL_MS = 120

export type QrDecoder = (pixels: Uint8ClampedArray, width: number, height: number) => string | null

export type CameraProblem = 'insecure' | 'unsupported' | 'denied' | 'missing' | 'busy' | 'failed'

export class CameraError extends Error {
  readonly problem: CameraProblem
  constructor(problem: CameraProblem) {
    super(`Camera unavailable: ${problem}`)
    this.problem = problem
  }
}

function problemFrom(error: unknown): CameraProblem {
  const name = (error as { name?: unknown } | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing'
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy'
  return 'failed'
}

/** The rear camera where there is one. Browsers open a camera only on a secure page. */
export async function openRearCamera(): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraError('insecure')
  const devices = navigator.mediaDevices
  if (!devices?.getUserMedia) throw new CameraError('unsupported')
  try {
    return await devices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    })
  } catch (error) {
    throw new CameraError(problemFrom(error))
  }
}

export function closeCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop()
}

export async function loadQrDecoder(): Promise<QrDecoder> {
  const { default: jsQR } = await import('jsqr')
  // The desktop draws its QR dark on light, so the inverted pass would only cost time.
  return (pixels, width, height) => jsQR(pixels, width, height, { inversionAttempts: 'dontInvert' })?.data ?? null
}

/**
 * Decodes frames from a playing video until `onText` accepts one. Returns a
 * function that stops it.
 */
export function scanVideo(video: HTMLVideoElement, decode: QrDecoder, onText: (text: string) => boolean): () => void {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  let stopped = false
  let timer = 0
  const frame = (): void => {
    if (stopped) return
    const { videoWidth, videoHeight } = video
    if (context && video.readyState >= video.HAVE_CURRENT_DATA && videoWidth > 0 && videoHeight > 0) {
      const scale = Math.min(1, FRAME_SIZE / Math.max(videoWidth, videoHeight))
      const width = Math.round(videoWidth * scale)
      const height = Math.round(videoHeight * scale)
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      context.drawImage(video, 0, 0, width, height)
      const text = decode(context.getImageData(0, 0, width, height).data, width, height)
      if (text !== null && onText(text)) {
        stopped = true
        return
      }
    }
    timer = window.setTimeout(frame, FRAME_INTERVAL_MS)
  }
  frame()
  return () => {
    stopped = true
    window.clearTimeout(timer)
  }
}
