-- TEST-ONLY helpers for a REAL LOCAL Supabase stack (supabase start). NEVER RUN AGAINST A HOSTED PROJECT.
-- Same helpers as 00_local_stub.sql, without the emulated auth schema, roles and default privileges,
-- because the real stack provides them. Generated from 00_local_stub.sql; keep the two in sync.

-- ---------- Test helpers ----------
create schema test;
grant usage on schema test to anon, authenticated, service_role;

create function test.alice() returns uuid language sql immutable as $$ select 'a0000000-0000-4000-8000-000000000001'::uuid $$;
create function test.bob() returns uuid language sql immutable as $$ select 'a0000000-0000-4000-8000-000000000002'::uuid $$;
create function test.moderator() returns uuid language sql immutable as $$ select 'a0000000-0000-4000-8000-000000000003'::uuid $$;
create function test.admin_x() returns uuid language sql immutable as $$ select 'a0000000-0000-4000-8000-000000000004'::uuid $$;
create function test.admin_y() returns uuid language sql immutable as $$ select 'a0000000-0000-4000-8000-000000000005'::uuid $$;
create function test.claimant() returns uuid language sql immutable as $$ select 'a0000000-0000-4000-8000-000000000006'::uuid $$;

create function test.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
end $$;

create function test.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;

create function test.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role service_role';
end $$;

create function test.reset() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create function test.assert(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'ASSERT FAILED: %', p_msg;
  end if;
end $$;

-- Runs a statement and requires it to FAIL with a message containing p_expected.
create function test.expect_error(p_sql text, p_expected text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception 'ASSERT FAILED: expected error containing "%" but it succeeded: %', p_expected, p_sql;
  end if;
  if position(p_expected in v_msg) = 0 then
    raise exception 'ASSERT FAILED: expected error containing "%" but got "%" for: %', p_expected, v_msg, p_sql;
  end if;
end $$;

-- Runs a statement and requires it to succeed.
create function test.expect_ok(p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
end $$;

-- Builds a complete pending post for an author (as that author), then returns to the owner role.
create function test.make_pending(p_author uuid, p_anonymous boolean, p_company_slug text default 'acme-synthetic')
returns uuid language plpgsql as $$
declare
  v_res jsonb;
  v_id uuid;
begin
  perform test.as_user(p_author);
  v_res := public.save_draft(null, null, jsonb_build_object(
    'company_id', (select c.id from public.companies c where c.slug = p_company_slug),
    'role_title', 'SDE Synthetic',
    'opportunity_type', 'full_time',
    'campus_type', 'on_campus',
    'recruitment_year', 2026,
    'result', 'selected',
    'is_anonymous', p_anonymous,
    'prep_tips', 'Practise data structures daily',
    'min_cgpa', 7.5,
    'rounds', jsonb_build_array(jsonb_build_object(
      'round_type', 'technical', 'difficulty', 3, 'duration_min', 45,
      'topic_ids', jsonb_build_array((select t.id from public.topics t where t.slug = 'dsa')),
      'questions', jsonb_build_array(jsonb_build_object(
        'body', 'Explain how a hash map handles collisions',
        'topic_ids', jsonb_build_array((select t.id from public.topics t where t.slug = 'dsa')))))),
    'resources', jsonb_build_array(jsonb_build_object('url', 'https://example.test/guide', 'label', 'Guide'))
  ));
  v_id := (v_res ->> 'id')::uuid;
  perform public.submit_experience(v_id);
  perform test.reset();
  return v_id;
end $$;

create function test.make_approved(p_author uuid, p_anonymous boolean, p_company_slug text default 'acme-synthetic')
returns uuid language plpgsql as $$
declare v_id uuid := test.make_pending(p_author, p_anonymous, p_company_slug);
begin
  perform test.as_user(test.moderator());
  perform public.moderate_experience(v_id, 'approve');
  perform test.reset();
  return v_id;
end $$;

grant execute on all functions in schema test to anon, authenticated, service_role;
