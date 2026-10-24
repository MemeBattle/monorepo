/** A flat object of fields; nested values are not part of the log format (docs/adrs/logging.md). */
export type LogFields = Record<string, string | number | boolean | null | undefined>

/**
 * The logging port. The production adapter writes one JSON line per call; `debug` is dropped unless the level is
 * `debug`. Never pass a body, a cookie, a token or a secret as a field.
 */
export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  /** A logger that adds `fields` to every line it writes, such as the request id. */
  child(fields: LogFields): Logger
}
