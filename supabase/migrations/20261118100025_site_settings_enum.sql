-- New admin audit action for site settings (migration 026). Kept separate because Postgres cannot
-- use a new enum value in the same transaction that adds it.
alter type public.admin_action add value if not exists 'change_setting';
