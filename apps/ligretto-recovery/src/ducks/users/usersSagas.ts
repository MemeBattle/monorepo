import type { GetMeResponse } from '../../api'
import { getMe } from '../../api'
import { call, put } from 'redux-saga/effects'
import type { SagaIterator } from 'redux-saga'
import type { User } from './usersTypes'
import type { AxiosResponse } from 'axios'
import { addUser } from './usersActions'

export function* getUserByTokenSaga(token?: string): SagaIterator<{ userId: User['_id']; token: string } | null> {
  try {
    const { data }: AxiosResponse<GetMeResponse> = yield call(getMe, token)

    yield put(addUser(data.user))

    return {
      userId: data.user._id,
      token: data.token,
    }
  } catch (e) {
    console.error(e)
    return null
  }
}
