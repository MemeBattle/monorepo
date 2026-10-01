-- Authorization codes: what `/authorize` hands a client and `/token` takes
-- back, once.
--
-- A code is 256 random bits; the row keeps only its SHA-256, as `sessions`
-- keeps the hash of a session token. The row binds the code to everything
-- the token endpoint must check it against: the client, the redirect URI
-- exactly as sent, the granted scopes, the PKCE challenge, the nonce, the
-- account and the session that authorized it. Expiry is the database clock.
-- See docs/adr/0010-authorization-endpoint.md.

CREATE TABLE authorization_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- SHA-256 of the code, never the code (as sessions.token_hash).
    code_hash bytea NOT NULL UNIQUE,
    client_id text NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    -- The session that authorized: logout deletes the session and the cascade
    -- takes the pending code with it.
    session_id uuid NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    -- Exactly as the client sent it; /token compares byte for byte.
    redirect_uri text NOT NULL,
    scopes text[] NOT NULL,
    -- The S256 challenge. The method is not stored: S256 is the only one
    -- accepted, and discovery says so.
    code_challenge text NOT NULL,
    nonce text,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Redeeming after this point fails. The application never removes rows
    -- past it; the scheduled cleanup will (as for webauthn_ceremonies).
    expires_at timestamptz NOT NULL,
    -- Set by redemption. The row stays until the scheduled cleanup so a replay
    -- is recognised as a replay (RFC 6749 §4.1.2), not as an unknown code.
    redeemed_at timestamptz
);

-- For the scheduled cleanup of expired rows.
CREATE INDEX authorization_codes_expires_at_idx ON authorization_codes (expires_at);

-- The ON DELETE CASCADE clauses above look rows up by these columns.
CREATE INDEX authorization_codes_session_id_idx ON authorization_codes (session_id);
CREATE INDEX authorization_codes_account_id_idx ON authorization_codes (account_id);
CREATE INDEX authorization_codes_client_id_idx ON authorization_codes (client_id);
