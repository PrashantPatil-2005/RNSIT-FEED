-- Post, comment and user management (owner request 2026-11-20, admin panel plan steps C4-C6).
--
-- C6 users
--   * Suspend / unsuspend (profiles.suspended_at). A suspended account can still read and sign in,
--     but every member and staff action is refused, exactly like a pending deletion: caller_role()
--     and require_member() treat it as no role. Their published posts stay.
--   * Fix a member's department and batch.
--   * Force deletion: marks the account for deletion; the daily maintenance job then removes it
--     through the existing delete_account_data path (same as a self-requested deletion).
--   Admins and the owner cannot be suspended or deleted here (change their role first; the owner
--   is always protected).
-- C5 comments: remove every visible comment by one member at once (each logged like a single
--   removal, with open reports on them closed).
-- C4 posts
--   * Admin text fix on any post, in any status (typos, NDA or personal-detail removal): role title,
--     preparation tips, round notes and platform, question text, and removing a resource link.
--     The old text is NOT kept anywhere, because the usual reason is removing something that
--     must not be stored; the audit log records which fields changed.
--   * Hard delete of a post in any status (comments, votes and reports go with it).

-- ---------- Schema ----------

alter table public.profiles add column suspended_at timestamptz;

-- ---------- Role checks: a suspended account has no role ----------

create or replace function private.caller_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.domain_verified and p.deletion_requested_at is null
    and p.suspended_at is null
$$;

create or replace function private.require_member()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and p.suspended_at is not null) then
    raise exception 'suspended' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.domain_verified and p.deletion_requested_at is null
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_uid;
end $$;

-- suspended_at joins the protected columns (same body as migration 005 otherwise).
create or replace function private.profiles_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_setting('app.profile_change', true) is distinct from '1' then
    if (new.id, new.role, new.full_name, new.domain_verified, new.department_id, new.batch_id,
        new.onboarded_at, new.deletion_requested_at, new.suspended_at)
       is distinct from
       (old.id, old.role, old.full_name, old.domain_verified, old.department_id, old.batch_id,
        old.onboarded_at, old.deletion_requested_at, old.suspended_at) then
      raise exception 'protected_columns' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- ---------- Admin text fixes: narrow exceptions in the content locks ----------

-- Same as migration 028, plus: inside an admin text fix (app.admin_edit) role_title and prep_tips
-- may change on a locked post. Every other column stays locked.
create or replace function private.experiences_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_admin_edit boolean := current_setting('app.admin_edit', true) = '1';
begin
  if new.id is distinct from old.id then
    raise exception 'protected_columns' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if current_setting('app.transition', true) is distinct from '1' then
      raise exception 'status_change_forbidden' using errcode = '42501';
    end if;
    if not private.valid_transition(old.status, new.status) then
      raise exception 'invalid_transition' using errcode = '55000';
    end if;
  end if;
  if old.status not in ('draft', 'returned') and
     (case when current_setting('app.company_merge', true) = '1' then old.company_id else new.company_id end,
      case when v_admin_edit then old.role_title else new.role_title end,
      new.opportunity_type, new.campus_type, new.department_id,
      new.batch_id, new.recruitment_year, new.min_cgpa, new.backlogs_allowed, new.result,
      case when v_admin_edit then old.prep_tips else new.prep_tips end,
      new.is_anonymous)
     is distinct from
     (old.company_id, old.role_title, old.opportunity_type, old.campus_type, old.department_id,
      old.batch_id, old.recruitment_year, old.min_cgpa, old.backlogs_allowed, old.result,
      old.prep_tips, old.is_anonymous) then
    raise exception 'content_locked' using errcode = '55000';
  end if;
  return new;
end $$;

-- Same as migration 014, plus: inside an admin text fix, child rows may be updated or deleted
-- (never inserted) on a locked post.
create or replace function private.children_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_exp uuid;
  v_status public.exp_status;
