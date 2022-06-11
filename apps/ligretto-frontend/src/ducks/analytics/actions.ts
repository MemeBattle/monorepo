import { createAction } from '@reduxjs/toolkit'

export const logAnalyticsEventAction =
  createAction<{ eventType: string } & { eventProperties?: Record<string, unknown> }>('@@analytics/logAnalyticsEventAction')
