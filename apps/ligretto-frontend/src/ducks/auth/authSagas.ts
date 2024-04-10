import * as Sentry from '@sentry/browser'

import { call, put, takeLeading } from 'redux-saga/effects'

import { getUserByTokenSaga } from '#ducks/users'

import type { User } from '../users/usersTypes'
import { logout, getMeRequest, getMeSuccess } from './authActions'
import { LOCAL_STORAGE_TOKEN_KEY } from './constants'

export function* initSaga() {
  const token = window.localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY) ?? undefined
  yield put(getMeRequest({ token }))
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
