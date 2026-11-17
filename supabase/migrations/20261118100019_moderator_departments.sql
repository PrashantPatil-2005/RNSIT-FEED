-- Moderator departments and role history (plan P2, decisions D-R2 to D-R6 in
-- docs/ROLES-AND-STAFF-PANEL.md and DECISION-REGISTER section H).
--
-- * private.moderator_departments: which departments a moderator covers. Soft scope (D-R2): it sets
--   the moderator's default queue filter; it does NOT restrict what a moderator may review.
--   At most 4 moderators per department, enforced here (D-R3).
-- * private.role_changes: append-only history of role changes (D-R5). The free-text reason stays
--   in private.admin_audit only, so personal data is not copied into a second table (O-3).
-- * Demotion away from moderator clears the person's departments in the same transaction (D-R6).
-- * A moderator may step down themselves and returns to their previous role (D-R4).
--
-- Both tables live in the private schema with RLS on and no API grants; they are reached only
-- through the SECURITY DEFINER functions below, which check the caller's role from the database.

-- ---------- Tables ----------

create table private.moderator_departments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  department_id smallint not null references public.departments (id) on delete restrict,
  assigned_by uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, department_id)
);
create index moderator_departments_department_idx on private.moderator_departments (department_id);
alter table private.moderator_departments enable row level security;

create table private.role_changes (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  old_role public.user_role not null,
  new_role public.user_role not null,
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (old_role <> new_role)
);
create index role_changes_user_idx on private.role_changes (user_id, created_at desc);
alter table private.role_changes enable row level security;

create trigger role_changes_append_only before update or delete on private.role_changes
  for each row execute function private.audit_append_only('user_id', 'changed_by');
create trigger role_changes_no_truncate before truncate on private.role_changes
  for each statement execute function private.audit_no_truncate();

-- ---------- Internal helper (no grants) ----------

