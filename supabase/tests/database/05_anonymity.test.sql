-- Anonymous authors cannot be found through public queries, other students, moderators,
-- search, joins or functions. Only an audited admin reveal can identify them.
begin;

do $$
declare
  v_anon uuid;
  v_named uuid;
  v_hits int;
begin
  v_anon := test.make_approved(test.alice(), true, 'acme-synthetic');
  v_named := test.make_approved(test.bob(), false, 'globex-synthetic');

  -- Public: author fields are NULL for the anonymous post and present for the named one
  perform test.as_anon();
  perform test.assert((select author_name from public.public_experiences where id = v_anon) is null, 'anonymous post has no author name');
  perform test.assert((select is_anonymous from public.public_experiences where id = v_anon) is true, 'flag is visible');
  perform test.assert((select author_name from public.public_experiences where id = v_named) = 'Synthetic Bob', 'named post shows the author name');
  perform test.assert((select count(*) from public.search_experiences('hash') where id = v_anon and author_name is null) = 1, 'search masks the anonymous author');
  -- Published date is coarse: a date, not a timestamp
  perform test.assert(pg_typeof((select published_on from public.public_experiences where id = v_anon)) = 'date'::regtype, 'only a date is published');
  perform test.expect_error($f$ select * from private.experience_authors $f$, 'permission denied');
  perform test.expect_error($f$ select * from public.profiles $f$, 'permission denied');
  perform test.reset();

  -- Neither the author's id, name, nor email appears anywhere a visitor can read
  select count(*) into v_hits from (
    select to_jsonb(x)::text t from public.public_experiences x where x.id = v_anon
    union all select to_jsonb(x)::text from public.public_rounds x where x.experience_id = v_anon
    union all select to_jsonb(x)::text from public.public_questions x where x.experience_id = v_anon
    union all select to_jsonb(x)::text from public.public_resources x where x.experience_id = v_anon
    union all select to_jsonb(x)::text from public.public_eligible_departments x where x.experience_id = v_anon
    union all select to_jsonb(x)::text from public.company_stats x
  ) s
  where t ilike '%' || test.alice()::text || '%' or t ilike '%Synthetic Alice%' or t ilike '%alice@%';
  perform test.assert(v_hits = 0, 'no public view contains the anonymous author identity');

  -- Another student
  perform test.as_user(test.bob());
  perform test.assert((select count(*) from public.my_experiences where id = v_anon) = 0, 'other student cannot see ownership');
  perform test.expect_error(format($f$ select public.get_my_experience(%L) $f$, v_anon), 'not_found');
  perform test.reset();

  -- Moderator: list, detail, history and reports never show the anonymous author
  perform test.as_user(test.moderator());
  perform test.assert((select author_name from public.moderation_experiences where id = v_anon) is null, 'moderator list hides the anonymous author');
  perform test.assert((select author_name from public.moderation_experiences where id = v_named) = 'Synthetic Bob', 'moderator sees the name of a non-anonymous post');
  perform test.assert((public.moderation_experience_detail(v_anon) ->> 'author_name') is null, 'moderator detail hides the anonymous author');
  perform test.assert(not (public.moderation_experience_detail(v_anon)::text ilike '%Synthetic Alice%'), 'moderator detail has no author name text');
  perform test.assert(not (public.moderation_experience_detail(v_anon)::text ilike '%' || test.alice()::text || '%'), 'moderator detail has no author id');
  select count(*) into v_hits from public.moderation_history h
  where to_jsonb(h)::text ilike '%' || test.alice()::text || '%';
  perform test.assert(v_hits = 0, 'moderator history has no author id');
  perform test.expect_error(format($f$ select public.admin_reveal_author(%L, 'Synthetic reason for test') $f$, v_anon), 'forbidden');
  perform test.reset();

  -- A report on the anonymous post does not reveal the author or the reporter to a moderator
  perform test.as_user(test.bob());
  perform public.report_experience(v_anon, 'personal_info', 'Synthetic report');
  perform test.reset();
  perform test.as_user(test.moderator());
  perform test.assert((select count(*) from public.moderation_reports where experience_id = v_anon) = 1, 'moderator sees the report');
  perform test.assert(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'moderation_reports' and column_name ~ 'reporter'), 'moderation_reports has no reporter column');
  perform test.reset();

  -- The author's identity survives withdrawal and still cannot be found publicly
  perform test.as_user(test.alice());
  perform public.withdraw_experience(v_anon);
  perform test.reset();
  perform test.as_anon();
  perform test.assert((select count(*) from public.public_experiences where id = v_anon) = 0, 'withdrawn anonymous post is gone from public');
  perform test.reset();

  -- Admin reveal works, is audited, and is the only route
  perform test.as_user(test.admin_x());
  perform test.assert((public.admin_reveal_author(v_anon, 'Synthetic abuse investigation for test') ->> 'author_id')::uuid = test.alice(), 'admin can reveal the author');
  perform test.reset();
  perform test.assert((select count(*) from private.admin_audit where action = 'reveal_author' and experience_id = v_anon) = 1, 'reveal is audited');
  perform test.assert(not exists (select 1 from public.moderation_actions where to_jsonb(moderation_actions)::text ilike '%reveal%'), 'reveal is absent from the moderator log');
end $$;

rollback;
