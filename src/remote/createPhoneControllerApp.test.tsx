// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://0sfs.github.io/"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ render: vi.fn(), unmount: vi.fn(), createClient: vi.fn(), destroyClient: vi.fn() }))
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: mocks.render, unmount: mocks.unmount }) }))
vi.mock('./phoneControllerClient', () => ({ createPhoneControllerClient: mocks.createClient }))
vi.mock('./PhoneController', () => ({ PhoneController: () => null }))
import { createPhoneControllerApp } from './createPhoneControllerApp'
const secret = 'a'.repeat(43)
const apps: Awaited<ReturnType<typeof createPhoneControllerApp>>[] = []
async function mount() {
  const app = await createPhoneControllerApp(document.getElementById('root')!)
  apps.push(app)
  return app
}
function invitationHash(peer = 'desktop', token = secret) { return `#v=1&peer=${peer}&join=${token}` }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.createClient.mockImplementation(() => ({ destroy: mocks.destroyClient }))
  window.history.replaceState(null, '', '/?mode=remote')
  document.body.innerHTML = '<div id="root"></div>'
})
afterEach(() => { apps.splice(0).forEach(app => app.destroy()); document.body.replaceChildren() })
describe('phone controller application', () => {
  it('clears the URL credential before creating exactly one client and disposes both resources', async () => {
    window.history.replaceState({ keep: true }, '', `/?mode=remote#v=1&peer=desktop&join=${secret}`)
    mocks.createClient.mockImplementation((invitation: { peerId: string; secret: string }) => {
      expect(window.location.hash).toBe('')
      expect(window.history.state).toEqual({ keep: true })
      expect(invitation).toEqual({ peerId: 'desktop', secret })
      return { destroy: mocks.destroyClient }
    })
    const app = await mount()
    expect(mocks.createClient).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/')
    expect(window.location.search).toBe('?mode=remote')
    expect(mocks.createClient.mock.calls[0][0].secret).toBe('')
    expect(mocks.render).toHaveBeenCalledOnce()
    app.destroy()
    expect(mocks.unmount).toHaveBeenCalledOnce()
    expect(mocks.destroyClient).toHaveBeenCalledOnce()
  })
  it('shows recovery instructions and avoids networking for invalid or refreshed links', async () => {
    for (const hash of ['', '#v=1&peer=desktop&join=invalid']) {
      window.history.replaceState(null, '', `/?mode=remote${hash}`)
      const app = await mount()
      expect(window.location.hash).toBe('')
      expect(mocks.createClient).not.toHaveBeenCalled()
      expect(mocks.render.mock.calls.at(-1)![0].props.className).toContain('phone-app--empty')
      app.destroy()
    }
    expect(mocks.destroyClient).not.toHaveBeenCalled()
    expect(mocks.unmount).toHaveBeenCalledTimes(2)
  })

  it('consumes a scanned invitation from an already open recovery page without a full navigation', async () => {
    await mount()
    expect(mocks.createClient).not.toHaveBeenCalled()
    mocks.createClient.mockImplementation((invitation: { peerId: string; secret: string }) => {
      expect(window.location.hash).toBe('')
      expect(invitation).toEqual({ peerId: 'desktop', secret })
      return { destroy: mocks.destroyClient }
    })
    window.location.hash = invitationHash()
    await vi.waitFor(() => expect(mocks.createClient).toHaveBeenCalledOnce())
    expect(mocks.render.mock.calls.at(-1)![0].props.client).toBe(mocks.createClient.mock.results[0].value)
    expect(mocks.createClient.mock.calls[0][0].secret).toBe('')
    expect(window.location.href).toBe('https://0sfs.github.io/?mode=remote')
  })

  it('destroys the previous client before pairing a fresh QR and remounts touch state', async () => {
    const first = { destroy: vi.fn() }
    const second = { destroy: vi.fn() }
    mocks.createClient.mockReturnValueOnce(first).mockReturnValueOnce(second)
    window.history.replaceState({ preserve: 'state' }, '', `/?mode=remote${invitationHash()}`)
    const app = await mount()
    const firstKey = mocks.render.mock.calls.at(-1)![0].key
    window.location.hash = invitationHash('other-desktop', 'b'.repeat(43))
    const navigatedHistoryState = window.history.state
    await vi.waitFor(() => expect(mocks.createClient).toHaveBeenCalledTimes(2))
    expect(first.destroy).toHaveBeenCalledOnce()
    expect(first.destroy.mock.invocationCallOrder[0]).toBeLessThan(mocks.createClient.mock.invocationCallOrder[1])
    expect(second.destroy).not.toHaveBeenCalled()
    expect(mocks.render.mock.calls.at(-1)![0].props.client).toBe(second)
    expect(mocks.render.mock.calls.at(-1)![0].key).not.toBe(firstKey)
    expect(mocks.createClient.mock.calls[1][0]).toEqual({ peerId: 'other-desktop', secret: '' })
    expect(window.history.state).toEqual(navigatedHistoryState)
    app.destroy()
    app.destroy()
    expect(first.destroy).toHaveBeenCalledOnce()
    expect(second.destroy).toHaveBeenCalledOnce()
    expect(mocks.unmount).toHaveBeenCalledOnce()
  })

  it('does not replay stale queued hashchange events after the current fragment is consumed', async () => {
    await mount()
    window.location.hash = invitationHash('older-desktop')
    window.location.hash = invitationHash('latest-desktop', 'c'.repeat(43))
    await vi.waitFor(() => expect(mocks.createClient).toHaveBeenCalledOnce())
    window.dispatchEvent(new HashChangeEvent('hashchange', { newURL: `https://0sfs.github.io/?mode=remote${invitationHash('older-desktop')}` }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mocks.createClient).toHaveBeenCalledOnce()
    expect(mocks.createClient.mock.calls[0][0]).toEqual({ peerId: 'latest-desktop', secret: '' })
    expect(mocks.destroyClient).not.toHaveBeenCalled()
  })

  it('clears invalid new fragments, closes the old client, and can recover with the next valid scan', async () => {
    window.history.replaceState(null, '', `/?mode=remote${invitationHash()}`)
    await mount()
    window.location.hash = invitationHash('desktop', 'invalid')
    await vi.waitFor(() => expect(mocks.destroyClient).toHaveBeenCalledOnce())
    expect(window.location.hash).toBe('')
    expect(mocks.createClient).toHaveBeenCalledOnce()
    expect(mocks.render.mock.calls.at(-1)![0].props.className).toContain('phone-app--empty')
    window.location.hash = invitationHash('new-desktop')
    await vi.waitFor(() => expect(mocks.createClient).toHaveBeenCalledTimes(2))
    expect(mocks.destroyClient).toHaveBeenCalledOnce()
    expect(window.location.hash).toBe('')
  })

  it('detaches hash navigation on destroy, including events queued before destruction', async () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const app = await mount()
    window.location.hash = invitationHash()
    app.destroy()
    await new Promise(resolve => setTimeout(resolve, 0))
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(remove).toHaveBeenCalledWith('hashchange', expect.any(Function))
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.render).toHaveBeenCalledOnce()
    expect(mocks.unmount).toHaveBeenCalledOnce()
    remove.mockRestore()
  })
})
