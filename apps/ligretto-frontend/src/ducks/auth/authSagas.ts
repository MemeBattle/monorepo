import * as Sentry from '@sentry/browser'

import { call, put, takeLeading } from 'redux-saga/effects'

import type { User } from '../users/usersTypes'
import { logout, getMeRequest, getMeSuccess } from './authActions'
import { LOCAL_STORAGE_TOKEN_KEY } from './constants'

import { analytics } from '#entities/analytics'
import { addUser } from '#ducks/users'
import type { AxiosResponse } from 'axios'
import type { SagaIterator } from 'redux-saga'
import { getMe } from '#shared/api'
import type { GetMeResponse } from '#shared/api'

export function* initSaga() {
  const token = window.localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY) ?? undefined
  yield put(getMeRequest({ token }))
}

export function* getUserByTokenSaga(
  token?: string,
): SagaIterator<{ userId: User['casId']; token: string; isTemporary: boolean; username: string | null } | null> {
  try {
    const { data }: AxiosResponse<GetMeResponse> = yield call(getMe, token)

    yield put(addUser(data.user))

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

export function* getMeSaga({ payload }: ReturnType<typeof getMeRequest>) {
  const user: { userId: User['casId']; token: string; isTemporary: boolean; username?: string } | null = yield call(getUserByTokenSaga, payload.token)

  if (!user) {
    return
  }

  Sentry.setUser({
    id: user.userId,
    username: user?.username,
  })
  window.localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, user.token)

  analytics.setUserProperties({ id: user.userId, isTemporary: user.isTemporary })
  analytics.logEvent('User authorized')

  yield put(getMeSuccess({ ...user }))
}

export function* logoutSaga() {
  window.localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY)

  yield put(getMeRequest({}))
}

export function* authRootSaga() {
  yield takeLeading(getMeRequest, getMeSaga)
  yield takeLeading(logout, logoutSaga)
  yield call(initSaga)
}
