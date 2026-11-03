const PING = 'ping'
const PONG = 'pong'
const HEARTBEAT_INTERVAL_MS = 20_000
/** Two missed answers and a slow third. The server gives up on a silent socket after the same time. */
const SILENCE_TIMEOUT_MS = 45_000
const RETRY_DELAY_MS = 2_000
const MAX_RETRIES = 3

interface GameplaySocketOptions {
  baseUrl: string
  getAccessToken: () => string
  onOpen: () => void
  onMessage: (data: unknown) => void
}

/**
 * One socket at a time to one endpoint of the gameplay server, reopened up to `MAX_RETRIES` times in a row, after which
 * it stays down until `connect` or `resume` is called. The token is read again for every attempt, so a refused one is
 * replaced if it is refreshed before the retries run out; it is in the query string because a browser's WebSocket
 * cannot set headers. A message sent while the socket is not open waits for it, and a switch of endpoint drops what is
 * waiting, since it was meant for the old one.
 */
export const createGameplaySocket = ({ baseUrl, getAccessToken, onOpen, onMessage }: GameplaySocketOptions) => {
  let socket: WebSocket | undefined
  let path: string | undefined
  let waiting: string[] = []
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retries = 0
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let lastHeardAt = 0

  const clearTimers = () => {
    clearTimeout(retryTimer)
    clearInterval(heartbeatTimer)
    retryTimer = undefined
    heartbeatTimer = undefined
  }

  const closeCurrent = () => {
    const current = socket
    socket = undefined
    clearTimers()
    if (current) {
      current.onopen = current.onmessage = current.onclose = null
      current.close(1000)
    }
  }

  const isDown = () => socket === undefined && retryTimer === undefined

  const scheduleRetry = () => {
    if (retries >= MAX_RETRIES) {
      return
    }
    retries++
    retryTimer = setTimeout(open, RETRY_DELAY_MS)
  }

  /** A connection that silently died answers nothing and may never report a close, so it is abandoned here. */
  const startHeartbeat = (current: WebSocket) => {
    lastHeardAt = Date.now()
    heartbeatTimer = setInterval(() => {
      if (Date.now() - lastHeardAt > SILENCE_TIMEOUT_MS) {
        closeCurrent()
        scheduleRetry()
      } else {
        current.send(PING)
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  function open() {
    clearTimers()
    const current = new WebSocket(`${baseUrl}${path}?token=${encodeURIComponent(getAccessToken())}`)
    socket = current

    current.onopen = () => {
      startHeartbeat(current)
      for (const message of waiting) {
        current.send(message)
      }
      waiting = []
      onOpen()
    }

    // Not on open: the server refuses a socket by accepting it and closing it at once, before saying anything.
    current.onmessage = event => {
      lastHeardAt = Date.now()
      retries = 0
      if (event.data !== PONG) {
        onMessage(JSON.parse(event.data))
      }
    }

    current.onclose = () => {
      socket = undefined
      clearTimers()
      scheduleRetry()
    }
  }

  return {
    connect: (nextPath: string) => {
      if (nextPath === path && !isDown()) {
        return
      }
      closeCurrent()
      path = nextPath
      waiting = []
      retries = 0
      open()
    },

    send: (action: unknown) => {
      const message = JSON.stringify(action)
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(message)
      } else {
        waiting.push(message)
      }
    },

    /** For the browser coming back online: the retries start over, and a socket that gave up opens again. */
    resume: () => {
      retries = 0
      if (path !== undefined && isDown()) {
        open()
      }
    },

    /** Only `connect` opens a socket again. */
    stop: () => {
      closeCurrent()
      path = undefined
      waiting = []
    },
  }
}
