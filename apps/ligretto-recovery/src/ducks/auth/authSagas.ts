import { getMeRequest } from './authActions'
import { getMeSuccess } from './authActions'
import { call, put, takeLeading } from 'redux-saga/effects'
import { getUserByTokenSaga } from 'ducks/users'

export function* getMeSaga({ payload }: ReturnType<typeof getMeRequest>) {
  const userId: string = yield call(getUserByTokenSaga, payload.token)

  yield put(getMeSuccess({ userId }))
}

export function* authRootSaga() {
  yield takeLeading(getMeRequest, getMeSaga)
}
