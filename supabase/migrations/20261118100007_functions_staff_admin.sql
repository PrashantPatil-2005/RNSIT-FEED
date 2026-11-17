-- Moderator, admin, USN-dispute, deletion and maintenance functions.
-- Role checks read profiles.role from the database on every call. Hiding a button in the UI
-- is never the security boundary.

-- ---------- Moderation ----------

create function public.moderate_experience(
  p_id uuid, p_action text, p_reason public.reason_code default null, p_note text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_staff();
  v_role text := private.caller_role()::text;
  v_status public.exp_status;
begin
  select e.status into v_status from public.experiences e where e.id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- A moderator or admin can never moderate their own post.
  if private.is_author(p_id) then raise exception 'forbidden' using errcode = '42501'; end if;

  if p_action = 'approve' then
    if v_status <> 'pending' then raise exception 'invalid_state' using errcode = '55000'; end if;
    perform private.transition_experience(p_id, 'approved');
    perform private.log_mod('approve', p_id, null, v_uid, v_role, null);
  elsif p_action = 'reject' then
    if v_status <> 'pending' then raise exception 'invalid_state' using errcode = '55000'; end if;
    if p_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;
    perform private.transition_experience(p_id, 'rejected');
    update public.experiences set moderation_note = nullif(left(btrim(coalesce(p_note, '')), 1000), '') where id = p_id;
    perform private.log_mod('reject', p_id, null, v_uid, v_role, p_reason);
  elsif p_action = 'remove' then
    if v_status <> 'approved' then raise exception 'invalid_state' using errcode = '55000'; end if;
    if p_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;
    perform private.transition_experience(p_id, 'removed');
    update public.experiences set moderation_note = nullif(left(btrim(coalesce(p_note, '')), 1000), '') where id = p_id;
    perform private.close_open_reports(p_id);
    perform private.log_mod('remove', p_id, null, v_uid, v_role, p_reason);
  elsif p_action = 'restore' then
    if v_status <> 'removed' then raise exception 'invalid_state' using errcode = '55000'; end if;
    perform private.transition_experience(p_id, 'approved');
    perform private.log_mod('restore', p_id, null, v_uid, v_role, null);
  else
    raise exception 'invalid_input' using errcode = '22023';
  end if;
end $$;

create function public.resolve_report(
  p_id uuid, p_outcome text, p_reason public.reason_code default null, p_remove boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_staff();
  v_role text := private.caller_role()::text;
  v_report public.reports%rowtype;
begin
  select r.* into v_report from public.reports r where r.id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_report.status <> 'open' then raise exception 'invalid_state' using errcode = '55000'; end if;
  if p_outcome = 'dismissed' then
    update public.reports set status = 'dismissed', resolved_by = v_uid, resolved_at = now() where id = p_id;
    perform private.log_mod('dismiss_report', v_report.experience_id, p_id, v_uid, v_role, p_reason);
  elsif p_outcome = 'actioned' then
    update public.reports set status = 'actioned', resolved_by = v_uid, resolved_at = now() where id = p_id;
    perform private.log_mod('resolve_report', v_report.experience_id, p_id, v_uid, v_role, p_reason);
    if p_remove then
      perform public.moderate_experience(v_report.experience_id, 'remove', p_reason, null);
    end if;
  else
    raise exception 'invalid_input' using errcode = '22023';
  end if;
end $$;

-- Full post for review. Author name only when the post is not anonymous.
create function public.moderation_experience_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_json jsonb;
begin
  perform private.require_staff();
  select private.experience_json(e.id) || jsonb_build_object(
           'author_name',
           case when e.is_anonymous is false then (
             select p.full_name from private.experience_authors a
             join public.profiles p on p.id = a.author_id where a.experience_id = e.id) end)
  into v_json
  from public.experiences e
  where e.id = p_id and e.status in ('pending', 'approved', 'removed');
  if v_json is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return v_json;
end $$;

-- ---------- Admin ----------

create function private.bootstrap_admin(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.profiles p where p.role = 'admin' and p.deletion_requested_at is null) >= 2 then
    raise exception 'limit_reached' using errcode = '53400';
  end if;
  perform private.log_admin('bootstrap_admin', null, p_user, null, null, p_reason);
  perform set_config('app.profile_change', '1', true);
  update public.profiles set role = 'admin' where id = p_user;
  perform set_config('app.profile_change', '', true);
end $$;

create function public.admin_set_user_role(p_user uuid, p_role public.user_role, p_reason text)
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
  perform set_config('app.profile_change', '1', true);
  update public.profiles set role = p_role where id = p_user;
  perform set_config('app.profile_change', '', true);
end $$;

-- Decision U13: the name is locked to Google's; only this audited correction can change it.
create function public.admin_correct_name(p_user uuid, p_name text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_admin();
begin
  if p_name is null or length(btrim(p_name)) not between 1 and 120 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.log_admin('correct_name', v_uid, p_user, null, null, p_reason);
  perform set_config('app.profile_change', '1', true);
  update public.profiles set full_name = btrim(p_name) where id = p_user;
  perform set_config('app.profile_change', '', true);
end $$;

create function public.admin_reveal_author(p_experience uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_author uuid;
  v_name text;
begin
  select a.author_id, p.full_name into v_author, v_name
  from private.experience_authors a join public.profiles p on p.id = a.author_id
  where a.experience_id = p_experience;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.log_admin('reveal_author', v_uid, v_author, p_experience, null, p_reason);
  return jsonb_build_object('author_id', v_author, 'full_name', v_name);
end $$;

-- One user at a time, with a reason, audited. The USN value is never written to the audit log.
create function public.admin_get_usn(p_user uuid, p_reason text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_usn text;
begin
  select pp.usn into v_usn from private.profile_private pp where pp.user_id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.log_admin('view_usn', v_uid, p_user, null, null, p_reason);
  return v_usn;
end $$;

create function public.admin_create_company(p_name text, p_slug text, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_id uuid;
begin
  perform private.log_admin('manage_company', v_uid, null, null, null, p_reason);
  insert into public.companies (name, slug) values (btrim(p_name), lower(btrim(p_slug))) returning id into v_id;
  return v_id;
end $$;

create function public.admin_add_company_alias(p_company uuid, p_alias text, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_id uuid;
begin
  if not exists (select 1 from public.companies c where c.id = p_company) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.log_admin('manage_company', v_uid, null, null, null, p_reason);
  insert into public.company_aliases (company_id, alias) values (p_company, btrim(p_alias)) returning id into v_id;
  perform private.rebuild_search_doc(e.id) from public.experiences e where e.company_id = p_company;
  return v_id;
end $$;

create function public.admin_list_audit(p_reason text, p_limit integer default 50)
returns table (
  id bigint, action public.admin_action, actor_id uuid, target_user_id uuid, experience_id uuid,
  case_id uuid, reason text, verification_method text, evidence_ref text, created_at timestamptz
) language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_admin();
begin
  perform private.log_admin('view_audit', v_uid, null, null, null, p_reason);
  return query
  select a.id, a.action, a.actor_id, a.target_user_id, a.experience_id, a.case_id, a.reason,
         a.verification_method, a.evidence_ref, a.created_at
  from private.admin_audit a
  order by a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- ---------- USN ownership disputes (decision U10) ----------
-- State machine: opened -> under_review -> notice_sent -> (contested) -> approved -> executed.
-- Release needs: a non-conflicted admin, institutional evidence (method + reference), a written
-- reason, notice to the holder, and an audit row at every step. If ownership cannot be shown,
-- no function moves a USN. Evidence itself is never stored here, only an opaque reference.

create function public.request_usn_review(p_usn text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_member();
  v_usn text := private.normalise_usn(p_usn);
  v_holder uuid;
  v_case uuid;
begin
  perform private.usn_rate_limit(v_uid);
  select pp.user_id into v_holder from private.profile_private pp where pp.usn = v_usn;
  if not found then return jsonb_build_object('status', 'usn_available'); end if;
  if v_holder = v_uid then return jsonb_build_object('status', 'already_yours'); end if;
  if exists (select 1 from private.profile_private pp where pp.user_id = v_uid) then
    return jsonb_build_object('status', 'already_has_usn');
  end if;
  begin
    insert into private.usn_disputes (claimant_id, claimed_usn, holder_id)
    values (v_uid, v_usn, v_holder) returning id into v_case;
  exception when unique_violation then
    return jsonb_build_object('status', 'case_exists');
  end;
  return jsonb_build_object('status', 'opened', 'case_id', v_case);
end $$;

-- USN release is OFF until private.settings 'usn_release_enabled' = 'true'. It stays off until the
-- core team has written down which institutional evidence is acceptable (decision U10). Denying a
-- case is always allowed, so cases can be closed while the process is disabled.
create function private.usn_case_lock(p_case uuid, p_admin uuid, p_requires_enabled boolean default true)
returns private.usn_disputes language plpgsql security definer set search_path = '' as $$
declare c private.usn_disputes;
begin
  if p_requires_enabled and coalesce(
       (select s.value from private.settings s where s.key = 'usn_release_enabled'), 'false') <> 'true' then
    raise exception 'usn_release_disabled' using errcode = '55000';
  end if;
  select d.* into c from private.usn_disputes d where d.id = p_case for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- An admin who is the claimant or the current holder is conflicted and can never act.
  if p_admin = c.claimant_id or coalesce(p_admin = c.holder_id, false) then
    raise exception 'conflict' using errcode = '42501';
  end if;
  return c;
end $$;

create function public.admin_usn_case_take(p_case uuid, p_no_conflict_attested boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  c private.usn_disputes := private.usn_case_lock(p_case, v_uid);
begin
  if c.state <> 'opened' then raise exception 'invalid_state' using errcode = '55000'; end if;
  if p_no_conflict_attested is not true then
    raise exception 'conflict_attestation_required' using errcode = '22023';
  end if;
  perform private.log_admin('take_usn_case', v_uid, c.claimant_id, null, c.id, p_reason);
  update private.usn_disputes set reviewer_id = v_uid, state = 'under_review', conflict_attested = true
  where id = c.id;
end $$;

create function public.admin_usn_case_notify(p_case uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  c private.usn_disputes := private.usn_case_lock(p_case, v_uid);
  v_days integer;
begin
  if c.state <> 'under_review' or c.reviewer_id is distinct from v_uid or c.holder_id is null then
    raise exception 'invalid_state' using errcode = '55000';
  end if;
  select coalesce((select s.value::integer from private.settings s where s.key = 'usn_objection_days'), 7)
  into v_days;
  perform private.log_admin('notify_usn_holder', v_uid, c.holder_id, null, c.id, p_reason);
  insert into private.user_notices (user_id, kind, ref_id) values (c.holder_id, 'usn_dispute_opened', c.id);
  update private.usn_disputes
  set state = 'notice_sent', notice_sent_at = now(), notice_deadline = now() + make_interval(days => v_days)
  where id = c.id;
end $$;

create function public.object_to_usn_release(p_case uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_member();
begin
  update private.usn_disputes
  set state = 'contested', contested_at = now()
  where id = p_case and holder_id = v_uid and state = 'notice_sent';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

create function public.admin_usn_case_approve(
  p_case uuid, p_reason text, p_method text, p_evidence_ref text, p_no_conflict_attested boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  c private.usn_disputes := private.usn_case_lock(p_case, v_uid);
begin
  if p_no_conflict_attested is not true then
    raise exception 'conflict_attestation_required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_method, ''))) < 3 or length(btrim(coalesce(p_evidence_ref, ''))) < 3 then
    raise exception 'evidence_required' using errcode = '22023';
  end if;
  if c.state = 'notice_sent' then
    if now() < c.notice_deadline then
      raise exception 'objection_window_open' using errcode = '55000';
    end if;
  elsif c.state = 'contested' then
    -- The holder objected: a different admin from the reviewer must approve.
    if v_uid = c.reviewer_id then
      raise exception 'second_admin_required' using errcode = '42501';
    end if;
  else
    raise exception 'invalid_state' using errcode = '55000';
  end if;
  perform private.log_admin('approve_usn_case', v_uid, c.claimant_id, null, c.id, p_reason,
                            btrim(p_method), btrim(p_evidence_ref));
  update private.usn_disputes
  set state = 'approved', decided_at = now(),
      verification_method = btrim(p_method), evidence_ref = btrim(p_evidence_ref)
  where id = c.id;
end $$;

create function public.admin_usn_case_deny(p_case uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  c private.usn_disputes := private.usn_case_lock(p_case, v_uid, false);
begin
  if c.state not in ('opened', 'under_review', 'notice_sent', 'contested', 'approved') then
    raise exception 'invalid_state' using errcode = '55000';
  end if;
  perform private.log_admin('deny_usn_case', v_uid, c.claimant_id, null, c.id, p_reason);
  update private.usn_disputes set state = 'denied', decided_at = now() where id = c.id;
end $$;

-- Atomic transfer from an approved case. Aborts if anything changed since review.
create function public.admin_usn_case_execute(p_case uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  c private.usn_disputes := private.usn_case_lock(p_case, v_uid);
begin
  if c.state <> 'approved' then raise exception 'invalid_state' using errcode = '55000'; end if;
  if c.holder_id is null or not exists (
    select 1 from private.profile_private pp where pp.user_id = c.holder_id and pp.usn = c.claimed_usn
  ) then
    raise exception 'holder_changed' using errcode = '55000';
  end if;
  if exists (select 1 from private.profile_private pp where pp.user_id = c.claimant_id) then
    raise exception 'claimant_has_usn' using errcode = '55000';
  end if;
  perform private.log_admin('execute_usn_release', v_uid, c.claimant_id, null, c.id, p_reason,
                            c.verification_method, c.evidence_ref);
  delete from private.profile_private where user_id = c.holder_id;
  insert into private.profile_private (user_id, usn) values (c.claimant_id, c.claimed_usn);
  -- The former holder must enter a valid USN before posting again. Reading and old posts stay.
  perform set_config('app.profile_change', '1', true);
  update public.profiles set onboarded_at = null where id = c.holder_id;
  perform set_config('app.profile_change', '', true);
  insert into private.user_notices (user_id, kind, ref_id)
  values (c.holder_id, 'usn_released', c.id), (c.claimant_id, 'usn_released', c.id);
  update private.usn_disputes set state = 'executed', executed_at = now() where id = c.id;
end $$;

-- ---------- Account deletion step 2 and maintenance (service role only) ----------

-- Decision U5. Deletes the user's experiences (cascading to rounds, questions, topics, resources,
-- eligible departments, the author mapping and reports about those posts), the USN, notices,
-- disputes they opened, and the profile. Audit rows keep action, role and time only, because
-- their foreign keys become NULL. The server deletes the auth user afterwards.
create function public.delete_account_data(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role public.user_role;
begin
  select p.role into v_role from public.profiles p where p.id = p_user and p.deletion_requested_at is not null;
  if not found then raise exception 'deletion_not_requested' using errcode = '55000'; end if;
  if v_role = 'admin' and (
    select count(*) from public.profiles p where p.role = 'admin' and p.deletion_requested_at is null
  ) < 1 then
    raise exception 'last_admin' using errcode = '55000';
  end if;
  delete from public.experiences e using private.experience_authors a
  where a.experience_id = e.id and a.author_id = p_user;
  update public.reports set details = null where reporter_id = p_user;
  delete from private.profile_private where user_id = p_user;
  delete from public.profiles where id = p_user;
  insert into private.deletion_ledger (user_id) values (p_user) on conflict do nothing;
end $$;

create function public.purge_expired_drafts(p_days integer default 90)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if p_days is null or p_days < 1 then raise exception 'invalid_input' using errcode = '22023'; end if;
  delete from public.experiences e
  where e.status = 'draft' and e.updated_at < now() - make_interval(days => p_days);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create function public.purge_deletion_ledger(p_days integer default 30)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if p_days is null or p_days < 1 then raise exception 'invalid_input' using errcode = '22023'; end if;
  delete from private.deletion_ledger l where l.deleted_at < now() - make_interval(days => p_days);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
