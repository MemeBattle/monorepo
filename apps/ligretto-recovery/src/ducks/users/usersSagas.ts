import type { GetMeResponse } from '../../api'
import { getMe } from '../../api'
import { call, put } from 'redux-saga/effects'
import type { SagaIterator } from 'redux-saga'
import type { User } from './usersTypes'
import type { AxiosResponse } from 'axios'
import { addUser } from './usersActions'

export function* getUserByTokenSaga(token: string): SagaIterator<User['_id']> {
  try {
    const { data }: AxiosResponse<GetMeResponse> = yield call(getMe, token)

    yield put(addUser(data.user))

    return data.user._id
  } catch (e) {
    console.error(e)
    return ''
  }
}
