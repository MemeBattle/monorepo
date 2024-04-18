export function extractSentryTracingHeaders(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') {
    return
  }

  if ('Baggage' in metadata && 'Sentry-Trace' in metadata && typeof metadata['Sentry-Trace'] === 'string' && typeof metadata.Baggage === 'string') {
    return {
      baggage: metadata.Baggage,
      sentryTrace: metadata['Sentry-Trace'],
    }
  }
}
