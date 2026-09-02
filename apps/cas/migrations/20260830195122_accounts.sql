-- Accounts: the identity root. `id` is the OIDC `sub`.
--
-- Per docs/PLAN.md there is no unique username: `display_name` is non-unique
-- and guests are regular rows (`type = 'guest'`) with no credentials, so one
-- code path serves guests and full accounts.

CREATE TYPE account_type AS ENUM ('guest', 'full');

CREATE TABLE accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name text NOT NULL,
    type account_type NOT NULL,
    -- Optional and unverified in v1: the future recovery anchor (M4).
    -- Deliberately not unique yet; uniqueness needs verification to be
    -- meaningful, and would let an unverified address block a real owner.
    email text,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Drives guest GC (a cron delete of inactive guests) and "last seen" in the
    -- dashboard. Starts equal to created_at.
    last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- Guest GC scans inactive guests; the partial index keeps full accounts out.
CREATE INDEX accounts_guest_last_seen_at_idx
    ON accounts (last_seen_at)
    WHERE type = 'guest';
