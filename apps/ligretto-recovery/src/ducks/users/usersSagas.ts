import type { GetMeResponse, GetUsersResponse } from '../../api'
import { getMe, getUsersByIds } from '../../api'
import { call, put, takeEvery } from 'redux-saga/effects'
import type { SagaIterator } from 'redux-saga'
import type { User } from './usersTypes'
import type { AxiosResponse } from 'axios'
import { addUser, addUsers } from './usersActions'
import { connectToRoomSuccessAction } from '@memebattle/ligretto-shared'
import { userJoinToRoomAction } from '@memebattle/ligretto-shared'

export function* getUserByTokenSaga(token?: string): SagaIterator<{ userId: User['casId']; token: string } | null> {
  try {
    const { data }: AxiosResponse<GetMeResponse> = yield call(getMe, token)

    yield put(addUser(data.user))

    return {
      userId: data.user.casId,
      token: data.token,
    }
  } catch (e) {
    console.error(e)
    return null
  }
}

export function* getUsersByIdsSaga(ids: string[]) {
  try {
    const { data }: AxiosResponse<GetUsersResponse> = yield call(getUsersByIds, ids)

    yield put(addUsers(data))
  } catch (e) {
    console.error(e)
  }
}

export function* opponentJoinToRoomSaga({ payload }: ReturnType<typeof userJoinToRoomAction>) {
  yield call(getUsersByIdsSaga, [payload.userId])
}

export function* userJoinToRoomSaga({ payload }: ReturnType<typeof connectToRoomSuccessAction>) {
  yield call(getUsersByIdsSaga, Object.keys(payload.game.players))
}

export function* usersRootSaga() {
  yield takeEvery(userJoinToRoomAction, opponentJoinToRoomSaga)
  yield takeEvery(connectToRoomSuccessAction, userJoinToRoomSaga)
}