-- The one place a role is written after onboarding: records history, clears departments when the
-- person stops being a moderator, and bypasses the protected-column guard for this update only.
create function private.apply_role_change(p_user uuid, p_new public.user_role, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.user_role;
begin
  select p.role into v_old from public.profiles p where p.id = p_user for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_old = p_new then return; end if;

  insert into private.role_changes (user_id, old_role, new_role, changed_by)
  values (p_user, v_old, p_new, p_actor);
  if p_new <> 'moderator' then
    delete from private.moderator_departments where user_id = p_user;
  end if;

  perform set_config('app.profile_change', '1', true);
  update public.profiles set role = p_new where id = p_user;
  perform set_config('app.profile_change', '', true);
end $$;

-- ---------- Role changes (replaces the migration 007 body; same signature and rules) ----------

create or replace function public.admin_set_user_role(p_user uuid, p_role public.user_role, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_old public.user_role;
  v_admins integer;
begin
  if p_user = v_uid then raise exception 'forbidden' using errcode = '42501'; end if;
  select p.role into v_old from public.profiles p where p.id = p_user and p.deletion_requested_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select count(*) into v_admins from public.profiles p where p.role = 'admin' and p.deletion_requested_at is null;
  if p_role = 'admin' and v_old <> 'admin' and v_admins >= 2 then
    raise exception 'limit_reached' using errcode = '53400';
  end if;
  if v_old = 'admin' and p_role <> 'admin' and v_admins <= 1 then
    raise exception 'last_admin' using errcode = '55000';
  end if;
  perform private.log_admin('set_role', v_uid, p_user, null, null, p_reason);
  perform private.apply_role_change(p_user, p_role, v_uid);
end $$;

-- D-R4: a moderator steps down and returns to the role they held before their latest promotion to
-- moderator. With no history (for example a role set before this migration), an alumnus who joined
-- through an invite returns to alumni; anyone else to student. Admins cannot use this.
create function public.moderator_step_down(p_reason text)
returns public.user_role language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_staff();
  v_back public.user_role;
begin
  if private.caller_role() <> 'moderator' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select c.old_role into v_back
  from private.role_changes c
  where c.user_id = v_uid and c.new_role = 'moderator'
  order by c.created_at desc, c.id desc
  limit 1;
  if v_back is null or v_back not in ('student', 'alumni') then
    v_back := case
      when exists (select 1 from private.alumni_invites i where i.used_by = v_uid) then 'alumni'
      else 'student'
    end;
  end if;
  perform private.log_admin('moderator_step_down', v_uid, v_uid, null, null, p_reason);
  perform private.apply_role_change(v_uid, v_back, v_uid);
  return v_back;
end $$;

-- ---------- Department assignments (admin only) ----------

create function public.admin_assign_moderator_department(
  p_user uuid, p_department smallint, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_code text;
  v_count integer;
begin
  -- Lock the department row so two concurrent assignments cannot both pass the limit check.
  select d.code into v_code from public.departments d
  where d.id = p_department and d.active for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_user and p.role = 'moderator' and p.deletion_requested_at is null
  ) then
    raise exception 'not_moderator' using errcode = '22023';
  end if;
  if exists (
    select 1 from private.moderator_departments m
    where m.user_id = p_user and m.department_id = p_department
  ) then
    raise exception 'already_assigned' using errcode = '23505';
  end if;
  select count(*) into v_count from private.moderator_departments m
  where m.department_id = p_department;
  if v_count >= 4 then
    raise exception 'limit_reached' using errcode = '53400';
  end if;
  perform private.log_admin('assign_moderator_department', v_uid, p_user, null, null, p_reason,
    null, 'department:' || v_code);
  insert into private.moderator_departments (user_id, department_id, assigned_by)
  values (p_user, p_department, v_uid);
end $$;

create function public.admin_unassign_moderator_department(
  p_user uuid, p_department smallint, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_code text;
begin
  select d.code into v_code from public.departments d where d.id = p_department;
  delete from private.moderator_departments m
  where m.user_id = p_user and m.department_id = p_department;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.log_admin('unassign_moderator_department', v_uid, p_user, null, null, p_reason,
    null, 'department:' || v_code);
end $$;

-- ---------- Reads ----------

-- The caller's own departments (empty for anyone who is not a moderator). Used for the default
-- queue filter and the account page.
create function public.my_moderator_departments()
returns table (department_id smallint, code text, name text)
language sql stable security definer set search_path = '' as $$
  select d.id, d.code, d.name
  from private.moderator_departments m
  join public.departments d on d.id = m.department_id
  where m.user_id = auth.uid()
  order by d.code
$$;

-- Admin team page: every active department with its moderators (names only, no email or USN).
create function public.admin_moderator_coverage()
returns table (
  department_id smallint, code text, name text, moderator_count integer, moderators jsonb
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select d.id, d.code, d.name,
         count(m.user_id)::integer,
         coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name)
                    order by p.full_name) filter (where m.user_id is not null), '[]'::jsonb)
  from public.departments d
  left join private.moderator_departments m on m.department_id = d.id
  left join public.profiles p on p.id = m.user_id
  where d.active
  group by d.id, d.code, d.name
  order by d.code;
end $$;

-- Admin: a user's role history. Actor names only; reasons stay in the audited audit log.
create function public.admin_user_role_history(p_user uuid)
returns table (
  old_role public.user_role, new_role public.user_role, changed_by_name text,
  self_service boolean, created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select c.old_role, c.new_role, a.full_name, c.changed_by = c.user_id, c.created_at
  from private.role_changes c
  left join public.profiles a on a.id = c.changed_by
  where c.user_id = p_user
  order by c.created_at desc, c.id desc
  limit 50;
end $$;

-- ---------- Grants ----------
revoke all on private.moderator_departments, private.role_changes from public, anon, authenticated;

revoke execute on function private.apply_role_change(uuid, public.user_role, uuid) from public, anon, authenticated;
revoke execute on function public.admin_set_user_role(uuid, public.user_role, text) from public, anon;
revoke execute on function public.moderator_step_down(text) from public, anon, authenticated;
revoke execute on function public.admin_assign_moderator_department(uuid, smallint, text) from public, anon, authenticated;
revoke execute on function public.admin_unassign_moderator_department(uuid, smallint, text) from public, anon, authenticated;
revoke execute on function public.my_moderator_departments() from public, anon, authenticated;
revoke execute on function public.admin_moderator_coverage() from public, anon, authenticated;
revoke execute on function public.admin_user_role_history(uuid) from public, anon, authenticated;

grant execute on function public.admin_set_user_role(uuid, public.user_role, text) to authenticated;
grant execute on function public.moderator_step_down(text) to authenticated;
grant execute on function public.admin_assign_moderator_department(uuid, smallint, text) to authenticated;
grant execute on function public.admin_unassign_moderator_department(uuid, smallint, text) to authenticated;
grant execute on function public.my_moderator_departments() to authenticated;
grant execute on function public.admin_moderator_coverage() to authenticated;
grant execute on function public.admin_user_role_history(uuid) to authenticated;
