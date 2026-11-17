-- Phase 3 (moderation), part 2 of 2: request-changes vs final rejection, mandatory notes,
-- version-checked decisions, review views and history.
--
-- STATUS: LOCAL ONLY, NOT APPLIED to any hosted database.
--
-- Lifecycle (owner decision SC-2):
--   draft -> pending                   author submits
--   pending -> approved                moderator approves (public from now on)
--   pending -> returned                moderator requests changes (reason code + note required)
--   pending -> rejected                moderator rejects, final (reason code + note required)
--   pending -> draft                   author cancels before review (O-4)
--   returned -> pending                author edits and resubmits
--   approved -> removed / withdrawn, removed -> approved   (unchanged)
-- 'rejected' is terminal for the author: no edits, no resubmission. The author may delete it, and
-- it is purged 90 days after the decision (O-4), like returned posts left untouched.
--
-- Concurrency: decisions lock the row (SELECT ... FOR UPDATE) and require status 'pending', so a
-- second moderator gets invalid_state. Decisions also carry the row_version the moderator reviewed:
-- if the author changed the post since (cancel, edit, resubmit), the decision fails with
-- version_conflict, so nobody approves content they did not see.

-- ---------- Constraints ----------
alter table public.experiences drop constraint experiences_complete_when_live;
alter table public.experiences add constraint experiences_complete_when_live check (
  status in ('draft', 'returned', 'rejected')
  or (company_id is not null and role_title is not null and opportunity_type is not null
      and campus_type is not null and recruitment_year is not null and result is not null
      and is_anonymous is not null)
);

alter table public.moderation_actions drop constraint moderation_reject_needs_reason;
alter table public.moderation_actions add constraint moderation_reject_needs_reason
  check (action not in ('reject', 'return', 'remove') or reason_code is not null);

-- ---------- Lifecycle helpers ----------
create or replace function private.valid_transition(p_from public.exp_status, p_to public.exp_status)
returns boolean language sql immutable set search_path = '' as $$
  select (p_from::text, p_to::text) in (
    ('draft', 'pending'), ('returned', 'pending'),
    ('pending', 'approved'), ('pending', 'rejected'), ('pending', 'returned'), ('pending', 'draft'),
    ('approved', 'removed'), ('removed', 'approved'),
    ('approved', 'withdrawn')
  )
$$;

create or replace function private.experiences_guard()
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
  -- Content is editable only while it is the author's working copy (U6: no edits after approval).
  if old.status not in ('draft', 'returned') and
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
  -- Deleting a whole post (cascade from experiences) is allowed in any state; edits only while
  -- the post is the author's working copy.
  if tg_op = 'DELETE' and not exists (select 1 from public.experiences e where e.id = v_exp) then
    return old;
  end if;
  if v_status not in ('draft', 'returned') then
    raise exception 'content_locked' using errcode = '55000';
  end if;
  return coalesce(new, old);
end $$;

create or replace function private.transition_experience(p_id uuid, p_to public.exp_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.transition', '1', true);
  update public.experiences e set
    status = p_to,
    submitted_at = case when p_to = 'pending' then now()
                        when p_to = 'draft' then null
                        else e.submitted_at end,
    approved_at = case when p_to = 'approved' and e.approved_at is null then now() else e.approved_at end,
    withdrawn_at = case when p_to = 'withdrawn' then now() else e.withdrawn_at end,
    rejected_at = case when p_to in ('rejected', 'returned') then now() else e.rejected_at end,
    updated_at = case when p_to = 'draft' then now() else e.updated_at end,
    -- Each decision replaces the note; approval clears it.
    moderation_note = case when p_to in ('approved', 'pending') then null else e.moderation_note end
  where e.id = p_id;
  perform set_config('app.transition', '', true);
end $$;

-- ---------- Author functions ----------

-- Same as before, except that the editable states are draft and returned.
create or replace function public.save_draft(p_id uuid, p_expected_version integer, p_payload jsonb)
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
    select e.id, e.row_version, e.status into v_id, v_version, v_status
    from public.experiences e
    join private.experience_authors a on a.experience_id = e.id
    where e.id = p_id and a.author_id = v_uid
    for update of e;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_status not in ('draft', 'returned') then
      raise exception 'invalid_state' using errcode = '55000';
    end if;
    if p_expected_version is distinct from v_version then
      raise exception 'version_conflict' using errcode = '40001';
    end if;
  end if;

  begin
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

-- Submit from draft or returned (rejected is final). Duplicate guard from migration 012 kept.
create or replace function public.submit_experience(p_id uuid)
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
  if v_exp.status not in ('draft', 'returned') then
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
  if exists (
    select 1
    from private.experience_authors a
    join public.experiences o on o.id = a.experience_id
    where a.author_id = v_uid
      and o.id <> p_id
      and o.status in ('pending', 'approved')
      and o.company_id = v_exp.company_id
      and o.recruitment_year = v_exp.recruitment_year
      and lower(btrim(o.role_title)) = lower(btrim(v_exp.role_title))
  ) then
    raise exception 'duplicate_submission' using errcode = '23505';
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

-- Authors may delete anything that is not public and not under review: drafts, returned and
-- rejected posts. Pending posts are cancelled first; approved ones are withdrawn (U12).
create or replace function public.delete_draft(p_id uuid)
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
  if v_status not in ('draft', 'returned', 'rejected') then
    raise exception 'invalid_state' using errcode = '55000';
  end if;
  delete from public.experiences where id = p_id;
end $$;

-- ---------- Moderation ----------

-- New signature: adds p_expected_version (the row_version the moderator reviewed).
drop function public.moderate_experience(uuid, text, public.reason_code, text);

create function public.moderate_experience(
  p_id uuid,
  p_action text,
  p_reason public.reason_code default null,
  p_note text default null,
  p_expected_version integer default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_staff();
  v_role text := private.caller_role()::text;
  v_status public.exp_status;
  v_version integer;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 1000), '');
