-- Guest accounts minted by a client through the guest grant, and the
-- per-client limit on how many it may mint.
--
-- A guest is an `accounts` row of `type = 'guest'` (the type exists since the
-- accounts migration). What it lacked is provenance: which client minted it.
-- The limit is counted over that provenance in Postgres, because CAS runs as
-- several stateless replicas and an in-memory counter would be per replica.
-- Both columns are additive, nullable or defaulted, so the previous release
-- keeps working on this schema. See
-- docs/adr/0014-guest-accounts-and-the-guest-grant.md.

-- The client that minted a guest through the guest grant; NULL for an account
-- created through CAS's own UI. Provenance, not ownership: it stays when the
-- guest is upgraded to a full account, so deleting the client unlinks the
-- account (SET NULL) rather than deleting one that may belong to a person by
-- now (CASCADE).
ALTER TABLE accounts
    ADD COLUMN created_by_client_id text REFERENCES clients (id) ON DELETE SET NULL;

-- Serves the rate limit's count (the accounts a client minted in the last
-- minute: the client id and the window are both index conditions) and the
-- ON DELETE SET NULL lookup above. Partial, so full accounts created through
-- the UI stay out of it.
CREATE INDEX accounts_created_by_client_id_created_at_idx
    ON accounts (created_by_client_id, created_at)
    WHERE created_by_client_id IS NOT NULL;

-- How many guest accounts a client may mint per minute. Per client because
-- applications differ, and in the row so the number changes without a
-- release. The default is what lets the previous release's `cas-client`,
-- which does not know the column, still register a client (expand rule); the
-- domain's default is the same number.
ALTER TABLE clients
    ADD COLUMN guest_grants_per_minute integer NOT NULL DEFAULT 60
    CONSTRAINT clients_guest_grants_per_minute_positive CHECK (guest_grants_per_minute > 0);
