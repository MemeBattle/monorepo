/** Whether the database answers, for the health check. */
export interface DatabaseProbe {
  /** Resolves when the database answered, rejects otherwise. */
  ping(): Promise<void>
}
