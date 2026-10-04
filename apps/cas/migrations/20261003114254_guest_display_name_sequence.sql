-- The number in a guest's generated display name (`Guest 42`).
--
-- Every guest gets a display name of its own when it is minted, so that CAS's
-- screens and an operator can tell two guests apart; the name is never
-- released to a client, and the guest replaces it with one it chooses when it
-- upgrades. A sequence is the source of the number because it is shared by
-- every replica, never hands out the same value twice, and costs no lock;
-- the gaps a rolled-back mint leaves are harmless.
--
-- Deliberately no UNIQUE constraint or index on `accounts.display_name`:
-- display names of full accounts are not unique (PLAN), and a guest's is
-- distinct by construction. See
-- docs/adr/0014-guest-accounts-and-the-guest-grant.md (b).

CREATE SEQUENCE guest_display_name_seq AS bigint;
