import type { TypedStartListening, ListenerEffectAPI, Dispatch } from '@reduxjs/toolkit'
import { connectToRoomSuccessAction, userJoinToRoomAction } from '@memebattle/ligretto-shared'

import { describeFailure, getUsersByIds } from '#shared/api'

import { addUsers } from './usersActions'
import type { All } from '#types/store'

async function getUsersByIdsEffect(ids: string[], listenerApi: ListenerEffectAPI<All, Dispatch>) {
  // The route takes 1 to 100 ids.
  if (ids.length === 0) {
    return
  }
  // The socket connects only after the first getMeSuccess, so a room event always finds a token.
  const result = await getUsersByIds(ids, listenerApi.getState().auth.accessToken)
  if (result.kind !== 'success') {
    // The players keep the fallback label and avatar.
    console.error('GET /api/users failed', describeFailure(result))
    return
  }
  listenerApi.dispatch(addUsers(result.data))
}

export function addListeners(startListener: TypedStartListening<All>) {
  startListener({
    actionCreator: userJoinToRoomAction,
    effect: async ({ payload }, listenerApi) => {
      await getUsersByIdsEffect([payload.userId], listenerApi)
    },
  })

  startListener({
    actionCreator: connectToRoomSuccessAction,
    effect: async ({ payload }, listenerApi) => {
      await getUsersByIdsEffect(Object.keys(payload.game.players), listenerApi)
    },
  })
}
