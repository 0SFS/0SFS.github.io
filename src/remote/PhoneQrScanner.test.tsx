// @vitest-environment jsdom
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ decode: vi.fn() }))
vi.mock('jsqr', () => ({ default: mocks.decode }))
import { PhoneQrScanner } from './PhoneQrScanner'

const PAIRING = `https://0sfs.github.io/rc/#v=1&peer=desktop&join=${'a'.repeat(43)}`
let root: Root
let container: HTMLDivElement
let trackStop: ReturnType<typeof vi.fn>
let getUserMedia: ReturnType<typeof vi.fn>
const onScan = vi.fn()
const onClose = vi.fn()

const status = () => container.querySelector('[role="status"]')?.textContent ?? ''
const button = (label: string) => [...container.querySelectorAll('button')].find(candidate => candidate.textContent === label)
const render = () => root.render(<PhoneQrScanner onScan={onScan} onClose={onClose} />)
const camera = () => ({ getTracks: () => [{ stop: trackStop }] }) as unknown as MediaStream

beforeEach(() => {
  trackStop = vi.fn()
  getUserMedia = vi.fn(async () => camera())
  onScan.mockReset()
  onClose.mockReset()
  mocks.decode.mockReset().mockReturnValue(null)
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  Object.defineProperties(HTMLMediaElement.prototype, {
    play: { configurable: true, value: vi.fn(async () => {}) },
    readyState: { configurable: true, get: () => 4 },
  })
  Object.defineProperties(HTMLVideoElement.prototype, {
    videoWidth: { configurable: true, get: () => 1280 },
    videoHeight: { configurable: true, get: () => 720 },
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: () => {},
    getImageData: (_x: number, _y: number, width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
  } as never)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  root.unmount()
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'mediaDevices')
  for (const name of ['play', 'readyState']) Reflect.deleteProperty(HTMLMediaElement.prototype, name)
  for (const name of ['videoWidth', 'videoHeight']) Reflect.deleteProperty(HTMLVideoElement.prototype, name)
})

describe('phone QR scanner', () => {
  it('opens the rear camera, plays it inline and silent, and says what to do', async () => {
    render()
    await vi.waitFor(() => expect(status()).toBe('Point the camera at the QR on the computer.'))

    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }))
    const video = container.querySelector('video')!
    // iOS takes a video full screen in its own player unless it plays inline.
    expect(video.hasAttribute('playsinline')).toBe(true)
    expect(video.muted).toBe(true)
  })

  it('hands over the first controller link it sees, once, and turns the camera off', async () => {
    mocks.decode.mockReturnValue({ data: PAIRING })
    render()

    await vi.waitFor(() => expect(onScan).toHaveBeenCalledWith(PAIRING))
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(onScan).toHaveBeenCalledOnce()
    expect(trackStop).toHaveBeenCalled()
    await vi.waitFor(() => expect(status()).toBe('Found it. Connecting…'))
  })

  it('says so when a QR is not a controller link, and keeps looking', async () => {
    mocks.decode.mockReturnValueOnce({ data: 'https://example.com/menu' }).mockReturnValue({ data: PAIRING })
    render()

    await vi.waitFor(() => expect(status()).toContain('not an OSFS controller link'))
    await vi.waitFor(() => expect(onScan).toHaveBeenCalledWith(PAIRING))
  })

  it('explains a refused camera and asks again on Try again', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'))
    render()
    await vi.waitFor(() => expect(status()).toContain('Camera access was not allowed'))

    button('Try again')!.click()
    await vi.waitFor(() => expect(status()).toBe('Point the camera at the QR on the computer.'))
    expect(getUserMedia).toHaveBeenCalledTimes(2)
  })

  it('does not ask for the camera on a page that is not secure, and offers no retry', async () => {
    vi.stubGlobal('isSecureContext', false)
    render()

    await vi.waitFor(() => expect(status()).toContain('secure (https)'))
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(button('Try again')).toBeUndefined()
  })

  it('turns off a camera that arrives after the scanner was closed', async () => {
    let grant!: (stream: MediaStream) => void
    getUserMedia.mockReturnValueOnce(new Promise<MediaStream>(resolve => { grant = resolve }))
    render()
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalled())

    root.unmount()
    grant(camera())
    await vi.waitFor(() => expect(trackStop).toHaveBeenCalled())
    root = createRoot(container)
  })

  it('closes on Cancel, and the camera goes off with it', async () => {
    render()
    await vi.waitFor(() => expect(status()).toBe('Point the camera at the QR on the computer.'))

    button('Cancel')!.click()
    expect(onClose).toHaveBeenCalledOnce()
    root.unmount()
    expect(trackStop).toHaveBeenCalled()
    root = createRoot(container)
  })
})
