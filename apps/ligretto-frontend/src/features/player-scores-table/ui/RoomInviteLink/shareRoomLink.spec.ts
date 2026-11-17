// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { shareRoomLink } from './shareRoomLink'

const URL = 'https://ligretto.app/game/room-1'

const mockNavigator = (apis: { share?: unknown; canShare?: unknown; clipboard?: unknown }) => {
  for (const [key, value] of Object.entries(apis)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true })
  }
}

describe('shareRoomLink', () => {
  afterEach(() => {
    for (const key of ['share', 'canShare', 'clipboard']) {
      Reflect.deleteProperty(navigator, key)
    }
  })

  it('shares the link natively when the browser can share it, without copying', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const canShare = vi.fn().mockReturnValue(true)
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockNavigator({ share, canShare, clipboard: { writeText } })

    await expect(shareRoomLink(URL)).resolves.toBe('shared')
    expect(canShare).toHaveBeenCalledWith({ url: URL })
    expect(share).toHaveBeenCalledWith({ url: URL })
    expect(writeText).not.toHaveBeenCalled()
  })

  it('shares natively when the browser has no canShare check', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    mockNavigator({ share })

    await expect(shareRoomLink(URL)).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({ url: URL })
  })

  it('copies the link when sharing is unsupported', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockNavigator({ clipboard: { writeText } })

    await expect(shareRoomLink(URL)).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith(URL)
  })

  it('copies the link without sharing when the browser cannot share it', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockNavigator({ share, canShare: vi.fn().mockReturnValue(false), clipboard: { writeText } })

    await expect(shareRoomLink(URL)).resolves.toBe('copied')
    expect(share).not.toHaveBeenCalled()
    expect(writeText).toHaveBeenCalledWith(URL)
  })

  it('copies the link when sharing is not permitted', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockNavigator({ share: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')), clipboard: { writeText } })

    await expect(shareRoomLink(URL)).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith(URL)
  })

  it('reports a dismissed share dialog as cancelled, without copying', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockNavigator({ share: vi.fn().mockRejectedValue(new DOMException('Canceled', 'AbortError')), clipboard: { writeText } })

    await expect(shareRoomLink(URL)).resolves.toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('fails without copying when sharing fails unexpectedly', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockNavigator({ share: vi.fn().mockRejectedValue(new TypeError('Invalid data')), clipboard: { writeText } })

    await expect(shareRoomLink(URL)).resolves.toBe('failed')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('fails when there is no clipboard to copy into', async () => {
    mockNavigator({})

    await expect(shareRoomLink(URL)).resolves.toBe('failed')
  })

  it('fails when the clipboard rejects the link', async () => {
    mockNavigator({ clipboard: { writeText: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')) } })

    await expect(shareRoomLink(URL)).resolves.toBe('failed')
  })
})
