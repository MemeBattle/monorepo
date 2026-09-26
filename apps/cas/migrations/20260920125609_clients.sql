-- OIDC clients: the applications allowed to start an authorization flow.
--
-- The registry is managed by hand until the admin panel exists: rows are
-- written by the `cas-client` binary, never by a migration, so no environment
-- inherits a client with a known secret. `/authorize` and `/token` read it.
-- A confidential client's secret is stored only as its SHA-256; redirect URIs
-- are matched by exact string comparison against what was registered.
-- See docs/adr/0008-oidc-clients-registry.md.

CREATE TYPE client_kind AS ENUM ('public', 'confidential');

CREATE TABLE clients (
    -- The OIDC client_id: chosen by hand when the client is registered, so
    -- text rather than a generated uuid. Its shape is enforced by the domain.
    id text PRIMARY KEY,
    name text NOT NULL,
    kind client_kind NOT NULL,
    -- SHA-256 of the client secret, never the secret itself. Present for
    -- exactly the confidential clients, which the CHECK below enforces.
    secret_hash bytea,
    redirect_uris text[] NOT NULL,
    post_logout_redirect_uris text[] NOT NULL DEFAULT '{}',
    -- A first-party client skips the consent screen.
    first_party boolean NOT NULL DEFAULT false,
    -- May mint guest accounts through the guest grant.
    guest_login_allowed boolean NOT NULL DEFAULT false,
    -- The scopes the client may request; a request for any other is refused.
    scopes text[] NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT clients_secret_hash_matches_kind
        CHECK ((kind = 'confidential') = (secret_hash IS NOT NULL))
);

-- No updated_at and no index beyond the primary key: nothing updates a row
-- yet, and every lookup is by id.
