import { getMeRequest, getMeSuccess } from './authActions'
import { call, put, takeLeading } from 'redux-saga/effects'
import { getUserByTokenSaga } from 'ducks/users'
import { LOCAL_STORAGE_TOKEN_KEY } from './constants'

export function* initSaga() {
  const token = window.localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY)
  if (token) {
    yield put(getMeRequest({ token }))
  }
}

export function* getMeSaga({ payload }: ReturnType<typeof getMeRequest>) {
  const userId: string = yield call(getUserByTokenSaga, payload.token)

  window.localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, payload.token)
  yield put(getMeSuccess({ userId }))
}

export function* authRootSaga() {
  yield takeLeading(getMeRequest, getMeSaga)
  yield call(initSaga)
}