begin
  select e.status, e.row_version into v_status, v_version
  from public.experiences e where e.id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- A moderator or admin can never moderate their own post.
  if private.is_author(p_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_expected_version is not null and p_expected_version is distinct from v_version then
    raise exception 'version_conflict' using errcode = '40001';
  end if;

  if p_action = 'approve' then
    if v_status <> 'pending' then raise exception 'invalid_state' using errcode = '55000'; end if;
    perform private.transition_experience(p_id, 'approved');
    perform private.log_mod('approve', p_id, null, v_uid, v_role, null);
  elsif p_action in ('return', 'reject') then
    if v_status <> 'pending' then raise exception 'invalid_state' using errcode = '55000'; end if;
    if p_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;
    if v_note is null or length(v_note) < 10 then raise exception 'note_required' using errcode = '22023'; end if;
    perform private.transition_experience(p_id, case when p_action = 'return'
      then 'returned'::public.exp_status else 'rejected'::public.exp_status end);
    update public.experiences set moderation_note = v_note where id = p_id;
    perform private.log_mod(p_action::public.mod_action, p_id, null, v_uid, v_role, p_reason);
  elsif p_action = 'remove' then
    if v_status <> 'approved' then raise exception 'invalid_state' using errcode = '55000'; end if;
    if p_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;
    perform private.transition_experience(p_id, 'removed');
    update public.experiences set moderation_note = v_note where id = p_id;
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

-- Full post for review, now including returned and rejected posts. Author name only when the post
-- is not anonymous (U7). Never the author id, email or USN.
create or replace function public.moderation_experience_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_json jsonb;
begin
  perform private.require_staff();
  select private.experience_json(e.id) || jsonb_build_object(
           'author_name',
           case when e.is_anonymous is false then (
             select p.full_name from private.experience_authors a
             join public.profiles p on p.id = a.author_id where a.experience_id = e.id) end,
           'is_own', private.is_author(e.id),
           'submitted_at', e.submitted_at,
           'decided_at', coalesce(e.rejected_at, e.approved_at))
  into v_json
  from public.experiences e
  where e.id = p_id and e.status in ('pending', 'approved', 'removed', 'returned', 'rejected');
  if v_json is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return v_json;
end $$;

-- Queue view: adds returned/rejected and the fields needed for review (appended columns only).
create or replace view public.moderation_experiences with (security_invoker = false) as
select
  e.id, e.status, c.name as company_name, e.role_title, e.opportunity_type, e.campus_type,
  d.code as department_code, b.grad_year as batch_year, e.recruitment_year, e.result,
  e.is_anonymous, e.moderation_note, e.submitted_at,
  case when e.is_anonymous is false then p.full_name end as author_name,
  e.row_version,
  coalesce(e.rejected_at, e.approved_at) as decided_at
from public.experiences e
join public.companies c on c.id = e.company_id
join public.departments d on d.id = e.department_id
join public.batches b on b.id = e.batch_id
left join private.experience_authors a on a.experience_id = e.id and e.is_anonymous is false
left join public.profiles p on p.id = a.author_id
where private.is_staff() and e.status in ('pending', 'approved', 'removed', 'returned', 'rejected');

-- History: staff see which staff member acted (accountability). Author events carry no actor, so
-- they never identify an author. Deleted staff show as NULL.
create or replace view public.moderation_history with (security_invoker = false) as
select m.id, m.action, m.experience_id, m.report_id, m.actor_role, m.reason_code, m.created_at,
       case when m.actor_role in ('moderator', 'admin') then p.full_name end as actor_name
from public.moderation_actions m
left join public.profiles p on p.id = m.actor_id
where private.is_staff();

-- O-4 purge covers final rejections and returned posts left untouched for 90 days.
create or replace function public.purge_rejected_experiences(p_days integer default 90)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if p_days is null or p_days < 1 then raise exception 'invalid_input' using errcode = '22023'; end if;
  delete from public.experiences e
  where e.status in ('rejected', 'returned')
    and greatest(coalesce(e.rejected_at, e.updated_at), e.updated_at) < now() - make_interval(days => p_days);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------- Grants ----------
revoke execute on function public.moderate_experience(uuid, text, public.reason_code, text, integer)
  from public, anon, authenticated;
grant execute on function public.moderate_experience(uuid, text, public.reason_code, text, integer)
  to authenticated;
