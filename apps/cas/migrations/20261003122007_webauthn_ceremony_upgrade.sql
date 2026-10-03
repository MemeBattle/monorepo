-- The guest upgrade ceremony (docs/adr/0015-guest-upgrade.md (e), (g)).
--
-- A fourth ceremony kind: registering the first passkey of a guest account
-- under an upgrade session, which turns the guest into a full account with
-- the same id. Finishing looks rows up by kind as well as by id, so an
-- account registration can never be finished as an upgrade and vice versa.
-- The new value is not used inside this migration's transaction, which
-- Postgres requires of `ADD VALUE`.
--
-- `account_id` is the existing account a ceremony is bound to: set for a
-- passkey addition and an upgrade, `NULL` for a registration (its account
-- does not exist yet) and a login (it names no account). Finishing an upgrade
-- deletes every other pending ceremony of the account by this column instead
-- of reaching into `state`; the partial index serves that delete, and the
-- cascade removes an account's ceremonies with it.
--
-- Additive, so the previous release keeps running: it never writes the new
-- value, and its inserts leave the nullable column `NULL`
-- (docs/MIGRATIONS.md, expand/contract).
ALTER TYPE webauthn_ceremony_kind ADD VALUE 'upgrade';

ALTER TABLE webauthn_ceremonies
    ADD COLUMN account_id uuid REFERENCES accounts (id) ON DELETE CASCADE;

CREATE INDEX webauthn_ceremonies_account_id_idx
    ON webauthn_ceremonies (account_id)
    WHERE account_id IS NOT NULL;
