-- New admin audit action for managing interview topics (migration 022). Kept separate because
-- Postgres cannot use a new enum value in the same transaction that adds it.
alter type public.admin_action add value if not exists 'manage_topic';
