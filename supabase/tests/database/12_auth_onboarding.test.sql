-- Phase 1: authentication, onboarding, role protection and USN privacy (negative tests included).
begin;

-- ---------- A verified Google sign-up creates a minimal, un-onboarded student profile ----------
do $$
declare v_new uuid := 'c0000000-0000-4000-8000-000000000001';
begin
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values (v_new, 'phase1.new@example.test', '{"provider":"google","providers":["google"]}',
          '{"email_verified":true,"full_name":"Synthetic Newcomer","role":"admin","domain_verified":false}');
  perform test.assert((select full_name from public.profiles where id = v_new) = 'Synthetic Newcomer', 'name copied from Google');
  perform test.assert((select role from public.profiles where id = v_new) = 'student', 'metadata cannot set a role (always student)');
  perform test.assert((select domain_verified from public.profiles where id = v_new), 'domain_verified set by the server');
  perform test.assert((select onboarded_at from public.profiles where id = v_new) is null, 'not onboarded yet');
  perform test.assert(not exists (select 1 from private.profile_private where user_id = v_new), 'no USN yet');

  -- Later metadata edits never change the locked display name (U13)
  update auth.users set raw_user_meta_data = '{"full_name":"Changed Later"}' where id = v_new;
  perform test.assert((select full_name from public.profiles where id = v_new) = 'Synthetic Newcomer', 'name stays locked after metadata changes');

  -- Not onboarded: member actions are refused
  perform test.as_user(v_new);
  perform test.expect_error($f$ select public.save_draft(null, null, '{}'::jsonb) $f$, 'onboarding_required');
  perform test.expect_error($f$ select public.report_experience(gen_random_uuid(), 'spam') $f$, 'onboarding_required');
  perform test.reset();
end $$;

-- ---------- Onboarding validation ----------
do $$
declare
  v_new uuid := 'c0000000-0000-4000-8000-000000000001';
  v_res text;
  bad text;
