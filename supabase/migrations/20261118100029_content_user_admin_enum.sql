-- New admin audit actions for user and post management (migration 030). Kept separate because
-- Postgres cannot use a new enum value in the same transaction that adds it.
alter type public.admin_action add value if not exists 'manage_user';
alter type public.admin_action add value if not exists 'edit_post';
alter type public.admin_action add value if not exists 'delete_post';
