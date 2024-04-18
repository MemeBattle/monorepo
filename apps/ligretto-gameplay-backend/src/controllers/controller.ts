import type { Socket } from 'socket.io'
import { injectable } from 'inversify'
import type { AnyAction } from '../types/any-action'
import * as Sentry from '@sentry/node'
import { getDynamicSamplingContextFromClient, spanToTraceHeader } from '@sentry/core'
import { dynamicSamplingContextToSentryBaggageHeader } from '@sentry/utils'

@injectable()
export abstract class Controller {
  protected abstract handlers: {
    [actionType: string]: <A extends AnyAction>(socket: Socket, action: A) => void
  }

  private getHandler(type: string) {
    return this.handlers[type]
  }

  handleMessage(socket: Socket, action: AnyAction): void {
    const handler = this.getHandler(action.type)

    if (handler && typeof handler === 'function') {
      return handler(socket, action)
    }
  }

  protected emit<T>(emitter: { emit: Socket['emit'] }, data: T) {
    const span = Sentry.getActiveSpan()

    let meta

    if (span) {
      const dynamicContext = getDynamicSamplingContextFromClient(span.spanContext().traceId, Sentry.getClient()!)
      const baggage = dynamicSamplingContextToSentryBaggageHeader(dynamicContext)
      meta = { Baggage: baggage, 'Sentry-Trace': spanToTraceHeader(span) }
    }

    return emitter.emit('event', data, meta)
  }
}
