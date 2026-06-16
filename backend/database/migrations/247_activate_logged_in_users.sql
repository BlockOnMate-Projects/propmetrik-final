-- Migration 247: correct stale activation state.
--
-- The login handler only updated last_login_at — it never incremented login_count
-- and never advanced status from 'pending_verification' to 'active'. So users who
-- signed up and then signed in (and are actively using the platform) were stuck at
-- status='pending_verification' with login_count=0, and the admin Users page showed
-- them as INACTIVE. (Going forward, login now does both — see auth.ts.)
--
-- This backfills users who have demonstrably logged in (last_login_at IS NOT NULL):
--   * promote status pending_verification → active
--   * set login_count to at least 1 (historical count can't be reconstructed)
--
-- Idempotent. email_verified is intentionally left untouched (verification is a
-- separate concern from account-active state).

BEGIN;

UPDATE users
   SET status = 'active'
 WHERE status = 'pending_verification'
   AND last_login_at IS NOT NULL;

UPDATE users
   SET login_count = 1
 WHERE login_count = 0
   AND last_login_at IS NOT NULL;

COMMIT;
