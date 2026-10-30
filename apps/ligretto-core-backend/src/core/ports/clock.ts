/** The time source of the service, so durations and expiries are testable. */
export interface Clock {
  /** Milliseconds since the epoch. */
  now(): number
}
