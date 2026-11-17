-- Phase 3 (moderation), part 1 of 2: new enum values.
--
-- STATUS: LOCAL ONLY, NOT APPLIED to any hosted database.
--
-- Postgres cannot use a newly added enum value in the same transaction that adds it, so the values
-- live in their own migration and are used from migration 014 onward.
--
-- Owner decision SC-2 (Phase 3 brief, 2026-11-17): moderators can either REQUEST CHANGES or REJECT.
--   returned  = changes requested; the author edits and resubmits (what 'rejected' meant before).
--   rejected  = final; the author sees the reason but cannot edit or resubmit.
alter type public.exp_status add value if not exists 'returned' after 'rejected';
alter type public.mod_action add value if not exists 'return';
