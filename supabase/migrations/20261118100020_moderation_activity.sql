-- Moderation activity counts (plans P3 and P4 in docs/ROLES-AND-STAFF-PANEL.md).
-- public.moderation_actions has no API grant and moderation_history carries names, not ids, so
-- these two functions return COUNTS ONLY: no post content, no reasons, no authors.
-- A "decision" is any moderation_actions row a staff member made (actor_role moderator/admin):
-- approve, return, reject, remove, restore, report and comment decisions. Author events are excluded.

-- The caller's own activity over the last p_days (1–365). Staff only.
create function public.my_moderation_activity(p_days integer default 7)
returns table (decisions integer, last_decision_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_staff();
begin
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return query
  select count(*) filter (where m.created_at >= now() - make_interval(days => p_days))::integer,
         max(m.created_at)
  from public.moderation_actions m
  where m.actor_id = v_uid and m.actor_role in ('moderator', 'admin');
end $$;

-- Admin team page: every current moderator and admin with their decision count over p_days and
-- their last decision ever. Admin only.
create function public.admin_moderator_activity(p_days integer default 30)
returns table (
  user_id uuid, full_name text, role public.user_role, decisions integer,
  last_decision_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return query
  select p.id, p.full_name, p.role,
         (count(m.id) filter (where m.created_at >= now() - make_interval(days => p_days)))::integer,
         max(m.created_at)
  from public.profiles p
  left join public.moderation_actions m
    on m.actor_id = p.id and m.actor_role in ('moderator', 'admin')
  where p.role in ('moderator', 'admin') and p.deletion_requested_at is null
  group by p.id, p.full_name, p.role
  order by p.role desc, p.full_name;
end $$;

-- ---------- Grants ----------
revoke execute on function public.my_moderation_activity(integer) from public, anon, authenticated;
revoke execute on function public.admin_moderator_activity(integer) from public, anon, authenticated;
grant execute on function public.my_moderation_activity(integer) to authenticated;
grant execute on function public.admin_moderator_activity(integer) to authenticated;