begin
  perform test.as_user(v_new);
  foreach bad in array array['', '1RN23CS01', '1RN23CS0011', '2RN23CS001', '1RN2XCS001', 'ABC', $q$1RN23CS001'; drop table public.profiles; --$q$, '1RN23C5001']
  loop
    perform test.expect_error(format($f$ select public.complete_onboarding(1::smallint, 1::smallint, %L) $f$, bad), 'invalid_usn');
  end loop;
  perform test.expect_error($f$ select public.complete_onboarding(999::smallint, 1::smallint, '1RN00ZZ101') $f$, 'invalid_input');
  perform test.expect_error($f$ select public.complete_onboarding(1::smallint, 999::smallint, '1RN00ZZ101') $f$, 'invalid_input');
  perform test.reset();

  -- An inactive department is refused
  update public.departments set active = false where code = 'EC';
  perform test.as_user(v_new);
  perform test.expect_error(format($f$ select public.complete_onboarding(%s::smallint, 1::smallint, '1RN00ZZ101') $f$,
    (select id from public.departments where code = 'EC')), 'invalid_input');

  -- A USN already held by another account (case/whitespace variants included) is unavailable,
  -- the response does not say who holds it, and nothing is saved
  v_res := public.complete_onboarding(1::smallint, 1::smallint, ' 1rn00zz001 ');
  perform test.assert(v_res = 'usn_unavailable', 'duplicate USN refused (normalised before comparing)');
  perform test.assert((select onboarded_at from public.profiles where id = v_new) is null, 'still not onboarded after a refused USN');
  perform test.reset();
  perform test.assert(not exists (select 1 from private.profile_private where user_id = v_new), 'refused USN is not stored');
  perform test.assert((select count(*) from private.usn_attempts where user_id = v_new) = 1, 'the attempt is recorded for rate limiting');
  perform test.assert((select count(*) from private.usn_attempts a where to_jsonb(a)::text ~* '1RN') = 0, 'attempt log holds no USN');

  -- Success: normalised, stored privately, profile completed
  perform test.as_user(v_new);
  v_res := public.complete_onboarding(1::smallint, 2::smallint, ' 1rn00zz101 ');
  perform test.assert(v_res = 'ok', 'onboarding succeeds');
  perform test.assert(public.get_my_usn() = '1RN00ZZ101', 'USN normalised to uppercase without spaces');
  perform test.assert((select department_id from public.profiles where id = v_new) = 1, 'department saved');
  perform test.assert((select batch_id from public.profiles where id = v_new) = 2, 'batch saved');
  perform test.expect_error($f$ select public.complete_onboarding(1::smallint, 1::smallint, '1RN00ZZ102') $f$, 'already_onboarded');
  perform test.assert(public.get_my_usn() = '1RN00ZZ101', 'USN cannot be changed by re-onboarding');
  perform test.reset();

  -- The new USN now blocks others
  perform test.as_user(test.claimant());
  perform test.assert(public.complete_onboarding(1::smallint, 1::smallint, '1RN00ZZ101') = 'usn_unavailable', 'new USN is protected too');
  perform test.reset();
end $$;

-- ---------- Rate limit on USN attempts ----------
do $$
declare
  v_u uuid := 'c0000000-0000-4000-8000-000000000002';
  i integer;
begin
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values (v_u, 'phase1.prober@example.test', '{"provider":"google"}', '{"email_verified":true,"name":"Synthetic Prober"}');
  perform test.as_user(v_u);
  for i in 1 .. 10 loop
    perform public.complete_onboarding(1::smallint, 1::smallint, '1RN00ZZ001');   -- held by Alice
  end loop;
  perform test.expect_error($f$ select public.complete_onboarding(1::smallint, 1::smallint, '1RN00ZZ555') $f$, 'rate_limited');
  perform test.reset();
end $$;

-- ---------- No self-assigned roles or protected-field edits ----------
do $$
declare v_new uuid := 'c0000000-0000-4000-8000-000000000001';
begin
  perform test.as_user(v_new);
  perform test.expect_error(format($f$ update public.profiles set role = 'admin' where id = %L $f$, v_new), 'permission denied');
  perform test.expect_error(format($f$ update public.profiles set domain_verified = true, full_name = 'X' where id = %L $f$, v_new), 'permission denied');
  perform test.expect_error(format($f$ update public.profiles set department_id = 2 where id = %L $f$, v_new), 'permission denied');
  perform test.expect_error($f$ insert into public.profiles (id, full_name, role) values (gen_random_uuid(), 'Fake', 'admin') $f$, 'permission denied');
  perform test.expect_error(format($f$ delete from public.profiles where id = %L $f$, v_new), 'permission denied');
  perform test.expect_error(format($f$ select public.admin_set_user_role(%L, 'admin', 'self escalation attempt') $f$, v_new), 'forbidden');
  perform test.expect_error(format($f$ select private.bootstrap_admin(%L, 'self escalation attempt') $f$, v_new), 'permission denied');
  -- Setting the guard's bypass flag gains nothing: there is no write grant to use it with
  perform set_config('app.profile_change', '1', true);
  perform test.expect_error(format($f$ update public.profiles set role = 'admin' where id = %L $f$, v_new), 'permission denied');
  perform set_config('app.profile_change', '', true);
  perform test.reset();
  perform test.assert((select role from public.profiles where id = v_new) = 'student', 'role unchanged after every attempt');

  -- Second layer: even a privileged session cannot change protected columns without the function flag
  perform test.expect_error(format($f$ update public.profiles set role = 'admin' where id = %L $f$, v_new), 'protected_columns');
end $$;

-- ---------- Profile and USN privacy ----------
do $$
declare v_new uuid := 'c0000000-0000-4000-8000-000000000001';
begin
  perform test.as_user(v_new);
  perform test.assert((select count(*) from public.profiles) = 1, 'a student reads only their own profile');
  perform test.assert((select id from public.profiles) = v_new, 'and it is theirs');
  perform test.expect_error($f$ select * from private.profile_private $f$, 'permission denied');
  perform test.expect_error($f$ select * from private.usn_attempts $f$, 'permission denied');
  perform test.expect_error($f$ select * from auth.users $f$, 'permission denied');
  perform test.expect_error(format($f$ select public.admin_get_usn(%L, 'curious student lookup') $f$, test.alice()), 'forbidden');
  perform test.reset();

  perform test.as_user(test.moderator());
  perform test.assert((select count(*) from public.profiles) = 1, 'a moderator reads only their own profile');
  perform test.assert(public.get_my_usn() = '1RN00ZZ003', 'get_my_usn returns only the caller''s USN');
  perform test.expect_error(format($f$ select public.admin_get_usn(%L, 'moderator lookup attempt') $f$, v_new), 'forbidden');
  perform test.reset();

  perform test.as_anon();
  perform test.expect_error($f$ select * from public.profiles $f$, 'permission denied');
  perform test.expect_error($f$ select public.get_my_usn() $f$, 'permission denied');
  perform test.expect_error($f$ select public.complete_onboarding(1::smallint, 1::smallint, '1RN00ZZ777') $f$, 'permission denied');
  perform test.reset();
end $$;

-- ---------- Accounts that are not allowed to act ----------
do $$
declare v_u uuid := 'c0000000-0000-4000-8000-000000000003';
begin
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values (v_u, 'phase1.leaving@example.test', '{"provider":"google"}', '{"email_verified":true,"name":"Synthetic Leaving"}');
  perform test.as_user(v_u);
  perform public.request_account_deletion();
  perform test.expect_error($f$ select public.complete_onboarding(1::smallint, 1::smallint, '1RN00ZZ888') $f$, 'forbidden');
  perform test.expect_error($f$ select public.get_my_usn() $f$, 'forbidden');
  perform test.reset();

  -- A JWT for a user id with no profile (e.g. deleted) can do nothing
  perform test.as_user(gen_random_uuid());
  perform test.expect_error($f$ select public.complete_onboarding(1::smallint, 1::smallint, '1RN00ZZ889') $f$, 'forbidden');
  perform test.assert((select count(*) from public.profiles) = 0, 'no rows for an unknown user');
  perform test.reset();
end $$;

rollback;
