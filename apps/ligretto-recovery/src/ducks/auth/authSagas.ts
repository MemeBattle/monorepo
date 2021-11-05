import { call, put, takeLeading } from 'redux-saga/effects'

import { getUserByTokenSaga } from 'ducks/users'

import type { User } from '../users/usersTypes'
import { getMeRequest, getMeSuccess } from './authActions'
import { LOCAL_STORAGE_TOKEN_KEY } from './constants'

export function* initSaga() {
  const token = window.localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY) ?? undefined
  yield put(getMeRequest({ token }))
}

export function* getMeSaga({ payload }: ReturnType<typeof getMeRequest>) {
  const user: { userId: User['casId']; token: string; isTemporary: boolean } | null = yield call(getUserByTokenSaga, payload.token)

  if (!user) {
    return
  }

  window.localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, user.token)
  yield put(getMeSuccess({ userId: user.userId, token: user.token, isTemporary: user.isTemporary }))
}

export function* authRootSaga() {
  yield takeLeading(getMeRequest, getMeSaga)
  yield call(initSaga)
}
