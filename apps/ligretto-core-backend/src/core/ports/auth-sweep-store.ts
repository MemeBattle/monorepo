/** A session past its retention, as the sweep sees it: the id to take, and the account to name it by in a log. */
export interface ExpiredSessionCandidate {
  /** The session id, which is the credential (cookie value or bearer token): never logged. */
  id: string
  /** The account the session belongs to: what a log line names instead of the id. */
  sub: string
}

/** The statements of the scheduled sweep (docs/adrs/session-store-locking.md). Times are epoch milliseconds. */
export interface AuthSweepStore {
  /** Removes the `auth_requests` with `expires_at <= cutoff`; answers how many. */
  deleteExpiredAuthRequests(cutoff: number): Promise<number>
  /** The sessions with `grant_ends_at <= retainUntil`, in id order, each with the account it belongs to. */
  expiredSessions(retainUntil: number): Promise<ExpiredSessionCandidate[]>
  /**
   * Under the session's lock: deletes the session if it is still past `retainUntil`, and its lock row with it;
   * answers whether it was deleted. Throws (a `SessionBusyError` included) when the lock cannot be taken.
   */
  deleteExpiredSession(id: string, retainUntil: number): Promise<boolean>
  /** Removes the lock rows whose session is gone, skipping the ones held right now; answers how many. */
  deleteOrphanedSessionLocks(): Promise<number>
}
