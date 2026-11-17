-- New admin audit actions for moderator departments and stepping down (migration 019, plan P2 in
-- docs/ROLES-AND-STAFF-PANEL.md). Kept separate because Postgres cannot use a new enum value in the
-- same transaction that adds it.
alter type public.admin_action add value if not exists 'assign_moderator_department';
alter type public.admin_action add value if not exists 'unassign_moderator_department';
alter type public.admin_action add value if not exists 'moderator_step_down';
