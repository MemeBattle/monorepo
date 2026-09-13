-- Passkey credentials: the WebAuthn authenticators bound to an account.
--
-- The credential is stored whole as jsonb (the serde form of the webauthn-rs
-- `Passkey`: public key, signature counter, backup flags, transports) instead
-- of a column per field, so the schema does not have to track the library's
-- internals. See docs/adr/0001-passkey-persistence.md.
--
-- `credential_id` is the one field lifted out of the json: login (#666) starts
-- from the raw credential id the authenticator returns and has to find the row
-- by it, which a lookup inside jsonb cannot serve as cheaply. It is globally
-- unique — an authenticator must never be registered twice, on the same
-- account or on another one.

CREATE TABLE passkey_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    credential_id bytea NOT NULL UNIQUE,
    credential jsonb NOT NULL,
    -- User-facing label ("MacBook", "YubiKey"). Not unique: naming two keys
    -- alike is the user's business. Renamed by passkey management (#668).
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- NULL until the credential is first used to sign in; #666 sets it.
    last_used_at timestamptz
);

-- Both listing an account's passkeys (#668) and the ON DELETE CASCADE above
-- look rows up by account_id; without the index Postgres would sequentially
-- scan the table on every account delete.
CREATE INDEX passkey_credentials_account_id_idx ON passkey_credentials (account_id);
