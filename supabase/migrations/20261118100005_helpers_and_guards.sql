-- Internal helpers and guard triggers.
-- Every function: SECURITY DEFINER where it must read private data, search_path = '' and
-- fully qualified names. Nothing here is granted to API roles unless the last migration says so.
-- Authorization always comes from the database (profiles.role), never from request claims.

-- ---------- Caller identity and role checks ----------

create function private.caller_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.domain_verified and p.deletion_requested_at is null
$$;

create function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.caller_role() in ('moderator', 'admin'), false)
$$;

create function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.caller_role() = 'admin', false)
$$;

create function private.is_author(p_experience uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.experience_authors a
    where a.experience_id = p_experience and a.author_id = auth.uid()
  )
$$;

create function private.require_member()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.domain_verified and p.deletion_requested_at is null
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_uid;
end $$;

create function private.require_onboarded()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_member();
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.onboarded_at is not null) then
    raise exception 'onboarding_required' using errcode = '55000';
  end if;
  return v_uid;
end $$;

create function private.require_staff()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_onboarded();
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_uid;
end $$;

create function private.require_admin()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_onboarded();
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_uid;
end $$;

-- ---------- Sign-up guard (server-side domain restriction) ----------
-- Fails closed: if no allowed domain is configured, every sign-up is refused.
-- Exact domain match only: sub-domains are refused. Google's `hd` parameter is only a UI hint.

create function private.signup_allowed(p_email text, p_verified boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_domain text;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  select ltrim(lower(btrim(s.value)), '@') into v_domain
  from private.settings s where s.key = 'allowed_email_domain';
  if v_domain is null or v_domain = '' then return false; end if;
  if not coalesce(p_verified, false) then return false; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then return false; end if;
  return split_part(v_email, '@', 2) = v_domain;
end $$;

-- Enforced in the database so it still applies if the Auth hook is not switched on.
create function private.auth_users_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.signup_allowed(
    new.email,
    (new.email_confirmed_at is not null) or ((new.raw_user_meta_data ->> 'email_verified') = 'true')
  ) then
    raise exception 'signup_not_allowed' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger auth_users_guard before insert on auth.users
  for each row execute function private.auth_users_guard();

-- The display name comes from the Google-provided name once, at registration (decision U13).
-- The email local part is never used as a fallback because it may contain a USN.
create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, domain_verified)
  values (
    new.id,
    left(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      'RNSIT member'
    ), 120),
    true
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Supabase Before User Created hook wrapper. Event field names and the rejection format are
-- UNVERIFIED against a live project: the trigger above is the guarantee, this is an early refusal.
create function public.hook_before_user_created(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if private.signup_allowed(
    event -> 'user' ->> 'email',
    (event -> 'user' -> 'user_metadata' ->> 'email_verified') = 'true'
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'message', 'Sign-up is not allowed for this email address.', 'http_code', 403));
end $$;

-- ---------- USN normalisation ----------

create function private.usn_normalise()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.usn := upper(regexp_replace(new.usn, '\s', '', 'g'));
  new.updated_at := now();
  return new;
end $$;

create trigger profile_private_usn_normalise before insert or update on private.profile_private
  for each row execute function private.usn_normalise();

-- ---------- Protected-column and lifecycle guards ----------

create function private.profiles_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_setting('app.profile_change', true) is distinct from '1' then
    if (new.id, new.role, new.full_name, new.domain_verified, new.department_id, new.batch_id,
        new.onboarded_at, new.deletion_requested_at)
       is distinct from
       (old.id, old.role, old.full_name, old.domain_verified, old.department_id, old.batch_id,
        old.onboarded_at, old.deletion_requested_at) then
      raise exception 'protected_columns' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function private.profiles_guard();

create function private.valid_transition(p_from public.exp_status, p_to public.exp_status)
returns boolean language sql immutable set search_path = '' as $$
  select (p_from::text, p_to::text) in (
    ('draft', 'pending'), ('rejected', 'pending'),
    ('pending', 'approved'), ('pending', 'rejected'),
    ('approved', 'removed'), ('removed', 'approved'),
    ('approved', 'withdrawn')
  )