begin
  case tg_table_name
    when 'rounds', 'experience_resources', 'experience_eligible_departments' then
      v_exp := (v_row ->> 'experience_id')::uuid;
    when 'round_topics', 'questions' then
      select r.experience_id into v_exp from public.rounds r where r.id = (v_row ->> 'round_id')::uuid;
    when 'question_topics' then
      select r.experience_id into v_exp
      from public.questions q join public.rounds r on r.id = q.round_id
      where q.id = (v_row ->> 'question_id')::uuid;
  end case;
  if v_exp is null then return coalesce(new, old); end if;
  select e.status into v_status from public.experiences e where e.id = v_exp;
  if not found then return coalesce(new, old); end if;
  if tg_op = 'DELETE' and not exists (select 1 from public.experiences e where e.id = v_exp) then
    return old;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and current_setting('app.admin_edit', true) = '1' then
    return coalesce(new, old);
  end if;
  if v_status not in ('draft', 'returned') then
    raise exception 'content_locked' using errcode = '55000';
  end if;
  return coalesce(new, old);
end $$;

-- ---------- Users (C6) ----------

-- Shared target check: an existing, non-admin, non-owner account.
create function private.manageable_member(p_user uuid, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role public.user_role;
begin
  if p_user = p_actor then raise exception 'forbidden' using errcode = '42501'; end if;
  select p.role into v_role from public.profiles p where p.id = p_user for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if private.is_owner(p_user) then raise exception 'owner_protected' using errcode = '42501'; end if;
  if v_role = 'admin' then raise exception 'is_admin' using errcode = '42501'; end if;
end $$;

create function public.admin_set_suspended(p_user uuid, p_suspended boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_admin();
begin
  if p_suspended is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  perform private.manageable_member(p_user, v_uid);
  if p_suspended = exists (select 1 from public.profiles p where p.id = p_user and p.suspended_at is not null) then
    raise exception 'invalid_state' using errcode = '55000';
  end if;
  perform private.log_admin('manage_user', v_uid, p_user, null, null, p_reason, null,
    case when p_suspended then 'suspend' else 'unsuspend' end);
  perform set_config('app.profile_change', '1', true);
  update public.profiles set suspended_at = case when p_suspended then now() end where id = p_user;
  perform set_config('app.profile_change', '', true);
end $$;

-- Department and batch fix. Allowed for any account except the owner by other admins.
create function public.admin_set_user_details(
  p_user uuid, p_department smallint, p_batch smallint, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_admin();
begin
  if private.is_owner(p_user) and not private.is_owner(v_uid) then
    raise exception 'owner_protected' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user and p.onboarded_at is not null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.departments d where d.id = p_department and d.active)
     or not exists (select 1 from public.batches b where b.id = p_batch) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform private.log_admin('manage_user', v_uid, p_user, null, null, p_reason, null, 'details');
  perform set_config('app.profile_change', '1', true);
  update public.profiles set department_id = p_department, batch_id = p_batch where id = p_user;
  perform set_config('app.profile_change', '', true);
end $$;

-- Marks the account for deletion; maintenance deletes it like a self-requested deletion.
create function public.admin_request_user_deletion(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_admin();
begin
  perform private.manageable_member(p_user, v_uid);
  if exists (select 1 from public.profiles p where p.id = p_user and p.deletion_requested_at is not null) then
    raise exception 'invalid_state' using errcode = '55000';
  end if;
  perform private.log_admin('manage_user', v_uid, p_user, null, null, p_reason, null, 'force_delete');
  perform set_config('app.profile_change', '1', true);
  update public.profiles set deletion_requested_at = now() where id = p_user;
  perform set_config('app.profile_change', '', true);
end $$;

-- ---------- Comments (C5) ----------

create function public.admin_remove_user_comments(p_user uuid, p_reason_code public.reason_code, p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_c record;
  v_n integer := 0;
begin
  if p_reason_code is null then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_user = v_uid then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.log_admin('manage_user', v_uid, p_user, null, null, p_reason, null, 'remove_all_comments');
  for v_c in
    select c.id, c.experience_id from public.comments c
    where c.author_id = p_user and c.status = 'visible' for update
  loop
    update public.comments set status = 'removed', removed_at = now() where id = v_c.id;
    perform private.close_open_comment_reports(v_c.id);
    perform private.log_mod_comment('remove_comment', v_c.experience_id, v_c.id, null, v_uid, 'admin', p_reason_code);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------- Posts (C4) ----------

-- One call per fix. p_field: role_title | prep_tips | round_notes | round_platform | question |
-- remove_resource. p_target is the round, question or resource id where one is needed.
create function public.admin_edit_post(
  p_experience uuid, p_field text, p_target uuid, p_value text, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_value text := nullif(btrim(coalesce(p_value, '')), '');
begin
  perform 1 from public.experiences e where e.id = p_experience for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform set_config('app.admin_edit', '1', true);

  if p_field = 'role_title' then
    if v_value is null or length(v_value) > 120 then raise exception 'invalid_input' using errcode = '22023'; end if;
    update public.experiences set role_title = v_value where id = p_experience;
  elsif p_field = 'prep_tips' then
    if length(coalesce(v_value, '')) > 5000 then raise exception 'invalid_input' using errcode = '22023'; end if;
    update public.experiences set prep_tips = v_value where id = p_experience;
  elsif p_field = 'round_notes' then
    if length(coalesce(v_value, '')) > 2000 then raise exception 'invalid_input' using errcode = '22023'; end if;
    update public.rounds set notes = v_value where id = p_target and experience_id = p_experience;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  elsif p_field = 'round_platform' then
    if length(coalesce(v_value, '')) > 120 then raise exception 'invalid_input' using errcode = '22023'; end if;
    update public.rounds set platform = v_value where id = p_target and experience_id = p_experience;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  elsif p_field = 'question' then
    if v_value is null or length(v_value) not between 10 and 2000 then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    update public.questions q set body = v_value
    from public.rounds r
    where q.id = p_target and r.id = q.round_id and r.experience_id = p_experience;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  elsif p_field = 'remove_resource' then
    delete from public.experience_resources where id = p_target and experience_id = p_experience;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  else
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  perform set_config('app.admin_edit', '', true);
  perform private.log_admin('edit_post', v_uid, null, p_experience, null, p_reason, null, 'field:' || p_field);
  perform private.rebuild_search_doc(p_experience);
end $$;

create function public.admin_delete_post(p_experience uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_admin();
begin
  perform 1 from public.experiences e where e.id = p_experience for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- experience_id in the audit row becomes null with the post; the evidence keeps the id.
  perform private.log_admin('delete_post', v_uid, null, p_experience, null, p_reason, null,
    'experience:' || p_experience);
  delete from public.experiences where id = p_experience;
end $$;

-- Admin edit page: the editable text of a post with the row ids the fixes need. No author identity.
create function public.admin_post_detail(p_experience uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_admin();
  select jsonb_build_object(
    'id', e.id, 'status', e.status, 'role_title', e.role_title, 'prep_tips', e.prep_tips,
    'company_name', c.name, 'is_anonymous', e.is_anonymous,
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'position', r.position, 'round_type', r.round_type,
        'notes', r.notes, 'platform', r.platform,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object('id', q.id, 'body', q.body) order by q.position)
          from public.questions q where q.round_id = r.id), '[]'::jsonb)
      ) order by r.position)
      from public.rounds r where r.experience_id = e.id), '[]'::jsonb),
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'url', x.url, 'label', x.label) order by x.position)
      from public.experience_resources x where x.experience_id = e.id), '[]'::jsonb)
  ) into v
  from public.experiences e left join public.companies c on c.id = e.company_id
  where e.id = p_experience;
  if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return v;
end $$;

-- ---------- Grants ----------

revoke execute on function private.manageable_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.admin_set_suspended(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_set_user_details(uuid, smallint, smallint, text) from public, anon;
revoke execute on function public.admin_request_user_deletion(uuid, text) from public, anon;
revoke execute on function public.admin_remove_user_comments(uuid, public.reason_code, text) from public, anon;
revoke execute on function public.admin_edit_post(uuid, text, uuid, text, text) from public, anon;
revoke execute on function public.admin_delete_post(uuid, text) from public, anon;
revoke execute on function public.admin_post_detail(uuid) from public, anon;
grant execute on function public.admin_set_suspended(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_user_details(uuid, smallint, smallint, text) to authenticated;
grant execute on function public.admin_request_user_deletion(uuid, text) to authenticated;
grant execute on function public.admin_remove_user_comments(uuid, public.reason_code, text) to authenticated;
grant execute on function public.admin_edit_post(uuid, text, uuid, text, text) to authenticated;
grant execute on function public.admin_delete_post(uuid, text) to authenticated;
grant execute on function public.admin_post_detail(uuid) to authenticated;
