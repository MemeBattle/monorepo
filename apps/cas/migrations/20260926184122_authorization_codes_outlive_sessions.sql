-- A redeemed authorization code outlives the session that authorized it.
--
-- `authorization_codes.session_id` cascaded on delete, so logging out of CAS
-- removed the codes that session had issued, redeemed ones included. A
-- redeemed row is the replay signal (RFC 6749 §4.1.2): without it a code
-- presented again after logout was merely unknown, and the grant its first
-- redemption produced was never revoked. Now logout only unlinks the row.
-- A pending code is still void once its session is gone: redemption requires
-- `session_id IS NOT NULL`, which is what the delete used to guarantee.
-- See docs/adr/0011-token-endpoint-and-access-tokens.md (d).

ALTER TABLE authorization_codes ALTER COLUMN session_id DROP NOT NULL;

ALTER TABLE authorization_codes DROP CONSTRAINT authorization_codes_session_id_fkey;
ALTER TABLE authorization_codes
    ADD CONSTRAINT authorization_codes_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE SET NULL;
