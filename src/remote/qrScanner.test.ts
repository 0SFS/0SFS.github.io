// @vitest-environment jsdom
import QRCode from 'qrcode'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPairingUrl, parsePairingUrl } from './pairing'
import { CameraError, loadQrDecoder, openRearCamera, scanVideo } from './qrScanner'

const SECRET = 'a'.repeat(43)

/**
 * The QR as the desktop draws it — its library, its error correction, its
 * margin — as the RGBA pixels a camera frame would hold, dropped into a grey
 * frame the size the scanner reads.
 */
function cameraFrame(text: string, { moduleSize = 4, width = 640, height = 480 } = {}) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const margin = 3
  const side = (modules.size + margin * 2) * moduleSize
  const left = Math.floor((width - side) / 2)
  const top = Math.floor((height - side) / 2)
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const row = Math.floor((y - top) / moduleSize) - margin
      const col = Math.floor((x - left) / moduleSize) - margin
      const onCode = x >= left && x < left + side && y >= top && y < top + side
      const dark = onCode && row >= 0 && col >= 0 && row < modules.size && col < modules.size && modules.get(row, col)
      const value = !onCode ? 90 : dark ? 20 : 235
      pixels.set([value, value, value, 255], (y * width + x) * 4)
    }
  }
  return { pixels, width, height }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('reading the desktop pairing QR', () => {
  it.each([
    ['a deployed site', 'https://0sfs.github.io/'],
    ['a laptop on the LAN', 'http://192.168.1.20:5173/'],
    ['a project-site base', 'https://example.github.io/osfs/'],
  ])('reads back what the desktop draws for %s', async (_, base) => {
    const url = createPairingUrl('desktop-1234', SECRET, base)
    const decode = await loadQrDecoder()
    const { pixels, width, height } = cameraFrame(url)

    expect(decode(pixels, width, height)).toBe(url)
    expect(parsePairingUrl(url)).toEqual({ peerId: 'desktop-1234', secret: SECRET })
  })

  it('reads it small in the frame, at two pixels a module', async () => {
    const url = createPairingUrl('desktop-1234', SECRET, 'https://0sfs.github.io/')
    const { pixels, width, height } = cameraFrame(url, { moduleSize: 2 })

    expect((await loadQrDecoder())(pixels, width, height)).toBe(url)
  })

  it('finds nothing in a frame with no QR', async () => {
    const pixels = new Uint8ClampedArray(64 * 48 * 4).fill(128)
    expect((await loadQrDecoder())(pixels, 64, 48)).toBeNull()
  })
})

describe('the scan loop', () => {
  function fakeVideo(width: number, height: number, readyState = 4) {
    return { videoWidth: width, videoHeight: height, readyState, HAVE_CURRENT_DATA: 2 } as unknown as HTMLVideoElement
  }
  function stubCanvas() {
    const drawImage = vi.fn()
    const getImageData = vi.fn((_x: number, _y: number, width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage, getImageData } as never)
    return { drawImage, getImageData }
  }

  it('hands the decoder a frame no more than 640 pixels on a side', () => {
    const { getImageData } = stubCanvas()
    const decode = vi.fn(() => null)
    const stop = scanVideo(fakeVideo(1280, 720), decode, () => true)

    expect(getImageData).toHaveBeenCalledWith(0, 0, 640, 360)
    expect(decode).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), 640, 360)
    stop()
  })

  it('keeps reading past a rejected QR, and stops at the first accepted one', () => {
    vi.useFakeTimers()
    stubCanvas()
    const decode = vi.fn().mockReturnValueOnce(null).mockReturnValueOnce('not ours').mockReturnValue('ours')
    const onText = vi.fn((text: string) => text === 'ours')
    scanVideo(fakeVideo(640, 480), decode, onText)

    vi.advanceTimersByTime(1000)
    expect(onText.mock.calls.map(([text]) => text)).toEqual(['not ours', 'ours'])
    expect(decode).toHaveBeenCalledTimes(3)
  })

  it('waits for the video to have a frame, and stops when told', () => {
    vi.useFakeTimers()
    const { drawImage } = stubCanvas()
    const decode = vi.fn(() => null)
    const stop = scanVideo(fakeVideo(0, 0, 0), decode, () => true)

    vi.advanceTimersByTime(500)
    expect(drawImage).not.toHaveBeenCalled()
    stop()
    vi.advanceTimersByTime(500)
    expect(decode).not.toHaveBeenCalled()
  })
})

describe('opening the camera', () => {
  it('asks for the rear camera and no microphone', async () => {
    const stream = {} as MediaStream
    const getUserMedia = vi.fn(async () => stream)
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

    await expect(openRearCamera()).resolves.toBe(stream)
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
      audio: false, video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
    }))
  })

  it.each([
    ['NotAllowedError', 'denied'],
    ['NotFoundError', 'missing'],
    ['NotReadableError', 'busy'],
    ['TypeError', 'failed'],
  ])('reports %s as %s', async (name, problem) => {
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => { throw new DOMException('no', name) } } })

    await expect(openRearCamera()).rejects.toMatchObject({ problem })
  })

  it('does not ask on a page that is not secure, where browsers refuse it', async () => {
    const getUserMedia = vi.fn()
    vi.stubGlobal('isSecureContext', false)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

    await expect(openRearCamera()).rejects.toEqual(new CameraError('insecure'))
    expect(getUserMedia).not.toHaveBeenCalled()
  })
})
