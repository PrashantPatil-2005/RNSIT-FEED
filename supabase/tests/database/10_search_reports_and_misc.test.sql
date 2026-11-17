-- Search, filters, reports, notices and cross-user access.
begin;

do $$
declare
  v_a uuid;
  v_b uuid;
  v_report uuid;
begin
  v_a := test.make_approved(test.alice(), false, 'acme-synthetic');
  v_b := test.make_approved(test.bob(), true, 'globex-synthetic');

  -- Search: text, company alias, filters, limit clamp
  perform test.as_anon();
  perform test.assert((select count(*) from public.search_experiences('collisions')) = 2, 'question text is searchable');
  perform test.assert((select count(*) from public.search_experiences('Acme Ltd')) = 1, 'company aliases are searchable');
  perform test.assert((select count(*) from public.search_experiences(null, null, 1::smallint)) = 2, 'department filter');
  perform test.assert((select count(*) from public.search_experiences(null, null, 2::smallint)) = 0, 'department filter excludes others');
  perform test.assert((select count(*) from public.search_experiences(null, null, null, null, 'full_time')) = 2, 'opportunity filter');
  perform test.assert((select count(*) from public.search_experiences(null, null, null, null, 'internship')) = 0, 'opportunity filter excludes others');
  perform test.assert((select count(*) from public.search_experiences(null, null, null, null, null, 'selected')) = 2, 'result filter');
  perform test.assert((select count(*) from public.search_experiences(null, null, null, null, null, null, 'technical')) = 2, 'round type filter');
  perform test.assert((select count(*) from public.search_experiences(null, null, null, null, null, null, 'hr')) = 0, 'round type filter excludes others');
  perform test.assert((select count(*) from public.search_experiences(null, null, null, 2::smallint)) = 0, 'batch filter excludes others');
  perform test.assert((select count(*) from public.search_experiences(null, null, null, null, null, null, null, 1)) = 1, 'limit applies');
  perform test.assert((select count(*) from public.search_experiences(null, null, null, null, null, null, null, 100000)) = 2, 'limit is clamped');
  perform test.assert((select count(*) from public.search_experiences($q$ '); drop table public.experiences; -- $q$)) = 0, 'hostile text is just a search string');
  perform test.assert((select count(*) from public.search_experiences('   ')) = 2, 'a blank query returns everything approved');
  perform test.reset();
  perform test.assert(to_regclass('public.experiences') is not null, 'the table still exists');

  -- Company aggregates
  perform test.as_anon();
  perform test.assert((select post_count from public.company_stats where slug = 'acme-synthetic') = 1, 'stats count approved posts');
  perform test.assert((select avg_difficulty from public.company_stats where slug = 'acme-synthetic') = 3.00, 'average difficulty');
  perform test.assert((select (round_type_counts ->> 'technical')::int from public.company_stats where slug = 'acme-synthetic') = 1, 'round counts');
  perform test.assert((select (result_counts ->> 'selected')::int from public.company_stats where slug = 'acme-synthetic') = 1, 'result counts');
  perform test.reset();

  -- Reports: not on own post, one per user, caps, moot on withdrawal, no cross-user access
  perform test.as_user(test.alice());
  perform test.expect_error(format($f$ select public.report_experience(%L, 'spam') $f$, v_a), 'forbidden');
  perform public.report_experience(v_b, 'nda', 'Synthetic details');
  perform public.report_experience(v_b, 'nda', 'Synthetic details again');   -- duplicate is ignored
  perform test.assert((select count(*) from public.my_reports) = 1, 'one report per user per post');
  perform test.reset();
  perform test.as_user(test.bob());
  perform test.assert((select count(*) from public.my_reports) = 0, 'a user cannot see another user reports');
  perform test.assert((select count(*) from public.my_notices) = 0, 'a user cannot see another user notices');
  perform test.reset();
  perform test.as_anon();
  perform test.expect_error(format($f$ select public.report_experience(%L, 'spam') $f$, v_b), 'permission denied');
  perform test.reset();

  -- A moderator resolves it; non-approved posts cannot be reported
  perform test.as_user(test.moderator());
  v_report := (select id from public.moderation_reports where experience_id = v_b);
  perform public.resolve_report(v_report, 'actioned', 'nda', true);
  perform test.expect_error(format($f$ select public.resolve_report(%L, 'dismissed') $f$, v_report), 'invalid_state');
  perform test.reset();
  perform test.assert((select status from public.experiences where id = v_b) = 'removed', 'an actioned report can remove the post');
  perform test.assert((select count(*) from public.moderation_actions where report_id = v_report) = 1, 'report resolution is logged');
  perform test.as_user(test.alice());
  perform test.expect_error(format($f$ select public.report_experience(%L, 'spam') $f$, v_b), 'not_found');
  perform test.reset();

  -- Reports on a post that is then withdrawn become moot
  perform test.as_user(test.bob());
  perform public.report_experience(v_a, 'fake');
  perform test.reset();
  perform test.as_user(test.alice());
  perform public.withdraw_experience(v_a);
  perform test.reset();
  perform test.assert((select status from public.reports where experience_id = v_a) = 'moot', 'open reports become moot on withdrawal');

  -- Admin company management only; aliases cannot clash with company names
  perform test.as_user(test.admin_x());
  perform public.admin_create_company('Initech Synthetic', 'initech-synthetic', 'Synthetic company addition');
  perform test.expect_error($f$ select public.admin_add_company_alias((select id from public.companies where slug = 'initech-synthetic'), 'Acme Synthetic', 'Synthetic alias test') $f$, 'alias_equals_company_name');
  perform test.expect_error($f$ select public.admin_create_company('initech synthetic', 'initech-2', 'Synthetic duplicate name') $f$, 'duplicate key');
  perform test.reset();
  perform test.as_user(test.bob());
  perform test.expect_error($f$ select public.admin_create_company('Student Co', 'student-co', 'Synthetic reason for test') $f$, 'forbidden');
  perform test.expect_error($f$ insert into public.companies (name, slug) values ('Direct Co', 'direct-co') $f$, 'permission denied');
  perform test.reset();
end $$;

rollback;
