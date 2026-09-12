-- Idle timeout for sessions (ADR 0004, amended with #697).
--
-- A session now has two clocks: `expires_at`, the absolute cap fixed at
-- creation, and `last_seen_at`, reset by an authenticated request at most
-- once per renewal window. A row is live only while both hold. Existing rows
-- start their idle clock now; nothing is signed out by this migration.

ALTER TABLE sessions
    ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();

-- For the scheduled cleanup of idle-expired rows, next to the index on
-- expires_at that serves the absolute ones.
CREATE INDEX sessions_last_seen_at_idx ON sessions (last_seen_at);
