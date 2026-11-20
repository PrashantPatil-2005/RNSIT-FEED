-- Free company entry in the post form (supersedes decision U14 "admin-only companies" for
-- members' own posts).
--
-- Authors type the company name. save_draft keeps the typed text (experiences.company_input) and
-- links company_id when the text matches an existing company name or alias (case-insensitive).
-- If nothing matches, submit_experience creates the company UNLISTED: it exists so the pending
-- post, the duplicate guard and the moderation views work unchanged, but it is hidden from the
-- public until a post that uses it is approved. Approval lists it (trigger, so
-- moderate_experience is not redefined). An unlisted company that no post uses any more is
-- deleted automatically, so rejected, deleted or re-edited posts leave nothing behind.
-- Wrong spellings: a moderator returns the post, or an admin renames/merges the company.

-- ---------- Columns ----------
alter table public.companies add column listed boolean not null default true;

alter table public.experiences add column company_input text
  check (company_input is null or length(company_input) between 1 and 120);

-- Existing posts: remember the current company name as the typed text.
update public.experiences e set company_input = c.name
from public.companies c where c.id = e.company_id and e.company_input is null;

-- ---------- Visibility ----------
-- Everyone sees listed companies; staff also see unlisted ones (moderation and admin pages).
drop policy companies_read on public.companies;
create policy companies_read on public.companies for select to anon, authenticated using (listed);
create policy companies_read_staff on public.companies for select to authenticated
  using (private.is_staff());

-- ---------- Helpers ----------

-- Trim and collapse inner whitespace; NULL for empty input. At most 120 characters.
create function private.clean_company_name(p_name text)
returns text language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 120), '')
$$;

