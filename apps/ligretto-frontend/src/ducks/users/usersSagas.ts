import { call, put, takeEvery } from 'redux-saga/effects'
import type { SagaIterator } from 'redux-saga'
import type { AxiosResponse } from 'axios'
import { connectToRoomSuccessAction, userJoinToRoomAction } from '@memebattle/ligretto-shared'

import { getMe, getUsersByIds } from '#shared/api'
import type { GetMeResponse, GetUsersResponse } from '#shared/api'

import { addUser, addUsers } from './usersActions'
import type { User } from './usersTypes'

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
