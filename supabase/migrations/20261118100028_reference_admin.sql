-- Reference data management (owner request 2026-11-20, admin panel plan steps C1-C3).
--
-- Default is to hide, not delete: published posts point at companies, topics, departments and
-- batches, so a hard delete is allowed only when nothing uses the row (the foreign keys are
-- ON DELETE RESTRICT and stay that way). Every write is admin-only and audited.
--
-- C1 companies: rename (the old name is kept as an alias so search still finds it; the web address
--    never changes), remove an alias, merge a duplicate into another company, delete if unused.
-- C2 topics: hide from the post form (topics.active), show again, delete if unused.
-- C3 departments: add, rename, hide or show (departments.active already exists; codes never
--    change). Batches: add a graduation year, delete if unused.
-- admin_reference_usage() tells the admin pages how many rows use each item.

-- ---------- Schema ----------

alter table public.topics add column active boolean not null default true;

-- ---------- Merge support ----------

-- Same rules as migration 014, plus one narrow exception: a company merge (and nothing else) may
-- move a locked post to another company, signalled by app.company_merge inside
-- admin_merge_companies only. Every other column stays locked.
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
     (case when current_setting('app.company_merge', true) = '1' then old.company_id else new.company_id end,
      new.role_title, new.opportunity_type, new.campus_type, new.department_id,
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

-- ---------- Companies (C1) ----------

create function public.admin_rename_company(p_company uuid, p_name text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_old text;
  v_name text := btrim(coalesce(p_name, ''));
begin
  select c.name into v_old from public.companies c where c.id = p_company for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if length(v_name) not between 1 and 120 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if v_name = v_old then return; end if;
  perform private.log_admin('manage_company', v_uid, null, null, null, p_reason, null,
    'company:' || p_company || ':rename');
  -- The new name must not stay listed as an alias of this company.
  delete from public.company_aliases a where a.company_id = p_company and lower(a.alias) = lower(v_name);
  update public.companies set name = v_name where id = p_company;
  -- Keep the old spelling searchable unless a case-only change.
  if lower(v_old) <> lower(v_name) then
    insert into public.company_aliases (company_id, alias) values (p_company, v_old)
    on conflict do nothing;
  end if;
  perform private.rebuild_search_doc(e.id) from public.experiences e where e.company_id = p_company;
end $$;

create function public.admin_remove_company_alias(p_company uuid, p_alias text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_admin();
begin
  delete from public.company_aliases a
  where a.company_id = p_company and lower(a.alias) = lower(btrim(coalesce(p_alias, '')));
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.log_admin('manage_company', v_uid, null, null, null, p_reason, null,
    'company:' || p_company || ':remove_alias');
  perform private.rebuild_search_doc(e.id) from public.experiences e where e.company_id = p_company;
end $$;

-- Moves every post (any status) and alias from p_from to p_into, keeps p_from's name as an alias,
-- then deletes p_from. Its old web address stops working.
create function public.admin_merge_companies(p_from uuid, p_into uuid, p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_from_name text;
  v_moved integer;
begin
  if p_from = p_into then raise exception 'invalid_input' using errcode = '22023'; end if;
  -- Lock both rows in a fixed order so two merges cannot deadlock or cross.
  perform 1 from public.companies c where c.id in (p_from, p_into) order by c.id for update;
  select c.name into v_from_name from public.companies c where c.id = p_from;
  if not found or not exists (select 1 from public.companies c where c.id = p_into) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.log_admin('manage_company', v_uid, null, null, null, p_reason, null,
    'company:' || p_from || ':merged_into:' || p_into);

  perform set_config('app.company_merge', '1', true);
  update public.experiences set company_id = p_into where company_id = p_from;
  get diagnostics v_moved = row_count;
  perform set_config('app.company_merge', '', true);

  -- Aliases: drop any that the target already has (or that equal its name), move the rest.
  delete from public.company_aliases a
  where a.company_id = p_from and (
    exists (select 1 from public.company_aliases b where b.company_id = p_into and lower(b.alias) = lower(a.alias))
    or exists (select 1 from public.companies c where c.id = p_into and lower(c.name) = lower(a.alias))
  );
  update public.company_aliases set company_id = p_into where company_id = p_from;
  delete from public.companies where id = p_from;
  if not exists (select 1 from public.companies c where c.id = p_into and lower(c.name) = lower(v_from_name))
     and not exists (select 1 from public.company_aliases a where lower(a.alias) = lower(v_from_name)) then
    insert into public.company_aliases (company_id, alias) values (p_into, v_from_name);
  end if;

  perform private.rebuild_search_doc(e.id) from public.experiences e where e.company_id = p_into;
  return v_moved;
end $$;

create function public.admin_delete_company(p_company uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_admin();
begin
  perform 1 from public.companies c where c.id = p_company for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.experiences e where e.company_id = p_company) then
    raise exception 'in_use' using errcode = '23503';
  end if;
  perform private.log_admin('manage_company', v_uid, null, null, null, p_reason, null,
    'company:' || p_company || ':delete');
  delete from public.companies where id = p_company;  -- aliases cascade
end $$;

-- ---------- Topics (C2) ----------

create function public.admin_set_topic_active(p_topic smallint, p_active boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_admin();
begin
  if p_active is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  perform 1 from public.topics t where t.id = p_topic for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.log_admin('manage_topic', v_uid, null, null, null, p_reason, null,
    'topic:' || p_topic || case when p_active then ':show' else ':hide' end);
  update public.topics set active = p_active where id = p_topic;
end $$;

create function public.admin_delete_topic(p_topic smallint, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_admin();
begin
  perform 1 from public.topics t where t.id = p_topic for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.round_topics r where r.topic_id = p_topic)
     or exists (select 1 from public.question_topics q where q.topic_id = p_topic) then
    raise exception 'in_use' using errcode = '23503';
  end if;
  perform private.log_admin('manage_topic', v_uid, null, null, null, p_reason, null,
    'topic:' || p_topic || ':delete');
  delete from public.topics where id = p_topic;
end $$;

-- ---------- Departments and batches (C3) ----------

create function public.admin_create_department(p_code text, p_name text, p_reason text)
returns smallint language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_id smallint;
begin
  if v_code !~ '^[A-Z]{2}$' or length(v_name) not between 2 and 120 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform private.log_admin('manage_reference', v_uid, null, null, null, p_reason, null,
    'department:' || v_code || ':create');
  insert into public.departments (code, name) values (v_code, v_name) returning id into v_id;
  return v_id;
end $$;

create function public.admin_update_department(
  p_department smallint, p_name text, p_active boolean, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_code text;
  v_name text := btrim(coalesce(p_name, ''));
begin
  select d.code into v_code from public.departments d where d.id = p_department for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if length(v_name) not between 2 and 120 or p_active is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform private.log_admin('manage_reference', v_uid, null, null, null, p_reason, null,
    'department:' || v_code || ':update');
  update public.departments set name = v_name, active = p_active where id = p_department;
end $$;

create function public.admin_create_batch(p_year smallint, p_reason text)
returns smallint language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_id smallint;
begin
  if p_year is null or p_year not between 2000 and 2100 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform private.log_admin('manage_reference', v_uid, null, null, null, p_reason, null,
    'batch:' || p_year || ':create');
  insert into public.batches (grad_year) values (p_year) returning id into v_id;
  return v_id;
end $$;

create function public.admin_delete_batch(p_batch smallint, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_year smallint;
begin
  select b.grad_year into v_year from public.batches b where b.id = p_batch for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.experiences e where e.batch_id = p_batch)
     or exists (select 1 from public.profiles p where p.batch_id = p_batch) then
    raise exception 'in_use' using errcode = '23503';
  end if;
  perform private.log_admin('manage_reference', v_uid, null, null, null, p_reason, null,
    'batch:' || v_year || ':delete');
  delete from public.batches where id = p_batch;
end $$;

-- ---------- Usage counts for the admin pages ----------

-- How many rows use each company, topic, department and batch (any status, counts only).
create function public.admin_reference_usage()
returns table (kind text, ref_id text, uses integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select 'company'::text, e.company_id::text, count(*)::integer
    from public.experiences e where e.company_id is not null group by e.company_id
  union all
    select 'topic', u.topic_id::text, count(*)::integer from (
      select r.topic_id from public.round_topics r
      union all select q.topic_id from public.question_topics q
    ) u group by u.topic_id
  union all
    select 'department', u.department_id::text, count(*)::integer from (
      select e.department_id from public.experiences e
      union all select p.department_id from public.profiles p where p.department_id is not null
      union all select x.department_id from public.experience_eligible_departments x
    ) u group by u.department_id
  union all
    select 'batch', u.batch_id::text, count(*)::integer from (
      select e.batch_id from public.experiences e
      union all select p.batch_id from public.profiles p where p.batch_id is not null
    ) u group by u.batch_id;
end $$;

-- ---------- Grants ----------

revoke execute on function public.admin_rename_company(uuid, text, text) from public, anon;
revoke execute on function public.admin_remove_company_alias(uuid, text, text) from public, anon;
revoke execute on function public.admin_merge_companies(uuid, uuid, text) from public, anon;
revoke execute on function public.admin_delete_company(uuid, text) from public, anon;
revoke execute on function public.admin_set_topic_active(smallint, boolean, text) from public, anon;
revoke execute on function public.admin_delete_topic(smallint, text) from public, anon;
revoke execute on function public.admin_create_department(text, text, text) from public, anon;
revoke execute on function public.admin_update_department(smallint, text, boolean, text) from public, anon;
revoke execute on function public.admin_create_batch(smallint, text) from public, anon;
revoke execute on function public.admin_delete_batch(smallint, text) from public, anon;
revoke execute on function public.admin_reference_usage() from public, anon;
grant execute on function public.admin_rename_company(uuid, text, text) to authenticated;
grant execute on function public.admin_remove_company_alias(uuid, text, text) to authenticated;
grant execute on function public.admin_merge_companies(uuid, uuid, text) to authenticated;
grant execute on function public.admin_delete_company(uuid, text) to authenticated;
grant execute on function public.admin_set_topic_active(smallint, boolean, text) to authenticated;
grant execute on function public.admin_delete_topic(smallint, text) to authenticated;
grant execute on function public.admin_create_department(text, text, text) to authenticated;
grant execute on function public.admin_update_department(smallint, text, boolean, text) to authenticated;
grant execute on function public.admin_create_batch(smallint, text) to authenticated;
grant execute on function public.admin_delete_batch(smallint, text) to authenticated;
grant execute on function public.admin_reference_usage() to authenticated;