$$;

create function private.experiences_guard()
returns trigger language plpgsql set search_path = '' as $$
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
  -- Approved, pending, removed and withdrawn content cannot be edited (interim default for U6).
  if old.status not in ('draft', 'rejected') and
     (new.company_id, new.role_title, new.opportunity_type, new.campus_type, new.department_id,
      new.batch_id, new.recruitment_year, new.min_cgpa, new.backlogs_allowed, new.result,
      new.prep_tips, new.is_anonymous)
     is distinct from
     (old.company_id, old.role_title, old.opportunity_type, old.campus_type, old.department_id,
      old.batch_id, old.recruitment_year, old.min_cgpa, old.backlogs_allowed, old.result,
      old.prep_tips, old.is_anonymous) then
    raise exception 'content_locked' using errcode = '55000';
  end if;
  return new;
end $$;

create trigger experiences_guard before update on public.experiences
  for each row execute function private.experiences_guard();

-- Children (rounds, questions, resources, topics, eligible departments) are editable only while
-- the parent is a draft or rejected. A missing parent (cascade delete) is allowed.
create function private.children_lock()
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
  if v_status not in ('draft', 'rejected') then
    raise exception 'content_locked' using errcode = '55000';
  end if;
  return coalesce(new, old);
end $$;

create trigger rounds_lock before insert or update or delete on public.rounds
  for each row execute function private.children_lock();
create trigger resources_lock before insert or update or delete on public.experience_resources
  for each row execute function private.children_lock();
create trigger eligible_lock before insert or update or delete on public.experience_eligible_departments
  for each row execute function private.children_lock();
create trigger round_topics_lock before insert or update or delete on public.round_topics
  for each row execute function private.children_lock();
create trigger questions_lock before insert or update or delete on public.questions
  for each row execute function private.children_lock();
create trigger question_topics_lock before insert or update or delete on public.question_topics
  for each row execute function private.children_lock();

-- Alias must not equal any company name.
create function private.alias_not_company_name()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.companies c where lower(c.name) = lower(new.alias)) then
    raise exception 'alias_equals_company_name' using errcode = '23505';
  end if;
  return new;
end $$;

create trigger company_aliases_check before insert or update on public.company_aliases
  for each row execute function private.alias_not_company_name();

-- ---------- Audit tables are append-only against every role that goes through SQL ----------
-- Allowed: ON DELETE SET NULL updates (a referenced column going from a value to NULL).
-- Everything else, including DELETE and TRUNCATE, is refused. The table owner can still drop or
-- disable these triggers: that is an operational control, not a technical one.

create function private.audit_append_only()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_col text;
  i integer;
begin
  if tg_op <> 'UPDATE' then
    raise exception 'audit_immutable' using errcode = '42501';
  end if;
  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  for i in 0 .. tg_nargs - 1 loop
    v_col := tg_argv[i];
    if (v_new -> v_col) is distinct from (v_old -> v_col) and (v_new -> v_col) <> 'null'::jsonb then
      raise exception 'audit_immutable' using errcode = '42501';
    end if;
    v_old := v_old - v_col;
    v_new := v_new - v_col;
  end loop;
  if v_new is distinct from v_old then
    raise exception 'audit_immutable' using errcode = '42501';
  end if;
  return new;
end $$;

create function private.audit_no_truncate()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_immutable' using errcode = '42501';
end $$;

create trigger moderation_actions_append_only before update or delete on public.moderation_actions
  for each row execute function private.audit_append_only('actor_id', 'experience_id', 'report_id');
create trigger moderation_actions_no_truncate before truncate on public.moderation_actions
  for each statement execute function private.audit_no_truncate();

create trigger admin_audit_append_only before update or delete on private.admin_audit
  for each row execute function private.audit_append_only('actor_id', 'target_user_id', 'experience_id', 'case_id');
create trigger admin_audit_no_truncate before truncate on private.admin_audit
  for each statement execute function private.audit_no_truncate();

-- ---------- Internal write helpers (no grants) ----------

