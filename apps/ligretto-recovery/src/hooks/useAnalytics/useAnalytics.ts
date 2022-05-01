import { useDispatch } from 'react-redux'
import { useCallback } from 'react'

import { logAnalyticsEventAction } from 'ducks/analytics'

export const useAnalytics = () => {
  const dispatch = useDispatch()
  const logAnalyticsEvent = useCallback(
    (eventType: string, eventProperties?: Record<string, unknown>) => dispatch(logAnalyticsEventAction({ eventType, eventProperties })),
    [dispatch],
  )

  return { logAnalyticsEvent }
}