-- The company whose name or alias equals the text (case-insensitive), listed or not.
create function private.find_company(p_name text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from (
    select c.id, 1 as pri from public.companies c
    where lower(c.name) = lower(private.clean_company_name(p_name))
    union all
    select a.company_id, 2 from public.company_aliases a
    where lower(a.alias) = lower(private.clean_company_name(p_name))
  ) m order by pri limit 1
$$;

-- Find or create (unlisted) the company for a typed name. Safe against concurrent submits.
create function private.resolve_company(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_name text := private.clean_company_name(p_name);
  v_base text;
  v_slug text;
  v_id uuid;
  v_n integer := 1;
begin
  if v_name is null then return null; end if;
  v_base := btrim(left(btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-'), 60), '-');
  if v_base = '' then v_base := 'company'; end if;
  loop
    v_id := private.find_company(v_name);
    if v_id is not null then return v_id; end if;
    v_slug := case when v_n = 1 then v_base else v_base || '-' || v_n end;
    begin
      insert into public.companies (name, slug, listed) values (v_name, v_slug, false)
      returning id into v_id;
      return v_id;
    exception when unique_violation then
      -- Same name created concurrently (found on the next pass) or the slug is taken.
      v_n := v_n + 1;
      if v_n > 50 then raise exception 'invalid_input' using errcode = '22023'; end if;
    end;
  end loop;
end $$;

-- ---------- Triggers ----------

-- Approval (or an admin moving an approved post) makes its company public.
create function private.list_company_on_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.companies set listed = true where id = new.company_id and not listed;
  return null;
end $$;

create trigger experiences_list_company
  after insert or update of status, company_id on public.experiences
  for each row when (new.status = 'approved' and new.company_id is not null)
  execute function private.list_company_on_approval();

-- An unlisted company that no post (any status) uses any more is removed.
create function private.drop_orphan_company()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.company_id is not distinct from old.company_id then return null; end if;
  -- admin_merge_companies deletes the source company itself.
  if current_setting('app.company_merge', true) = '1' then return null; end if;
  delete from public.companies c
  where c.id = old.company_id and not c.listed
    and not exists (select 1 from public.experiences e where e.company_id = c.id);
  return null;
end $$;

create trigger experiences_drop_orphan_company
  after delete or update of company_id on public.experiences
  for each row when (old.company_id is not null)
  execute function private.drop_orphan_company();

-- ---------- save_draft: accept 'company_name' ----------
-- Patched in place (like 20261120100000) so the rest of the body cannot drift. 'company_name'
-- sets the typed text and links a matching company (or none); the older 'company_id' key still
-- works and clears the typed text.
do $$
declare
  v_fn regprocedure := 'public.save_draft(uuid, integer, jsonb)'::regprocedure;
  v_def text := pg_get_functiondef('public.save_draft(uuid, integer, jsonb)'::regprocedure);
  v_old text := $s$company_id = case when p_payload ? 'company_id' then nullif(p_payload ->> 'company_id', '')::uuid else e.company_id end,$s$;
  v_new text := $s$company_input = case when p_payload ? 'company_name' then private.clean_company_name(p_payload ->> 'company_name')
                           when p_payload ? 'company_id' then null else e.company_input end,
      company_id = case when p_payload ? 'company_name' then private.find_company(p_payload ->> 'company_name')
                        when p_payload ? 'company_id' then nullif(p_payload ->> 'company_id', '')::uuid else e.company_id end,$s$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'expected company_id assignment in %, definition changed', v_fn;
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

-- ---------- submit_experience: resolve the typed company ----------
-- Same as migration 014, plus: a draft with typed text but no linked company gets one (found or
-- created unlisted) before the completeness and duplicate checks.
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
  if v_exp.company_id is null and v_exp.company_input is not null then
    v_exp.company_id := private.resolve_company(v_exp.company_input);
    update public.experiences set company_id = v_exp.company_id where id = p_id;
    perform private.rebuild_search_doc(p_id);
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

-- ---------- Read paths ----------

-- Same as migration 005, plus company_name (linked company, else the typed text) and
-- company_listed (false = new company created by this post, not public yet).
create or replace function private.experience_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'status', e.status, 'row_version', e.row_version,
    'moderation_note', e.moderation_note,
    'company_id', e.company_id, 'role_title', e.role_title,
    'company_name', coalesce(c.name, e.company_input),
    'company_listed', c.listed,
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
  from public.experiences e
  left join public.companies c on c.id = e.company_id
  where e.id = p_id
$$;

-- Author list: appends company_name (the author may see their own unlisted company).
create or replace view public.my_experiences with (security_invoker = false) as
select e.id, e.status, e.row_version, e.company_id, e.role_title, e.opportunity_type, e.campus_type,
       e.recruitment_year, e.result, e.is_anonymous, e.moderation_note,
       e.created_at, e.updated_at, e.submitted_at, e.approved_at, e.withdrawn_at,
       coalesce(c.name, e.company_input) as company_name
from public.experiences e
join private.experience_authors a on a.experience_id = e.id
left join public.companies c on c.id = e.company_id
where a.author_id = auth.uid();

-- Moderation queue: appends company_listed so new companies stand out for review.
create or replace view public.moderation_experiences with (security_invoker = false) as
select
  e.id, e.status, c.name as company_name, e.role_title, e.opportunity_type, e.campus_type,
  d.code as department_code, b.grad_year as batch_year, e.recruitment_year, e.result,
  e.is_anonymous, e.moderation_note, e.submitted_at,
  case when e.is_anonymous is false then p.full_name end as author_name,
  e.row_version,
  coalesce(e.rejected_at, e.approved_at) as decided_at,
  c.listed as company_listed
from public.experiences e
join public.companies c on c.id = e.company_id
join public.departments d on d.id = e.department_id
join public.batches b on b.id = e.batch_id
left join private.experience_authors a on a.experience_id = e.id and e.is_anonymous is false
left join public.profiles p on p.id = a.author_id
where private.is_staff() and e.status in ('pending', 'approved', 'removed', 'returned', 'rejected');

-- ---------- Grants ----------
revoke execute on function private.clean_company_name(text) from public, anon, authenticated;
revoke execute on function private.find_company(text) from public, anon, authenticated;
revoke execute on function private.resolve_company(text) from public, anon, authenticated;
revoke execute on function private.list_company_on_approval() from public, anon, authenticated;
revoke execute on function private.drop_orphan_company() from public, anon, authenticated;
