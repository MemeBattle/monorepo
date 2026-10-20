-- External identities: an account's identity at another provider, and the
-- state of a sign-in or link flow in progress.
--
-- Both tables exist for the same reason the ceremony table does: CAS runs as
-- several replicas that scale automatically, and the two legs of a provider
-- dance — the redirect out and the callback back — may land on different
-- instances. Nothing a later request depends on lives in process memory.
-- See docs/adr/0023-external-identities.md and
-- docs/adr/0002-ceremony-state-in-postgres.md.

CREATE TABLE external_identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    -- The provider's slug, as the registry names it ('telegram', 'github').
    -- Text rather than an enum: a provider is added by deploying code that
    -- registers it, not by migrating the schema.
    provider text NOT NULL,
    -- The provider's own stable identifier for the person: the OIDC `sub`, or
    -- whatever the provider's API calls its user id. Text, because no two
    -- providers agree on its shape.
    provider_subject text NOT NULL,
    -- A snapshot of what the provider said about the person when the identity
    -- was linked, stored as received (length-capped by the application). Data
    -- for a screen, never a credential and never a label CAS validates: an
    -- account's own display name is the `accounts` column.
    profile_name text,
    profile_username text,
    profile_picture_url text,
    linked_at timestamptz NOT NULL DEFAULT now(),
    -- One identity belongs to exactly one account: CAS does not merge
    -- accounts. Named, because the repository maps the constraint to the
    -- domain's "already linked" rather than letting a 23505 escape.
    CONSTRAINT external_identities_provider_subject_key UNIQUE (provider, provider_subject)
);

-- Every read that is not the unique lookup is "this account's identities":
-- the list of login methods and the count the last-login-method guard takes.
CREATE INDEX external_identities_account_id_idx ON external_identities (account_id);

-- Which half of the dance a flow is for. Read from the row on the callback,
-- never from the URL, so the redirect URI registered with a provider stays
-- one stable address.
CREATE TYPE external_identity_intent AS ENUM ('sign_in', 'link');

CREATE TABLE external_identity_flows (
    -- Random, minted by CAS: this id *is* the `state` parameter the provider
    -- echoes back. Single-use — the callback deletes the row in the same
    -- statement that reads it — so a replayed `state` finds nothing.
    id uuid PRIMARY KEY,
    provider text NOT NULL,
    intent external_identity_intent NOT NULL,
    -- The PKCE verifier whose S256 challenge went out with the redirect. A
    -- provider that does not implement PKCE simply ignores it.
    pkce_verifier text NOT NULL,
    -- SHA-256 of the one-time secret in the flow cookie, never the secret
    -- itself: the flow is bound to the browser that started it, and a read of
    -- this table hands out no live flows.
    browser_hash bytea NOT NULL,
    -- The account a `link` flow was started for; NULL for `sign_in`, which has
    -- no account yet.
    account_id uuid REFERENCES accounts (id) ON DELETE CASCADE,
    -- Where the browser goes when the flow finishes: a path on the frontend,
    -- validated by the application before it is written.
    return_to text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Finishing after this point fails. The application never removes rows
    -- past it; a separate scheduled cleanup will, as for the ceremony table
    -- (docs/adr/0002-ceremony-state-in-postgres.md (d)).
    expires_at timestamptz NOT NULL
);

CREATE INDEX external_identity_flows_expires_at_idx ON external_identity_flows (expires_at);
