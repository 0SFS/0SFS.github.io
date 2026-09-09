// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://felipegalind0.io/flight-sim/"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ render: vi.fn(), unmount: vi.fn(), createClient: vi.fn(), destroyClient: vi.fn() }))
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: mocks.render, unmount: mocks.unmount }) }))
vi.mock('./phoneControllerClient', () => ({ createPhoneControllerClient: mocks.createClient }))
vi.mock('./PhoneController', () => ({ PhoneController: () => null }))
import { createPhoneControllerApp } from './createPhoneControllerApp'
const secret = 'a'.repeat(43)
beforeEach(() => { vi.clearAllMocks(); document.body.innerHTML = '<div id="root"></div>' })
afterEach(() => { document.body.replaceChildren() })
describe('phone controller application', () => {
  it('clears the URL credential before creating exactly one client and disposes both resources', async () => {
    window.history.replaceState({ keep: true }, '', `/flight-sim/?mode=remote#v=1&peer=desktop&join=${secret}`)
    mocks.createClient.mockImplementation((invitation: { peerId: string; secret: string }) => {
      expect(window.location.hash).toBe('')
      expect(window.history.state).toEqual({ keep: true })
      expect(invitation).toEqual({ peerId: 'desktop', secret })
      return { destroy: mocks.destroyClient }
    })
    const app = await createPhoneControllerApp(document.getElementById('root')!)
    expect(mocks.createClient).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/flight-sim/')
    expect(window.location.search).toBe('?mode=remote')
    expect(mocks.createClient.mock.calls[0][0].secret).toBe('')
    expect(mocks.render).toHaveBeenCalledOnce()
    app.destroy()
    expect(mocks.unmount).toHaveBeenCalledOnce()
    expect(mocks.destroyClient).toHaveBeenCalledOnce()
  })
  it('shows recovery instructions and avoids networking for invalid or refreshed links', async () => {
    for (const hash of ['', '#v=1&peer=desktop&join=invalid']) {
      window.history.replaceState(null, '', `/flight-sim/?mode=remote${hash}`)
      const app = await createPhoneControllerApp(document.getElementById('root')!)
      expect(window.location.hash).toBe('')
      expect(mocks.createClient).not.toHaveBeenCalled()
      expect(mocks.render.mock.calls.at(-1)![0].props.className).toContain('phone-app--empty')
      app.destroy()
    }
    expect(mocks.destroyClient).not.toHaveBeenCalled()
    expect(mocks.unmount).toHaveBeenCalledTimes(2)
  })
})
