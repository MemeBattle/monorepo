import * as Sentry from '@sentry/browser'
import type { TypedStartListening } from '@reduxjs/toolkit'
import type { AxiosResponse } from 'axios'

import { logout, getMeRequest, getMeSuccess } from './authActions'
import { LOCAL_STORAGE_TOKEN_KEY } from './constants'

import { analytics } from '#entities/analytics'
import { addUser } from '#ducks/users'
import { getMe } from '#shared/api'
import type { GetMeResponse } from '#shared/api'
import type { All } from '#types/store'

async function getUserByTokenEffect(token?: string) {
  try {
    const { data }: AxiosResponse<GetMeResponse> = await getMe(token)

    return {
      userId: data.user.casId,
      isTemporary: data.user.isTemporary,
      token: data.token,
      username: data.user.isTemporary ? null : data.user.username,
    }
  } catch (e) {
    console.error(e)
    return null
  }
}

export function addListeners(startListener: TypedStartListening<All>) {
  startListener({
    actionCreator: getMeRequest,
    effect: async ({ payload }, listenerApi) => {
      const user = await getUserByTokenEffect(payload.token)

      if (!user) {
        return
      }

      // Add user to store - handle temporary users correctly
      if (user.isTemporary) {
        listenerApi.dispatch(
          addUser({
            casId: user.userId,
            isTemporary: true,
          }),
        )
      } else {
        listenerApi.dispatch(
          addUser({
            casId: user.userId,
            isTemporary: false,
            username: user.username!,
          }),
        )
      }

      Sentry.setUser({
        id: user.userId,
        username: user.username || undefined,
      })
      window.localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, user.token)

      analytics.setUserProperties({ id: user.userId, isTemporary: user.isTemporary })
      analytics.logEvent('User authorized')

      listenerApi.dispatch(getMeSuccess({ ...user }))
    },
  })

  startListener({
    actionCreator: logout,
    effect: async (_action, listenerApi) => {
      window.localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY)
      listenerApi.dispatch(getMeRequest({}))
    },
  })

  // Initialize auth on app start
  const unsubscribeInitAuth = startListener({
    predicate: () => true,
    effect: async (_action, listenerApi) => {
      unsubscribeInitAuth()
      const token = window.localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY) ?? undefined
      listenerApi.dispatch(getMeRequest({ token }))
    },
  })
}
