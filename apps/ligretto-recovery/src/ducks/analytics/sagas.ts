import { takeEvery, takeLatest } from 'redux-saga/effects'
import { getMeSuccess } from 'ducks/auth'
import { analytics } from './analytics'
import { logAnalyticsEventAction } from './actions'

export function* analyticsRootSaga() {
  analytics.logEvent('Init application')

  yield takeLatest(getMeSuccess, ({ payload }) => {
    analytics.setUserProperties({ id: payload.userId, isTemporary: payload.isTemporary })
    analytics.logEvent('User authorized')
  })

  yield takeEvery(logAnalyticsEventAction, ({ payload: { eventType, eventProperties } }) => {
    analytics.logEvent(eventType, eventProperties)
  })
}
