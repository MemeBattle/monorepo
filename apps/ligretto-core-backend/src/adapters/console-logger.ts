import type { LogFields, Logger } from '../core/ports/logger'

type ConsoleLoggerOptions = {
  level: 'debug' | 'info'
  fields?: LogFields
}

/** Field names that suggest a secret; such fields never reach the output (docs/adrs/logging.md). */
const SECRET_FIELD = /token|secret|authorization|cookie|password/i

const redact = (fields: LogFields): LogFields => Object.fromEntries(Object.entries(fields).filter(([key]) => !SECRET_FIELD.test(key)))

/**
 * The production logger: one JSON object per line on the console, which both runtimes collect (stdout on Node,
 * observability on Workers). `debug` is dropped unless the level is `debug`.
 */
export const createConsoleLogger = ({ level, fields = {} }: ConsoleLoggerOptions): Logger => {
  const write = (lineLevel: 'debug' | 'info' | 'warn' | 'error', message: string, extra?: LogFields) => {
    if (lineLevel === 'debug' && level !== 'debug') {
      return
    }
    // The line's own keys come last: a field named `level`, `time` or `message` never replaces them.
    const line = JSON.stringify({ ...redact({ ...fields, ...extra }), level: lineLevel, time: new Date().toISOString(), message })
    if (lineLevel === 'warn' || lineLevel === 'error') {
      console.error(line)
    } else {
      console.log(line)
    }
  }

  return {
    debug: (message, extra) => write('debug', message, extra),
    info: (message, extra) => write('info', message, extra),
    warn: (message, extra) => write('warn', message, extra),
    error: (message, extra) => write('error', message, extra),
    child: bound => createConsoleLogger({ level, fields: { ...fields, ...bound } }),
  }
}
