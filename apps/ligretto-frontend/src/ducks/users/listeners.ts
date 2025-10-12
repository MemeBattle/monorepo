import type { TypedStartListening, ListenerEffectAPI, Dispatch } from '@reduxjs/toolkit'
import type { AxiosResponse } from 'axios'
import { connectToRoomSuccessAction, userJoinToRoomAction } from '@memebattle/ligretto-shared'

import { getUsersByIds } from '#shared/api'
import type { GetUsersResponse } from '#shared/api'

import { addUsers } from './usersActions'
import type { All } from '#types/store'

async function getUsersByIdsEffect(ids: string[], listenerApi: ListenerEffectAPI<All, Dispatch>) {
  try {
    const { data }: AxiosResponse<GetUsersResponse> = await getUsersByIds(ids)
    listenerApi.dispatch(addUsers(data))
  } catch (e) {
    console.error(e)
  }
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
