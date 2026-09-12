-- Server-side sessions: what a signed-in browser holds between requests.
--
-- The browser keeps a random token in an HttpOnly cookie; the row keeps only
-- the SHA-256 of that token, so a read of this table does not hand out live
-- sessions. Lookup is by the hash, which is why it is the unique column.
-- See docs/adr/0004-cookie-sessions.md.

CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    token_hash bytea NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Absolute lifetime, fixed when the session is created. A request after
    -- this point is unauthenticated; the application never removes rows past
    -- it, a separate scheduled cleanup will (as for webauthn_ceremonies).
    expires_at timestamptz NOT NULL
);

-- Listing an account's sessions and the ON DELETE CASCADE above both look
-- rows up by account_id.
CREATE INDEX sessions_account_id_idx ON sessions (account_id);

-- For the scheduled cleanup of expired rows.
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
