import { connectToRoomErrorAction } from '@memebattle/ligretto-shared'
import type { AnyAction } from '../core/actions'

/** A browser cannot read the HTTP status of a failed upgrade, so a refusal accepts the socket and closes it with a code. */
export const refuseSocket = (closeCode: number, reason?: string, action?: AnyAction) => {
  const { 0: client, 1: server } = new WebSocketPair()
  server.accept()
  if (action) {
    server.send(JSON.stringify(action))
  }
  server.close(closeCode, reason)
  return new Response(null, { status: 101, webSocket: client })
}

export const rejectMissingRoom = () => refuseSocket(1000, 'room not found', connectToRoomErrorAction())
