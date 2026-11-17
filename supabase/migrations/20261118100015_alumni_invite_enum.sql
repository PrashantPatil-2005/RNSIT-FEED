-- New admin audit actions for alumni invites (migration 016). Kept separate because Postgres cannot
-- use a new enum value in the same transaction that adds it.
alter type public.admin_action add value if not exists 'invite_alumnus';
alter type public.admin_action add value if not exists 'revoke_alumni_invite';
