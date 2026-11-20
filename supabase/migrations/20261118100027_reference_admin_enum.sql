-- New admin audit action for departments and batches (migration 028). Kept separate because
-- Postgres cannot use a new enum value in the same transaction that adds it.
alter type public.admin_action add value if not exists 'manage_reference';
