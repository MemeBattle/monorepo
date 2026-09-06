-- WebAuthn ceremony state: what the server has to remember between issuing a
-- challenge and checking the browser's answer.
--
-- CAS runs as several replicas behind a load balancer, and the two requests of
-- a ceremony may land on different ones, so the state lives here and never in
-- process memory. Persisting it needs webauthn-rs's
-- `danger-allow-state-serialisation` feature; the danger the library warns
-- about is client-side storage (a cookie the client could replay), and a
-- server-side table is the case its documentation lists as safe.
-- See docs/adr/0002-ceremony-state-in-postgres.md.

CREATE TYPE webauthn_ceremony_kind AS ENUM ('registration', 'authentication');

CREATE TABLE webauthn_ceremonies (
    -- Random, minted by CAS. Deliberately not the account id: the same account
    -- may run several ceremonies at once (a second passkey, two open tabs), and
    -- a login ceremony has no account yet when it starts.
    id uuid PRIMARY KEY,
    -- Guards against finishing a ceremony of one kind with the other's
    -- endpoint. `authentication` is reserved for login (#666).
    kind webauthn_ceremony_kind NOT NULL,
    -- The serde form of the webauthn-rs state plus whatever CAS needs to
    -- finish: for a registration, the future account id and the display name.
    state jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Finishing after this point fails. Rows past it are swept when the next
    -- ceremony starts; there is no background reaper.
    expires_at timestamptz NOT NULL
);

CREATE INDEX webauthn_ceremonies_expires_at_idx ON webauthn_ceremonies (expires_at);
