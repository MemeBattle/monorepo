-- Session kinds (docs/adr/0015-guest-upgrade.md (a), amending ADR 0004).
--
-- `full` is every session CAS has issued so far: registration and login.
-- `upgrade` is the restricted session `/authorize` opens for a guest that
-- presents a fresh ID token as `id_token_hint`: it may only run the
-- account-registration ceremony for its own account and continue
-- `/authorize`; every other endpoint answers it as unauthenticated.
--
-- Additive, so the previous release keeps running: it writes neither value
-- explicitly and every row it inserts is `full` by the default
-- (docs/MIGRATIONS.md, expand/contract). It does not read the column either,
-- which is why guest-enabled clients stay off until every instance runs the
-- release that does (ADR 0015 (h)).
CREATE TYPE session_kind AS ENUM ('full', 'upgrade');

ALTER TABLE sessions
    ADD COLUMN kind session_kind NOT NULL DEFAULT 'full';
