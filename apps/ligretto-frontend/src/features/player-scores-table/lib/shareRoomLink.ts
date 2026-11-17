export type ShareRoomLinkResult = 'shared' | 'copied' | 'cancelled' | 'failed'

const isDomError = (error: unknown, name: string) => error instanceof DOMException && error.name === name

const copyRoomLink = async (url: string): Promise<ShareRoomLinkResult> => {
  if (!navigator.clipboard?.writeText) {
    return 'failed'
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}

/** Called right from the click handler: the browser rejects sharing without transient user activation. */
export const shareRoomLink = async (url: string): Promise<ShareRoomLinkResult> => {
  const data: ShareData = { url }

  if (typeof navigator.share !== 'function' || navigator.canShare?.(data) === false) {
    return copyRoomLink(url)
  }

  try {
    await navigator.share(data)
    return 'shared'
  } catch (error) {
    // The Web Share API reports a dismissed dialog and a device without share targets alike, as AbortError.
    if (isDomError(error, 'AbortError')) {
      return 'cancelled'
    }
    if (isDomError(error, 'NotAllowedError')) {
      return copyRoomLink(url)
    }
    return 'failed'
  }
}