create function private.log_mod(
  p_action public.mod_action, p_experience uuid, p_report uuid,
  p_actor uuid, p_role text, p_reason public.reason_code
) returns void language sql security definer set search_path = '' as $$
  insert into public.moderation_actions (action, experience_id, report_id, actor_id, actor_role, reason_code)
  values (p_action, p_experience, p_report, p_actor, p_role, p_reason)
$$;

create function private.log_admin(
  p_action public.admin_action, p_actor uuid, p_target uuid, p_experience uuid, p_case uuid,
  p_reason text, p_method text default null, p_evidence text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  insert into private.admin_audit
    (action, actor_id, target_user_id, experience_id, case_id, reason, verification_method, evidence_ref)
  values (p_action, p_actor, p_target, p_experience, p_case, btrim(p_reason), p_method, p_evidence);
end $$;

create function private.transition_experience(p_id uuid, p_to public.exp_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.transition', '1', true);
  update public.experiences e set
    status = p_to,
    submitted_at = case when p_to = 'pending' then now() else e.submitted_at end,
    approved_at = case when p_to = 'approved' and e.approved_at is null then now() else e.approved_at end,
    withdrawn_at = case when p_to = 'withdrawn' then now() else e.withdrawn_at end,
    moderation_note = case when p_to = 'approved' then null else e.moderation_note end
  where e.id = p_id;
  perform set_config('app.transition', '', true);
end $$;

create function private.close_open_reports(p_experience uuid)
returns void language sql security definer set search_path = '' as $$
  update public.reports set status = 'moot', resolved_at = now()
  where experience_id = p_experience and status = 'open'
$$;

create function private.rebuild_search_doc(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.experiences e set search_doc =
    setweight(to_tsvector('simple', coalesce((select c.name from public.companies c where c.id = e.company_id), '')
      || ' ' || coalesce((select string_agg(a.alias, ' ') from public.company_aliases a where a.company_id = e.company_id), '')), 'A')
    || setweight(to_tsvector('simple', coalesce(e.role_title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce((
         select string_agg(q.body, ' ') from public.questions q
         join public.rounds r on r.id = q.round_id where r.experience_id = e.id), '')), 'B')
    || setweight(to_tsvector('simple', coalesce(e.prep_tips, '')), 'C')
  where e.id = p_id;
end $$;

-- Full content of one experience as JSON. Internal: callers add their own authorization and
-- decide whether to expose the author (this function never returns author identity).
create function private.experience_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'status', e.status, 'row_version', e.row_version,
    'moderation_note', e.moderation_note,
    'company_id', e.company_id, 'role_title', e.role_title,
    'opportunity_type', e.opportunity_type, 'campus_type', e.campus_type,
    'department_id', e.department_id, 'batch_id', e.batch_id,
    'recruitment_year', e.recruitment_year, 'min_cgpa', e.min_cgpa,
    'backlogs_allowed', e.backlogs_allowed, 'result', e.result,
    'prep_tips', e.prep_tips, 'is_anonymous', e.is_anonymous,
    'eligible_department_ids', coalesce((
      select jsonb_agg(d.department_id order by d.department_id)
      from public.experience_eligible_departments d where d.experience_id = e.id), '[]'::jsonb),
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object('url', r.url, 'label', r.label) order by r.position)
      from public.experience_resources r where r.experience_id = e.id), '[]'::jsonb),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'round_type', r.round_type, 'duration_min', r.duration_min, 'platform', r.platform,
        'difficulty', r.difficulty, 'notes', r.notes,
        'topic_ids', coalesce((select jsonb_agg(t.topic_id order by t.topic_id)
                               from public.round_topics t where t.round_id = r.id), '[]'::jsonb),
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'body', q.body,
            'topic_ids', coalesce((select jsonb_agg(qt.topic_id order by qt.topic_id)
                                   from public.question_topics qt where qt.question_id = q.id), '[]'::jsonb)
          ) order by q.position)
          from public.questions q where q.round_id = r.id), '[]'::jsonb)
      ) order by r.position)
      from public.rounds r where r.experience_id = e.id), '[]'::jsonb)
  )
  from public.experiences e where e.id = p_id
$$;
