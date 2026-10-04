-- What `/token` produces from an authorization code: a grant, the refresh
-- token hanging off it, and the audience its access tokens are issued for.
--
-- A grant is one authorization of a client by an account: created by the
-- code exchange, carrying the scopes the code granted, alive for an absolute
-- 30 days from its creation. Its refresh tokens are stored as SHA-256, as
-- `sessions` stores its tokens. Revocation is `grants.revoked_at` and nothing
-- else: revoking a grant is what kills its refresh tokens. Expiry is the
-- database clock. See docs/adr/0011-token-endpoint-and-access-tokens.md.

-- The `aud` of the access tokens issued to a client (RFC 9068 §3): the
-- resource server they are meant for, which is not the client itself when two
-- clients share one (both ligretto backends are `ligretto`). Existing clients
-- are their own audience, which is also the default for a new one.
--
-- The previous release's `cas-client` does not know the column and cannot
-- register a client once this has run; registration is a manual operator
-- step, taken with the binary of the release that runs the migration.
ALTER TABLE clients ADD COLUMN audience text;
UPDATE clients SET audience = id;
ALTER TABLE clients ALTER COLUMN audience SET NOT NULL;

CREATE TABLE grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    client_id text NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
    scopes text[] NOT NULL,
    -- The code this grant was exchanged for. A replayed code revokes what it
    -- produced (RFC 6749 §4.1.2), and this is how the grant is found. NULL for
    -- a grant no code produced (the guest grant) and once the scheduled
    -- cleanup has removed the code.
    authorization_code_id uuid REFERENCES authorization_codes (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Moved by a refresh (#744).
    last_used_at timestamptz NOT NULL DEFAULT now(),
    -- The absolute cap: no refresh token of this grant is honoured past it,
    -- and rotation never moves it. The application never removes rows past
    -- it; the scheduled cleanup will (as for sessions).
    expires_at timestamptz NOT NULL,
    -- The only revocation state: a revoked grant's refresh tokens are dead.
    revoked_at timestamptz
);

-- The ON DELETE CASCADE / SET NULL clauses above look rows up by these
-- columns, and so does the revocation of a replayed code.
CREATE INDEX grants_account_id_idx ON grants (account_id);
CREATE INDEX grants_client_id_idx ON grants (client_id);
CREATE INDEX grants_authorization_code_id_idx ON grants (authorization_code_id);

-- For the scheduled cleanup of expired rows.
CREATE INDEX grants_expires_at_idx ON grants (expires_at);

CREATE TABLE refresh_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    grant_id uuid NOT NULL REFERENCES grants (id) ON DELETE CASCADE,
    -- SHA-256 of the token, never the token (as sessions.token_hash).
    token_hash bytea NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- The grant's expiry, copied: a token never outlives its grant.
    expires_at timestamptz NOT NULL,
    -- Set by rotation (#744). A used row stays until the scheduled cleanup so
    -- that presenting it again is recognised as a replay, which revokes the
    -- grant.
    used_at timestamptz
);

-- The ON DELETE CASCADE above looks rows up by grant_id.
CREATE INDEX refresh_tokens_grant_id_idx ON refresh_tokens (grant_id);

-- For the scheduled cleanup of expired rows.
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);
