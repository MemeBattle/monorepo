import type { LogFields, Logger } from './logger'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogEntry = { level: LogLevel; message: string; fields: LogFields }

/** A logger that records every call, child loggers included, into one list a test can inspect. */
export const createRecordingLogger = (): { logger: Logger; entries: LogEntry[] } => {
  const entries: LogEntry[] = []

  const create = (bound: LogFields): Logger => {
    const write = (level: LogLevel) => (message: string, fields?: LogFields) => {
      entries.push({ level, message, fields: { ...bound, ...fields } })
    }
    return {
      debug: write('debug'),
      info: write('info'),
      warn: write('warn'),
      error: write('error'),
      child: fields => create({ ...bound, ...fields }),
    }
  }

  return { logger: create({}), entries }
}
