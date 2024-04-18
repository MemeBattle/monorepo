import * as Sentry from '@sentry/browser'
import { spanToTraceHeader, getDynamicSamplingContextFromClient } from '@sentry/core'
import { dynamicSamplingContextToSentryBaggageHeader } from '@sentry/utils'

type SentryHeaders = {
  Baggage: string
  'Sentry-Trace': string
}

/**
 * Prepare sentry info for distributed tracing
 *
 * @param span
 * @returns
 */
export function getSentryTracingHeaders(span: Sentry.Span): SentryHeaders | undefined {
  const sentryClient = Sentry.getClient()

  if (!sentryClient) {
    return
  }

  const dynamicContext = getDynamicSamplingContextFromClient(span.spanContext().traceId, sentryClient)
  const baggage = dynamicSamplingContextToSentryBaggageHeader(dynamicContext)

  if (!baggage) {
    return
  }

  return { Baggage: baggage, 'Sentry-Trace': spanToTraceHeader(span) } as const
}
