-- New admin audit action for the owner's automatic admin role at sign-up (migration 024). Kept
-- separate because Postgres cannot use a new enum value in the same transaction that adds it.
alter type public.admin_action add value if not exists 'owner_auto_admin';
