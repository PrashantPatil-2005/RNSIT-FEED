-- Member-facing functions. These are the only way a signed-in user changes protected state.
-- Direct INSERT/UPDATE/DELETE on every table is revoked from API roles in the last migration.
-- Each function is SECURITY DEFINER with search_path = '' and takes the caller from auth.uid().

-- ---------- USN claim helpers ----------

create function private.usn_rate_limit(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from private.usn_attempts a
      where a.user_id = p_user and a.attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited' using errcode = '53400';
  end if;
  insert into private.usn_attempts (user_id) values (p_user);
end $$;

create function private.normalise_usn(p_usn text)
returns text language plpgsql immutable set search_path = '' as $$
declare v text := upper(regexp_replace(coalesce(p_usn, ''), '\s', '', 'g'));
begin
  if v !~ '^1RN[0-9]{2}[A-Z]{2}[0-9]{3}$' then
    raise exception 'invalid_usn' using errcode = '22023';
  end if;
  return v;
end $$;

-- ---------- Onboarding and USN ----------

-- Returns 'ok' or 'usn_unavailable'. A taken USN is NOT an exception so the attempt is recorded
-- for rate limiting, and the response never says who holds the USN. The USN alone grants nothing.
create function public.complete_onboarding(p_department_id smallint, p_batch_id smallint, p_usn text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_member();
  v_usn text := private.normalise_usn(p_usn);
begin
  if exists (select 1 from public.profiles p where p.id = v_uid and p.onboarded_at is not null) then
    raise exception 'already_onboarded' using errcode = '55000';
  end if;
  if not exists (select 1 from public.departments d where d.id = p_department_id and d.active)
     or not exists (select 1 from public.batches b where b.id = p_batch_id) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform private.usn_rate_limit(v_uid);
  begin
    insert into private.profile_private (user_id, usn) values (v_uid, v_usn)
    on conflict (user_id) do update set usn = excluded.usn;
  exception when unique_violation then
    return 'usn_unavailable';
  end;
  perform set_config('app.profile_change', '1', true);
  update public.profiles p
  set department_id = p_department_id, batch_id = p_batch_id, onboarded_at = now()
  where p.id = v_uid;
  perform set_config('app.profile_change', '', true);
  return 'ok';
end $$;

create function public.get_my_usn()
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_member();
begin
  return (select pp.usn from private.profile_private pp where pp.user_id = v_uid);
end $$;

-- ---------- Drafts (autosave) ----------

create function public.save_draft(p_id uuid, p_expected_version integer, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_onboarded();
  v_id uuid;
  v_version integer;
  v_status public.exp_status;
  v_dep smallint;
  v_bat smallint;
  v_round jsonb;
  v_q jsonb;
  v_round_id uuid;
  v_q_id uuid;
  v_pos integer;
  v_qpos integer;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  if p_id is null then
    if (select count(*) from private.experience_authors a
        join public.experiences e on e.id = a.experience_id
        where a.author_id = v_uid and e.status = 'draft') >= 10 then
      raise exception 'limit_reached' using errcode = '53400';
    end if;
    select p.department_id, p.batch_id into v_dep, v_bat from public.profiles p where p.id = v_uid;
    insert into public.experiences (department_id, batch_id) values (v_dep, v_bat) returning id into v_id;
    insert into private.experience_authors (experience_id, author_id) values (v_id, v_uid);
    v_version := 0;
  else
    -- Same error for "does not exist" and "belongs to someone else": no existence leak.
    select e.id, e.row_version, e.status into v_id, v_version, v_status
    from public.experiences e
    join private.experience_authors a on a.experience_id = e.id
    where e.id = p_id and a.author_id = v_uid
    for update of e;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_status not in ('draft', 'rejected') then
      raise exception 'invalid_state' using errcode = '55000';
    end if;
    if p_expected_version is distinct from v_version then
      raise exception 'version_conflict' using errcode = '40001';
    end if;
  end if;

  begin
    -- Only whitelisted keys are read. A "status" key (or any other) in the payload is ignored.
    update public.experiences e set
      company_id = case when p_payload ? 'company_id' then nullif(p_payload ->> 'company_id', '')::uuid else e.company_id end,
      role_title = case when p_payload ? 'role_title' then nullif(btrim(p_payload ->> 'role_title'), '') else e.role_title end,
      opportunity_type = case when p_payload ? 'opportunity_type' then nullif(p_payload ->> 'opportunity_type', '')::public.opportunity_type else e.opportunity_type end,
      campus_type = case when p_payload ? 'campus_type' then nullif(p_payload ->> 'campus_type', '')::public.campus_type else e.campus_type end,
      recruitment_year = case when p_payload ? 'recruitment_year' then nullif(p_payload ->> 'recruitment_year', '')::smallint else e.recruitment_year end,
      min_cgpa = case when p_payload ? 'min_cgpa' then nullif(p_payload ->> 'min_cgpa', '')::numeric else e.min_cgpa end,
      backlogs_allowed = case when p_payload ? 'backlogs_allowed' then nullif(p_payload ->> 'backlogs_allowed', '')::smallint else e.backlogs_allowed end,
      result = case when p_payload ? 'result' then nullif(p_payload ->> 'result', '')::public.result_type else e.result end,
      prep_tips = case when p_payload ? 'prep_tips' then nullif(btrim(p_payload ->> 'prep_tips'), '') else e.prep_tips end,
      is_anonymous = case when p_payload ? 'is_anonymous' then (p_payload ->> 'is_anonymous')::boolean else e.is_anonymous end,
      row_version = e.row_version + 1,
      updated_at = now()
    where e.id = v_id;

    if p_payload ? 'eligible_department_ids' then
      delete from public.experience_eligible_departments where experience_id = v_id;
      insert into public.experience_eligible_departments (experience_id, department_id)
      select distinct v_id, x::smallint from jsonb_array_elements_text(p_payload -> 'eligible_department_ids') as x;
    end if;

    if p_payload ? 'resources' then
      if jsonb_typeof(p_payload -> 'resources') <> 'array' or jsonb_array_length(p_payload -> 'resources') > 10 then
        raise exception 'invalid_input' using errcode = '22023';
      end if;
      delete from public.experience_resources where experience_id = v_id;
      insert into public.experience_resources (experience_id, position, url, label)
      select v_id, t.ord::smallint, btrim(t.r ->> 'url'), nullif(btrim(t.r ->> 'label'), '')
      from jsonb_array_elements(p_payload -> 'resources') with ordinality as t(r, ord);
    end if;

    if p_payload ? 'rounds' then
      if jsonb_typeof(p_payload -> 'rounds') <> 'array' or jsonb_array_length(p_payload -> 'rounds') > 12 then
        raise exception 'invalid_input' using errcode = '22023';
      end if;
      delete from public.rounds where experience_id = v_id;
      v_pos := 0;
      for v_round in select r.value from jsonb_array_elements(p_payload -> 'rounds') as r loop
        v_pos := v_pos + 1;
        insert into public.rounds (experience_id, position, round_type, duration_min, platform, difficulty, notes)
        values (
          v_id, v_pos,
          (v_round ->> 'round_type')::public.round_type,
          nullif(v_round ->> 'duration_min', '')::smallint,
          nullif(btrim(v_round ->> 'platform'), ''),
          nullif(v_round ->> 'difficulty', '')::smallint,
          nullif(btrim(v_round ->> 'notes'), '')
        ) returning id into v_round_id;
        if v_round ? 'topic_ids' then
          insert into public.round_topics (round_id, topic_id)
          select distinct v_round_id, x::smallint from jsonb_array_elements_text(v_round -> 'topic_ids') as x;
        end if;
        if v_round ? 'questions' then
          if jsonb_typeof(v_round -> 'questions') <> 'array' or jsonb_array_length(v_round -> 'questions') > 20 then
            raise exception 'invalid_input' using errcode = '22023';
          end if;
          v_qpos := 0;
          for v_q in select q.value from jsonb_array_elements(v_round -> 'questions') as q loop
            v_qpos := v_qpos + 1;
            insert into public.questions (round_id, position, body)
            values (v_round_id, v_qpos, btrim(v_q ->> 'body')) returning id into v_q_id;
            if v_q ? 'topic_ids' then
              insert into public.question_topics (question_id, topic_id)
              select distinct v_q_id, x::smallint from jsonb_array_elements_text(v_q -> 'topic_ids') as x;
            end if;
          end loop;
        end if;
      end loop;
    end if;
  exception
    when invalid_text_representation or numeric_value_out_of_range or check_violation
      or foreign_key_violation or not_null_violation or invalid_parameter_value
      or datatype_mismatch or unique_violation then
      raise exception 'invalid_input' using errcode = '22023';
  end;

  perform private.rebuild_search_doc(v_id);
  return jsonb_build_object('id', v_id, 'row_version', v_version + 1);
end $$;

create function public.delete_draft(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_onboarded();
  v_status public.exp_status;
begin
  select e.status into v_status
  from public.experiences e
  join private.experience_authors a on a.experience_id = e.id
  where e.id = p_id and a.author_id = v_uid
  for update of e;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_status <> 'draft' then raise exception 'invalid_state' using errcode = '55000'; end if;
  delete from public.experiences where id = p_id;
end $$;

-- The author's own full content, for resuming a draft on another device. Author only.
create function public.get_my_experience(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_member();
  if not private.is_author(p_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return private.experience_json(p_id);
end $$;

-- ---------- Submit, withdraw, report ----------

create function public.submit_experience(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_onboarded();
  v_exp public.experiences%rowtype;
begin
  select e.* into v_exp
  from public.experiences e
  join private.experience_authors a on a.experience_id = e.id
  where e.id = p_id and a.author_id = v_uid
  for update of e;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_exp.status not in ('draft', 'rejected') then
    raise exception 'invalid_state' using errcode = '55000';
  end if;
  if v_exp.company_id is null or v_exp.role_title is null or v_exp.opportunity_type is null
     or v_exp.campus_type is null or v_exp.recruitment_year is null or v_exp.result is null
     or v_exp.is_anonymous is null
     or not exists (select 1 from public.rounds r where r.experience_id = p_id)
     or not exists (select 1 from public.questions q join public.rounds r on r.id = q.round_id
                    where r.experience_id = p_id) then
    raise exception 'incomplete' using errcode = '22023';
  end if;
  if (select count(*) from private.experience_authors a
      join public.experiences e on e.id = a.experience_id
      where a.author_id = v_uid and e.status = 'pending') >= 5 then
    raise exception 'limit_reached' using errcode = '53400';
  end if;
  perform private.transition_experience(p_id, 'pending');
  perform private.log_mod(
    case when v_exp.status = 'draft' then 'submit'::public.mod_action else 'resubmit'::public.mod_action end,
    p_id, null, null, 'author', null);
end $$;

-- Withdrawal (decision U12): approved -> withdrawn. History is kept; author identity is not logged.
create function public.withdraw_experience(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_onboarded();
  v_status public.exp_status;
begin
  select e.status into v_status
  from public.experiences e
  join private.experience_authors a on a.experience_id = e.id
  where e.id = p_id and a.author_id = v_uid
  for update of e;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_status <> 'approved' then raise exception 'invalid_state' using errcode = '55000'; end if;
  perform private.transition_experience(p_id, 'withdrawn');
  perform private.close_open_reports(p_id);
  perform private.log_mod('withdraw', p_id, null, null, 'author', null);
end $$;

create function public.report_experience(p_id uuid, p_reason public.report_reason, p_details text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_onboarded();
begin
  if not exists (select 1 from public.experiences e where e.id = p_id and e.status = 'approved') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if private.is_author(p_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (select count(*) from public.reports r where r.reporter_id = v_uid and r.status = 'open') >= 10 then
    raise exception 'limit_reached' using errcode = '53400';
  end if;
  insert into public.reports (experience_id, reporter_id, reason, details)
  values (p_id, v_uid, p_reason, nullif(btrim(left(p_details, 1000)), ''))
  on conflict (experience_id, reporter_id) do nothing;
end $$;

create function public.mark_notice_read(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_member();
begin
  update private.user_notices set read_at = coalesce(read_at, now()) where id = p_id and user_id = v_uid;
end $$;

-- ---------- Account deletion request (step 1; step 2 is service-role only) ----------

create function public.request_account_deletion()
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_member();
begin
  if private.is_admin() and (
    select count(*) from public.profiles p where p.role = 'admin' and p.deletion_requested_at is null
  ) <= 1 then
    raise exception 'last_admin' using errcode = '55000';
  end if;
  perform set_config('app.profile_change', '1', true);
  update public.profiles p set deletion_requested_at = now() where p.id = v_uid;
  perform set_config('app.profile_change', '', true);
end $$;

-- ---------- Public discovery ----------

create function public.search_experiences(
  p_query text default null,
  p_company_id uuid default null,
  p_department_id smallint default null,
  p_batch_id smallint default null,
  p_opportunity public.opportunity_type default null,
  p_result public.result_type default null,
  p_round_type public.round_type default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, company_name text, company_slug text, role_title text,
  opportunity_type public.opportunity_type, campus_type public.campus_type,
  department_code text, batch_year smallint, recruitment_year smallint,
  result public.result_type, published_on date, author_name text, is_anonymous boolean, rank real
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_tsq tsquery;
begin
  if v_q is not null then v_tsq := websearch_to_tsquery('simple', left(v_q, 200)); end if;
  return query
  select pe.id, pe.company_name, pe.company_slug, pe.role_title, pe.opportunity_type, pe.campus_type,
         pe.department_code, pe.batch_year, pe.recruitment_year, pe.result, pe.published_on,
         pe.author_name, pe.is_anonymous,
         case when v_tsq is null then 0::real else ts_rank(e.search_doc, v_tsq) end
  from public.experiences e
  join public.public_experiences pe on pe.id = e.id
  where e.status = 'approved'
    and (v_tsq is null or e.search_doc @@ v_tsq)
    and (p_company_id is null or e.company_id = p_company_id)
    and (p_department_id is null or e.department_id = p_department_id)
    and (p_batch_id is null or e.batch_id = p_batch_id)
    and (p_opportunity is null or e.opportunity_type = p_opportunity)
    and (p_result is null or e.result = p_result)
    and (p_round_type is null or exists (
      select 1 from public.rounds r where r.experience_id = e.id and r.round_type = p_round_type))
  order by 14 desc, e.approved_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
end $$;
