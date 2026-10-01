-- A third ceremony kind: registering another passkey for an account that is
-- already signed in (docs/adr/0006-passkey-management.md, decision (g)). Its
-- state carries the account id the session named when the challenge was
-- issued. Finishing looks rows up by kind as well as by id, so an account
-- registration can never be finished as a passkey addition and vice versa.
--
-- Additive, so the previous release keeps running: it never writes or reads
-- this value (docs/MIGRATIONS.md, expand/contract).
ALTER TYPE webauthn_ceremony_kind ADD VALUE 'addition';
