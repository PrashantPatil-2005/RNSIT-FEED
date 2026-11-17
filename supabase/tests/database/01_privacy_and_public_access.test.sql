-- Public users cannot read private user data; cross-user access is denied; USN never leaks.
begin;

-- Anonymous visitor
select test.as_anon();
select test.expect_error($$ select * from public.profiles $$, 'permission denied');
select test.expect_error($$ select * from private.profile_private $$, 'permission denied');
select test.expect_error($$ select * from private.experience_authors $$, 'permission denied');
select test.expect_error($$ select * from public.experiences $$, 'permission denied');
select test.expect_error($$ select * from public.reports $$, 'permission denied');
select test.expect_error($$ select * from public.moderation_actions $$, 'permission denied');
select test.expect_error($$ select * from private.admin_audit $$, 'permission denied');
select test.expect_error($$ select public.get_my_usn() $$, 'permission denied');
select test.expect_error($$ select * from public.my_experiences $$, 'permission denied');
select test.expect_error($$ select * from public.moderation_experiences $$, 'permission denied');
select test.expect_error($$ insert into public.companies (name, slug) values ('x', 'x') $$, 'permission denied');
select test.assert((select count(*) from public.companies) = 2, 'visitor can read the company list');
select test.assert((select count(*) from public.departments) = 36, 'visitor can read all 36 VTU branches (migration 017)');
select test.assert((select count(*) from public.batches) = 36, 'visitor can read graduation years 2000-2035');
select test.reset();

-- A signed-in student
select test.as_user(test.alice());
select test.assert((select count(*) from public.profiles) = 1, 'a student sees only their own profile row');
select test.assert((select id from public.profiles) = test.alice(), 'the visible row is their own');
select test.expect_error($$ select * from private.profile_private $$, 'permission denied');
select test.expect_error($$ select * from private.settings $$, 'permission denied');
select test.expect_error($$ select * from private.admin_audit $$, 'permission denied');
select test.assert(public.get_my_usn() = '1RN00ZZ001', 'the owner can read their own USN');
select test.expect_error($$ update public.profiles set full_name = 'Hacker' where id = auth.uid() $$, 'permission denied');
select test.expect_error($$ update public.profiles set role = 'admin' where id = auth.uid() $$, 'permission denied');
select test.expect_error($$ insert into public.experiences (department_id, batch_id) values (1, 1) $$, 'permission denied');
select test.expect_error($$ delete from public.companies $$, 'permission denied');
select test.reset();

-- Another student cannot read the first student's USN through any route
select test.as_user(test.bob());
select test.assert(public.get_my_usn() = '1RN00ZZ002', 'each user reads only their own USN');
select test.assert((select count(*) from public.profiles where id = test.alice()) = 0, 'cannot see another student profile');
select test.reset();

-- Even an admin reads profiles but never USNs directly
select test.as_user(test.admin_x());
select test.assert((select count(*) from public.profiles) >= 6, 'an admin can list profiles');
select test.expect_error($$ select * from private.profile_private $$, 'permission denied');
select test.reset();

-- No view in public exposes a USN column or value, and none exposes an author id
select test.assert(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public'
    and table_name in (select table_name from information_schema.views where table_schema = 'public')
    and (column_name ~* 'usn' or column_name in ('author_id', 'email', 'reporter_id', 'actor_id'))
), 'no public view has a USN, author id, email, reporter or actor column');

-- Values: with live posts present, no view row contains anything shaped like a USN
select test.make_approved(test.alice(), false);
select test.make_approved(test.bob(), true, 'globex-synthetic');
select test.assert(not exists (select 1 from public.public_experiences x where to_jsonb(x)::text ~ '1RN[0-9]{2}'), 'public_experiences has no USN value');
select test.assert(not exists (select 1 from public.public_rounds x where to_jsonb(x)::text ~ '1RN[0-9]{2}'), 'public_rounds has no USN value');
select test.assert(not exists (select 1 from public.public_questions x where to_jsonb(x)::text ~ '1RN[0-9]{2}'), 'public_questions has no USN value');
select test.assert(not exists (select 1 from public.company_stats x where to_jsonb(x)::text ~ '1RN[0-9]{2}'), 'company_stats has no USN value');

rollback;
